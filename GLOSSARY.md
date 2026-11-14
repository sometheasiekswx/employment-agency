# Employment Agency

Shared local application software with independently located personal career data.

## Language

**Application installation**:
The reusable software and UI that manages career information, discovery, tailoring, application review and storage. It contains no real user's data in its public distribution.

**Career workspace**:
A selected local folder containing one person's master resumes, confirmed facts, supplemental information, research, preferences, templates, generated applications and decision history. It contains data and configuration, not executable application extensions or a private UI fork.

**Default workspace**:
The ignored `workspace/` folder inside a source installation, used unless another workspace location is selected. Its presence on disk does not make its contents part of the public Git repository.

The personal setup guide explicitly selects an external workspace; this fallback remains supported for existing installations. See [ADR 0017](docs/adr/0017-personal-workspace-first-onboarding.md).

**External workspace**:
A career workspace stored outside the application installation and managed by the same shared application.

**Application version**:
A preserved set of application documents and supporting evidence for one job, identified by generation date and, when needed, time. Regeneration creates a new version.

**Organised applications folder**:
The authoritative document store within a career workspace, organised by city, company, job and generation date/time. The web interface opens the same files that the user can browse on disk.

**Active workspace**:
The single career workspace selected by a running application instance. Selection is explicit, and another workspace's data is not merged into it by switching.

**Master reconciliation**:
Review of proposed career-fact updates and conflicts detected after a master resume changes in the active workspace. It preserves supplementary information and does not itself regenerate existing applications.

**Submitted snapshot**:
The exact application documents recorded as submitted, preserved with their provenance and submission decision. Later edits or generations do not change what was submitted.

**Application decision**:
A user's recorded review or manual submission. Recording Submitted also confirms review. Active contains Draft and Reviewed packages for roles without a recorded submission. Earlier Rejected decisions are retained in activity.

**Recorded submission**:
A submitted application snapshot or a listing tagged Already submitted. It moves the role from Jobs or To apply into Applications → Submitted. A listing tag leaves the submitted document version unknown. Any unfinished draft for that listing is accessible from Submitted as a separate version.

**Company cooldown**:
The temporary pause on discovery and new applications at a hiring employer after two distinct confirmed submissions. Its deadline uses the workspace’s configured duration and the actual submission history.

**Company allowance**:
The capacity for two distinct vacancies at a hiring employer in the current application round. To apply choices, confirmed submissions in that round and active or uncertain submission holds share this capacity without counting the same vacancy twice. Pending choices do not trigger the cooldown or authorize a submission. See [ADR 0018](docs/adr/0018-count-to-apply-choices-in-company-allowance.md).

**Hiring employer**:
The organisation hiring for a vacancy, which can differ from the recruiter or listing source. An agent can resolve its identity from reliable evidence; an uncertain identity remains a question for the user.

**Companies to avoid**:
Hiring employers whose company cooldown is active at the time of a job search.

**Jobs**:
The incoming list of opportunities available to assess. Stronger matches appear first, and profile mismatches remain visible.

**To apply**:
The roles the user kept with **Apply later**, including roles with prepared drafts. Recording a submission removes the vacancy from this pending list. Removal preserves the choice for restoration. Earlier bookmarks and agent marks both carry forward into To apply.

New choices must fit the hiring employer's remaining company allowance. Verified alternate names share the same employer identity; an uncertain match requires confirmation. See [ADR 0018](docs/adr/0018-count-to-apply-choices-in-company-allowance.md).

**Selected roles**:
The temporary subset of To apply chosen for a grouped action or exact agent instructions. Selecting a role does not add it to To apply, change the company allowance or authorize submission. With no temporary selection, application instructions use the entire pending To apply list. The Jobs status **2 selected** refers to two pending vacancies already chosen at that employer, rather than this temporary subset.

**Agent instructions**:
An editable prompt describing a research task or an exact set of pending application roles in the active workspace. Copying it does not start an agent or submit an application. Edits belong to the current generated prompt and are not a saved reusable template.

**Job reference**:
The title, company and full workspace job ID copied from a listing, with its original link when available. The ID identifies the exact role when titles and companies repeat.

**Requirement evidence**:
The user's confirmation or written example for a specific requirement on a job. A quick confirmation saves the requirement as a reusable, self-confirmed skill. A written example adds a separate confirmed career fact.

**Opportunity source link**:
A link to a job listing, company careers page or listing site's home page. In a web browser it opens in a separate tab alongside the workspace.

**Native source browser**:
The system browser view opened from an installed mobile app when following a listing or company link. Closing it returns to the workspace.

**Removed opportunity**:
A role the user has set aside across search profiles and application lists. Removed holds its listing, application versions, documents and decisions. Restore returns the role and its application to their previous lists. Current applications rejected in an earlier version also appear here and restore as drafts.

**Removal reason**:
An optional comment associated with removing an opportunity. Adding it is separate from removal and never a prerequisite for continuing to browse.

**Review status**:
The reversible Draft or Reviewed state of an active application version. Changing review status records the user's current decision without deleting previous decisions or changing the preserved application documents; a submitted snapshot is not reopened by this control.

**Listing dates**:
Employer-provided posting, reposting and closing dates, distinct from document generation and user decision dates. Missing values remain unknown and approximate source wording stays approximate.

**Discovery run**:
An on-demand search of selected feeds and public URLs for a workspace. Its results and source outcomes are available while the search is running.

**New to the workspace**:
A listing the workspace has not previously recorded under its source identity or a verified equivalent. The employer’s posting date may be earlier.

**Hosted workspace**:
An account-owned collection of career facts, preferences, job evidence, documents and decisions stored privately in the hosted service, isolated from other users and separate from local workspaces.

**Fit summary**:
One or two sentences describing a role and its strongest supported match to confirmed career facts, including a material gap when relevant. It does not imply qualifications unsupported by evidence.

**Demo workspace**:
An isolated example career workspace containing an explicitly fictional candidate and dated snapshots of real job listings. Its sample decisions and generated documents demonstrate the application, not a real person's employment or submissions.

**Public showcase**:
The publicly accessible static demo with the owner’s redacted résumé and profile, employer listings and sample application decisions. Visitors can keep roles in To apply in their browser and prepare drafts from a résumé selected in the current tab.

**Demo draft**:
An application draft prepared from the selected résumé in the public showcase. The draft lives in the current tab and the visitor can download a copy.

**Submission approval**:
The user's authorization to prepare and submit the role or selected roles named when starting **Apply for me**. An **Apply later** choice, draft preparation or review decision does not grant this authority; actions outside the authorized scope require a new decision. See [ADR 0016](docs/adr/0016-authorize-role-submission-when-starting-agent.md). Earlier delivery attempts retain their original final-approval contract.
