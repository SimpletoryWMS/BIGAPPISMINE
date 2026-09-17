#!/usr/bin/env python3
"""
Codebase Quick Diagnostics Tool
Fast, token-efficient checks for syntax, bracket balance, HTML/CSS validity,
and recent Git changes with zero external dependencies.
"""

import sys
import os
import re
import subprocess
import json
from html.parser import HTMLParser

WORKSPACE_DIR = os.path.abspath(os.getcwd())

def get_git_changes():
    """Detects modified files and modified line ranges."""
    try:
        status_res = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True, text=True, cwd=WORKSPACE_DIR, timeout=3
        )
        if status_res.returncode != 0:
            return None, "Git not available or not a git repository"
        
        lines = status_res.stdout.strip().splitlines()
        modified_files = []
        for line in lines:
            if len(line) >= 3:
                status_code = line[:2].strip()
                fname = line[2:].strip()
                # If renamed or quoted
                if ' -> ' in fname:
                    fname = fname.split(' -> ')[-1]
                fname = fname.strip('"\'')
                modified_files.append((status_code, fname))

        diff_res = subprocess.run(
            ['git', 'diff', '--unified=0'],
            capture_output=True, text=True, cwd=WORKSPACE_DIR, timeout=3
        )
        
        diff_hunks = {}
        if diff_res.returncode == 0:
            current_file = None
            for dline in diff_res.stdout.splitlines():
                if dline.startswith('+++ b/'):
                    current_file = dline[6:].strip('"\'')
                    if current_file not in diff_hunks:
                        diff_hunks[current_file] = []
                elif dline.startswith('@@ ') and current_file:
                    match = re.search(r'@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@', dline)
                    if match:
                        start = int(match.group(1))
                        count = int(match.group(2)) if match.group(2) is not None else 1
                        diff_hunks[current_file].append((start, start + count - 1 if count > 0 else start))
        
        return modified_files, diff_hunks
    except Exception as e:
        return None, str(e)

def check_js_syntax(filepath):
    """
    Robust JS Tokenizer and Bracket/Brace Validator.
    Accurately handles single quotes, double quotes, template strings (with nested ${}),
    regex literals, line comments, block comments, and bracket/brace stacks.
    """
    errors = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            code = f.read()

        pos = 0
        length = len(code)
        line = 1
        col = 1
        
        # State stack: each item is 'CODE', 'TEMPLATE_STR'
        state_stack = ['CODE']
        # Bracket stack: tuples of (token, line, col)
        bracket_stack = []
        
        # Track last significant token for regex detection
        last_sig_token = ''

        def advance(n=1):
            nonlocal pos, line, col
            for _ in range(n):
                if pos < length:
                    if code[pos] == '\n':
                        line += 1
                        col = 1
                    else:
                        col += 1
                    pos += 1

        while pos < length:
            ch = code[pos]
            next_ch = code[pos + 1] if pos + 1 < length else ''
            curr_state = state_stack[-1] if state_stack else 'CODE'

            if curr_state == 'TEMPLATE_STR':
                if ch == '\\':
                    advance(2)
                    continue
                elif ch == '`':
                    state_stack.pop()
                    advance(1)
                    last_sig_token = '`'
                    continue
                elif ch == '$' and next_ch == '{':
                    bracket_stack.append(('${', line, col))
                    state_stack.append('CODE')
                    advance(2)
                    last_sig_token = '${'
                    continue
                else:
                    advance(1)
                    continue

            # In 'CODE' state:
            # Skip whitespace
            if ch in ' \t\r\n':
                advance(1)
                continue

            # Comments
            if ch == '/' and next_ch == '/':
                # Line comment
                start_line = line
                while pos < length and code[pos] != '\n':
                    advance(1)
                continue

            if ch == '/' and next_ch == '*':
                # Block comment
                start_line, start_col = line, col
                advance(2)
                closed = False
                while pos + 1 < length:
                    if code[pos] == '*' and code[pos + 1] == '/':
                        advance(2)
                        closed = True
                        break
                    advance(1)
                if not closed:
                    errors.append(f"Line {start_line}:{start_col} - Unclosed block comment '/*'")
                    advance(length - pos)
                continue

            # Strings
            if ch == "'" or ch == '"':
                quote_char = ch
                start_line, start_col = line, col
                advance(1)
                closed = False
                while pos < length:
                    c = code[pos]
                    if c == '\\':
                        advance(2)
                        continue
                    if c == quote_char:
                        advance(1)
                        closed = True
                        break
                    if c == '\n':
                        # Newline inside unescaped single/double quote
                        errors.append(f"Line {start_line}:{start_col} - Unescaped newline inside string literal")
                        break
                    advance(1)
                if not closed:
                    errors.append(f"Line {start_line}:{start_col} - Unclosed string literal {quote_char}")
                last_sig_token = 'STRING'
                continue

            # Template literal
            if ch == '`':
                state_stack.append('TEMPLATE_STR')
                advance(1)
                continue

            # Regex vs Division:
            # A slash '/' is regex if it follows operators/keywords where an expression starts
            if ch == '/':
                # Check if this could be a regex
                regex_triggers = {
                    '', '(', '[', '{', ',', ';', ':', '=', '==', '===', '!=', '!==',
                    '+', '-', '*', '%', '&', '|', '^', '!', '~', '?', 'return', 'typeof',
                    'case', 'delete', 'void', 'throw', 'await', 'yield', '=>'
                }
                if last_sig_token in regex_triggers:
                    # Parse regex
                    start_line, start_col = line, col
                    advance(1)
                    in_char_class = False
                    closed = False
                    while pos < length:
                        c = code[pos]
                        if c == '\\':
                            advance(2)
                            continue
                        if c == '[':
                            in_char_class = True
                        elif c == ']' and in_char_class:
                            in_char_class = False
                        elif c == '/' and not in_char_class:
                            advance(1)
                            # skip regex flags (g, i, m, s, u, y)
                            while pos < length and code[pos].isalnum():
                                advance(1)
                            closed = True
                            break
                        if c == '\n':
                            break
                        advance(1)
                    if not closed:
                        errors.append(f"Line {start_line}:{start_col} - Unterminated regular expression")
                    last_sig_token = 'REGEX'
                    continue

            # Brackets & Braces
            if ch in ('(', '[', '{'):
                bracket_stack.append((ch, line, col))
                last_sig_token = ch
                advance(1)
                continue

            if ch in (')', ']', '}'):
                expected_map = {')': '(', ']': '[', '}': '{'}
                expected = expected_map[ch]
                
                if not bracket_stack:
                    errors.append(f"Line {line}:{col} - Unexpected closing '{ch}' with no opening match")
                else:
                    top_tok, top_line, top_col = bracket_stack.pop()
                    if ch == '}' and top_tok == '${':
                        # Closing of template interpolation ${...}
                        if len(state_stack) > 1 and state_stack[-1] == 'CODE':
                            state_stack.pop() # Return to TEMPLATE_STR
                    elif top_tok != expected:
                        errors.append(f"Line {line}:{col} - Mismatched '{ch}', expected closing for '{top_tok}' (opened at Line {top_line}:{top_col})")
                
                last_sig_token = ch
                advance(1)
                continue

            # Identifiers / Keywords / Operators
            if ch.isalnum() or ch in '$_':
                start_p = pos
                while pos < length and (code[pos].isalnum() or code[pos] in '$_'):
                    advance(1)
                last_sig_token = code[start_p:pos]
                continue

            # Multi-character or single operators
            last_sig_token = ch
            advance(1)

        # EOF checks
        if state_stack and state_stack[-1] == 'TEMPLATE_STR':
            errors.append("EOF - Unclosed template literal (`)")

        while bracket_stack:
            top_tok, top_line, top_col = bracket_stack.pop()
            close_sym = '}' if top_tok in ('{', '${') else (')' if top_tok == '(' else ']')
            errors.append(f"Line {top_line}:{top_col} - Unclosed '{top_tok}' (missing closing '{close_sym}')")

    except Exception as e:
        errors.append(f"Error checking JS syntax: {e}")

    return errors

class StrictHTMLParser(HTMLParser):
    VOID_TAGS = {
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
    }

    def __init__(self):
        super().__init__()
        self.tag_stack = []
        self.errors = []
        self.ids = {}

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        pos = self.getpos()
        
        # Check duplicate IDs
        for k, v in attrs:
            if k == 'id' and v:
                if v in self.ids:
                    first_pos = self.ids[v]
                    self.errors.append(f"Line {pos[0]}:{pos[1]} - Duplicate element ID '{v}' (previously defined at line {first_pos[0]}:{first_pos[1]})")
                else:
                    self.ids[v] = pos

        if tag not in self.VOID_TAGS:
            self.tag_stack.append((tag, pos[0], pos[1]))

    def handle_endtag(self, tag):
        tag = tag.lower()
        pos = self.getpos()
        if tag in self.VOID_TAGS:
            return
        
        if not self.tag_stack:
            self.errors.append(f"Line {pos[0]}:{pos[1]} - Unexpected closing tag </{tag}> with no opening match")
            return
        
        # Find matching tag from stack
        for i in range(len(self.tag_stack) - 1, -1, -1):
            stack_tag, s_line, s_col = self.tag_stack[i]
            if stack_tag == tag:
                unclosed = self.tag_stack[i+1:]
                for u_tag, u_line, u_col in unclosed:
                    self.errors.append(f"Line {u_line}:{u_col} - Unclosed tag <{u_tag}> (closed out of order by </{tag}> at line {pos[0]})")
                self.tag_stack = self.tag_stack[:i]
                return

        self.errors.append(f"Line {pos[0]}:{pos[1]} - Mismatched closing tag </{tag}>")

def check_html_syntax(filepath):
    """Checks HTML for unclosed/mismatched tags and duplicate IDs."""
    errors = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        parser = StrictHTMLParser()
        parser.feed(content)
        errors.extend(parser.errors)

        for u_tag, u_line, u_col in parser.tag_stack:
            errors.append(f"Line {u_line}:{u_col} - Unclosed tag <{u_tag}> at end of file")

    except Exception as e:
        errors.append(f"HTML Parse Error: {e}")

    return errors

def check_css_syntax(filepath):
    """Checks CSS for unclosed braces and comment blocks."""
    errors = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        lines = content.splitlines()
        brace_stack = []
        in_block_comment = False

        for line_num, line in enumerate(lines, 1):
            col = 0
            while col < len(line):
                char = line[col]
                next_char = line[col+1] if col + 1 < len(line) else ''

                if in_block_comment:
                    if char == '*' and next_char == '/':
                        in_block_comment = False
                        col += 2
                        continue
                    col += 1
                    continue

                if char == '/' and next_char == '*':
                    in_block_comment = True
                    col += 2
                    continue

                if char == '{':
                    brace_stack.append((line_num, col + 1))
                elif char == '}':
                    if not brace_stack:
                        errors.append(f"Line {line_num}:{col+1} - Unexpected closing brace '}}'")
                    else:
                        brace_stack.pop()

                col += 1

        if in_block_comment:
            errors.append("EOF - Unclosed comment block '/*'")
        for b_line, b_col in brace_stack:
            errors.append(f"Line {b_line}:{b_col} - Unclosed brace '{{'")

    except Exception as e:
        errors.append(f"CSS Error: {e}")

    return errors

def check_json_syntax(filepath):
    """Validates JSON structure."""
    errors = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            json.load(f)
    except json.JSONDecodeError as e:
        errors.append(f"Line {e.lineno}:{e.colno} - {e.msg}")
    except Exception as e:
        errors.append(f"Error reading JSON: {e}")
    return errors

def run_diagnostics():
    print("=== QUICK CODEBASE DIAGNOSTIC REPORT ===")
    
    # 1. Check Git status and recent diffs
    mod_files, diff_hunks = get_git_changes()
    if mod_files is not None:
        if mod_files:
            print("[RECENT CHANGES]:")
            for status, fname in mod_files:
                hunks = diff_hunks.get(fname, [])
                hunk_str = ", ".join([f"L{s}-{e}" if s != e else f"L{s}" for s, e in hunks]) if hunks else "untracked/unstaged"
                print(f"  * [{status}] {fname} ({hunk_str})")
        else:
            print("[RECENT CHANGES]: Clean working tree (no uncommitted changes).")
    else:
        print(f"[GIT]: {diff_hunks}")

    # 2. Check all relevant files in workspace
    files_to_check = []
    for root, dirs, files in os.walk(WORKSPACE_DIR):
        # Ignore .git, node_modules, dist, etc.
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'dist', '.agents', '.gemini', '.system_generated')]
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in ('.js', '.html', '.css', '.json', '.ts', '.jsx', '.tsx'):
                rel_path = os.path.relpath(os.path.join(root, f), WORKSPACE_DIR)
                files_to_check.append(rel_path)

    total_errors = 0
    print("\n[SYNTAX & STRUCTURE VALIDATION]:")
    
    for rel_path in sorted(files_to_check):
        ext = os.path.splitext(rel_path)[1].lower()
        errs = []
        if ext in ('.js', '.ts', '.jsx', '.tsx'):
            errs = check_js_syntax(os.path.join(WORKSPACE_DIR, rel_path))
        elif ext == '.html':
            errs = check_html_syntax(os.path.join(WORKSPACE_DIR, rel_path))
        elif ext == '.css':
            errs = check_css_syntax(os.path.join(WORKSPACE_DIR, rel_path))
        elif ext == '.json':
            errs = check_json_syntax(os.path.join(WORKSPACE_DIR, rel_path))

        if errs:
            total_errors += len(errs)
            print(f"  ❌ {rel_path} ({len(errs)} issue{'s' if len(errs) > 1 else ''}):")
            for e in errs[:5]:  # show top 5 issues to preserve tokens
                print(f"     - {e}")
            if len(errs) > 5:
                print(f"     ... and {len(errs) - 5} more issues.")
        else:
            # Check if this file was recently changed
            is_mod = any(fname == rel_path for _, fname in (mod_files or []))
            mod_flag = " (recently modified)" if is_mod else ""
            print(f"  ✅ {rel_path}{mod_flag} - Valid")

    print("========================================")
    if total_errors == 0:
        print("RESULT: ALL SYNTAX CHECKS PASSED.")
    else:
        print(f"RESULT: {total_errors} SYNTAX/STRUCTURE ISSUE(S) DETECTED.")
    print("========================================")

if __name__ == '__main__':
    run_diagnostics()
