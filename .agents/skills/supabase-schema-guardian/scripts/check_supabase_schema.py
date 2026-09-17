#!/usr/bin/env python3
"""
Supabase Schema & Multi-Tenant RLS Guardian
Checks:
1. Every table defined in SQL has Row Level Security (RLS) enabled.
2. Every table has tenant_id isolation policies.
3. Performance indexes on tenant_id / foreign keys.
4. Cross-checks client JS supabase.from('table_name') calls against the SQL schema.
Massively saves tokens by catching database/client mismatches deterministically.
"""

import os
import re
import sys

WORKSPACE_DIR = os.path.abspath(os.getcwd())
SQL_SCHEMA_PATH = os.path.join(WORKSPACE_DIR, 'supabase_schema.sql')
JS_PATH = os.path.join(WORKSPACE_DIR, 'app.js')
SUPABASE_CONFIG_PATH = os.path.join(WORKSPACE_DIR, 'supabase-config.js')

def parse_sql_schema(filepath):
    if not os.path.exists(filepath):
        return None, f"File not found: {filepath}"
    
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        sql = f.read()

    # Find CREATE TABLE
    create_table_regex = re.compile(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\);', re.DOTALL | re.IGNORECASE)
    tables = {}
    for match in create_table_regex.finditer(sql):
        tname = match.group(1).lower()
        body = match.group(2)
        
        # Check columns
        has_tenant_id = bool(re.search(r'\btenant_id\b', body, re.IGNORECASE))
        has_id = bool(re.search(r'\bid\b', body, re.IGNORECASE))
        tables[tname] = {
            'has_tenant_id': has_tenant_id,
            'has_id': has_id,
            'rls_enabled': False,
            'policies': [],
            'indexes': []
        }

    # Find ALTER TABLE ... ENABLE ROW LEVEL SECURITY
    rls_regex = re.compile(r'ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY', re.IGNORECASE)
    for match in rls_regex.finditer(sql):
        tname = match.group(1).lower()
        if tname in tables:
            tables[tname]['rls_enabled'] = True

    # Find CREATE POLICY ... ON table_name
    policy_regex = re.compile(r'CREATE\s+POLICY\s+["\']?([^"\']+)["\']?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)\s+(.*?);', re.DOTALL | re.IGNORECASE)
    for match in policy_regex.finditer(sql):
        pname = match.group(1)
        tname = match.group(2).lower()
        body = match.group(3)
        if tname in tables:
            tables[tname]['policies'].append((pname, body))

    # Find CREATE INDEX ... ON table_name
    index_regex = re.compile(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[a-zA-Z0-9_]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\);', re.IGNORECASE)
    for match in index_regex.finditer(sql):
        tname = match.group(1).lower()
        cols = match.group(2).lower().replace(' ', '')
        if tname in tables:
            tables[tname]['indexes'].append(cols)

    return tables, None

def extract_js_table_queries():
    """Finds all .from('table_name') in JS files."""
    tables_queried = {}
    js_files = [JS_PATH, SUPABASE_CONFIG_PATH]
    
    table_from_regex = re.compile(r"""\.from\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)""")
    
    for js_file in js_files:
        if os.path.exists(js_file):
            with open(js_file, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            for line_no, line in enumerate(content.splitlines(), 1):
                for match in table_from_regex.finditer(line):
                    tname = match.group(1).lower()
                    if tname not in tables_queried:
                        tables_queried[tname] = []
                    tables_queried[tname].append((os.path.basename(js_file), line_no))
    return tables_queried

def run_schema_check():
    print("=== SUPABASE SCHEMA & RLS GUARDIAN REPORT ===")
    
    tables, err = parse_sql_schema(SQL_SCHEMA_PATH)
    if err:
        print(f"❌ {err}")
        return

    print(f"Schema: {len(tables)} tables discovered in {os.path.basename(SQL_SCHEMA_PATH)}")
    
    issues_found = 0

    # 1. Check RLS & Multi-Tenant Security
    rls_missing = []
    tenant_policy_missing = []
    missing_tenant_index = []

    for tname, meta in tables.items():
        if not meta['rls_enabled']:
            rls_missing.append(tname)
        if meta['has_tenant_id']:
            # check if policy references tenant_id
            tenant_policy = any('tenant_id' in pbody.lower() for _, pbody in meta['policies'])
            if not tenant_policy:
                tenant_policy_missing.append(tname)
            # check index
            has_t_idx = any('tenant_id' in idx for idx in meta['indexes'])
            if not has_t_idx:
                missing_tenant_index.append(tname)

    if rls_missing:
        issues_found += len(rls_missing)
        print(f"\n❌ [RLS DISABLED] ({len(rls_missing)} tables missing ENABLE ROW LEVEL SECURITY):")
        for t in rls_missing:
            print(f"   - {t}")
    else:
        print("✅ Row Level Security (RLS) is enabled on all tables.")

    if tenant_policy_missing:
        issues_found += len(tenant_policy_missing)
        print(f"\n⚠️  [MISSING TENANT RLS POLICIES] ({len(tenant_policy_missing)} tables with tenant_id lack tenant isolation policies):")
        for t in tenant_policy_missing:
            print(f"   - {t}")

    if missing_tenant_index:
        print(f"\n💡 [INDEXING ADVISORY] ({len(missing_tenant_index)} tables lack index on tenant_id):")
        for t in missing_tenant_index:
            print(f"   - {t}")

    # 2. Check JS .from('table') references vs SQL tables
    js_tables = extract_js_table_queries()
    missing_in_sql = []
    for tname, locs in js_tables.items():
        if tname not in tables:
            first_loc = f"{locs[0][0]}:{locs[0][1]}"
            missing_in_sql.append((tname, first_loc))

    if missing_in_sql:
        issues_found += len(missing_in_sql)
        print(f"\n❌ [UNKNOWN TABLES IN JS] ({len(missing_in_sql)} tables queried in JS not in schema):")
        for t, loc in missing_in_sql:
            print(f"   - '{t}' (queried at {loc})")
    else:
        print(f"✅ All {len(js_tables)} table queries in JavaScript match declared SQL schema tables.")

    print("=============================================")
    if issues_found == 0:
        print("RESULT: SUPABASE SCHEMA & RLS SECURE (0 errors).")
    else:
        print(f"RESULT: {issues_found} SCHEMA/SECURITY ISSUE(S) DETECTED.")
    print("=============================================")

if __name__ == '__main__':
    run_schema_check()
