-- ============================================================================
-- SIMPLETORY WMS - COMPLETE DATABASE RESET / WIPE SCRIPT
-- WARNING: This will drop all Simpletory tables, functions, and triggers.
-- ============================================================================

-- 1. Drop Triggers and Functions
DROP TRIGGER IF EXISTS trg_audit_inventory ON public.inventory;
DROP FUNCTION IF EXISTS public.fn_audit_inventory_changes() CASCADE;

-- 2. Drop all Simpletory Application Tables (Cascade removes all FK constraints)
DROP TABLE IF EXISTS public.inventory_history CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

-- 3. Optional: Drop any legacy tables from previous experiments if present
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
