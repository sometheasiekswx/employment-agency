/** API data owned and validated by the Python services. No storage logic lives here. */
export interface Identity {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  languages?: string;
}
export interface Fact {
  id: string;
  text: string;
  category?: string;
  association?: string;
  dates?: string;
  claim_key?: string;
  confirmed: boolean;
  retired?: boolean;
  conflict?: boolean;
  source?: { name?: string; at?: string };
}
export interface Profile {
  id: string;
  name: string;
  roles: string[];
  locations: string[];
  seniority: string[];
  arrangements: string[];
  hard: string[];
  exclude: string[];
  work_rights: string[];
  needs_sponsorship: boolean;
  minimum: number;
  currency: string;
  period: string;
  template: string;
  include_stretch: boolean;
  include_unknown: boolean;
}
export interface Salary {
  min?: number;
  max?: number;
  currency?: string;
  period?: string;
  basis?: string;
}
export interface JobRemoval {
  id: string;
  at: string;
  reason: string;
  reason_updated_at?: string;
  restored_at?: string;
  legacy_application_id?: string;
}
export interface JobRemovalResult {
  id: string;
  removals: JobRemoval[];
}
interface SubmissionTime {
  at: string;
  assumed: boolean;
}

export interface Job {
  company?: {
    id: string;
    name?: string;
    remaining: number;
    cooling: boolean;
    cooldown_until?: string;
    cooldown_time_assumed?: boolean;
  };
  submission_time?: SubmissionTime | null;
  id: string;
  saved?: boolean;
  removals?: JobRemoval[];
  title: string;
  employer: string;
  location?: string;
  city?: string;
  url?: string;
  careers_url?: string;
  source?: string;
  email?: string;
  description?: string;
  requirements?: string[];
  requirement_evidence?: Record<
    string,
    { confirmed?: boolean; fact_ids?: string[] }
  >;
  matched_skill_evidence?: Record<string, string[]>;
  closes?: string;
  posted_at?: string;
  reposted_at?: string;
  checked_at?: string;
  seniority?: string;
  work_arrangement?: string;
  eligibility?: string;
  sponsorship?: string;
  prior_application?: string;
  availability?: string;
  salary?: Salary | string;
  expectation?: {
    target?: string;
    basis?: string;
    source?: string;
    confidence?: string;
  };
}
export interface ReviewComment {
  at: string;
  kind?: string;
  status?: string;
  text: string;
}
export interface Application {
  id: string;
  job_id: string;
  title: string;
  employer: string;
  status: "draft" | "reviewed" | "submitted" | "rejected";
  demo_draft?: boolean;
  created_at?: string;
  reviewed_at?: string;
  submitted_at?: string;
  submission_time?: SubmissionTime | null;
  folder?: string;
  manifest_hash?: string;
  submission_record?: {
    at: string;
    previous_status: string;
    prior_application?: string;
    token: string;
    prior_token?: string;
  };
  submission_correction?: {
    at: string;
    reason: string;
    recovery_application_id: string;
  };
  submission_recovery?: {
    original_id: string;
    at: string;
    reason: string;
    recorded_at?: string;
  };
  submission_correction_blocked?: string;
  archived?: boolean;
  fit_summary?: string;
  warnings?: string[];
  documents?: Record<string, string>;
  file_changes?: string[];
  migration_warning?: string;
  comments: ReviewComment[];
}
export interface WorkspaceSettings {
  snapshot?: { status: "current" | "pending" | "conflict"; revision: number; published_revision: number };
  company_cooldown_months?: number;
  demo?: boolean;
  path: string;
  label: string;
  master: string;
  master_template: boolean;
  timezone: string;
  preferred_locations: string[];
  setup_complete: boolean;
}
export interface MasterState {
  exists: boolean;
  changed: boolean;
  path: string;
  sha256?: string;
}
export interface MasterProposal {
  sha256: string;
  diff: string;
  conflicts: unknown[];
  identity: Identity;
  candidates: Fact[];
}
export interface Run {
  id: string;
  profile: Profile;
  status: string;
  packages: string[];
  count: number;
  note?: string;
  reserved: number;
  errors: unknown[];
}
export interface Match {
  eligible_for_preparation: boolean;
  hard_conflicts: string[];
  unknowns: string[];
  gaps: string[];
  evidence: unknown;
  preferences: unknown;
  salary_expectation: unknown;
}
export interface RankedJob {
  job: Job;
  match: Match;
}
export interface ApplicationQueueEntry {
  job_id: string;
  application_id: string | null;
  stage: "active" | "submitted" | "removed" | "saved";
  archived: boolean;
}
export interface WorkspaceState {
  application_queue?: ApplicationQueueEntry[];
  identity: Identity;
  facts: Fact[];
  profiles: Profile[];
  jobs: Job[];
  unlisted_removals?: Record<string, JobRemoval[]>;
  sources: {
    id: string;
    kind: string;
    board: string;
    status: string;
    checked_at?: string;
    error?: string;
  }[];
  runs: Run[];
  applications: Application[];
  consents: Record<string, unknown>;
  historical_decisions?: { employer: string; status: string }[];
  _workspace: WorkspaceSettings;
  _master: MasterState;
  _hosted?: boolean;
}
export interface StateResponse {
  state: WorkspaceState;
  token: string;
}
export type Block = [string, string];
export interface EditorDocument {
  id: string;
  document: "resume" | "cover-letter";
  base: string;
  mode: "blocks" | "tex" | "view";
  pdf: string;
  source?: string;
  blocks?: Block[];
  notice?: string;
}
export interface HistoryVersion {
  id: string;
  city: string;
  company: string;
  job: string;
  label: string;
  generated_at: string;
  date_uncertain: boolean;
  source: string;
  files: string[];
}
export type RequestData = Record<string, unknown>;
