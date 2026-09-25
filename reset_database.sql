-- ============================================================================
-- SIMPLETORY WMS - COMPLETE SAFE DATABASE RESET / WIPE SCRIPT
-- ============================================================================

-- 1. Drop all Simpletory Application Tables (CASCADE automatically drops triggers & FKs)
DROP TABLE IF EXISTS public.inventory_history CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

-- 2. Drop any legacy tables from previous experiments if present
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;

-- 3. Drop Trigger Function (CASCADE cleans up any remaining references)
DROP FUNCTION IF EXISTS public.fn_audit_inventory_changes() CASCADE;
