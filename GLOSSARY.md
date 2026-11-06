# Employment Agency

Shared local application software with independently located personal career data.

## Language

**Application installation**:
The reusable software and UI that manages career information, discovery, tailoring, application review and storage. It contains no real user's data in its public distribution.

**Career workspace**:
A selected local folder containing one person's master resumes, confirmed facts, supplemental information, research, preferences, templates, generated applications and decision history. It contains data and configuration, not executable application extensions or a private UI fork.

**Default workspace**:
The ignored `workspace/` folder inside a source installation, used unless another workspace location is selected. Its presence on disk does not make its contents part of the public Git repository.

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
A user's recorded review, rejection or manual submission. Recording Submitted also confirms review; it does not send an application. Comments do not change decisions. Active contains Draft and Reviewed packages; Submitted and Rejected have separate sections.

**Review status**:
The reversible Draft or Reviewed state of an active application version. Changing review status records the user's current decision without deleting previous decisions or changing the preserved application documents; a submitted snapshot is not reopened by this control.

**Listing dates**:
Employer-provided posting, reposting and closing dates, distinct from document generation and user decision dates. Missing values remain unknown and approximate source wording stays approximate.

**Hosted workspace**:
An account-owned collection of career facts, preferences, job evidence, documents and decisions stored privately in the hosted service, isolated from other users and separate from local workspaces.

**Fit summary**:
One or two sentences describing a role and its strongest supported match to confirmed career facts, including a material gap when relevant. It does not imply qualifications unsupported by evidence.

**Demo workspace**:
An isolated example career workspace containing an explicitly fictional candidate and dated snapshots of real job listings. Its sample decisions and generated documents demonstrate the application, not a real person's employment or submissions.

**Public showcase**:
The publicly accessible static website containing entirely fictional career information, vacancies and sample documents. It is separate from the installed demo workspace and private hosted pilot; visitors can explore it and save browser bookmarks without accessing a real career workspace.

**Submission approval**:
The user's confirmation of one external application attempt in the local Apply For Me preview, bound to its exact documents, recipient, answers and final action. Requesting preparation or recording a review decision does not constitute this approval. The capability is implemented in the unreleased local source preview; the published 0.6 wheel remains draft-only and hosted execution is disabled.
