---
status: accepted
---
# Add an invite-only hosted service alongside the local application

The owner chose a full hosted service on Vercel so users can work without cloning or installing the repository. Supabase supplies Google sign-in, owner-isolated database records and private document storage, with workspace export and account/data deletion. The existing local application remains supported; the owner's private local workspace is not automatically uploaded.

The initial release is an invite-only pilot, verified with fictional data before broader registration. Only free tiers are authorized, with no paid upgrades or platform-funded AI calls. This trades the simplicity of local files for explicit authentication, tenant isolation, cloud persistence and quota management. Provider eligibility, credentials and actual deployed verification remain prerequisites, not completed work. The pilot includes imports and confirmed facts, profiles, supported discovery, template PDF/DOCX/EML generation, fit summaries, decisions, export and deletion. Local filesystem watching, custom LaTeX and agent integrations remain local-only. Initial access is restricted to the owner’s explicitly approved Google identity, configured outside the repository.
