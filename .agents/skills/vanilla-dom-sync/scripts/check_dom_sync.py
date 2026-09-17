#!/usr/bin/env python3
"""
DOM Sync & Integrity Checker
Cross-references index.html and app.js to detect:
1. Missing DOM IDs queried by JavaScript (getElementById / querySelector).
2. Missing modal IDs referenced in openModal() calls.
3. Missing script and style asset links.
Massively saves LLM tokens by preventing full-file scanning.
"""

import os
import re
import sys
from html.parser import HTMLParser

WORKSPACE_DIR = os.path.abspath(os.getcwd())
HTML_PATH = os.path.join(WORKSPACE_DIR, 'index.html')
JS_PATH = os.path.join(WORKSPACE_DIR, 'app.js')

class HTMLIDExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.modal_ids = set()
        self.form_ids = set()
        self.script_srcs = []
        self.link_hrefs = []

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        el_id = attr_dict.get('id')
        if el_id:
            self.ids.add(el_id)
            if 'modal' in el_id.lower() or 'modal' in attr_dict.get('class', '').lower():
                self.modal_ids.add(el_id)
            if tag == 'form':
                self.form_ids.add(el_id)
        
        if tag == 'script' and 'src' in attr_dict:
            self.script_srcs.append(attr_dict['src'])
        if tag == 'link' and 'href' in attr_dict:
            self.link_hrefs.append(attr_dict['href'])

def extract_js_dom_references(filepath):
    """Finds all getElementById, querySelector('#...'), and openModal references in JS."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            code = f.read()
    except Exception as e:
        return set(), set(), set(), str(e)

    # 1. document.getElementById('...')
    get_id_pattern = re.compile(r"""getElementById\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)""")
    get_ids = set(get_id_pattern.findall(code))

    # 2. querySelector('#...')
    qs_pattern = re.compile(r"""querySelector\(\s*['"]#([a-zA-Z0-9_\-]+)['"]\s*\)""")
    qs_ids = set(qs_pattern.findall(code))

    # 3. openModal('...') / closeModal('...')
    modal_pattern = re.compile(r"""(?:openModal|closeModal)\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)""")
    modal_ids = set(modal_pattern.findall(code))

    return get_ids, qs_ids, modal_ids, None

def run_dom_check():
    print("=== DOM & JS SYNC INTEGRITY REPORT ===")
    
    if not os.path.exists(HTML_PATH):
        print("❌ Error: index.html not found.")
        return
    if not os.path.exists(JS_PATH):
        print("❌ Error: app.js not found.")
        return

    # Parse HTML
    with open(HTML_PATH, 'r', encoding='utf-8', errors='replace') as f:
        html_content = f.read()

    parser = HTMLIDExtractor()
    parser.feed(html_content)

    # Parse JS
    get_ids, qs_ids, js_modal_ids, err = extract_js_dom_references(JS_PATH)
    if err:
        print(f"❌ Error reading JS: {err}")
        return

    queried_ids = get_ids | qs_ids

    # Find Missing IDs
    missing_ids = queried_ids - parser.ids
    # Find Missing Modals
    missing_modals = js_modal_ids - parser.ids

    # Summary
    print(f"Stats: {len(parser.ids)} HTML elements with IDs | {len(queried_ids)} IDs queried in JS")
    
    issues_found = 0

    if missing_ids:
        issues_found += len(missing_ids)
        print(f"\n❌ [MISSING DOM IDs IN HTML] ({len(missing_ids)} IDs queried by JS but missing in index.html):")
        for mid in sorted(missing_ids):
            is_modal = mid in js_modal_ids
            suffix = " (Modal target)" if is_modal else ""
            print(f"   - #{mid}{suffix}")
    else:
        print("✅ All document.getElementById / querySelector targets exist in index.html.")

    if missing_modals:
        print(f"\n❌ [MISSING MODAL CONTAINERS] ({len(missing_modals)} modals opened in JS but missing):")
        for mid in sorted(missing_modals):
            print(f"   - #{mid}")

    # Check local script / link assets
    missing_assets = []
    for src in parser.script_srcs:
        if not src.startswith(('http://', 'https://', '//')):
            clean_src = src.split('?')[0]
            if not os.path.exists(os.path.join(WORKSPACE_DIR, clean_src)):
                missing_assets.append(f"Local script missing: {clean_src}")
    for href in parser.link_hrefs:
        if not href.startswith(('http://', 'https://', '//')) and not href.startswith('data:'):
            clean_href = href.split('?')[0]
            if not os.path.exists(os.path.join(WORKSPACE_DIR, clean_href)):
                missing_assets.append(f"Local stylesheet/icon missing: {clean_href}")

    if missing_assets:
        issues_found += len(missing_assets)
        print(f"\n❌ [MISSING ASSETS] ({len(missing_assets)} linked files missing on disk):")
        for ma in missing_assets:
            print(f"   - {ma}")
    else:
        print("✅ All local script and CSS asset references exist on disk.")

    print("========================================")
    if issues_found == 0:
        print("RESULT: DOM & JS INTEGRITY VERIFIED (0 issues).")
    else:
        print(f"RESULT: {issues_found} INTEGRITY ISSUE(S) DETECTED.")
    print("========================================")

if __name__ == '__main__':
    run_dom_check()
