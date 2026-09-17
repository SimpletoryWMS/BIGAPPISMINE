---
name: vercel-deploy-guard
description: >-
  Pre-flight deployment validator for Vercel and GitHub.
  Trigger whenever preparing to deploy to Vercel, committing production changes, or configuring build settings.
  Validates credentials, SPA routing rules in vercel.json, and asset availability in <0.05s.
---

# Vercel & GitHub Deployment Guard

This skill automates pre-flight verification before pushing to GitHub or deploying to Vercel.

## Workflow

1. **Run Deployment Pre-Flight Tool**:
   ```bash
   python3 .agents/skills/vercel-deploy-guard/scripts/check_deploy.py
   ```

2. **Evaluate Output**:
   - **Supabase Credentials**: Ensures live HTTPS endpoints and non-placeholder anon keys are set.
   - **Vercel Routing**: Validates `vercel.json` SPA catch-all rewrite rules.
   - **Git Hygiene**: Verifies all critical files are staged and committed.

3. **Remediation**:
   - Create or adjust `vercel.json` for proper single-page app fallback routing.
   - Ensure environment variables are populated before triggering production deployments.
