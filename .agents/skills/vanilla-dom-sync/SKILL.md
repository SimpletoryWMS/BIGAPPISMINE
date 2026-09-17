---
name: vanilla-dom-sync
description: >-
  Ultra-fast token-saving validator for Vanilla JavaScript and HTML UI integration.
  Trigger whenever modifying UI components, modals, buttons, forms, or debugging missing element errors.
  Cross-checks document.getElementById, querySelector, and openModal IDs against index.html in <0.05s.
---

# Vanilla DOM & JavaScript Sync Validator

This skill instantly verifies that all DOM element IDs, modals, forms, and assets referenced in JavaScript exist in `index.html` without loading large HTML/JS files into LLM context.

## Workflow

1. **Run DOM Sync Tool**:
   ```bash
   python3 .agents/skills/vanilla-dom-sync/scripts/check_dom_sync.py
   ```

2. **Evaluate Output**:
   - **Missing DOM IDs**: Element IDs queried in `app.js` (`getElementById` / `querySelector`) that do not exist in `index.html`.
   - **Missing Modals**: Modal containers triggered via `openModal()` in JS that are missing from the DOM.
   - **Missing Assets**: `<script>` and `<link>` stylesheets referenced in HTML that are missing on disk.

3. **Remediation**:
   - Add missing IDs/elements to `index.html`, or update `app.js` selectors to match the actual HTML markup.
