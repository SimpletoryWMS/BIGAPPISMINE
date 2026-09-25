-- ============================================================================
-- SIMPLETORY ENTERPRISE MULTI-TENANT WMS - COMPLETE IDEMPOTENT DATABASE SCHEMA
-- ============================================================================

-- 1. Tenants / Facilities Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Defensive Migration: relax any legacy NOT NULL constraints on tenants
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'slug'
    ) THEN
        ALTER TABLE public.tenants ALTER COLUMN slug DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'industry'
    ) THEN
        ALTER TABLE public.tenants ALTER COLUMN industry DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'plan_tier'
    ) THEN
        ALTER TABLE public.tenants ALTER COLUMN plan_tier DROP NOT NULL;
    END IF;
END $$;

-- 2. Items Master Table
CREATE TABLE IF NOT EXISTS public.items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    sub_category TEXT DEFAULT 'Standard',
    uom TEXT NOT NULL DEFAULT 'EA',
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    reorder_point NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_sku UNIQUE (tenant_id, sku)
);

-- Ensure sub_category and other columns exist if items table was created earlier
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sub_category TEXT DEFAULT 'Standard';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'EA';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(12, 2) DEFAULT 0.00;

-- 3. Inventory Overview Table (On-Hand Stock by Location)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    location TEXT NOT NULL DEFAULT 'MAIN-FLOOR',
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Available',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_item_location UNIQUE (tenant_id, item_id, location)
);

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Available';

-- 4. Inventory Change History / Audit Log Table (Tracks Every Change)
CREATE TABLE IF NOT EXISTS public.inventory_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    item_name TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'ADD', 'SUBTRACT', 'ADJUST', 'TRANSFER', 'DELETE'
    qty_change NUMERIC(12, 2) NOT NULL,
    previous_qty NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    new_qty NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    location TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT 'System / Admin',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory_history ADD COLUMN IF NOT EXISTS user_name TEXT DEFAULT 'System / Admin';
ALTER TABLE public.inventory_history ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. Users & RBAC Table
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'User', -- 'Superadmin', 'Manager', 'User'
    status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Suspended'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_username UNIQUE (tenant_id, username)
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'User';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- ============================================================================
-- AUTOMATED DATABASE AUDIT TRIGGER (GUARANTEES IMMUTABLE HISTORY)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_audit_inventory_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_sku TEXT;
    v_name TEXT;
    v_action TEXT;
    v_change NUMERIC(12, 2);
    v_prev NUMERIC(12, 2);
    v_new NUMERIC(12, 2);
BEGIN
    -- Fetch SKU and Name from items table
    IF (TG_OP = 'DELETE') THEN
        SELECT sku, name INTO v_sku, v_name FROM public.items WHERE id = OLD.item_id;
        v_action := 'DELETE';
        v_prev := OLD.quantity;
        v_new := 0.00;
        v_change := -OLD.quantity;
        
        INSERT INTO public.inventory_history (
            id, tenant_id, item_id, sku, item_name, action_type,
            qty_change, previous_qty, new_qty, location, user_name, notes, created_at
        ) VALUES (
            'hist-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 4),
            OLD.tenant_id, OLD.item_id, COALESCE(v_sku, 'DELETED'), COALESCE(v_name, 'Unknown Item'),
            v_action, v_change, v_prev, v_new, OLD.location, 'Database System Trigger', 'Automated trigger log on stock delete', NOW()
        );
        RETURN OLD;
    ELSE
        SELECT sku, name INTO v_sku, v_name FROM public.items WHERE id = NEW.item_id;
        
        IF (TG_OP = 'INSERT') THEN
            v_prev := 0.00;
            v_new := NEW.quantity;
            v_change := NEW.quantity;
            v_action := 'ADD';
        ELSIF (TG_OP = 'UPDATE') THEN
            v_prev := OLD.quantity;
            v_new := NEW.quantity;
            v_change := NEW.quantity - OLD.quantity;
            
            IF (v_change > 0) THEN
                v_action := 'ADD';
            ELSIF (v_change < 0) THEN
                v_action := 'SUBTRACT';
            ELSE
                v_action := 'ADJUST';
            END IF;
        END IF;

        -- Prevent duplicate entries if already logged by client app with explicit note
        IF NOT EXISTS (
            SELECT 1 FROM public.inventory_history 
            WHERE item_id = NEW.item_id 
              AND location = NEW.location 
              AND new_qty = v_new 
              AND created_at > (NOW() - INTERVAL '2 seconds')
        ) THEN
            INSERT INTO public.inventory_history (
                id, tenant_id, item_id, sku, item_name, action_type,
                qty_change, previous_qty, new_qty, location, user_name, notes, created_at
            ) VALUES (
                'hist-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 4),
                NEW.tenant_id, NEW.item_id, COALESCE(v_sku, 'UNKNOWN'), COALESCE(v_name, 'Catalog Item'),
                v_action, v_change, v_prev, v_new, NEW.location, 'Database System Trigger', 'Stock record updated', NOW()
            );
        END IF;

        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to inventory table
DROP TRIGGER IF EXISTS trg_audit_inventory ON public.inventory;
CREATE TRIGGER trg_audit_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_inventory_changes();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow Read-Write with Tenant Isolation
DROP POLICY IF EXISTS "Public access tenants" ON public.tenants;
CREATE POLICY "Public access tenants" ON public.tenants FOR ALL USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "Tenant isolation items" ON public.items;
CREATE POLICY "Tenant isolation items" ON public.items FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS "Tenant isolation inventory" ON public.inventory;
CREATE POLICY "Tenant isolation inventory" ON public.inventory FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS "Tenant isolation inventory_history" ON public.inventory_history;
CREATE POLICY "Tenant isolation inventory_history" ON public.inventory_history FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

DROP POLICY IF EXISTS "Tenant isolation users" ON public.users;
CREATE POLICY "Tenant isolation users" ON public.users FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

-- Indexes for Fast Query Performance
CREATE INDEX IF NOT EXISTS idx_items_tenant ON public.items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON public.inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_history_tenant ON public.inventory_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);

-- Enable Realtime Subscriptions (Defensive / Idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tenants') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_history') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_history;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;
END $$;

-- ============================================================================
-- INITIAL SEED DATA
-- ============================================================================
-- Seed Default Primary Tenant
INSERT INTO public.tenants (id, name)
VALUES 
  ('org-primary', 'Main Enterprise Warehouse'),
  ('org-east', 'East Coast Distribution Center')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Seed Superadmin, Manager, and Standard User
INSERT INTO public.users (id, tenant_id, username, email, password_hash, full_name, role, status)
VALUES 
  ('usr-admin-1', 'org-primary', 'derek', 'derek@simpletory.com', NULL, 'Derek Lumpkin', 'Superadmin', 'Active'),
  ('usr-mgr-1', 'org-primary', 'sarah.c', 'sarah@simpletory.com', NULL, 'Sarah Connor', 'Manager', 'Active'),
  ('usr-op-1', 'org-primary', 'mike.t', 'mike@simpletory.com', NULL, 'Mike Torres', 'User', 'Active')
ON CONFLICT (tenant_id, username) DO UPDATE SET role = EXCLUDED.role;

-- Seed Starter Catalog Items
INSERT INTO public.items (id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point)
VALUES 
  ('itm-1', 'org-primary', 'SKU-1001', 'Standard Heavy Duty Pallet Box', 'Packaging', 'Corrugated', 'EA', 14.50, 20),
  ('itm-2', 'org-primary', 'SKU-1002', 'Industrial Stretch Film Roll 80GA', 'Packaging', 'Plastic Wrap', 'RL', 22.00, 15),
  ('itm-3', 'org-primary', 'SKU-2001', 'Heavy Duty Steel Bracket 4-Hole', 'Hardware', 'Brackets', 'EA', 3.75, 50),
  ('itm-4', 'org-primary', 'SKU-3001', 'Premium Utility Knife Blades (Pack of 50)', 'Tools', 'Blades', 'PK', 8.90, 10),
  ('itm-5', 'org-primary', 'SKU-4001', 'Poly Bubble Mailers #0 (6x10)', 'Packaging', 'Envelopes', 'CS', 32.40, 25),
  ('itm-6', 'org-primary', 'SKU-5001', 'Direct Thermal Shipping Labels 4x6', 'Supplies', 'Labels', 'RL', 11.25, 30)
ON CONFLICT (id) DO UPDATE SET 
  sub_category = EXCLUDED.sub_category,
  uom = EXCLUDED.uom,
  unit_cost = EXCLUDED.unit_cost,
  reorder_point = EXCLUDED.reorder_point;

-- Seed Initial On-Hand Inventory
INSERT INTO public.inventory (id, tenant_id, item_id, location, quantity, status)
VALUES
  ('inv-1', 'org-primary', 'itm-1', 'A-01-01', 120, 'Available'),
  ('inv-2', 'org-primary', 'itm-2', 'A-01-02', 45, 'Available'),
  ('inv-3', 'org-primary', 'itm-3', 'B-02-01', 300, 'Available'),
  ('inv-4', 'org-primary', 'itm-4', 'B-02-02', 8, 'Low Stock'),
  ('inv-5', 'org-primary', 'itm-5', 'C-01-01', 64, 'Available'),
  ('inv-6', 'org-primary', 'itm-6', 'C-02-01', 5, 'Low Stock')
ON CONFLICT (id) DO NOTHING;

-- Seed Initial History Log
INSERT INTO public.inventory_history (id, tenant_id, item_id, sku, item_name, action_type, qty_change, previous_qty, new_qty, location, user_name, notes, created_at)
VALUES
  ('hist-1', 'org-primary', 'itm-1', 'SKU-1001', 'Standard Heavy Duty Pallet Box', 'ADD', 120, 0, 120, 'A-01-01', 'Derek Lumpkin', 'Initial inventory intake', NOW() - INTERVAL '1 day'),
  ('hist-2', 'org-primary', 'itm-2', 'SKU-1002', 'Industrial Stretch Film Roll 80GA', 'ADD', 45, 0, 45, 'A-01-02', 'Derek Lumpkin', 'PO-8821 Receipt', NOW() - INTERVAL '18 hours'),
  ('hist-3', 'org-primary', 'itm-3', 'SKU-2001', 'Heavy Duty Steel Bracket 4-Hole', 'ADD', 300, 0, 300, 'B-02-01', 'Derek Lumpkin', 'Bulk restock', NOW() - INTERVAL '12 hours'),
  ('hist-4', 'org-primary', 'itm-4', 'SKU-3001', 'Premium Utility Knife Blades (Pack of 50)', 'SUBTRACT', -2, 10, 8, 'B-02-02', 'Derek Lumpkin', 'Fulfillment Order #1042', NOW() - INTERVAL '2 hours')
ON CONFLICT (id) DO NOTHING;
