"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  Building2,
  CircleMinus,
  MessageSquare,
  RotateCcw,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useDraft } from "@/components/unsaved";
import { OpportunityApplication } from "@/features/applications/opportunity-application";
import { ApplicationVersions } from "@/features/applications/application-versions";
import { CompanySubmission } from "@/features/applications/company-submission";
import { SubmissionRecord } from "@/features/applications/submission-records";
import { RoleAgentWork } from "@/features/applications/agent-application";
import { Action, Check, Select } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import {
  applicationRoleId,
  applicationSection,
  compareDestinations,
  destination,
  errorMessage,
  hasRecordedSubmission,
} from "@/lib/format";
import type {
  Application,
  Job,
  JobRemoval,
  RankedJob,
  SubmissionAttempt,
} from "@/lib/models";
import { currentRemoval } from "@/lib/job-removal";
import { RemovalFeedback } from "./removal-feedback";
import { useJobRemoval } from "./use-job-removal";
import {
  advertisedSalary,
  applicationsByJob,
  filterOpportunities,
  groupOpportunities,
  remainingEvidenceGaps,
  requirementEvidence,
  roleStatus,
  pendingActionLabel,
  type DiscoveryView,
} from "./discovery";
import { OpportunityInspector, type RolePanel } from "./opportunity-inspector";
import { OpportunityListingLink } from "./opportunity-listing-link";
import { useInteractionMotion } from "./interaction-motion";
import { cachedRanking, loadRanking } from "./rankings";
import { CompanyReview } from "./company-review";
import { AgentQueueTools } from "./agent-queue";
import "./discover.css";
import "./opportunities.css";

interface RankingState {
  key: string;
  profileId: string;
  rows: RankedJob[];
  error: string;
}

const pendingPageSize = 50;
const shortlistHistoryKey = "employmentAgencyShortlistInspector";
const applicationStages = [
  ["active", "Active"],
  ["submitted", "Submitted"],
  ["removed", "Removed"],
] as const;

function unassessedRole(job: Job): RankedJob {
  return {
    job,
    match: {
      eligible_for_preparation: false,
      hard_conflicts: [],
      unknowns: [],
      gaps: [],
      evidence: [],
      preferences: [],
      salary_expectation: {},
    },
  };
}

const mobileInspectorQuery = "(max-width: 1000px)";

function subscribeToInspectorWidth(listener: () => void) {
  const query = window.matchMedia(mobileInspectorQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function useMobileInspector() {
  return useSyncExternalStore(
    subscribeToInspectorWidth,
    () => window.matchMedia(mobileInspectorQuery).matches,
    () => false,
  );
}

export function DiscoverPage() {
  const { canLeave, registerHistoryGuard } = useDraft();
  const animateInteractions = useInteractionMotion();
  const [motionRevision, setMotionRevision] = useState(0);
  const bookmarkAnimations = useRef(new Set<Animation>());
  const motionAllowed = useRef(false);
  useLayoutEffect(() => {
    motionAllowed.current = animateInteractions;
  }, [animateInteractions]);
  const { state, client, run, refresh, profileId, selectProfile } =
    useWorkspace();
  const [preparedVersion, setPreparedVersion] = useState<{
    workspace: string;
    application: Application;
  }>();
  const [recentSubmission, setRecentSubmission] = useState<SubmissionAttempt>();
  const localJourney =
    Boolean(state._workspace.agent_queue) && !client.hosted && !client.preview;
  const params = useSearchParams();
  const { back, replace } = useRouter();
  const [routeQuery, setOptimisticQuery] = useOptimistic(params.toString());
  const filters = new URLSearchParams(routeQuery);
  const applications = useMemo(
    () => applicationsByJob(state.applications, state.application_queue),
    [state.applications, state.application_queue],
  );
  const roleRecords = useMemo(() => {
    const roles = new Map(state.jobs.map((job) => [job.id, job]));
    for (const [id, app] of applications) {
      if (!roles.has(id))
        roles.set(id, {
          id,
          title: app.title,
          employer: app.employer,
          removals: state.unlisted_removals?.[id],
        });
    }
    return [...roles.values()];
  }, [applications, state.jobs, state.unlisted_removals]);
  const removal = useJobRemoval({ jobs: roleRecords, client, refresh });
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const legacyMarked = new Set(
    state.agent_intents
      ?.filter((intent) => intent.marked)
      .map((intent) => intent.id),
  );
  const latestJobs = new Map(
    roleRecords.map((job) => [
      job.id,
      removal.jobWithRemoval({
        ...job,
        saved:
          savedOverrides[job.id] ??
          Boolean(job.saved || legacyMarked.has(job.id)),
      }),
    ]),
  );
  const applicationId = filters.get("application");
  const requestedApplication =
    state.applications.find((app) => app.id === applicationId) ??
    (preparedVersion?.workspace === state._workspace.path &&
    preparedVersion.application.id === applicationId
      ? preparedVersion.application
      : undefined);
  const requestedRoleId = requestedApplication
    ? applicationRoleId(requestedApplication)
    : "";
  const requestedJob = latestJobs.get(requestedRoleId);
  const query = filters.get("q") || "";
  const rawStatus = filters.get("status") || "";
  const rawView = filters.get("view");
  const rawSection = filters.get("section");
  const removedView =
    filters.get("removed") === "true" ||
    rawStatus === "rejected" ||
    (rawView === "applications" &&
      (rawSection === "removed" || rawSection === "rejected")) ||
    Boolean(currentRemoval(requestedJob));
  const legacySubmittedFilter =
    rawView !== "applications" && rawStatus === "submitted";
  const linkedListingSubmission =
    requestedJob?.prior_application === "submitted" &&
    applications.get(requestedRoleId)?.status !== "submitted";
  if (!removedView && (legacySubmittedFilter || linkedListingSubmission)) {
    filters.set("view", "applications");
    filters.set("section", "submitted");
  }
  const legacySavedFilter =
    !removedView &&
    filters.get("view") !== "applications" &&
    rawStatus === "saved";
  const requestedView = filters.get("view");
  const toApplyLink =
    legacySavedFilter ||
    requestedView === "saved" ||
    requestedView === "to-apply" ||
    (requestedView === "applications" && rawSection === "agent");
  const view: DiscoveryView = removedView
    ? "applications"
    : toApplyLink && !(legacySubmittedFilter || linkedListingSubmission)
      ? "to-apply"
      : requestedView === "applications"
        ? "applications"
        : "jobs";
  const applicationView = view === "applications";
  const toApplyView = view === "to-apply";
  const agentTools = localJourney && toApplyView;
  const section = removedView ? "removed" : filters.get("section") || "active";
  if (requestedView && requestedView !== view) filters.set("view", view);
  if (toApplyView && rawSection === "agent") {
    const destinationAlias = filters.get("destination");
    if (destinationAlias && !filters.has("location"))
      filters.set("location", destinationAlias);
    filters.delete("destination");
  }
  if (!applicationView && (rawSection === "agent" || legacySavedFilter)) {
    filters.set("view", view);
    filters.delete("section");
    if (legacySavedFilter) filters.delete("status");
  }
  const queryString = filters.toString();
  const [agentSelection, setAgentSelection] = useState<string[]>([]);
  const [startingAgent, setStartingAgent] = useState(false);
  const offset = Number(filters.get("offset") ?? filters.get("agent_offset"));
  const requestedOffset =
    Number.isSafeInteger(offset) && offset > 0
      ? Math.floor(offset / pendingPageSize) * pendingPageSize
      : 0;
  const location =
    filters.get("location") ||
    (applicationView ? filters.get("destination") : "") ||
    "";
  const statusFilter =
    rawStatus === "rejected" ||
    rawStatus === "saved" ||
    (applicationView && section === "submitted" && rawStatus !== "submitted")
      ? ""
      : rawStatus;
  const hasActiveFilters = Boolean(
    query.trim() ||
    location ||
    (statusFilter &&
      !(section === "submitted" && statusFilter === "submitted")),
  );
  const includeHistorical = filters.get("history") === "true";
  const requestedPanel = filters.get("panel");
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [ranking, setRanking] = useState<RankingState>({
    key: "",
    profileId: "",
    rows: [],
    error: "",
  });
  const selectedId =
    requestedRoleId ||
    ((filters.get("assessment_profile") ?? "") === profileId
      ? filters.get("opportunity") || ""
      : "");
  const currentRoute = useRef({ queryString, profileId });
  const roleVisit = useRef<object | null>(null);
  const openedFromShortlist = useRef(false);
  const closingWithBack = useRef(false);
  useLayoutEffect(() => {
    currentRoute.current = { queryString, profileId };
  }, [queryString, profileId]);
  useLayoutEffect(() => {
    roleVisit.current = {};
    return () => {
      roleVisit.current = null;
    };
  }, [selectedId, profileId, state._workspace.path]);
  const replaceQuery = useCallback(
    (
      next: URLSearchParams,
      mode: "replace" | "filter" | "open" = "replace",
    ) => {
      startTransition(() => {
        setOptimisticQuery(next.toString());
        const href = `/discover/${next.size ? `?${next}` : ""}`;
        // Apply shortlist filters before pushing the role entry so immediate
        // Back or Escape returns to the board with its filters intact.
        if (mode === "filter") window.history.replaceState(null, "", href);
        else if (mode === "open")
          window.history.pushState({ [shortlistHistoryKey]: true }, "", href);
        else replace(href, { scroll: false });
      });
    },
    [replace, setOptimisticQuery],
  );
  const setSelectedId = useCallback(
    (id: string, guardChecked = false, openFromShortlist = false) => {
      // Keep the close callback stable so navigation within the inspector does
      // not rerun its initial-focus effect or reopen the native mobile dialog.
      if (!guardChecked && !canLeave()) return false;
      const current = currentRoute.current;
      const next = new URLSearchParams(current.queryString);
      if (id) {
        next.set("opportunity", id);
        next.set("assessment_profile", current.profileId);
        next.delete("application");
        next.delete("panel");
      } else {
        next.delete("opportunity");
        next.delete("assessment_profile");
        next.delete("application");
        next.delete("panel");
      }
      if (openFromShortlist) openedFromShortlist.current = true;
      replaceQuery(next, openFromShortlist ? "open" : "replace");
      return true;
    },
    [replaceQuery, canLeave],
  );
  const closeRemovalReason = removal.closeReason;
  const [saveError, setSaveError] = useState("");
  const saving = useRef(new Set<string>());
  const saveErrorNotice = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const submittedStage = useRef<HTMLButtonElement>(null);
  const focusSubmittedStage = useRef(false);
  useLayoutEffect(() => {
    if (
      !applicationView ||
      section !== "submitted" ||
      !focusSubmittedStage.current
    )
      return;
    focusSubmittedStage.current = false;
    submittedStage.current?.focus();
  }, [applicationView, section]);
  const opener = useRef<HTMLButtonElement | null>(null);
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const triageFocus = useRef<{
    adjacentId: string;
    pressed: Element | null;
    disappearingCard: Element | null;
    fallbackToRemoved: boolean;
  } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const discoverScreen = useRef<HTMLDivElement>(null);
  const mobile = useMobileInspector();
  const profile = state.profiles.find((item) => item.id === profileId);
  const priorities = profile?.locations.length
    ? profile.locations
    : state._workspace.preferred_locations;
  // Queue, removal and source link changes leave the current matching intact.
  const rankInput = JSON.stringify({
    profile,
    facts: state.facts,
    jobs: state.jobs.map((job) => ({
      ...job,
      saved: undefined,
      removals: undefined,
      careers_url: undefined,
      matched_skill_evidence: undefined,
      hiring_employer_verified: undefined,
    })),
  });
  const requestKey = `${profileId}:${attempt}:${rankInput}`;
  const workspacePath = state._workspace.path;
  const cached =
    attempt === 0
      ? cachedRanking(client, workspacePath, profileId, rankInput)
      : undefined;
  const currentRanking =
    ranking.key !== requestKey && cached
      ? { key: requestKey, profileId, rows: cached, error: "" }
      : ranking;
  const loading =
    view === "jobs" && Boolean(profile) && currentRanking.key !== requestKey;
  const selectionInFlight = useRef(false);

  useEffect(() => {
    if (!profileId || applicationView) return;
    let active = true;
    loadRanking(client, workspacePath, profileId, rankInput, attempt > 0).then(
      (rows) => {
        if (active) setRanking({ key: requestKey, profileId, rows, error: "" });
      },
      (error: unknown) => {
        if (active)
          setRanking((previous) => ({
            key: requestKey,
            profileId,
            rows: previous.profileId === profileId ? previous.rows : [],
            error: errorMessage(error),
          }));
      },
    );
    return () => {
      active = false;
    };
  }, [
    client,
    workspacePath,
    profileId,
    rankInput,
    requestKey,
    attempt,
    applicationView,
  ]);

  const rows = (
    currentRanking.profileId === profileId ? currentRanking.rows : []
  ).flatMap((row) => {
    const latest = latestJobs.get(row.job.id);
    return latest
      ? [
          {
            ...row,
            job: {
              ...row.job,
              ...latest,
              prior_application: latest.prior_application,
              matched_skill_evidence: latest.matched_skill_evidence,
            },
          },
        ]
      : [];
  });
  const effectiveQueue = new Map(
    state.application_queue?.map((entry) => [entry.job_id, entry.stage]),
  );
  const applicationJobs = {
    active: new Map<string, Job>(),
    submitted: new Map<string, Job>(),
  };
  for (const [id, app] of applications) {
    if (app.archived && !includeHistorical) continue;
    const job = latestJobs.get(id)!;
    const stage = currentRemoval(job)
      ? "removed"
      : effectiveQueue.get(id) || applicationSection(app, job);
    if (stage === "active" || stage === "submitted")
      applicationJobs[stage].set(id, job);
  }
  // A listing can record an earlier submission independently of any saved version.
  for (const [id, job] of latestJobs) {
    if (
      job.prior_application === "submitted" &&
      applications.get(id)?.status !== "submitted" &&
      !currentRemoval(job)
    )
      applicationJobs.submitted.set(id, job);
  }
  const listingIds = new Set(state.jobs.map(({ id }) => id));
  const pendingRole = (job: Job) =>
    listingIds.has(job.id) &&
    !currentRemoval(job) &&
    !hasRecordedSubmission(applications.get(job.id), job) &&
    !job.company?.submitted_vacancy;
  const pending = new Map(
    [...latestJobs].filter(([, job]) => Boolean(job.saved) && pendingRole(job)),
  );
  const chosenForAgent = agentSelection.flatMap((id) => {
    const job = pending.get(id);
    return job ? [job] : [];
  });
  const agentApplications = Object.fromEntries(
    chosenForAgent.flatMap(({ id }) => {
      const app = applications.get(id);
      return app && !app.archived ? [[id, app.id]] : [];
    }),
  );
  const assessedById = new Map(rows.map((row) => [row.job.id, row]));
  const discoveryRows = [
    ...rows.filter(({ job }) => pendingRole(job)),
    ...state.jobs.flatMap(({ id }) => {
      const job = latestJobs.get(id)!;
      return !assessedById.has(id) && pendingRole(job)
        ? [unassessedRole(job)]
        : [];
    }),
  ];
  const applicationRows = (
    section === "all"
      ? [
          ...applicationJobs.active.values(),
          ...applicationJobs.submitted.values(),
        ]
      : section === "active" || section === "submitted"
        ? [...applicationJobs[section].values()]
        : []
  ).map(unassessedRole);
  const removedRows: RankedJob[] = [...latestJobs.values()]
    .filter((job) => currentRemoval(job))
    .map(
      (job) => rows.find((row) => row.job.id === job.id) || unassessedRole(job),
    );
  const incomingRows = discoveryRows.filter(({ job }) => !job.saved);
  const availableIncoming = incomingRows.filter(
    ({ job }) => !job.company?.cooling,
  );
  const pausedResults = incomingRows.length > 0 && !availableIncoming.length;
  const sourceRows = removedView
    ? removedRows
    : applicationView
      ? applicationRows
      : toApplyView
        ? discoveryRows.filter(({ job }) => pending.has(job.id))
        : availableIncoming;
  const scopedRows = filterOpportunities(
    sourceRows,
    { query: "", location: "", view, removed: removedView },
    priorities,
  );
  const locations = [
    ...new Set([
      ...scopedRows.map(({ job }) => destination(job, priorities)),
      ...(location ? [location] : []),
    ]),
  ].sort((a, b) => compareDestinations(a, b, priorities));
  const filteredRows = filterOpportunities(
    scopedRows,
    {
      query,
      location,
      view,
      removed: removedView,
    },
    priorities,
  ).filter(({ job }) => {
    if (!statusFilter) return true;
    const app = applications.get(job.id);
    if (statusFilter === "submitted") return hasRecordedSubmission(app, job);
    if (statusFilter === "new")
      return !app && job.prior_application !== "rejected";
    return app?.status === statusFilter;
  });
  const pendingOffset = agentTools
    ? Math.min(
        requestedOffset,
        Math.max(
          0,
          Math.floor((filteredRows.length - 1) / pendingPageSize) *
            pendingPageSize,
        ),
      )
    : 0;
  const visible = agentTools
    ? filteredRows.slice(pendingOffset, pendingOffset + pendingPageSize)
    : filteredRows;
  const groups = groupOpportunities(visible);
  const navigationRows = groups.flatMap(({ roles }) => roles);
  const selectedRow = visible.find((row) => row.job.id === selectedId);
  const assessedRow = assessedById.get(selectedId);
  const selectedJob = latestJobs.get(selectedId);
  const selected =
    selectedRow ||
    (selectedJob &&
    (requestedApplication ||
      removal.feedback?.job.id === selectedId ||
      (view === "jobs" && selectedJob.saved && pendingRole(selectedJob)) ||
      (toApplyView &&
        (pending.has(selectedId) || Boolean(savingIds.includes(selectedId)))) ||
      (applicationView && !removedView && !currentRemoval(selectedJob)) ||
      recentSubmission?.binding.job_id === selectedId ||
      hasRecordedSubmission(applications.get(selectedId), selectedJob))
      ? assessedRow || unassessedRole(selectedJob)
      : undefined);
  const assessmentAvailable = Boolean(assessedRow);
  const hasListingRecord = listingIds.has(selectedId);
  const selectedApplication =
    requestedApplication ||
    (selected ? applications.get(selected.job.id) : undefined);
  const selectedDraft = Boolean(
    selectedApplication &&
    ["draft", "reviewed"].includes(selectedApplication.status),
  );
  const submission =
    recentSubmission?.binding.job_id === selectedId
      ? recentSubmission
      : undefined;
  const submitted = Boolean(
    submission || hasRecordedSubmission(selectedApplication, selected?.job),
  );
  const panel: RolePanel =
    requestedPanel === "overview" ||
    requestedPanel === "documents" ||
    requestedPanel === "activity" ||
    requestedPanel === "files"
      ? requestedPanel
      : selectedApplication
        ? "documents"
        : "overview";
  const expandedApplication = Boolean(
    selectedApplication && panel !== "overview",
  );
  const openPanel = (value: RolePanel) => {
    const next = new URLSearchParams(queryString);
    next.set("panel", value);
    replaceQuery(next);
  };
  const prepareApplication = async () => {
    const visit = roleVisit.current;
    const response = await client.action<
      Application | { application: Application }
    >("local-package", { profile_id: profileId, job_id: selectedId });
    const application =
      "application" in response ? response.application : response;
    if (!application?.id || application.job_id !== selectedId)
      throw new Error("The app could not open the prepared CV.");
    if (visit === roleVisit.current) {
      setPreparedVersion({ workspace: workspacePath, application });
      const next = new URLSearchParams(currentRoute.current.queryString);
      next.set("application", application.id);
      next.set("panel", "documents");
      replaceQuery(next);
    }
    void refresh().catch(() => {
      // The exact version was returned by preparation; workspace refresh can retry.
    });
  };
  const openVersion = (
    application: Application,
    nextPanel: RolePanel = "documents",
  ) => {
    if (!canLeave()) return;
    const next = new URLSearchParams(queryString);
    next.set("application", application.id);
    next.set("panel", nextPanel);
    if (applicationView)
      next.set(
        "section",
        applicationSection(
          application,
          latestJobs.get(applicationRoleId(application)),
        ),
      );
    replaceQuery(next);
  };
  const recordSubmission = (attempt: SubmissionAttempt) => {
    const current = new URLSearchParams(currentRoute.current.queryString);
    const activeJob =
      current.get("opportunity") ||
      (current.get("application") === selectedApplication?.id
        ? selectedId
        : "");
    if (activeJob !== attempt.binding.job_id) return;
    setRecentSubmission(attempt);
    if (!attempt.document_application_id && attempt.self_apply_request) {
      current.delete("application");
      current.set("panel", "overview");
    } else {
      current.set(
        "application",
        attempt.document_application_id || attempt.application_id,
      );
      current.set("panel", "documents");
    }
    current.set("opportunity", attempt.binding.job_id);
    current.set("assessment_profile", profileId);
    current.set("view", "applications");
    current.set("section", "submitted");
    current.delete("status");
    replaceQuery(current);
  };
  const inspectorOpen = Boolean(selected);
  const selectedIndex = navigationRows.findIndex(
    (row) => row.job.id === selectedId,
  );
  const error =
    !applicationView && currentRanking.key === requestKey
      ? currentRanking.error
      : "";
  const showBoard = (!loading || rows.length > 0) && visible.length > 0;
  const boardGroups =
    showBoard || inspectorOpen
      ? JSON.stringify(
          groups.map(({ id, roles }) => [id, roles.map(({ job }) => job.id)]),
        )
      : "";
  useEffect(() => {
    const intent = triageFocus.current;
    if (!intent) return;
    // Outside controls stay inert until the native details dialog has closed.
    // Consume focus only after the matching optimistic board/selection commits.
    if (mobile && inspectorOpen) return;
    const frame = requestAnimationFrame(() => {
      if (triageFocus.current !== intent) return;
      const focused = document.activeElement;
      if (
        focused !== intent.pressed &&
        !intent.disappearingCard?.contains(focused) &&
        focused !== document.body &&
        focused instanceof HTMLElement &&
        focused.isConnected &&
        (focused.tabIndex >= 0 || focused.hasAttribute("tabindex"))
      ) {
        triageFocus.current = null;
        return;
      }
      const target =
        cardButtons.current.get(intent.adjacentId) ||
        (intent.fallbackToRemoved &&
          document.querySelector<HTMLButtonElement>(
            ".discover-removed-filter[aria-pressed]",
          )) ||
        document.querySelector<HTMLButtonElement>(
          '.discover-views button[aria-pressed="true"]',
        );
      target?.focus({ preventScroll: true });
      if (document.activeElement === target) triageFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    boardGroups,
    inspectorOpen,
    mobile,
    selectedId,
    removal.feedback?.removalId,
  ]);

  useLayoutEffect(() => {
    const element = board.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const sections = [
      ...element.querySelectorAll<HTMLElement>(".discover-column"),
    ];
    let frame = 0;
    const pack = () => {
      const style = getComputedStyle(element);
      const rowSize = parseFloat(style.getPropertyValue("--discover-row-size"));
      const gap = parseFloat(style.getPropertyValue("--discover-group-gap"));
      // Read every natural section height before writing placement. Sections
      // stay in source order so shorter groups leave room for later companies.
      const spans = sections.map((section) =>
        Math.ceil((section.getBoundingClientRect().height + gap) / rowSize),
      );
      sections.forEach((section, index) => {
        const span = `span ${spans[index]}`;
        if (section.style.gridRowEnd !== span) section.style.gridRowEnd = span;
      });
      element.dataset.compact = "true";
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(pack);
    };
    // Pack synchronously before the selected card's scroll/focus restoration.
    pack();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    sections.forEach((section) => observer.observe(section));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [boardGroups, inspectorOpen, mobile]);

  useEffect(() => {
    const animations = bookmarkAnimations.current;
    if (!animateInteractions) {
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    }
    return () => {
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    };
  }, [animateInteractions]);

  useLayoutEffect(() => {
    const screen = discoverScreen.current;
    if (!screen || !inspectorOpen || mobile) return;

    const measure = () => {
      // Its position in the document reflects the shell and any notice above
      // the columns. Leave a gutter below the pane even before scrolling.
      const top = Math.max(
        16,
        screen.getBoundingClientRect().top + window.scrollY,
      );
      const offset = `${Math.ceil(top)}px`;
      if (screen.style.getPropertyValue("--discover-pane-offset") !== offset)
        screen.style.setProperty("--discover-pane-offset", offset);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    for (
      let branch: Element | null = screen;
      branch && branch !== document.body;
      branch = branch.parentElement
    ) {
      for (
        let sibling = branch.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      )
        observer?.observe(sibling);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      screen.style.removeProperty("--discover-pane-offset");
    };
  }, [inspectorOpen, mobile]);

  useEffect(() => {
    if (inspectorOpen && !mobile)
      cardButtons.current
        .get(selectedId)
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedId, inspectorOpen, mobile]);

  useEffect(() => {
    if (saveError && (!inspectorOpen || !mobile))
      saveErrorNotice.current?.focus({ preventScroll: true });
  }, [saveError, inspectorOpen, mobile]);

  const restoreShortlistFocus = useCallback(() => {
    return window.setTimeout(() => {
      if (opener.current?.isConnected) {
        opener.current.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
        });
        opener.current.focus({ preventScroll: true });
      } else {
        document
          .querySelector<HTMLButtonElement>(
            '.discover-views button[aria-pressed="true"]',
          )
          ?.focus({ preventScroll: true });
      }
    }, 0);
  }, []);
  const closeInspector = useCallback(() => {
    if (closingWithBack.current) return true;
    if (!canLeave()) return false;
    if (openedFromShortlist.current) {
      closingWithBack.current = true;
      back();
    } else {
      setSelectedId("", true);
      restoreShortlistFocus();
    }
    closeRemovalReason();
    return true;
  }, [
    back,
    canLeave,
    setSelectedId,
    closeRemovalReason,
    restoreShortlistFocus,
  ]);

  useEffect(() => {
    const guardShortlistBack = (event: PopStateEvent) => {
      const url = new URL(window.location.href);
      if (url.pathname !== "/discover/") return;
      if (
        url.searchParams.has("opportunity") ||
        url.searchParams.has("application")
      ) {
        openedFromShortlist.current =
          event.state?.[shortlistHistoryKey] === true;
        closingWithBack.current = false;
        return;
      }
      if (!openedFromShortlist.current) return;
      if (closingWithBack.current || canLeave()) {
        closingWithBack.current = true;
      } else {
        event.stopImmediatePropagation();
        window.history.forward();
      }
    };
    return registerHistoryGuard(guardShortlistBack);
  }, [canLeave, registerHistoryGuard]);

  useLayoutEffect(() => {
    if (!inspectorOpen || closingWithBack.current) return;
    const historyState = window.history.state;
    if (historyState?.[shortlistHistoryKey] === true) {
      openedFromShortlist.current = true;
    } else if (openedFromShortlist.current) {
      // Activity, Documents, and version changes can replace this same entry.
      // Keep its shortlist ownership alongside the router's history metadata.
      window.history.replaceState(
        { ...historyState, [shortlistHistoryKey]: true },
        "",
      );
    }
  }, [inspectorOpen, params]);

  useLayoutEffect(() => {
    if (inspectorOpen || !openedFromShortlist.current) return;
    const returnedWithBack = closingWithBack.current;
    openedFromShortlist.current = false;
    closingWithBack.current = false;
    closeRemovalReason();
    // Triage and filter changes have their own focus target. Restoring the
    // original opener here can focus a card that is about to disappear.
    if (!returnedWithBack) return;
    const restore = restoreShortlistFocus();
    return () => window.clearTimeout(restore);
  }, [inspectorOpen, closeRemovalReason, restoreShortlistFocus]);

  const updateFilters = (values: Record<string, string>) => {
    if (!canLeave()) return false;
    const next = new URLSearchParams(queryString);
    if (values.view) {
      next.delete("removed");
      next.delete("section");
      next.delete("status");
    }
    if (!Object.hasOwn(values, "offset")) next.delete("offset");
    next.delete("agent_offset");
    if (location) next.set("location", location);
    next.delete("destination");
    if (values.section) next.delete("removed");
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    next.delete("opportunity");
    next.delete("assessment_profile");
    next.delete("application");
    next.delete("panel");
    if (next.toString() !== routeQuery) replaceQuery(next, "filter");
    return true;
  };
  const clearFilters = () => {
    if (updateFilters({ q: "", location: "", status: "" }))
      searchInput.current?.focus({ preventScroll: true });
  };

  const scheduleTriageFocus = (
    adjacent: RankedJob | undefined,
    pressed: Element | null,
    jobId: string,
    fallbackToRemoved = true,
  ) => {
    triageFocus.current = {
      adjacentId: adjacent?.job.id || "",
      pressed,
      disappearingCard:
        cardButtons.current.get(jobId)?.closest(".discover-card") || null,
      fallbackToRemoved,
    };
  };
  const removeJob = async (job: Job) => {
    if (!canLeave()) return;
    const index = navigationRows.findIndex((row) => row.job.id === job.id);
    const eligible = (row: RankedJob) => row.job.id !== job.id;
    const adjacent =
      navigationRows.slice(index + 1).find(eligible) ||
      navigationRows.slice(0, index).reverse().find(eligible);
    const pressed = document.activeElement;
    if (
      !pressed?.closest(".discover-inspector") ||
      (selectedId === job.id && !adjacent)
    )
      scheduleTriageFocus(adjacent, pressed, job.id);
    let task: Promise<boolean> = Promise.resolve(false);
    startTransition(() => {
      if (selectedId === job.id) {
        setSelectedId(adjacent?.job.id || "", true);
      }
      task = removal.remove(job);
    });
    await task;
  };
  const restoreJob = async (job: Job) => {
    if (!canLeave()) return;
    const index = navigationRows.findIndex((row) => row.job.id === job.id);
    const adjacent = navigationRows[index + 1] || navigationRows[index - 1];
    const pressed = document.activeElement;
    if (removedView && (!pressed?.closest(".discover-inspector") || !adjacent))
      scheduleTriageFocus(adjacent, pressed, job.id);
    startTransition(() => {
      if (removedView && selectedId === job.id) {
        setSelectedId(adjacent?.job.id || "", true);
      }
      void removal.restore(job);
    });
  };
  const addRemovalReason = (job: Job, event: JobRemoval) => {
    removal.addReason(job, event);
    if (!inspectorOpen)
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLTextAreaElement>(
            ".discover-removal-inline .removal-reason-editor textarea",
          )
          ?.focus();
      });
  };
  const feedbackProps = {
    onUndo: () => {
      const item = removal.feedback;
      const job = item && latestJobs.get(item.job.id);
      const event = job?.removals?.find(
        (event) => event.id === item?.removalId,
      );
      if (job && event) void removal.restore(job, event);
    },
    onAddReason: () => {
      const item = removal.feedback;
      const job = item && latestJobs.get(item.job.id);
      const event = job?.removals?.find(
        (event) => event.id === item?.removalId,
      );
      if (job && event) addRemovalReason(job, event);
    },
    onRetryRemoval: () => {
      void removal.retry();
    },
    onDismiss: removal.dismiss,
    onNoticeInteractionChange: removal.setFeedbackHeld,
    onChangeReason: removal.changeReason,
    onSaveReason: () => {
      void removal.saveReason();
    },
    onCloseReason: removal.closeReason,
  };
  const removalNotice = (
    <RemovalFeedback {...feedbackProps} feedback={removal.feedback} />
  );
  const removalEditor = (
    <RemovalFeedback {...feedbackProps} editor={removal.editor} />
  );

  const saveJob = async (
    id: string,
    saved: boolean,
    button?: HTMLButtonElement,
  ) => {
    const leavesView = !applicationView && saved !== toApplyView;
    if (
      saving.current.has(id) ||
      (leavesView &&
        toApplyView &&
        selectedId === id &&
        !requestedApplication &&
        !canLeave())
    )
      return;
    saving.current.add(id);
    if (leavesView && (!saved || button?.closest(".discover-card"))) {
      const index = navigationRows.findIndex((row) => row.job.id === id);
      if (index >= 0)
        scheduleTriageFocus(
          navigationRows[index + 1] || navigationRows[index - 1],
          button || null,
          id,
          false,
        );
    }
    setSaveError("");
    setSavedOverrides((previous) => ({ ...previous, [id]: saved }));
    setSavingIds((previous) => [...previous, id]);
    try {
      await run(
        "save-job",
        { id, saved },
        saved ? "Role added to To apply." : "Role removed from To apply.",
      );
      if (!saved)
        setAgentSelection((ids) => ids.filter((jobId) => jobId !== id));
      const icon = button?.querySelector("svg");
      if (
        motionAllowed.current &&
        button?.dataset.opportunityId === id &&
        icon?.isConnected &&
        typeof icon.animate === "function"
      ) {
        const animation = icon.animate(
          saved
            ? [
                { transform: "scale(1) rotate(0deg)" },
                { transform: "scale(.76) rotate(-14deg)", offset: 0.22 },
                { transform: "scale(1.18) rotate(6deg)", offset: 0.6 },
                { transform: "scale(1) rotate(0deg)" },
              ]
            : [
                { transform: "translateY(0) scale(1)", opacity: 1 },
                {
                  transform: "translateY(-3px) scale(.84)",
                  opacity: 0.55,
                  offset: 0.35,
                },
                { transform: "translateY(0) scale(1)", opacity: 1 },
              ],
          { duration: saved ? 360 : 240, easing: "cubic-bezier(.16,1,.3,1)" },
        );
        bookmarkAnimations.current.add(animation);
        void animation.finished
          .catch(() => {})
          .finally(() => bookmarkAnimations.current.delete(animation));
      }
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      saving.current.delete(id);
      setSavedOverrides((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setSavingIds((previous) => previous.filter((value) => value !== id));
    }
  };

  const moveSelection = (index: number) => {
    const row = navigationRows[index];
    if (!row) return;
    if (setSelectedId(row.job.id)) {
      opener.current = cardButtons.current.get(row.job.id) || null;
      setMotionRevision((value) => value + 1);
    }
  };

  const desktopInspector = inspectorOpen && !mobile;
  return (
    <div
      ref={discoverScreen}
      className={`discover-screen${desktopInspector ? " has-desktop-inspector" : ""}${desktopInspector && expandedApplication ? " has-workbench" : ""}`}
      data-interaction-motion={animateInteractions ? "on" : "off"}
    >
      <div className="discover-results">
        <div className="discover-controls">
          <form
            className="discover-local-search"
            id="discover-search-form"
            action="/discover/"
            method="get"
            role="search"
            aria-label="Filter opportunities"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilters({ q: query });
            }}
          >
            <Search size={18} aria-hidden="true" />
            <label className="visually-hidden" htmlFor="discover-role-search">
              Filter roles
            </label>
            <input
              ref={searchInput}
              id="discover-role-search"
              name="q"
              type="search"
              value={query}
              onChange={(event) => updateFilters({ q: event.target.value })}
              placeholder={
                applicationView
                  ? "Search this queue"
                  : "Title, company or skill"
              }
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={(event) => {
                  updateFilters({ q: "" });
                  event.currentTarget.form
                    ?.querySelector("input")
                    ?.focus({ preventScroll: true });
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
            <input type="hidden" name="view" value={view} />
            {location && (
              <input type="hidden" name="location" value={location} />
            )}
            {statusFilter && (
              <input type="hidden" name="status" value={statusFilter} />
            )}
          </form>
          <div className="discover-toolbar">
            <div
              className="discover-views"
              role="group"
              aria-label="Opportunity views"
            >
              {(
                [
                  ["jobs", "Jobs"],
                  ["to-apply", "To apply"],
                  ["applications", "Applications"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => updateFilters({ view: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            {!applicationView && !removedView && (
              <Action
                className="discover-refresh"
                previewAllowed
                disabled={loading}
                run={async () => setAttempt((value) => value + 1)}
              >
                <RefreshCw size={15} />
                Refresh matches
              </Action>
            )}
            <details className="discover-filters">
              <summary>
                <SlidersHorizontal size={16} />
                Filters
              </summary>
              <div className="discover-filter-panel">
                {!applicationView && (
                  <Select
                    label="Opportunity state"
                    value={removedView ? "removed" : "available"}
                    options={[
                      ["available", "Available roles"],
                      ["removed", "Removed roles"],
                    ]}
                    onChange={(event) =>
                      updateFilters({
                        view:
                          event.target.value === "removed"
                            ? "applications"
                            : "jobs",
                        section:
                          event.target.value === "removed" ? "removed" : "",
                      })
                    }
                  />
                )}
                {!applicationView && profile && (
                  <Select
                    label="Profile"
                    aria-label="Search profile"
                    value={profileId}
                    options={state.profiles.map((item) => [item.id, item.name])}
                    onChange={(event) => {
                      if (setSelectedId("")) selectProfile(event.target.value);
                    }}
                  />
                )}
                <Select
                  label="Location"
                  value={location}
                  options={[
                    ["", "All locations"],
                    ...locations.map((city) => [city, city] as const),
                  ]}
                  onChange={(event) =>
                    updateFilters({ location: event.target.value })
                  }
                />
                {(!applicationView || section !== "submitted") && (
                  <Select
                    label="Application status"
                    value={statusFilter}
                    options={[
                      ["", "Any status"],
                      ["new", "New"],
                      ["draft", "Draft"],
                      ["reviewed", "Reviewed"],
                      ["submitted", "Submitted"],
                    ]}
                    onChange={(event) => {
                      const status = event.target.value;
                      if (status === "submitted" && !removedView) {
                        const disclosure =
                          event.currentTarget.closest("details");
                        focusSubmittedStage.current = true;
                        const changed = updateFilters(
                          applicationView
                            ? { status, section: "submitted" }
                            : {
                                status,
                                view: "applications",
                                section: "submitted",
                              },
                        );
                        if (changed && disclosure) disclosure.open = false;
                        if (!changed) focusSubmittedStage.current = false;
                      } else {
                        updateFilters({ status });
                      }
                    }}
                  />
                )}
                <Link href="/search/">
                  Manage profiles and job sources <ArrowUpRight size={14} />
                </Link>
              </div>
            </details>
          </div>
        </div>
        {applicationView && (
          <div className="opportunities-application-filters">
            <div
              className="opportunities-stages"
              role="group"
              aria-label="Application stage"
            >
              {applicationStages.map(([value, label]) => (
                <button
                  key={value}
                  ref={value === "submitted" ? submittedStage : undefined}
                  type="button"
                  aria-pressed={section === value}
                  onClick={() =>
                    updateFilters({
                      section: value,
                      status: "",
                    })
                  }
                >
                  {label}{" "}
                  <span>
                    {value === "removed"
                      ? removedRows.length
                      : applicationJobs[value].size}
                  </span>
                </button>
              ))}
            </div>
            {!removedView && (
              <Check
                name="history"
                label="Include earlier review queues"
                checked={includeHistorical}
                onChange={(event) =>
                  updateFilters({ history: String(event.target.checked) })
                }
              />
            )}
          </div>
        )}
        {agentTools && (
          <AgentQueueTools
            key={workspacePath}
            jobs={chosenForAgent}
            applicationIds={agentApplications}
            pending={latestJobs}
            onNavigate={(id) => setSelectedId(id, false, !inspectorOpen)}
            onStartBusy={(busy) => {
              selectionInFlight.current = busy;
              setStartingAgent(busy);
            }}
          />
        )}
        {filters.has("application") && !requestedApplication && (
          <div className="discover-request-error" role="status">
            <p>
              This application is no longer available. Choose another saved
              application.
            </p>
            <button
              type="button"
              onClick={() => updateFilters({ view: "applications" })}
            >
              View applications
            </button>
          </div>
        )}
        <div className="discover-summary">
          <span className="discover-result-count" role="status">
            {loading
              ? "Loading matches…"
              : error && !rows.length
                ? "Matches unavailable"
                : `${removedView ? "Removed · " : ""}${visible.length} ${visible.length === 1 ? "role" : "roles"} · ${groups.length} ${groups.length === 1 ? "company" : "companies"}`}
          </span>
          {hasActiveFilters && visible.length > 0 && (
            <button
              type="button"
              className="discover-removed-filter"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
          {(!applicationView || removedView) && (
            <button
              type="button"
              className="discover-removed-filter"
              aria-pressed={removedView}
              onClick={() =>
                updateFilters(
                  removedView
                    ? { view: "jobs" }
                    : { view: "applications", section: "removed" },
                )
              }
            >
              {removedView
                ? "Show available roles"
                : `Removed (${removedRows.length})`}
            </button>
          )}
        </div>
        {(!inspectorOpen || !mobile) &&
          (removal.feedback || (!inspectorOpen && removal.editor)) && (
            <div className="discover-removal-inline">
              <RemovalFeedback
                {...feedbackProps}
                feedback={removal.feedback}
                editor={inspectorOpen ? undefined : removal.editor}
              />
            </div>
          )}
        {locations.length > 4 ? (
          <div className="discover-location-select">
            <Select
              label="Filter by city"
              value={location}
              options={[
                ["", "All locations"],
                ...locations.map((city) => [city, city] as const),
              ]}
              onChange={(event) =>
                updateFilters({ location: event.target.value })
              }
            />
          </div>
        ) : (
          <div
            className="discover-location-tabs"
            role="group"
            aria-label="Filter roles by location"
          >
            <button
              type="button"
              aria-pressed={!location}
              onClick={() => updateFilters({ location: "" })}
            >
              All locations
            </button>
            {locations.map((city) => (
              <button
                key={city}
                type="button"
                aria-pressed={location === city}
                onClick={() => updateFilters({ location: city })}
              >
                {city}
              </button>
            ))}
          </div>
        )}
        {error && (
          <div className="discover-request-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  await refresh();
                  setAttempt((value) => value + 1);
                } catch {
                  // The provider exposes the failed state refresh; keep this assessment available to retry.
                } finally {
                  setRetrying(false);
                }
              }}
            >
              {retrying ? "Retrying…" : "Retry assessment"}
            </button>
          </div>
        )}
        {saveError && (
          <div
            ref={saveErrorNotice}
            className="discover-request-error"
            role="alert"
            tabIndex={-1}
          >
            <p>{saveError}</p>
            <p>
              Your previous To apply choice is shown. Retry the action or
              refresh.
            </p>
          </div>
        )}
        {loading && !rows.length && !inspectorOpen && (
          <div className="discover-skeleton-board" aria-hidden="true">
            {[0, 1, 2].map((group) => (
              <div className="discover-skeleton-group" key={group}>
                <span className="discover-skeleton-line discover-skeleton-heading" />
                {[0, 1].map((card) => (
                  <div className="discover-skeleton-card" key={card}>
                    <span className="discover-skeleton-line discover-skeleton-badge" />
                    <span className="discover-skeleton-line discover-skeleton-title" />
                    <span className="discover-skeleton-line" />
                    <span className="discover-skeleton-line discover-skeleton-short" />
                    <span className="discover-skeleton-line discover-skeleton-short" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {!loading && !visible.length && !inspectorOpen && (
          <div className="discover-empty">
            <Search size={27} aria-hidden="true" />
            <h2>
              {hasActiveFilters && scopedRows.length
                ? applicationView
                  ? "No applications match these filters"
                  : "No roles match these filters"
                : removedView
                  ? "No removed roles here"
                  : toApplyView
                    ? "No roles to apply for yet"
                    : applicationView
                      ? `No ${section} applications`
                      : pausedResults
                        ? "Companies are paused"
                        : !state.jobs.length
                          ? "Add your first opportunity"
                          : "No roles in Jobs"}
            </h2>
            <p>
              {hasActiveFilters && scopedRows.length
                ? "Clear the search and filters to see everything in this view."
                : removedView
                  ? "Restore roles here to recover their application documents and activity."
                  : toApplyView
                    ? "Choose Apply later on a role to find it here."
                    : applicationView
                      ? "Prepare a draft from a role to start an application."
                      : pausedResults
                        ? "Roles in To apply and application history are available during the cooldown."
                        : !state.jobs.length
                          ? "Import a job URL, paste an advert or refresh a configured source in Search preferences."
                          : "Import more roles or review the ones you plan to apply for."}
            </p>
            {hasActiveFilters && scopedRows.length ? (
              <button
                type="button"
                className="discover-primary"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : applicationView || toApplyView ? (
              <button
                type="button"
                className="discover-primary"
                onClick={() => updateFilters({ view: "jobs" })}
              >
                View Jobs
              </button>
            ) : pausedResults ? (
              <button
                type="button"
                onClick={() => updateFilters({ view: "to-apply" })}
              >
                View To apply
              </button>
            ) : (
              <Link
                className="button discover-primary"
                href="/search/#add-opportunity"
              >
                Add opportunities
              </Link>
            )}
          </div>
        )}
        {(showBoard || inspectorOpen) && (
          <div
            className={`discover-layout${desktopInspector ? " has-inspector" : ""}`}
          >
            <div
              ref={board}
              className="discover-board"
              role="region"
              aria-label="Opportunities by company"
              tabIndex={selected && !mobile ? 0 : undefined}
            >
              {groups.map(({ id, name, roles: opportunities }) => (
                <section
                  className="discover-column"
                  key={id}
                  aria-label={`${name} opportunities`}
                >
                  <header>
                    <h2>
                      <Building2 size={17} aria-hidden="true" />
                      {name}
                    </h2>
                    <span>{opportunities.length}</span>
                  </header>
                  {opportunities.map((row) => {
                    const { job, match } = row;
                    const status = roleStatus(
                      job,
                      applications.get(job.id),
                      client.preview,
                    );
                    const salary = advertisedSalary(job, {
                      compact: true,
                      missing: "",
                    });
                    const location = job.location || job.city;
                    const metadata = [location, job.work_arrangement]
                      .filter(Boolean)
                      .join(" · ");
                    const evidence = !applicationView
                      ? requirementEvidence(match.evidence, state.facts, job)
                      : [];
                    const gaps = remainingEvidenceGaps(
                      match.gaps,
                      evidence,
                    ).length;
                    const caution =
                      match.hard_conflicts[0] ||
                      match.unknowns[0] ||
                      (gaps
                        ? `${gaps} evidence ${gaps === 1 ? "gap" : "gaps"}`
                        : "");
                    const related = evidence.filter(
                      ({ facts, careerFacts, confirmedForJob }) =>
                        facts.length || careerFacts.length || confirmedForJob,
                    ).length;
                    return (
                      <article
                        className={`discover-card ${selectedId === job.id ? "is-selected" : ""}`}
                        data-job-id={job.id}
                        key={job.id}
                      >
                        <div className="discover-card-top">
                          <span className={`discover-status ${status.tone}`}>
                            {status.label}
                          </span>
                          <div className="discover-card-tools">
                            {agentTools && (
                              <label className="discover-agent-selection">
                                <input
                                  type="checkbox"
                                  checked={agentSelection.includes(job.id)}
                                  aria-label={`Select ${job.title} at ${job.employer}`}
                                  disabled={
                                    startingAgent ||
                                    (chosenForAgent.length >= 100 &&
                                      !agentSelection.includes(job.id))
                                  }
                                  onChange={(event) => {
                                    if (selectionInFlight.current) return;
                                    const checked = event.currentTarget.checked;
                                    setAgentSelection((current) =>
                                      checked
                                        ? [...new Set([...current, job.id])]
                                        : current.filter((id) => id !== job.id),
                                    );
                                  }}
                                />
                                Select
                              </label>
                            )}
                            {currentRemoval(job) ? (
                              <>
                                <button
                                  type="button"
                                  className="discover-icon-button"
                                  aria-label={`Add removal reason for ${job.title}`}
                                  title="Add removal reason"
                                  onClick={() =>
                                    addRemovalReason(job, currentRemoval(job)!)
                                  }
                                >
                                  <MessageSquare size={16} />
                                </button>
                                <Action
                                  previewAllowed
                                  keepContentWhileBusy
                                  className="discover-icon-button"
                                  aria-label={`Restore ${job.title}`}
                                  title="Restore role"
                                  run={async () => restoreJob(job)}
                                >
                                  <RotateCcw size={16} />
                                </Action>
                              </>
                            ) : (
                              <Action
                                previewAllowed
                                keepContentWhileBusy
                                className="discover-icon-button"
                                aria-label={`Remove ${job.title}`}
                                title="Remove role"
                                run={async () => removeJob(job)}
                              >
                                <CircleMinus size={16} />
                              </Action>
                            )}
                            {pendingRole(job) && (
                              <Action
                                previewAllowed
                                keepContentWhileBusy
                                data-opportunity-id={job.id}
                                className={`discover-icon-button ${job.saved ? "is-saved" : ""}`}
                                disabled={savingIds.includes(job.id)}
                                aria-label={`${pendingActionLabel(job.saved)} · ${job.title}`}
                                title={pendingActionLabel(job.saved)}
                                aria-pressed={Boolean(job.saved)}
                                run={async (button) =>
                                  saveJob(job.id, !job.saved, button)
                                }
                              >
                                <Bookmark
                                  size={16}
                                  fill={job.saved ? "currentColor" : "none"}
                                />
                              </Action>
                            )}
                          </div>
                        </div>
                        <button
                          ref={(element) => {
                            if (element) {
                              cardButtons.current.set(job.id, element);
                              if (selectedId === job.id)
                                opener.current = element;
                            } else {
                              cardButtons.current.delete(job.id);
                            }
                          }}
                          type="button"
                          className="discover-card-open"
                          aria-label={`Assess ${job.title} at ${job.employer}`}
                          aria-pressed={selectedId === job.id}
                          onClick={(event) => {
                            if (setSelectedId(job.id, false, !inspectorOpen)) {
                              opener.current = event.currentTarget;
                              setMotionRevision((value) => value + 1);
                            }
                          }}
                        >
                          <h3>{job.title}</h3>
                        </button>
                        {metadata && (
                          <p className="discover-card-location">{metadata}</p>
                        )}
                        {client.preview && (
                          <OpportunityListingLink
                            url={job.url}
                            className="discover-card-listing"
                            label={`View listing for ${job.title} at ${job.employer}`}
                          >
                            View listing
                          </OpportunityListingLink>
                        )}
                        {salary && (
                          <p
                            className="discover-card-salary"
                            title={advertisedSalary(job)}
                          >
                            {salary}
                          </p>
                        )}
                        {!applicationView && (related > 0 || caution) && (
                          <div className="discover-card-fit">
                            {related > 0 && (
                              <p>
                                Related evidence for {related}{" "}
                                {related === 1 ? "requirement" : "requirements"}
                              </p>
                            )}
                            {caution && (
                              <p className="discover-card-check">
                                <ShieldAlert size={14} aria-hidden="true" />
                                <span>{caution}</span>
                              </p>
                            )}
                          </div>
                        )}
                        {removedView && currentRemoval(job)?.reason && (
                          <p
                            className="discover-removal-reason"
                            title={currentRemoval(job)?.reason}
                          >
                            Reason: {currentRemoval(job)?.reason}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>
        )}
        {agentTools && filteredRows.length > pendingPageSize && (
          <div
            className="actions agent-queue-pagination"
            role="group"
            aria-label="To apply pages"
          >
            <button
              type="button"
              className="secondary"
              disabled={!pendingOffset}
              onClick={() =>
                updateFilters({
                  offset: String(pendingOffset - pendingPageSize),
                })
              }
            >
              Previous page
            </button>
            <span>
              {pendingOffset + 1}–{pendingOffset + visible.length} of{" "}
              {filteredRows.length}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={pendingOffset + visible.length >= filteredRows.length}
              onClick={() =>
                updateFilters({
                  offset: String(pendingOffset + pendingPageSize),
                })
              }
            >
              Next page
            </button>
          </div>
        )}
        {applicationView &&
          section === "submitted" &&
          Boolean(state.historical_decisions?.length) && (
            <section className="opportunities-historical">
              <h2>Earlier submission records</h2>
              <p>
                These records do not confirm which document bytes were
                submitted.
              </p>
              {state.historical_decisions?.map((record, index) => (
                <p key={index}>
                  {record.employer} · {record.status}
                </p>
              ))}
            </section>
          )}
      </div>
      {selected && (
        <OpportunityInspector
          animateInteractions={animateInteractions}
          motionRevision={motionRevision}
          row={selected}
          application={selectedApplication}
          panel={panel}
          onOpenPanel={openPanel}
          agentProgress={
            localJourney &&
            hasListingRecord &&
            !state._workspace.demo && (
              <RoleAgentWork
                key={selected.job.id}
                job={selected.job}
                applicationId={selectedApplication?.id}
                canStart={
                  !submitted &&
                  !selected.job.company?.submitted_vacancy &&
                  !currentRemoval(selected.job) &&
                  Boolean(profileId)
                }
              />
            )
          }
          submissionRecord={
            submitted &&
            panel !== "files" && (
              <SubmissionRecord
                key={selected.job.id}
                job={selected.job}
                application={selectedApplication}
                active
                recent={submission}
              />
            )
          }
          applicationContent={
            selectedApplication && (
              <>
                {(panel === "activity" || panel === "files") && (
                  <ApplicationVersions
                    application={selectedApplication}
                    onSelect={(app) => openVersion(app, panel)}
                  />
                )}
                <OpportunityApplication
                  application={selectedApplication}
                  job={selected.job}
                  tab={panel}
                  nextAction={
                    localJourney &&
                    hasListingRecord &&
                    !state._workspace.demo &&
                    selectedDraft ? (
                      <CompanySubmission
                        key={selectedApplication.id}
                        app={selectedApplication}
                        job={selected.job}
                        visible={panel === "documents"}
                        canStart={
                          !submitted &&
                          !selected.job.company?.submitted_vacancy &&
                          !currentRemoval(selected.job)
                        }
                        onIntegrityIssue={() => openPanel("files")}
                        onRecord={recordSubmission}
                      />
                    ) : undefined
                  }
                />
              </>
            )
          }
          facts={state.facts}
          timezone={state._workspace.timezone}
          mobile={mobile}
          position={Math.max(0, selectedIndex)}
          count={selectedIndex < 0 ? 1 : visible.length}
          rankingCurrent={!loading && !error && assessmentAvailable}
          assessmentAvailable={assessmentAvailable}
          hasListingRecord={hasListingRecord}
          canChangePending={pendingRole(selected.job)}
          companyReview={
            hasListingRecord &&
            state._workspace.snapshot &&
            !client.preview &&
            !client.hosted ? (
              <CompanyReview job={selected.job} />
            ) : undefined
          }
          onAddEvidence={
            hasListingRecord && !client.preview
              ? async (requirement, details) => {
                  await run(
                    "requirement-evidence",
                    {
                      job_id: selected.job.id,
                      requirement,
                      ...(details ? { details } : { save_skill: true }),
                    },
                    details
                      ? "Career evidence saved."
                      : "Skill saved to career evidence.",
                  );
                }
              : undefined
          }
          saving={savingIds.includes(selected.job.id)}
          saveError={saveError}
          preview={client.preview}
          onClose={closeInspector}
          onPrevious={() => moveSelection(selectedIndex - 1)}
          onNext={() => moveSelection(selectedIndex + 1)}
          onSave={async (button) =>
            saveJob(selected.job.id, !selected.job.saved, button)
          }
          onPrepare={prepareApplication}
          onRemove={() => removeJob(selected.job)}
          onRestore={() => restoreJob(selected.job)}
          removalFeedback={mobile ? removalNotice : undefined}
          removalEditor={removalEditor}
          reasonEditorId={removal.editor?.removalId}
        />
      )}
    </div>
  );
}
