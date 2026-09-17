---
name: supabase-schema-guardian
description: >-
  Ultra-fast token-saving validator for Supabase SQL schemas, RLS security policies, and client table queries.
  Trigger whenever working with SQL migrations, creating new tables, modifying database schemas,
  or writing Supabase client queries. Cross-checks client JS against SQL schema in <0.05s.
---

# Supabase Schema & Multi-Tenant RLS Guardian

This skill provides fast, deterministic validation of database schemas and client queries without reading entire SQL schema files into LLM context.

## Workflow

1. **Run Schema Guardian Tool**:
   ```bash
   python3 .agents/skills/supabase-schema-guardian/scripts/check_supabase_schema.py
   ```

2. **Evaluate Output**:
   - **RLS Status**: Verifies that every table has `ENABLE ROW LEVEL SECURITY`.
   - **Tenant Isolation**: Flags tables that contain `tenant_id` but lack tenant-specific RLS policies.
   - **Index Optimization**: Identifies missing indexes on `tenant_id` columns.
   - **JS/SQL Query Parity**: Confirms that all `supabase.from('table_name')` calls in JavaScript match tables declared in SQL.

3. **Remediation**:
   - Apply missing RLS policies or indexes to `supabase_schema.sql`.
   - Fix table name mismatches between client JS and database schema.
