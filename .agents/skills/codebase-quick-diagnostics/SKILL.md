---
name: codebase-quick-diagnostics
description: >-
  Ultra-fast, token-efficient first-line diagnostic tool. Trigger immediately whenever
  the user reports that anything is broken, not working, throwing errors, crashing, or buggy.
  Instantly checks recent Git diffs, syntax errors, unmatched braces/brackets/tags, and structural breaks
  without wasting tokens on verbose analysis.
---

# Codebase Quick Diagnostics

This skill provides an automated, token-minimal first-response protocol whenever a bug, error, or broken behavior is reported.

## Execution Protocol

### Step 1: Run Diagnostics Immediately
Do not start by reading massive files or guessing. Run the diagnostic tool first:

```bash
python3 .agents/skills/codebase-quick-diagnostics/scripts/diagnose.py
```

### Step 2: Interpret the Report
The script runs in < 0.1s and checks:
1. **Recent Changes**: Identifies unstaged/staged modified files and exact line numbers (`L...-L...`).
2. **JavaScript / TypeScript**: Unmatched `{ } [ ] ( )`, unclosed template literals (`` `...` ``), unterminated quotes, unclosed regex/comments.
3. **HTML**: Unclosed tags, mismatched closing tags, and duplicate element `id` attributes.
4. **CSS**: Unclosed braces and comment blocks.
5. **JSON**: Syntax errors and line-precise parse failures.

### Step 3: Fast Remediation
- **If Syntax/Structure Issues Found**: Pinpoint the exact line number, explain the missing/mismatched symbol, and apply a targeted fix using `replace_file_content`.
- **If Syntax is Valid**: Immediately focus your investigation on the exact lines modified in `[RECENT CHANGES]` instead of scanning entire files.
