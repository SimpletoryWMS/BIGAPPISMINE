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
    role TEXT NOT NULL, -- 'Company Admin', 'Warehouse Manager', 'Warehouse Operator', 'Viewer / Auditor'
    permission_key TEXT NOT NULL, -- 'inventory.read', 'inventory.adjust', 'catalog.manage', 'settings.manage', 'users.manage'
    description TEXT,
    PRIMARY KEY (role, permission_key)
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Warehouse Operator', -- 'Company Admin', 'Warehouse Manager', 'Warehouse Operator', 'Viewer / Auditor'
    all_facilities_access BOOLEAN NOT NULL DEFAULT TRUE,
    facility_id TEXT, -- Primary default facility
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    category TEXT NOT NULL DEFAULT 'Hardwood',
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
-- 10. ROW LEVEL SECURITY (RLS) POLICIES & ACCESS CONTROL
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

-- Allow public / anon read and write for the interactive application
-- (In production, replace with tenant-scoped auth JWT policies)
CREATE POLICY "Allow public read-write for tenants" ON public.tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for role_permissions" ON public.role_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for user_profiles" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for user_facility_access" ON public.user_facility_access FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for facility_types" ON public.facility_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for units_of_measure" ON public.units_of_measure FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for custom_fields" ON public.custom_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for facilities" ON public.facilities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for locations" ON public.locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for items" ON public.items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for lpns" ON public.lpns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for inventory_transactions" ON public.inventory_transactions FOR ALL USING (true) WITH CHECK (true);

-- Seed Canonical Role Permissions Matrix
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
-- 11. SEED DEFAULT TENANTS & CORE DATA
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, slug, template, tier)
VALUES 
  ('tenant-flooring', 'Apex Flooring & Tile Solutions', 'apex-flooring', 'flooring', 'Enterprise Free Tier'),
  ('tenant-general', 'Cascade Distribution & Logistics', 'cascade-logistics', 'general_wms', 'Starter Tier')
ON CONFLICT (id) DO NOTHING;

-- Seed Facility Types
INSERT INTO public.facility_types (id, tenant_id, code, name, description, is_default)
VALUES
  ('ftype-wh-floor', 'tenant-flooring', 'warehouse', 'Main Warehouse / DC', 'Central distribution hub with racking & docks', TRUE),
  ('ftype-shw-floor', 'tenant-flooring', 'showroom', 'Showroom & Retail', 'Customer-facing sales floor & sample library', FALSE),
  ('ftype-van-floor', 'tenant-flooring', 'mobile_van', 'Mobile Fleet Unit', 'Installation contractor mobile van/truck', FALSE),
  ('ftype-yard-floor', 'tenant-flooring', 'staging_yard', 'Staging Yard', 'Outdoor or jobsite contractor staging area', FALSE),
  ('ftype-wh-gen', 'tenant-general', 'warehouse', 'Central Logistics Hub', 'Full-scale palletized distribution warehouse', TRUE),
  ('ftype-dock-gen', 'tenant-general', 'cross_dock', 'Cross-Dock Terminal', 'Fast-turnaround inbound/outbound transit dock', FALSE),
  ('ftype-store-gen', 'tenant-general', 'retail_store', 'Retail Branch Outlet', 'Local pickup and direct-to-consumer store', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed UOMs
INSERT INTO public.units_of_measure (id, tenant_id, name, code, category, is_base_default)
VALUES
  ('uom-sqft', 'tenant-flooring', 'Square Feet', 'SQFT', 'area', TRUE),
  ('uom-box', 'tenant-flooring', 'Carton / Box', 'BOX', 'count', FALSE),
  ('uom-pallet', 'tenant-flooring', 'Pallet (Outer Pack)', 'PLT', 'count', FALSE),
  ('uom-roll', 'tenant-flooring', 'Carpet Roll', 'RL', 'length', FALSE),
  ('uom-linft', 'tenant-flooring', 'Linear Feet', 'LFT', 'length', FALSE),
  ('uom-pc', 'tenant-flooring', 'Piece / Tile', 'PC', 'count', FALSE),
  ('uom-ea', 'tenant-general', 'Each / Unit', 'EA', 'count', TRUE),
  ('uom-cs', 'tenant-general', 'Case', 'CS', 'count', FALSE),
  ('uom-plt', 'tenant-general', 'Pallet', 'PLT', 'count', FALSE),
  ('uom-lbs', 'tenant-general', 'Pounds (Lbs)', 'LBS', 'weight', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed Custom Fields (UDFs)
INSERT INTO public.custom_fields (id, tenant_id, key, label, type, required, show_in_grid, entity)
VALUES
  ('udf-sqft-box', 'tenant-flooring', 'sqft_per_box', 'Sq Ft per Box', 'number', TRUE, TRUE, 'item'),
  ('udf-color-stain', 'tenant-flooring', 'color_stain', 'Color / Stain', 'text', TRUE, TRUE, 'item'),
  ('udf-dye-lot', 'tenant-flooring', 'dye_lot_run', 'Dye Lot / Run #', 'text', TRUE, TRUE, 'lpn'),
  ('udf-wear-layer', 'tenant-flooring', 'wear_layer_mil', 'Wear Layer (mil)', 'text', FALSE, FALSE, 'item'),
  ('udf-oem-num', 'tenant-general', 'oem_part_no', 'OEM Part Number', 'text', TRUE, TRUE, 'item'),
  ('udf-weight', 'tenant-general', 'weight_per_unit', 'Weight per Unit (lbs)', 'number', FALSE, TRUE, 'item'),
  ('udf-batch-id', 'tenant-general', 'batch_lot_tag', 'Batch / Lot Tag', 'text', TRUE, TRUE, 'lpn')
ON CONFLICT (id) DO NOTHING;

-- Seed Facilities
INSERT INTO public.facilities (id, tenant_id, code, name, type, address, tracking_mode)
VALUES
  ('fac-main-dc', 'tenant-flooring', 'FAC-01', 'Main Distribution Center & Warehouse', 'warehouse', '1040 Logistics Pkwy, Bldg 4', 'lpn'),
  ('fac-showroom', 'tenant-flooring', 'FAC-02', 'Downtown Design Showroom & Samples', 'showroom', '420 Metro Blvd, Suite 100', 'summary_only'),
  ('fac-van-3', 'tenant-flooring', 'FAC-03', 'Mobile Installation Van #3', 'mobile_van', 'Fleet Field Vehicle', 'summary_only'),
  ('fac-gen-hub', 'tenant-general', 'FAC-01', 'Cascades Central Distribution', 'warehouse', '88 Commerce Way', 'lpn'),
  ('fac-gen-dock', 'tenant-general', 'FAC-02', 'Cross-Dock Terminal East', 'warehouse', '12 Freight Lane', 'lpn')
ON CONFLICT (id) DO NOTHING;

-- Seed Locations
INSERT INTO public.locations (id, tenant_id, facility_id, code, name, zone, capacity, barcode)
VALUES
  ('loc-a01-r01-a', 'tenant-flooring', 'fac-main-dc', 'A01-R01-A', 'Aisle 1, Rack 1, Floor Bay', 'racking', 4, 'LOC-A01-R01-A'),
  ('loc-a01-r02-b', 'tenant-flooring', 'fac-main-dc', 'A01-R02-B', 'Aisle 1, Rack 2, Level 2', 'racking', 2, 'LOC-A01-R02-B'),
  ('loc-a02-r04-a', 'tenant-flooring', 'fac-main-dc', 'A02-R04-A', 'Aisle 2, Rack 4, Heavy Pallet Bay', 'racking', 3, 'LOC-A02-R04-A'),
  ('loc-car-01', 'tenant-flooring', 'fac-main-dc', 'ROLL-CAR-01', 'Carpet Roll Carousel Tower A', 'roll_rack', 12, 'LOC-ROLL-01'),
  ('loc-rcv-01', 'tenant-flooring', 'fac-main-dc', 'RCV-DOCK-1', 'Inbound Receiving Staging Dock', 'receiving', 10, 'LOC-RCV-01'),
  ('loc-shw-rack', 'tenant-flooring', 'fac-showroom', 'SHW-RACK-1', 'Showroom Sample Display Rack', 'floor_bulk', 50, 'LOC-SHW-01'),
  ('loc-van-bin', 'tenant-flooring', 'fac-van-3', 'VAN-BIN-1', 'Van Interior Tool & Box Shelf', 'floor_bulk', 20, 'LOC-VAN-01'),
  ('loc-g-01', 'tenant-general', 'fac-gen-hub', 'BAY-01-A', 'Main High-Bay Rack 1', 'racking', 6, 'LOC-BAY-01-A'),
  ('loc-g-02', 'tenant-general', 'fac-gen-hub', 'BAY-02-B', 'Main High-Bay Rack 2', 'racking', 6, 'LOC-BAY-02-B')
ON CONFLICT (id) DO NOTHING;

-- Seed Catalog Items
INSERT INTO public.items (id, tenant_id, sku, name, category, base_uom, packaging_hierarchy, custom_attributes, min_safety_stock, reorder_point, cost_price, sell_price, barcode)
VALUES
  (
    'item-oak-white',
    'tenant-flooring',
    'SKU-OAK-01',
    'European White Oak Engineered Hardwood 7.5in',
    'Hardwood',
    'SQFT',
    '[{"level": 1, "uom": "BOX", "name": "Carton / Box", "ratioToBase": 24.5, "barcode": "07412891234"}, {"level": 2, "uom": "PLT", "name": "Pallet (60 Boxes)", "ratioToBase": 1470, "barcode": "07412891235"}]'::JSONB,
    '{"sqft_per_box": 24.5, "color_stain": "Nordic Natural Matte", "wear_layer_mil": "4mm Sawn Veneer"}'::JSONB,
    500,
    1500,
    3.85,
    6.99,
    'SKU-OAK-01'
  ),
  (
    'item-tile-calacatta',
    'tenant-flooring',
    'SKU-TILE-02',
    'Calacatta Gold Polished Porcelain Tile 24x48',
    'Tile & Stone',
    'SQFT',
    '[{"level": 1, "uom": "BOX", "name": "Carton (2 Pcs)", "ratioToBase": 16.0, "barcode": "08912899011"}, {"level": 2, "uom": "PLT", "name": "Pallet (32 Boxes)", "ratioToBase": 512, "barcode": "08912899012"}]'::JSONB,
    '{"sqft_per_box": 16.0, "color_stain": "Calacatta Warm Gold", "wear_layer_mil": "N/A - Porcelain"}'::JSONB,
    300,
    800,
    2.40,
    5.49,
    'SKU-TILE-02'
  ),
  (
    'item-lvp-slate',
    'tenant-flooring',
    'SKU-LVP-03',
    'Summit Rigid Core LVP Waterproof Plank 20mil',
    'Vinyl / LVP',
    'SQFT',
    '[{"level": 1, "uom": "BOX", "name": "Carton / Box", "ratioToBase": 20.0, "barcode": "06512398411"}, {"level": 2, "uom": "PLT", "name": "Pallet (55 Boxes)", "ratioToBase": 1100, "barcode": "06512398412"}]'::JSONB,
    '{"sqft_per_box": 20.0, "color_stain": "Charcoal Slate Wirebrush", "wear_layer_mil": "20 mil Commercial"}'::JSONB,
    1000,
    2500,
    1.65,
    3.79,
    'SKU-LVP-03'
  ),
  (
    'item-carpet-berber',
    'tenant-flooring',
    'SKU-CPT-04',
    'Highland Wool Loop Pattern Broadloom 12ft Roll',
    'Carpet & Rugs',
    'SQFT',
    '[{"level": 1, "uom": "RL", "name": "Carpet Roll (12ft x 100ft)", "ratioToBase": 1200.0, "barcode": "09912488111"}]'::JSONB,
    '{"sqft_per_box": 1200.0, "color_stain": "Oatmeal Heather", "wear_layer_mil": "Heavy Traffic"}'::JSONB,
    1200,
    2400,
    1.90,
    4.25,
    'SKU-CPT-04'
  ),
  (
    'item-gen-fastener',
    'tenant-general',
    'SKU-IND-501',
    'M8 Grade 8.8 Galvanized Flange Bolt (100pk)',
    'Industrial Hardware',
    'EA',
    '[{"level": 1, "uom": "CS", "name": "Case (10 Packs)", "ratioToBase": 10.0, "barcode": "01239912001"}, {"level": 2, "uom": "PLT", "name": "Pallet (50 Cases)", "ratioToBase": 500.0, "barcode": "01239912002"}]'::JSONB,
    '{"oem_part_no": "FLG-M8-100G", "weight_per_unit": 4.5}'::JSONB,
    50,
    200,
    12.50,
    24.95,
    'SKU-IND-501'
  )
ON CONFLICT (id) DO NOTHING;

-- Seed LPNS (License Plate Pallets)
INSERT INTO public.lpns (id, tenant_id, facility_id, location_id, lpn_number, sku, lot_number, quantity, uom, pallet_status, custom_attributes)
VALUES
  ('lpn-849201', 'tenant-flooring', 'fac-main-dc', 'loc-a01-r01-a', 'LPN-849201', 'SKU-OAK-01', 'LOT-2026-A1', 1470, 'SQFT', 'available', '{"dye_lot_run": "LOT-2026-A1"}'::JSONB),
  ('lpn-849202', 'tenant-flooring', 'fac-main-dc', 'loc-a01-r01-a', 'LPN-849202', 'SKU-OAK-01', 'LOT-2026-A1', 1470, 'SQFT', 'available', '{"dye_lot_run": "LOT-2026-A1"}'::JSONB),
  ('lpn-849203', 'tenant-flooring', 'fac-main-dc', 'loc-a01-r02-b', 'LPN-849203', 'SKU-TILE-02', 'LOT-CAL-99', 512, 'SQFT', 'available', '{"dye_lot_run": "LOT-CAL-99"}'::JSONB),
  ('lpn-849204', 'tenant-flooring', 'fac-main-dc', 'loc-a02-r04-a', 'LPN-849204', 'SKU-LVP-03', 'LOT-LVP-884', 1100, 'SQFT', 'available', '{"dye_lot_run": "LOT-LVP-884"}'::JSONB),
  ('lpn-849205', 'tenant-flooring', 'fac-main-dc', 'loc-car-01', 'LPN-849205', 'SKU-CPT-04', 'ROLL-BER-01', 1200, 'SQFT', 'available', '{"dye_lot_run": "ROLL-BER-01"}'::JSONB),
  ('lpn-849206', 'tenant-flooring', 'fac-main-dc', 'loc-rcv-01', 'LPN-849206', 'SKU-OAK-01', 'LOT-2026-B2', 735, 'SQFT', 'available', '{"dye_lot_run": "LOT-2026-B2"}'::JSONB),
  ('lpn-990101', 'tenant-general', 'fac-gen-hub', 'loc-g-01', 'LPN-990101', 'SKU-IND-501', 'BATCH-88A', 500, 'EA', 'available', '{"batch_lot_tag": "BATCH-88A"}'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Transactions
INSERT INTO public.inventory_transactions (tenant_id, facility_id, type, lpn_id, sku, qty_change, uom, from_location_id, to_location_id, reference_doc, user_name, notes)
VALUES
  ('tenant-flooring', 'fac-main-dc', 'inbound_receipt', 'LPN-849201', 'SKU-OAK-01', 1470, 'SQFT', 'loc-rcv-01', 'loc-a01-r01-a', 'PO-2026-0881', 'Derek Lumpkin', 'Initial container intake receiving & putaway'),
  ('tenant-flooring', 'fac-main-dc', 'inbound_receipt', 'LPN-849203', 'SKU-TILE-02', 512, 'SQFT', 'loc-rcv-01', 'loc-a01-r02-b', 'PO-2026-0882', 'Derek Lumpkin', 'Italian porcelain crate putaway')
ON CONFLICT (id) DO NOTHING;

-- Seed User Profiles (Universal Generic Roles)
INSERT INTO public.user_profiles (id, tenant_id, email, name, role, all_facilities_access, facility_id, status)
VALUES
  ('c0a80121-0001-4000-8000-000000000001', 'tenant-flooring', 'derek@apexflooring.com', 'Derek Lumpkin', 'Company Admin', TRUE, 'fac-main-dc', 'Active'),
  ('c0a80121-0002-4000-8000-000000000002', 'tenant-flooring', 'marcus@apexflooring.com', 'Marcus Vance', 'Warehouse Manager', FALSE, 'fac-main-dc', 'Active'),
  ('c0a80121-0003-4000-8000-000000000003', 'tenant-flooring', 'carlos@apexflooring.com', 'Carlos Gutierrez', 'Warehouse Operator', FALSE, 'fac-mobile-03', 'Active'),
  ('c0a80121-0004-4000-8000-000000000004', 'tenant-flooring', 'jessica@apexflooring.com', 'Jessica Taylor', 'Viewer / Auditor', FALSE, 'fac-showroom-02', 'Active'),
  ('c0a80121-0005-4000-8000-000000000005', 'tenant-general', 'elena@cascadelogistics.com', 'Elena Rostova', 'Company Admin', TRUE, 'fac-gen-hub', 'Active')
ON CONFLICT (id) DO NOTHING;

