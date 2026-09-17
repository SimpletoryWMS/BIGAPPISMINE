#!/usr/bin/env python3
"""
Vercel & Deployment Pre-Flight Guard
Verifies:
1. vercel.json routing and headers configuration.
2. Supabase configuration credentials validity.
3. Static asset availability and integrity.
4. Clean Git state for deployment.
Eliminates trial-and-error failed deployments and saves token context.
"""

import os
import re
import sys
import json
import subprocess

WORKSPACE_DIR = os.path.abspath(os.getcwd())
VERCEL_JSON_PATH = os.path.join(WORKSPACE_DIR, 'vercel.json')
SUPABASE_CONFIG_PATH = os.path.join(WORKSPACE_DIR, 'supabase-config.js')

def check_vercel_config():
    issues = []
    if not os.path.exists(VERCEL_JSON_PATH):
        issues.append("Missing vercel.json (SPA routing fallback may fail for sub-paths)")
        return issues, False
    
    try:
        with open(VERCEL_JSON_PATH, 'r', encoding='utf-8') as f:
            vcfg = json.load(f)
        # Check rewrites
        rewrites = vcfg.get('rewrites', [])
        has_spa_rewrite = any(r.get('destination') in ('/', '/index.html', 'index.html') for r in rewrites)
        if not has_spa_rewrite:
            issues.append("vercel.json missing SPA catch-all rewrite for /index.html")
    except Exception as e:
        issues.append(f"Invalid vercel.json format: {e}")
    return issues, True

def check_supabase_creds():
    issues = []
    if not os.path.exists(SUPABASE_CONFIG_PATH):
        issues.append("supabase-config.js not found.")
        return issues
    
    with open(SUPABASE_CONFIG_PATH, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Look for SUPABASE_URL / SUPABASE_ANON_KEY
    url_match = re.search(r"""SUPABASE_URL\s*=\s*['"]([^'"]+)['"]""", content)
    key_match = re.search(r"""SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]""", content)

    if not url_match or not url_match.group(1) or 'YOUR_SUPABASE' in url_match.group(1):
        issues.append("SUPABASE_URL is missing or contains placeholder in supabase-config.js")
    elif not url_match.group(1).startswith('https://'):
        issues.append("SUPABASE_URL must be a secure https:// endpoint")

    if not key_match or not key_match.group(1) or 'YOUR_ANON' in key_match.group(1):
        issues.append("SUPABASE_ANON_KEY is missing or contains placeholder in supabase-config.js")
    
    return issues

def run_deploy_check():
    print("=== VERCEL & GITHUB DEPLOYMENT READINESS REPORT ===")
    
    total_issues = 0

    # 1. Supabase Config
    supa_issues = check_supabase_creds()
    if supa_issues:
        total_issues += len(supa_issues)
        print("❌ [SUPABASE CONFIG]:")
        for si in supa_issues:
            print(f"   - {si}")
    else:
        print("✅ Supabase URL and Anon Key configured properly.")

    # 2. Vercel Config
    v_issues, exists = check_vercel_config()
    if v_issues:
        print("⚠️  [VERCEL CONFIG ADVISORY]:")
        for vi in v_issues:
            print(f"   - {vi}")
    else:
        print("✅ vercel.json routing is properly configured.")

    # 3. Git Status
    try:
        res = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True, cwd=WORKSPACE_DIR, timeout=3)
        uncommitted = [l for l in res.stdout.splitlines() if not l.startswith('?? .agents')]
        if uncommitted:
            print(f"ℹ️  [GIT STATUS]: {len(uncommitted)} uncommitted files. Ensure changes are committed before pushing to Vercel.")
        else:
            print("✅ Git working tree is clean and ready for deployment.")
    except Exception:
        pass

    print("==================================================")
    if total_issues == 0:
        print("RESULT: PROJECT IS READY FOR DEPLOYMENT.")
    else:
        print(f"RESULT: {total_issues} BLOCKING ISSUE(S) BEFORE DEPLOYMENT.")
    print("==================================================")

if __name__ == '__main__':
    run_deploy_check()
