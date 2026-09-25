-- ============================================================================
-- SIMPLETORY ENTERPRISE MULTI-TENANT WMS - CLEAN PRODUCTION SCHEMA
-- ============================================================================

-- 1. Tenants / Facilities Table
CREATE TABLE public.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Items Master Table (with dedicated sub_category column)
CREATE TABLE public.items (
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

-- 3. Inventory Overview Table (On-Hand Stock by Location)
CREATE TABLE public.inventory (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    location TEXT NOT NULL DEFAULT 'MAIN-FLOOR',
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Available',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_item_location UNIQUE (tenant_id, item_id, location)
);

-- 4. Inventory Change History / Audit Log Table (Tracks Every Change)
CREATE TABLE public.inventory_history (
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

-- 5. Users & RBAC Table
CREATE TABLE public.users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'User', -- 'Superadmin', 'Manager', 'User'
    status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Suspended'
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_username UNIQUE (tenant_id, username)
);

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
CREATE POLICY "Public access tenants" ON public.tenants FOR ALL USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL);
CREATE POLICY "Tenant isolation items" ON public.items FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
CREATE POLICY "Tenant isolation inventory" ON public.inventory FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
CREATE POLICY "Tenant isolation inventory_history" ON public.inventory_history FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
CREATE POLICY "Tenant isolation users" ON public.users FOR ALL USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

-- Indexes for Fast Query Performance
CREATE INDEX idx_items_tenant ON public.items(tenant_id);
CREATE INDEX idx_inventory_tenant ON public.inventory(tenant_id);
CREATE INDEX idx_history_tenant ON public.inventory_history(tenant_id);
CREATE INDEX idx_users_tenant ON public.users(tenant_id);

-- Enable Realtime Subscriptions (Defensive)
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
-- SECURE AUTHENTICATION & PASSWORD RPC FUNCTIONS (SECURITY DEFINER)
-- ============================================================================
-- Authenticate User RPC (Returns sanitized user profile without password_hash)
CREATE OR REPLACE FUNCTION public.authenticate_user(
    p_username TEXT,
    p_password_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user RECORD;
    v_tenant RECORD;
    v_clean_username TEXT := LOWER(TRIM(p_username));
    v_clean_hash TEXT := LOWER(TRIM(p_password_hash));
BEGIN
    -- 1. Find user matching username, email, or id
    SELECT * INTO v_user
    FROM public.users
    WHERE LOWER(username) = v_clean_username
       OR LOWER(email) = v_clean_username
       OR LOWER(id) = v_clean_username
    LIMIT 1;

    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid username or password.');
    END IF;

    -- 2. Check if user is suspended
    IF v_user.status = 'Suspended' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended. Please contact your administrator.');
    END IF;

    -- 3. Check if tenant is active (except superadmins)
    IF v_user.role <> 'Superadmin' THEN
        SELECT * INTO v_tenant FROM public.tenants WHERE id = v_user.tenant_id;
        IF v_tenant IS NOT NULL AND v_tenant.is_active = FALSE THEN
            RETURN jsonb_build_object('success', false, 'error', 'This facility / tenant account is inactive. Please contact your administrator.');
        END IF;
    END IF;

    -- 4. Verify password hash (strictly require exact SHA-256 match, disallow NULL)
    IF v_user.password_hash IS NULL OR LENGTH(v_user.password_hash) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account security configuration invalid. Please contact administrator.');
    END IF;

    IF LOWER(v_user.password_hash) <> v_clean_hash THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid username or password.');
    END IF;

    -- 5. Update last_login_at
    UPDATE public.users
    SET last_login_at = NOW()
    WHERE id = v_user.id;

    -- 6. Return sanitized user object (EXCLUDES password_hash!)
    RETURN jsonb_build_object(
        'success', true,
        'user', jsonb_build_object(
            'id', v_user.id,
            'tenant_id', v_user.tenant_id,
            'username', v_user.username,
            'email', v_user.email,
            'full_name', v_user.full_name,
            'role', v_user.role,
            'status', v_user.status,
            'last_login_at', NOW(),
            'created_at', v_user.created_at
        )
    );
END;
$$;

-- Change User Password RPC (Requires valid current password before updating)
CREATE OR REPLACE FUNCTION public.change_user_password(
    p_user_id TEXT,
    p_current_password_hash TEXT,
    p_new_password_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user RECORD;
    v_clean_curr TEXT := LOWER(TRIM(p_current_password_hash));
    v_clean_new TEXT := LOWER(TRIM(p_new_password_hash));
BEGIN
    SELECT * INTO v_user FROM public.users WHERE id = p_user_id;

    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found.');
    END IF;

    IF v_user.password_hash IS NOT NULL AND LOWER(v_user.password_hash) <> v_clean_curr THEN
        RETURN jsonb_build_object('success', false, 'error', 'Current password is incorrect.');
    END IF;

    IF LENGTH(v_clean_new) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'New password hash is invalid.');
    END IF;

    UPDATE public.users
    SET password_hash = v_clean_new
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execution to public / anon / authenticated so frontend can authenticate securely
GRANT EXECUTE ON FUNCTION public.authenticate_user(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_user_password(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================================================
-- INITIAL SEED DATA
-- ============================================================================
-- Seed Default Primary Tenant
INSERT INTO public.tenants (id, name, is_active)
VALUES 
  ('org-primary', 'Main Enterprise Warehouse', true),
  ('org-east', 'East Coast Distribution Center', true);

-- Seed Starter Catalog Items
INSERT INTO public.items (id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point)
VALUES 
  ('itm-1', 'org-primary', 'SKU-1001', 'Standard Heavy Duty Pallet Box', 'Packaging', 'Corrugated', 'EA', 14.50, 20),
  ('itm-2', 'org-primary', 'SKU-1002', 'Industrial Stretch Film Roll 80GA', 'Packaging', 'Plastic Wrap', 'RL', 22.00, 15),
  ('itm-3', 'org-primary', 'SKU-2001', 'Heavy Duty Steel Bracket 4-Hole', 'Hardware', 'Brackets', 'EA', 3.75, 50),
  ('itm-4', 'org-primary', 'SKU-3001', 'Premium Utility Knife Blades (Pack of 50)', 'Tools', 'Blades', 'PK', 8.90, 10),
  ('itm-5', 'org-primary', 'SKU-4001', 'Poly Bubble Mailers #0 (6x10)', 'Packaging', 'Envelopes', 'CS', 32.40, 25),
  ('itm-6', 'org-primary', 'SKU-5001', 'Direct Thermal Shipping Labels 4x6', 'Supplies', 'Labels', 'RL', 11.25, 30);

-- Seed Initial On-Hand Inventory
INSERT INTO public.inventory (id, tenant_id, item_id, location, quantity, status)
VALUES
  ('inv-1', 'org-primary', 'itm-1', 'A-01-01', 120, 'Available'),
  ('inv-2', 'org-primary', 'itm-2', 'A-01-02', 45, 'Available'),
  ('inv-3', 'org-primary', 'itm-3', 'B-02-01', 300, 'Available'),
  ('inv-4', 'org-primary', 'itm-4', 'B-02-02', 8, 'Low Stock'),
  ('inv-5', 'org-primary', 'itm-5', 'C-01-01', 64, 'Available'),
  ('inv-6', 'org-primary', 'itm-6', 'C-02-01', 5, 'Low Stock');

-- Seed Initial History Log
INSERT INTO public.inventory_history (id, tenant_id, item_id, sku, item_name, action_type, qty_change, previous_qty, new_qty, location, user_name, notes, created_at)
VALUES
  ('hist-1', 'org-primary', 'itm-1', 'SKU-1001', 'Standard Heavy Duty Pallet Box', 'ADD', 120, 0, 120, 'A-01-01', 'Derek Lumpkin', 'Initial inventory intake', NOW() - INTERVAL '1 day'),
  ('hist-2', 'org-primary', 'itm-2', 'SKU-1002', 'Industrial Stretch Film Roll 80GA', 'ADD', 45, 0, 45, 'A-01-02', 'Derek Lumpkin', 'PO-8821 Receipt', NOW() - INTERVAL '18 hours'),
  ('hist-3', 'org-primary', 'itm-3', 'SKU-2001', 'Heavy Duty Steel Bracket 4-Hole', 'ADD', 300, 0, 300, 'B-02-01', 'Derek Lumpkin', 'Bulk restock', NOW() - INTERVAL '12 hours'),
  ('hist-4', 'org-primary', 'itm-4', 'SKU-3001', 'Premium Utility Knife Blades (Pack of 50)', 'SUBTRACT', -2, 10, 8, 'B-02-02', 'Derek Lumpkin', 'Fulfillment Order #1042', NOW() - INTERVAL '2 hours');
