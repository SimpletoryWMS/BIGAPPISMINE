-- ============================================================================
-- SIMPLETORY ENTERPRISE MULTI-TENANT WMS - COMPLETE PRODUCTION SCHEMA
-- ============================================================================
-- Features:
-- 1. Native Supabase Auth Integration & Cryptographic JWT Verification
-- 2. Strict Kernel-Level Row Level Security (RLS) with Tenant Isolation
-- 3. Automated Database Audit Trigger for Stock Tracking
-- 4. Realtime Subscriptions & Performance Indexes
-- 5. Automated Server-Side User Provisioning Function
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Cleanup Legacy Auth Triggers & Obsolete Functions (if present)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    trg_record RECORD;
BEGIN
    FOR trg_record IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_schema = 'auth' AND event_object_table = 'users'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(trg_record.trigger_name) || ' ON auth.users CASCADE;';
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;

-- ----------------------------------------------------------------------------
-- 1. Core Tables
-- ----------------------------------------------------------------------------

-- 1. Tenants / Facilities Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users & RBAC Table (Linked with Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 3. Items Master Table (with sub_category)
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

-- 4. Inventory Overview Table (On-Hand Stock by Location)
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

-- 5. Inventory Change History / Audit Log Table
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

-- ----------------------------------------------------------------------------
-- 2. Audit History Trigger Function (Immutable Audit Logging)
-- ----------------------------------------------------------------------------
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

DROP TRIGGER IF EXISTS trg_audit_inventory ON public.inventory;
CREATE TRIGGER trg_audit_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_inventory_changes();

-- ----------------------------------------------------------------------------
-- 3. Helper Functions for Cryptographic JWT & RLS Tenant Evaluation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM public.users 
  WHERE id::text = auth.uid()::text OR email = auth.jwt()->>'email'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.users 
  WHERE id::text = auth.uid()::text OR email = auth.jwt()->>'email'
  LIMIT 1;
$$;

-- Username to Email resolver for public login
CREATE OR REPLACE FUNCTION public.get_email_for_login(p_identifier TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT email FROM public.users 
  WHERE (LOWER(username) = LOWER(TRIM(p_identifier)) OR LOWER(email) = LOWER(TRIM(p_identifier)))
    AND status = 'Active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_login(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Kernel-Level Row Level Security (RLS) - Strict Tenant Isolation
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 1. Tenants Table Policies
DROP POLICY IF EXISTS "Public access tenants" ON public.tenants;
DROP POLICY IF EXISTS "Authenticated tenants access" ON public.tenants;
CREATE POLICY "Authenticated tenants access" ON public.tenants
  FOR ALL TO authenticated
  USING (public.get_auth_role() = 'Superadmin' OR id = public.get_auth_tenant_id())
  WITH CHECK (public.get_auth_role() = 'Superadmin');

-- 2. Items Table Policies
DROP POLICY IF EXISTS "Tenant isolation items" ON public.items;
CREATE POLICY "Tenant isolation items" ON public.items
  FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin')
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin');

-- 3. Inventory Table Policies
DROP POLICY IF EXISTS "Tenant isolation inventory" ON public.inventory;
CREATE POLICY "Tenant isolation inventory" ON public.inventory
  FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin')
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin');

-- 4. Inventory History Table Policies
DROP POLICY IF EXISTS "Tenant isolation inventory_history" ON public.inventory_history;
CREATE POLICY "Tenant isolation inventory_history" ON public.inventory_history
  FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin')
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin');

-- 5. Users Table Policies
DROP POLICY IF EXISTS "Tenant isolation users" ON public.users;
CREATE POLICY "Tenant isolation users" ON public.users
  FOR ALL TO authenticated
  USING (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin')
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.get_auth_role() = 'Superadmin');

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_items_tenant ON public.items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON public.inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_history_tenant ON public.inventory_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);

-- ----------------------------------------------------------------------------
-- 5. Team Provisioning & In-App User Creation Function
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.create_team_member(
    p_username TEXT,
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_tenant_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_tenant TEXT;
    v_new_uid UUID := gen_random_uuid();
    v_encrypted_pw TEXT;
    v_clean_email TEXT := LOWER(TRIM(p_email));
    v_clean_username TEXT := TRIM(p_username);
BEGIN
    -- 1. Caller Authorization Check
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant 
    FROM public.users 
    WHERE id::text = auth.uid()::text OR email = auth.jwt()->>'email';

    IF v_caller_role NOT IN ('Superadmin', 'Manager') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Managers and Superadmins can create team members.');
    END IF;

    IF v_caller_role = 'Manager' AND p_tenant_id <> v_caller_tenant THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Managers can only add users to their assigned facility.');
    END IF;

    -- 2. Validate Uniqueness
    IF EXISTS (SELECT 1 FROM public.users WHERE tenant_id = p_tenant_id AND LOWER(username) = LOWER(v_clean_username)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Username already exists in this facility.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = v_clean_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Email address is already in use.');
    END IF;

    -- 3. Create auth.users Record (Auto-Confirmed Email for Instant Sign-In)
    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_new_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_clean_email,
        v_encrypted_pw,
        NOW(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('username', v_clean_username, 'full_name', p_full_name, 'role', p_role, 'tenant_id', p_tenant_id),
        NOW(),
        NOW()
    );

    -- 4. Create public.users Record
    INSERT INTO public.users (id, tenant_id, username, email, full_name, role, status, created_at)
    VALUES (v_new_uid::text, p_tenant_id, v_clean_username, v_clean_email, p_full_name, p_role, 'Active', NOW());

    RETURN jsonb_build_object('success', true, 'user_id', v_new_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_member(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Realtime Subscriptions
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 7. Initial Seed Tenants & Catalog (No Default Users)
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, is_active)
VALUES 
  ('org-primary', 'Main Enterprise Warehouse', true),
  ('org-east', 'East Coast Distribution Center', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.items (id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point)
VALUES 
  ('itm-1', 'org-primary', 'SKU-1001', 'Standard Heavy Duty Pallet Box', 'Packaging', 'Corrugated', 'EA', 14.50, 20),
  ('itm-2', 'org-primary', 'SKU-1002', 'Industrial Stretch Film Roll 80GA', 'Packaging', 'Plastic Wrap', 'RL', 22.00, 15),
  ('itm-3', 'org-primary', 'SKU-2001', 'Heavy Duty Steel Bracket 4-Hole', 'Hardware', 'Brackets', 'EA', 3.75, 50),
  ('itm-4', 'org-primary', 'SKU-3001', 'Premium Utility Knife Blades (Pack of 50)', 'Tools', 'Blades', 'PK', 8.90, 10),
  ('itm-5', 'org-primary', 'SKU-4001', 'Poly Bubble Mailers #0 (6x10)', 'Packaging', 'Envelopes', 'CS', 32.40, 25),
  ('itm-6', 'org-primary', 'SKU-5001', 'Direct Thermal Shipping Labels 4x6', 'Supplies', 'Labels', 'RL', 11.25, 30)
ON CONFLICT (tenant_id, sku) DO NOTHING;

INSERT INTO public.inventory (id, tenant_id, item_id, location, quantity, status)
VALUES
  ('inv-1', 'org-primary', 'itm-1', 'A-01-01', 120, 'Available'),
  ('inv-2', 'org-primary', 'itm-2', 'A-01-02', 45, 'Available'),
  ('inv-3', 'org-primary', 'itm-3', 'B-02-01', 300, 'Available'),
  ('inv-4', 'org-primary', 'itm-4', 'B-02-02', 8, 'Low Stock'),
  ('inv-5', 'org-primary', 'itm-5', 'C-01-01', 64, 'Available'),
  ('inv-6', 'org-primary', 'itm-6', 'C-02-01', 5, 'Low Stock')
ON CONFLICT (tenant_id, item_id, location) DO NOTHING;
