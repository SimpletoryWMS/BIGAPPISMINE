-- ============================================================================
-- SIMPLETORY WMS - SECURE AUTOMATED DAILY SNAPSHOT & 14-DAY BACKUP SYSTEM
-- ============================================================================
-- Features:
-- 1. Inaccessible from the Frontend: Stored in an isolated 'backup' schema with
--    all permissions revoked from 'anon', 'authenticated', and public API roles.
-- 2. Daily Snapshot: Copies all 5 production tables (tenants, users, items,
--    inventory, inventory_history) with an extra 'snapshot_date' and 'snapshot_at' column.
-- 3. Automatic 14-Day Rolling Retention: Automatically deletes snapshots older than 14 days.
-- 4. Scheduled via pg_cron: Runs automatically every day at midnight (00:00 UTC).
-- 5. Manual / Test Run Support: Can be triggered anytime via SELECT public.fn_create_daily_database_backup();
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Create Isolated Backup Schema & Lock Permissions
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS backup;

-- Block all frontend / PostgREST access completely
REVOKE ALL ON SCHEMA backup FROM anon, authenticated, public;
ALTER DEFAULT PRIVILEGES IN SCHEMA backup REVOKE ALL ON TABLES FROM anon, authenticated, public;
ALTER DEFAULT PRIVILEGES IN SCHEMA backup REVOKE ALL ON FUNCTIONS FROM anon, authenticated, public;
ALTER DEFAULT PRIVILEGES IN SCHEMA backup REVOKE ALL ON SEQUENCES FROM anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- STEP 2: Create Mirror Backup Tables with Snapshot Metadata
-- ----------------------------------------------------------------------------

-- Backup Log Table (tracks execution runs and records backed up)
CREATE TABLE IF NOT EXISTS backup.backup_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    tenants_count INT DEFAULT 0,
    users_count INT DEFAULT 0,
    items_count INT DEFAULT 0,
    inventory_count INT DEFAULT 0,
    history_count INT DEFAULT 0,
    notes TEXT
);

-- 1. Backup Tenants
CREATE TABLE IF NOT EXISTS backup.tenants (
    backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ
);

-- 2. Backup Users
CREATE TABLE IF NOT EXISTS backup.users (
    backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
);

-- 3. Backup Items Master
CREATE TABLE IF NOT EXISTS backup.items (
    backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    sub_category TEXT,
    uom TEXT,
    unit_cost NUMERIC(12, 2),
    reorder_point NUMERIC(12, 2),
    created_at TIMESTAMPTZ
);

-- 4. Backup Inventory (On-Hand Stock)
CREATE TABLE IF NOT EXISTS backup.inventory (
    backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    location TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL,
    updated_at TIMESTAMPTZ
);

-- 5. Backup Inventory History / Audit Logs
CREATE TABLE IF NOT EXISTS backup.inventory_history (
    backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    item_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    qty_change NUMERIC(12, 2) NOT NULL,
    previous_qty NUMERIC(12, 2) NOT NULL,
    new_qty NUMERIC(12, 2) NOT NULL,
    location TEXT NOT NULL,
    user_name TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ
);

-- Performance & Rollback Search Indexes
CREATE INDEX IF NOT EXISTS idx_backup_tenants_date ON backup.tenants(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_backup_users_date ON backup.users(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_backup_items_date ON backup.items(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_backup_inventory_date ON backup.inventory(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_backup_history_date ON backup.inventory_history(snapshot_date);

-- Ensure table permissions are locked
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- STEP 3: Automated Backup Function (Snapshot + 14-Day Purge)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_daily_database_backup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_today DATE := CURRENT_DATE;
    v_tenants_cnt INT := 0;
    v_users_cnt INT := 0;
    v_items_cnt INT := 0;
    v_inv_cnt INT := 0;
    v_hist_cnt INT := 0;
    v_deleted_cnt INT := 0;
BEGIN
    -- 1. PURGE SNAPSHOTS OLDER THAN 14 DAYS
    DELETE FROM backup.tenants WHERE snapshot_at < (v_now - INTERVAL '14 days');
    DELETE FROM backup.users WHERE snapshot_at < (v_now - INTERVAL '14 days');
    DELETE FROM backup.items WHERE snapshot_at < (v_now - INTERVAL '14 days');
    DELETE FROM backup.inventory WHERE snapshot_at < (v_now - INTERVAL '14 days');
    DELETE FROM backup.inventory_history WHERE snapshot_at < (v_now - INTERVAL '14 days');
    DELETE FROM backup.backup_log WHERE snapshot_at < (v_now - INTERVAL '14 days');

    -- 2. SNAPSHOT: Tenants
    INSERT INTO backup.tenants (snapshot_date, snapshot_at, id, name, is_active, created_at)
    SELECT v_today, v_now, id, name, is_active, created_at FROM public.tenants;
    GET DIAGNOSTICS v_tenants_cnt = ROW_COUNT;

    -- 3. SNAPSHOT: Users
    INSERT INTO backup.users (snapshot_date, snapshot_at, id, tenant_id, username, email, password_hash, full_name, role, status, last_login_at, created_at)
    SELECT v_today, v_now, id, tenant_id, username, email, password_hash, full_name, role, status, last_login_at, created_at FROM public.users;
    GET DIAGNOSTICS v_users_cnt = ROW_COUNT;

    -- 4. SNAPSHOT: Items Master
    INSERT INTO backup.items (snapshot_date, snapshot_at, id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point, created_at)
    SELECT v_today, v_now, id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point, created_at FROM public.items;
    GET DIAGNOSTICS v_items_cnt = ROW_COUNT;

    -- 5. SNAPSHOT: Inventory
    INSERT INTO backup.inventory (snapshot_date, snapshot_at, id, tenant_id, item_id, location, quantity, status, updated_at)
    SELECT v_today, v_now, id, tenant_id, item_id, location, quantity, status, updated_at FROM public.inventory;
    GET DIAGNOSTICS v_inv_cnt = ROW_COUNT;

    -- 6. SNAPSHOT: Inventory History
    INSERT INTO backup.inventory_history (snapshot_date, snapshot_at, id, tenant_id, item_id, sku, item_name, action_type, qty_change, previous_qty, new_qty, location, user_name, notes, created_at)
    SELECT v_today, v_now, id, tenant_id, item_id, sku, item_name, action_type, qty_change, previous_qty, new_qty, location, user_name, notes, created_at FROM public.inventory_history;
    GET DIAGNOSTICS v_hist_cnt = ROW_COUNT;

    -- 7. Record Log
    INSERT INTO backup.backup_log (snapshot_date, snapshot_at, status, tenants_count, users_count, items_count, inventory_count, history_count, notes)
    VALUES (v_today, v_now, 'SUCCESS', v_tenants_cnt, v_users_cnt, v_items_cnt, v_inv_cnt, v_hist_cnt, 'Completed automated daily backup and 14-day rolling purge');

    RETURN jsonb_build_object(
        'success', true,
        'snapshot_date', v_today,
        'snapshot_at', v_now,
        'tenants_backed_up', v_tenants_cnt,
        'users_backed_up', v_users_cnt,
        'items_backed_up', v_items_cnt,
        'inventory_backed_up', v_inv_cnt,
        'history_backed_up', v_hist_cnt
    );
END;
$$;

-- Restrict execution of the backup function to superadmins / service_role
REVOKE ALL ON FUNCTION public.fn_create_daily_database_backup() FROM anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- STEP 4: Automated Schedule with pg_cron (Every Day at Midnight UTC)
-- ----------------------------------------------------------------------------
-- Enable pg_cron extension if not enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing scheduled job if present, then schedule at midnight (00:00)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'simpletory-daily-midnight-backup') THEN
        PERFORM cron.unschedule('simpletory-daily-midnight-backup');
    END IF;
    PERFORM cron.schedule('simpletory-daily-midnight-backup', '0 0 * * *', 'SELECT public.fn_create_daily_database_backup();');
END $$;


-- ============================================================================
-- HELPER & ROLLBACK RECIPES (FOR DATABASE ADMINISTRATORS)
-- ============================================================================
/*
-- 1. TO RUN A MANUAL BACKUP RIGHT NOW:
SELECT public.fn_create_daily_database_backup();

-- 2. TO VIEW BACKUP HISTORY & AVAILABLE SNAPSHOT DATES:
SELECT * FROM backup.backup_log ORDER BY snapshot_at DESC;

-- 3. TO VIEW BACKED UP ITEMS OR INVENTORY FOR A SPECIFIC DATE:
SELECT * FROM backup.items WHERE snapshot_date = '2026-09-24';
SELECT * FROM backup.inventory WHERE snapshot_date = '2026-09-24';

-- 4. TO RESTORE / ROLLBACK ON-HAND INVENTORY TO A SPECIFIC DATE (e.g. 2026-09-24):
-- BEGIN;
--   -- Disable triggers temporarily during rollback if desired
--   ALTER TABLE public.inventory DISABLE TRIGGER USER;
--   
--   -- Clear current inventory table
--   DELETE FROM public.inventory;
--   
--   -- Restore snapshot from target date
--   INSERT INTO public.inventory (id, tenant_id, item_id, location, quantity, status, updated_at)
--   SELECT id, tenant_id, item_id, location, quantity, status, updated_at 
--   FROM backup.inventory 
--   WHERE snapshot_date = '2026-09-24';
--   
--   ALTER TABLE public.inventory ENABLE TRIGGER USER;
-- COMMIT;

-- 5. TO RESTORE / ROLLBACK CATALOG ITEMS TO A SPECIFIC DATE:
-- BEGIN;
--   DELETE FROM public.items;
--   INSERT INTO public.items (id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point, created_at)
--   SELECT id, tenant_id, sku, name, category, sub_category, uom, unit_cost, reorder_point, created_at 
--   FROM backup.items 
--   WHERE snapshot_date = '2026-09-24';
-- COMMIT;
*/
