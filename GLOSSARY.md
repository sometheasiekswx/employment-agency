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

**Listing dates**:
Employer-provided posting, reposting and closing dates, distinct from document generation and user decision dates. Missing values remain unknown and approximate source wording stays approximate.

**Hosted workspace**:
An account-owned collection of career facts, preferences, job evidence, documents and decisions stored privately in the hosted service, isolated from other users and separate from local workspaces.

**Fit summary**:
One or two sentences describing a role and its strongest supported match to confirmed career facts, including a material gap when relevant. It does not imply qualifications unsupported by evidence.
