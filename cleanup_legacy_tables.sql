-- ============================================================================
-- SIMPLETORY WMS - CLEANUP LEFTOVER LEGACY TABLES
-- Drops the 10 unused tables from the previous complex schema version.
-- Does NOT affect your active: tenants, items, inventory, inventory_history, users.
-- ============================================================================

DROP TABLE IF EXISTS public.custom_fields CASCADE;
DROP TABLE IF EXISTS public.facilities CASCADE;
DROP TABLE IF EXISTS public.facility_types CASCADE;
DROP TABLE IF EXISTS public.inventory_transactions CASCADE;
DROP TABLE IF EXISTS public.label_templates CASCADE;
DROP TABLE IF EXISTS public.lpns CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.units_of_measure CASCADE;
DROP TABLE IF EXISTS public.user_facility_access CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
