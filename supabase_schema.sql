-- ============================================================================
-- SIMPLETORY WMS v3.0 - MULTI-TENANT SUPABASE POSTGRESQL SCHEMA
-- Complete schema with RLS, JSONB Custom Fields (UDFs), Packaging Hierarchy,
-- Facilities, Locations, LPN tracking, and Audit Ledger Transactions.
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. TENANTS TABLE (Company Isolation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    template TEXT NOT NULL DEFAULT 'flooring', -- 'flooring' or 'general_wms'
    tier TEXT NOT NULL DEFAULT 'Free Tier',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. USER PROFILES & ROLE-BASED ACCESS CONTROL (RBAC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role TEXT NOT NULL, -- 'Master Admin', 'Company Admin', 'Warehouse Manager', 'Warehouse Operator', 'Viewer / Auditor'
    permission_key TEXT NOT NULL, -- 'platform.manage', 'tenants.provision', 'inventory.read', 'inventory.adjust', 'catalog.manage', 'settings.manage', 'users.manage'
    description TEXT,
    PRIMARY KEY (role, permission_key)
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    username TEXT UNIQUE,
    email TEXT,
    password_hash TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Warehouse Operator', -- 'Master Admin', 'Company Admin', 'Warehouse Manager', 'Warehouse Operator', 'Viewer / Auditor'
    all_facilities_access BOOLEAN NOT NULL DEFAULT TRUE,
    facility_id TEXT, -- Primary default facility
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing user_profiles table has all columns and constraints
ALTER TABLE public.user_profiles ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Warehouse Operator';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS all_facilities_access BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS facility_id TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Granular per-facility user access grants
CREATE TABLE IF NOT EXISTS public.user_facility_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL DEFAULT 'read_write', -- 'read_write', 'read_only'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, facility_id)
);

-- ----------------------------------------------------------------------------
-- 3. UNITS OF MEASURE (UOM Hierarchy)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.units_of_measure (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'count', -- 'count', 'area', 'length', 'weight'
    is_base_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing units_of_measure table has is_base_default
ALTER TABLE public.units_of_measure ADD COLUMN IF NOT EXISTS is_base_default BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.units_of_measure ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'count';

-- ----------------------------------------------------------------------------
-- 4. CUSTOM FIELDS / USER-DEFINED FIELDS (UDF Engine)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_fields (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text', -- 'text', 'number', 'select', 'date'
    required BOOLEAN NOT NULL DEFAULT FALSE,
    show_in_grid BOOLEAN NOT NULL DEFAULT TRUE,
    entity TEXT NOT NULL DEFAULT 'item', -- 'item' or 'lpn'
    options JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. FACILITY TYPES (Manageable Operating Categories)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facility_types (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- 'warehouse', 'showroom', 'mobile_van', 'hub'
    name TEXT NOT NULL, -- 'Main Warehouse / DC', 'Showroom & Retail'
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. FACILITIES (Warehouses, Showrooms, Mobile Vans)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facilities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'warehouse', -- 'warehouse', 'showroom', 'mobile_van'
    address TEXT,
    tracking_mode TEXT NOT NULL DEFAULT 'lpn', -- 'lpn' or 'summary_only'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing facilities table has tracking_mode
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'lpn';

-- ----------------------------------------------------------------------------
-- 6. LOCATIONS / BINS (Aisle, Rack, Shelf, Bay)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    zone TEXT NOT NULL DEFAULT 'racking', -- 'racking', 'floor_bulk', 'roll_rack', 'receiving', 'staging', 'shipping'
    capacity INTEGER NOT NULL DEFAULT 4,
    barcode TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. ITEMS / CATALOG (Products, Packaging Conversions, Custom UDF JSONB)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    base_uom TEXT NOT NULL,
    packaging_hierarchy JSONB NOT NULL DEFAULT '[]'::JSONB,
    custom_attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
    min_safety_stock NUMERIC NOT NULL DEFAULT 0,
    reorder_point NUMERIC NOT NULL DEFAULT 0,
    cost_price NUMERIC NOT NULL DEFAULT 0.00,
    sell_price NUMERIC NOT NULL DEFAULT 0.00,
    barcode TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing items table has all JSONB & pricing columns
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS packaging_hierarchy JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS min_safety_stock NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS reorder_point NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cost_price NUMERIC NOT NULL DEFAULT 0.00;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sell_price NUMERIC NOT NULL DEFAULT 0.00;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ----------------------------------------------------------------------------
-- 8. LPNS (License Plate Numbers - Pallets, Bins, Rolls, Lots)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lpns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    lpn_number TEXT NOT NULL,
    sku TEXT NOT NULL,
    lot_number TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    uom TEXT NOT NULL,
    pallet_status TEXT NOT NULL DEFAULT 'available', -- 'available', 'reserved', 'quarantine', 'allocated'
    custom_attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing lpns table has all columns
ALTER TABLE public.lpns ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE public.lpns ADD COLUMN IF NOT EXISTS pallet_status TEXT NOT NULL DEFAULT 'available';
ALTER TABLE public.lpns ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}'::JSONB;

-- ----------------------------------------------------------------------------
-- 9. INVENTORY TRANSACTIONS (Audit Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'inbound_receipt', 'lpn_relocation', 'outbound_dispatch', 'stock_adjustment', 'count_variance'
    lpn_id TEXT,
    sku TEXT NOT NULL,
    qty_change NUMERIC NOT NULL,
    uom TEXT NOT NULL,
    from_location_id TEXT,
    to_location_id TEXT,
    reference_doc TEXT,
    user_name TEXT NOT NULL DEFAULT 'System Admin',
    notes TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. LABEL TEMPLATES & SIZES (Pallet, Bin, SKU, Dispatch)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.label_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- 'Standard Pallet Thermal Label', 'Bin Shelf Tag'
    type TEXT NOT NULL DEFAULT 'lpn_pallet', -- 'lpn_pallet', 'bin_location', 'item_sku', 'dispatch_slip'
    width_in NUMERIC NOT NULL DEFAULT 4.0,
    height_in NUMERIC NOT NULL DEFAULT 6.0,
    unit TEXT NOT NULL DEFAULT 'in', -- 'in' or 'mm'
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    include_qr BOOLEAN NOT NULL DEFAULT TRUE,
    include_barcode BOOLEAN NOT NULL DEFAULT TRUE,
    include_lot BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing label_templates table has all columns
ALTER TABLE public.label_templates ADD COLUMN IF NOT EXISTS width_in NUMERIC NOT NULL DEFAULT 4.0;
ALTER TABLE public.label_templates ADD COLUMN IF NOT EXISTS height_in NUMERIC NOT NULL DEFAULT 6.0;
ALTER TABLE public.label_templates ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'in';
ALTER TABLE public.label_templates ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.label_templates ADD COLUMN IF NOT EXISTS include_qr BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.label_templates ADD COLUMN IF NOT EXISTS include_barcode BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.label_templates ADD COLUMN IF NOT EXISTS include_lot BOOLEAN NOT NULL DEFAULT TRUE;

-- ----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES & ACCESS CONTROL
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_facility_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lpns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;

-- Allow public / anon read and write for the interactive application
-- (In production, replace with tenant-scoped auth JWT policies)
DROP POLICY IF EXISTS "Allow public read-write for tenants" ON public.tenants;
CREATE POLICY "Allow public read-write for tenants" ON public.tenants FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for role_permissions" ON public.role_permissions;
CREATE POLICY "Allow public read-write for role_permissions" ON public.role_permissions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for user_profiles" ON public.user_profiles;
CREATE POLICY "Allow public read-write for user_profiles" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for user_facility_access" ON public.user_facility_access;
CREATE POLICY "Allow public read-write for user_facility_access" ON public.user_facility_access FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for facility_types" ON public.facility_types;
CREATE POLICY "Allow public read-write for facility_types" ON public.facility_types FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for units_of_measure" ON public.units_of_measure;
CREATE POLICY "Allow public read-write for units_of_measure" ON public.units_of_measure FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for custom_fields" ON public.custom_fields;
CREATE POLICY "Allow public read-write for custom_fields" ON public.custom_fields FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for facilities" ON public.facilities;
CREATE POLICY "Allow public read-write for facilities" ON public.facilities FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for locations" ON public.locations;
CREATE POLICY "Allow public read-write for locations" ON public.locations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for items" ON public.items;
CREATE POLICY "Allow public read-write for items" ON public.items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for lpns" ON public.lpns;
CREATE POLICY "Allow public read-write for lpns" ON public.lpns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Allow public read-write for inventory_transactions" ON public.inventory_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for label_templates" ON public.label_templates;
CREATE POLICY "Allow public read-write for label_templates" ON public.label_templates FOR ALL USING (true) WITH CHECK (true);

-- Indexes for Tenant Isolation & High Performance Querying
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON public.user_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_facility_access_tenant ON public.user_facility_access (tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_of_measure_tenant ON public.units_of_measure (tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant ON public.custom_fields (tenant_id);
CREATE INDEX IF NOT EXISTS idx_facility_types_tenant ON public.facility_types (tenant_id);
CREATE INDEX IF NOT EXISTS idx_facilities_tenant ON public.facilities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_locations_tenant ON public.locations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_items_tenant ON public.items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lpns_tenant ON public.lpns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_tenant ON public.inventory_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_label_templates_tenant ON public.label_templates (tenant_id);

-- ----------------------------------------------------------------------------
-- 11. SEED CANONICAL ROLE PERMISSIONS MATRIX
-- ----------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission_key, description)
VALUES
  ('Company Admin', 'all', 'Full tenant administrative & operational access'),
  ('Warehouse Manager', 'inventory.receive', 'Inbound receiving and putaway'),
  ('Warehouse Manager', 'inventory.relocate', 'Move pallets and stock between locations'),
  ('Warehouse Manager', 'inventory.adjust', 'Adjust stock levels and reason codes'),
  ('Warehouse Manager', 'catalog.manage', 'Add and edit SKUs and packaging hierarchies'),
  ('Warehouse Manager', 'reports.view', 'View inventory audit ledger and KPI metrics'),
  ('Warehouse Operator', 'inventory.scan', 'Scan barcodes and verify LPN contents'),
  ('Warehouse Operator', 'inventory.relocate', 'Execute assigned transfer picks and putaways'),
  ('Warehouse Operator', 'inventory.receive', 'Receive inbound items against POs'),
  ('Viewer / Auditor', 'inventory.read', 'Read-only view of stock, locations, and audit logs')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 12. SEED PRIMARY ENTERPRISE TENANT & CORE FOUNDATION
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, slug, template, tier)
VALUES 
  ('tenant-primary', 'Primary Enterprise Organization', 'primary-org', 'general_wms', 'Enterprise Tier')
ON CONFLICT (id) DO NOTHING;

-- Seed Standard Facility Types
INSERT INTO public.facility_types (id, tenant_id, code, name, description, is_default)
VALUES
  ('ftype-wh-main', 'tenant-primary', 'warehouse', 'Main Warehouse / DC', 'Central distribution hub with racking & docks', TRUE),
  ('ftype-dock-main', 'tenant-primary', 'cross_dock', 'Cross-Dock Terminal', 'Fast-turnaround transit facility', FALSE),
  ('ftype-fleet-main', 'tenant-primary', 'mobile_van', 'Mobile Fleet Unit', 'Installation / contractor mobile vehicle', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed Standard Units of Measure
INSERT INTO public.units_of_measure (id, tenant_id, name, code, category, is_base_default)
VALUES
  ('uom-ea', 'tenant-primary', 'Each / Unit', 'EA', 'count', TRUE),
  ('uom-cs', 'tenant-primary', 'Case / Box', 'CS', 'count', FALSE),
  ('uom-plt', 'tenant-primary', 'Pallet (PLT)', 'PLT', 'count', FALSE),
  ('uom-lbs', 'tenant-primary', 'Pounds (Lbs)', 'LBS', 'weight', FALSE),
  ('uom-sqft', 'tenant-primary', 'Square Feet', 'SQFT', 'area', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed Standard Primary Warehouse Facility
INSERT INTO public.facilities (id, tenant_id, code, name, type, address, tracking_mode)
VALUES
  ('fac-main-dc', 'tenant-primary', 'FAC-01', 'Central Distribution Center', 'warehouse', '100 Industrial Pkwy', 'lpn')
ON CONFLICT (id) DO NOTHING;

-- Seed Standard Receiving and Racking Location Bins
INSERT INTO public.locations (id, tenant_id, facility_id, code, name, zone, capacity, barcode)
VALUES
  ('loc-rcv-01', 'tenant-primary', 'fac-main-dc', 'RCV-DOCK-1', 'Inbound Receiving Staging Dock', 'receiving', 20, 'LOC-RCV-01'),
  ('loc-a01-r01-a', 'tenant-primary', 'fac-main-dc', 'A01-R01-A', 'Aisle 1, Rack 1, Floor Bay', 'racking', 4, 'LOC-A01-R01-A'),
  ('loc-a01-r02-b', 'tenant-primary', 'fac-main-dc', 'A01-R02-B', 'Aisle 1, Rack 2, Level 2', 'racking', 4, 'LOC-A01-R02-B')
ON CONFLICT (id) DO NOTHING;

-- Seed Standard Configurable Label Templates
INSERT INTO public.label_templates (id, tenant_id, name, type, width_in, height_in, unit, is_default, include_qr, include_barcode, include_lot)
VALUES
  ('lbl-4x6-pallet', 'tenant-primary', 'Standard 4x6" Pallet LPN Tag', 'lpn_pallet', 4.0, 6.0, 'in', TRUE, TRUE, TRUE, TRUE),
  ('lbl-2x1-bin', 'tenant-primary', 'Rack / Shelf Bin Marker (2x1")', 'bin_location', 2.0, 1.0, 'in', TRUE, FALSE, TRUE, FALSE),
  ('lbl-3x1-sku', 'tenant-primary', 'Item Carton Barcode (3x1")', 'item_sku', 3.0, 1.0, 'in', TRUE, FALSE, TRUE, FALSE),
  ('lbl-85x11-sheet', 'tenant-primary', 'Packing Sheet & Dispatch Slip (8.5x11")', 'dispatch_slip', 8.5, 11.0, 'in', FALSE, TRUE, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Super Administrator Profile
INSERT INTO public.user_profiles (id, tenant_id, username, email, password_hash, name, role, all_facilities_access, facility_id, status)
VALUES
  ('c0a80121-0001-4000-8000-000000000001', 'tenant-primary', 'derek', 'derek@simpletory.com', NULL, 'Derek Lumpkin', 'Master Admin', TRUE, 'fac-main-dc', 'Active')
ON CONFLICT (id) DO UPDATE SET role = 'Master Admin';


