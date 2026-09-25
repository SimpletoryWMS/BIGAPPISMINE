-- ============================================================================
-- SIMPLETORY SIMPLIFIED MULTI-TENANT WMS - DATABASE SCHEMA
-- ============================================================================

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- 4. Inventory Change History / Audit Log Table
CREATE TABLE IF NOT EXISTS public.inventory_history (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    item_name TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'ADD', 'SUBTRACT', 'ADJUST', 'TRANSFER'
    qty_change NUMERIC(12, 2) NOT NULL,
    previous_qty NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    new_qty NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    location TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT 'Admin',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Operator', -- 'Admin', 'Manager', 'Operator', 'Viewer'
    status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Suspended'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_username UNIQUE (tenant_id, username)
);

-- Enable Row Level Security (RLS)
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

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;

-- ============================================================================
-- INITIAL SEED DATA
-- ============================================================================
-- Seed Default Primary Tenant
INSERT INTO public.tenants (id, name)
VALUES ('org-primary', 'Main Enterprise Warehouse')
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Super Admin User (password initially null -> forces setup on login)
INSERT INTO public.users (id, tenant_id, username, email, password_hash, full_name, role, status)
VALUES ('usr-admin-1', 'org-primary', 'derek', 'derek@simpletory.com', NULL, 'Derek Lumpkin', 'Admin', 'Active')
ON CONFLICT (tenant_id, username) DO UPDATE SET role = 'Admin';

-- Seed Starter Catalog Items
INSERT INTO public.items (id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point)
VALUES 
  ('itm-1', 'org-primary', 'SKU-1001', 'Standard Heavy Duty Pallet Box', 'Packaging', 'Corrugated', 'EA', 14.50, 20),
  ('itm-2', 'org-primary', 'SKU-1002', 'Industrial Stretch Film Roll 80GA', 'Packaging', 'Plastic Wrap', 'RL', 22.00, 15),
  ('itm-3', 'org-primary', 'SKU-2001', 'Heavy Duty Steel Bracket 4-Hole', 'Hardware', 'Brackets', 'EA', 3.75, 50),
  ('itm-4', 'org-primary', 'SKU-3001', 'Premium Utility Knife Blades (Pack of 50)', 'Tools', 'Blades', 'PK', 8.90, 10)
ON CONFLICT (id) DO NOTHING;

-- Seed Initial On-Hand Inventory
INSERT INTO public.inventory (id, tenant_id, item_id, location, quantity, status)
VALUES
  ('inv-1', 'org-primary', 'itm-1', 'A-01-01', 120, 'Available'),
  ('inv-2', 'org-primary', 'itm-2', 'A-01-02', 45, 'Available'),
  ('inv-3', 'org-primary', 'itm-3', 'B-02-01', 300, 'Available'),
  ('inv-4', 'org-primary', 'itm-4', 'B-02-02', 85, 'Available')
ON CONFLICT (id) DO NOTHING;

-- Seed Initial History Log
INSERT INTO public.inventory_history (id, tenant_id, item_id, sku, item_name, action_type, qty_change, previous_qty, new_qty, location, user_name, notes)
VALUES
  ('hist-1', 'org-primary', 'itm-1', 'SKU-1001', 'Standard Heavy Duty Pallet Box', 'ADD', 120, 0, 120, 'A-01-01', 'Derek Lumpkin', 'Initial inventory intake'),
  ('hist-2', 'org-primary', 'itm-2', 'SKU-1002', 'Industrial Stretch Film Roll 80GA', 'ADD', 45, 0, 45, 'A-01-02', 'Derek Lumpkin', 'Initial inventory intake'),
  ('hist-3', 'org-primary', 'itm-3', 'SKU-2001', 'Heavy Duty Steel Bracket 4-Hole', 'ADD', 300, 0, 300, 'B-02-01', 'Derek Lumpkin', 'Initial inventory intake'),
  ('hist-4', 'org-primary', 'itm-4', 'SKU-3001', 'Premium Utility Knife Blades (Pack of 50)', 'ADD', 85, 0, 85, 'B-02-02', 'Derek Lumpkin', 'Initial inventory intake')
ON CONFLICT (id) DO NOTHING;
