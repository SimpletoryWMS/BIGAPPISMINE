# Simpletory WMS - Enterprise Warehouse Management System

A modern, fast, multi-tenant Warehouse Management System with real-time Supabase sync, role-based access control (RBAC), custom reporting, and automated database backups.

---

## 🗄️ Database Architecture & Migrations

- **[`sql/supabase_schema.sql`](file:///Users/dereklumpkin/Documents/Simpletory/sql/supabase_schema.sql)**: Complete production schema including `tenants`, `users`, `items`, `inventory`, `inventory_history`, audit triggers, and tenant isolation RLS policies.
- **[`sql/supabase_daily_backup.sql`](file:///Users/dereklumpkin/Documents/Simpletory/sql/supabase_daily_backup.sql)**: Automated daily midnight snapshot and 14-day rolling retention backup system.
- **[`sql/reset_database.sql`](file:///Users/dereklumpkin/Documents/Simpletory/sql/reset_database.sql)**: Safe wipe/reset script for staging.

---

## 🛡️ Automated Daily Backups & 14-Day Rolling Retention

The backup system is designed for enterprise data safety:
1. **Isolated & Frontend-Inaccessible**: All backups reside in a dedicated `backup` PostgreSQL schema with permissions completely revoked from `anon`, `authenticated`, and public API roles. PostgREST and the client UI cannot access or modify these tables.
2. **Daily Midnight Snapshots**: Automatically takes snapshots of all 5 tables (`tenants`, `users`, `items`, `inventory`, `inventory_history`) tagged with `snapshot_date` and `snapshot_at`.
3. **14-Day Rolling Retention**: Automatically purges snapshot records older than 14 days on each run to prevent database bloat.
4. **Scheduled via `pg_cron`**: Runs every day at 00:00 (Midnight UTC).

### Administrator Commands

* **Run a manual backup immediately:**
  ```sql
  SELECT public.fn_create_daily_database_backup();
  ```

* **Inspect available snapshots and row counts:**
  ```sql
  SELECT * FROM backup.backup_log ORDER BY snapshot_at DESC;
  ```

* **Inspect snapshot data for a specific date:**
  ```sql
  SELECT * FROM backup.items WHERE snapshot_date = '2026-09-24';
  SELECT * FROM backup.inventory WHERE snapshot_date = '2026-09-24';
  ```

* **Rollback inventory to a previous date:**
  ```sql
  BEGIN;
    DELETE FROM public.inventory;
    INSERT INTO public.inventory (id, tenant_id, item_id, location, quantity, status, updated_at)
    SELECT id, tenant_id, item_id, location, quantity, status, updated_at 
    FROM backup.inventory 
    WHERE snapshot_date = '2026-09-24';
  COMMIT;
  ```

