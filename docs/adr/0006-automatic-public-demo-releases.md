---
status: accepted
---
# Release the fictional public showcase after successful main checks

The public showcase updates automatically after all Checks succeed for the current `main` revision. GitHub Actions publishes the exact tested static artifact to the dedicated public Vercel project, verifies the staged release before promotion, and records the live source commit. Failed checks or a failed staged verification leave the previous public demo live.

The private hosted pilot remains an explicit deployment and private installations remain explicit upgrades. Root Git deployment stays disabled: enabling it would run the private Flask project, while the public showcase must publish only fictional static files. A project-scoped deployment credential and explicit project selection preserve that boundary at the cost of maintaining a small Actions release job.

[ADR 0013](0013-public-showcase-listings-and-tab-local-drafts.md) extends the public showcase with employer listings and tab-local draft preparation. The static release workflow continues to apply.
