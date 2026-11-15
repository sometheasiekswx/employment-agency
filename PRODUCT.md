# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People preparing and reviewing their own career applications. The owner uses the app locally with a separate private career workspace. Developers need conventional, readable React/Next.js code and shared Python services.

## Product Purpose

Turn confirmed career evidence and job requirements into reviewable application documents. Success means users can compare roles, inspect evidence, edit a new draft, find exact document versions, and apply themselves or authorize a supported connected agent without losing the record of what happened.

## Operating Context

A local Python server serves a static React/Next.js interface and application API. New local career workspaces use SQLite and publish readable Git snapshots. A separate invite-only hosted pilot uses shared services with authenticated cloud storage. Personal career workspaces are private runtime data. The separate static public demo uses a reviewed employer catalog, an explicitly approved public résumé and sample activity; development fixtures use fictional candidates.

## Capabilities and Constraints

Preserve setup/folder selection, career evidence and master reconciliation, profiles, discovery/ranking, bounded preparation, editing/versioning, comments/decisions, history, export and recovery. Drafting and manual submission recording do not send anything. Starting **Apply for me** in a local SQLite workspace authorizes preparation and submission for the named roles through a supported runtime and channel. Missing information and uncertain outcomes pause for help. Earlier delivery attempts retain their original exact final-approval contract. Hosted and public-demo execution remain disabled. No unapproved paid requests, cloud upload of local workspaces or private installation upgrade. See [connected applications](docs/apply-for-me.md).

Python services and storage remain authoritative for private workspaces. Submitted snapshots and canonical document links retain their integrity rules. Decision queues show one effective application version per job/listing; submitted snapshots take precedence, while all document versions remain in History. Correcting a mistaken manual submission preserves its original record and recovers a draft. Empty, busy, success, error, permission and reduced-motion states must remain usable.

## Brand Commitments

Keep the Employment Agency product name and truthful review-first language. The Industrial Precision **Agency.** wordmark appears in headers, and the compact **A.** identifies browser and app icons. The charcoal and light themes use a contextual desktop sidebar, restrained lavender selections, pink-to-lavender primary actions and locally hosted Inter typography. Discover groups opportunities by company and filters by location. Company logos retain their original artwork without an added backdrop, and appear in company headers and opened details. Selecting a role opens a docked inspector on desktop and an expandable sheet on mobile. Save/remove actions preserve the remaining companies' columns during review. Use actual workspace counts and supported evidence. Confirmed and reviewed states use green, requirements needing review use amber, and errors use red; submitted records remain explicitly labelled. Public sample activity is identified as simulated. No fabricated career claims, metrics, qualifications or customer evidence.

## Evidence on Hand

Python, frontend and browser acceptance suites; fictional browser fixtures; documented local/hosted/public-demo boundaries and systems design. README recordings use a disposable fictional workspace. The live public demo contains only the approved public profile and reviewed catalog, with simulated application activity. Other private career data never belongs in screenshots, tests or public documentation. Live cloud and employer-channel acceptance are distinct from controlled fixture results.

## Product Principles

- The user controls confirmation, document versions and submission decisions.
- Personal data remains separate from reusable application software.
- Shared server rules govern both interfaces.
- Preserve drafts and make failures recoverable.
- Make the next useful action easy to find without hiding important warnings.
