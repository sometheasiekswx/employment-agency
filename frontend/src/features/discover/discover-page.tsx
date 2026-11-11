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
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  CircleMinus,
  MessageSquare,
  RotateCcw,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useDraft } from "@/components/unsaved";
import { OpportunityWorkbench } from "./opportunity-workbench";
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
import type { Job, JobRemoval, RankedJob } from "@/lib/models";
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
  type DiscoveryView,
} from "./discovery";
import { OpportunityInspector } from "./opportunity-inspector";
import { OpportunityListingLink } from "./opportunity-source-preview";
import { useInteractionMotion } from "./interaction-motion";
import { cachedRanking, loadRanking } from "./rankings";
import "./discover.css";

interface RankingState {
  key: string;
  profileId: string;
  rows: RankedJob[];
  error: string;
}

const shortlistHistoryKey = "employmentAgencyShortlistInspector";

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

function useMobileInspector() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1000px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
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
  const params = useSearchParams();
  const { back, replace } = useRouter();
  const [routeQuery, setOptimisticQuery] = useOptimistic(params.toString());
  const filters = new URLSearchParams(routeQuery);
  const applications = useMemo(
    () => applicationsByJob(state.applications),
    [state.applications],
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
  const latestJobs = new Map(
    roleRecords.map((job) => [job.id, removal.jobWithRemoval(job)]),
  );
  const requestedApplication = state.applications.find(
    (app) => app.id === filters.get("application"),
  );
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
  const queryString = filters.toString();
  const legacySavedFilter =
    !removedView &&
    filters.get("view") !== "applications" &&
    rawStatus === "saved";
  const requestedView = legacySavedFilter ? "saved" : filters.get("view");
  const view: DiscoveryView = removedView
    ? "applications"
    : requestedView === "all" ||
        requestedView === "saved" ||
        requestedView === "applications"
      ? requestedView
      : "recommended";
  const applicationView = view === "applications";
  const section = removedView ? "removed" : filters.get("section") || "active";
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
  const panel =
    filters.get("panel") === "activity"
      ? "activity"
      : filters.get("panel") === "documents"
        ? "documents"
        : "overview";
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
    (filters.get("assessment_profile") === profileId
      ? filters.get("opportunity") || ""
      : "");
  const currentRoute = useRef({ queryString, profileId });
  const openedFromShortlist = useRef(false);
  const closingWithBack = useRef(false);
  useLayoutEffect(() => {
    currentRoute.current = { queryString, profileId };
  }, [queryString, profileId]);
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
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const closeRemovalReason = removal.closeReason;
  const [saveError, setSaveError] = useState("");
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
  const inspectorLayout = useRef<HTMLDivElement>(null);
  const mobile = useMobileInspector();
  const profile = state.profiles.find((item) => item.id === profileId);
  const priorities = profile?.locations.length
    ? profile.locations
    : state._workspace.preferred_locations;
  // Bookmark, removal and source link changes leave the current matching intact.
  const rankInput = JSON.stringify({
    profile,
    facts: state.facts,
    jobs: state.jobs.map((job) => ({
      ...job,
      saved: undefined,
      removals: undefined,
      careers_url: undefined,
      matched_skill_evidence: undefined,
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
    !applicationView &&
    !removedView &&
    Boolean(profile) &&
    currentRanking.key !== requestKey;

  useEffect(() => {
    if (!profileId || applicationView || removedView) return;
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
    removedView,
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
              saved: savedOverrides[row.job.id] ?? latest.saved ?? false,
            },
          },
        ]
      : [];
  });
  const applicationJobs = {
    active: new Map<string, Job>(),
    submitted: new Map<string, Job>(),
  };
  for (const [id, app] of applications) {
    if (app.archived && !includeHistorical) continue;
    const job = latestJobs.get(id)!;
    const stage = applicationSection(app, job);
    if (stage !== "removed") applicationJobs[stage].set(id, job);
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
  const sourceRows = removedView
    ? removedRows
    : applicationView
      ? applicationRows
      : rows.filter(
          ({ job }) =>
            !currentRemoval(job) &&
            !hasRecordedSubmission(applications.get(job.id), job),
        );
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
  const visible = filterOpportunities(
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
    return statusFilter === "submitted"
      ? hasRecordedSubmission(app, job)
      : roleStatus(job, app).label.toLowerCase() === statusFilter;
  });
  const groups = groupOpportunities(visible, priorities);
  const navigationRows = groups.flatMap(([, rows]) => rows);
  const selectedRow = visible.find((row) => row.job.id === selectedId);
  const assessedRow = rows.find((row) => row.job.id === selectedId);
  const keepSavedDetails =
    !applicationView &&
    view !== "saved" &&
    assessedRow?.job.saved &&
    !currentRemoval(assessedRow.job);
  const selected =
    selectedRow ||
    requestedApplication ||
    removal.feedback?.job.id === selectedId ||
    keepSavedDetails
      ? assessedRow || selectedRow
      : undefined;
  const assessmentAvailable = Boolean(assessedRow);
  const hasListingRecord = Boolean(
    selected && state.jobs.some((job) => job.id === selected.job.id),
  );
  const selectedApplication =
    requestedApplication ||
    (selected ? applications.get(selected.job.id) : undefined);
  const expandedApplication = Boolean(
    selectedApplication && panel !== "overview",
  );
  const openPanel = (value: "overview" | "documents" | "activity") => {
    const next = new URLSearchParams(queryString);
    next.set("panel", value);
    if (selectedApplication) next.set("application", selectedApplication.id);
    replaceQuery(next);
  };
  const inspectorOpen = Boolean(selected) || Boolean(requestedApplication);
  const selectedIndex = navigationRows.findIndex(
    (row) => row.job.id === selectedId,
  );
  const error =
    !applicationView && !removedView && currentRanking.key === requestKey
      ? currentRanking.error
      : "";
  const boardGroups = JSON.stringify(
    groups.map(([city, opportunities]) => [
      city,
      opportunities.map(({ job }) => job.id),
    ]),
  );
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
      // stay in source order; shorter city groups release space for later ones.
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
    const layout = inspectorLayout.current;
    if (!layout || !inspectorOpen || mobile) return;
    let frame = 0;
    const measure = () => {
      const top = Math.max(0, layout.getBoundingClientRect().top);
      const height = `${Math.max(0, Math.floor(window.innerHeight - top - 16))}px`;
      if (
        layout.style.getPropertyValue("--discover-available-height") !== height
      )
        layout.style.setProperty("--discover-available-height", height);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(schedule);
    // Content before this board can change height independently: public notice,
    // profile context, validation messages and the responsive workspace header.
    let branch: Element = layout;
    while (branch.parentElement && branch.parentElement !== document.body) {
      observer?.observe(branch.parentElement);
      let previous = branch.previousElementSibling;
      while (previous) {
        observer?.observe(previous);
        previous = previous.previousElementSibling;
      }
      branch = branch.parentElement;
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      layout.style.removeProperty("--discover-available-height");
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
    if (legacySavedFilter) {
      next.set("view", "saved");
      next.delete("status");
    }
    if (values.view) {
      next.delete("removed");
      next.delete("section");
      next.delete("status");
    }
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
    if (next.toString() !== queryString) replaceQuery(next, "filter");
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
    const leavesView = !applicationView && saved !== (view === "saved");
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
        saved ? "Role saved." : "Role removed from Saved.",
      );
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

  return (
    <div
      className="discover-screen"
      data-interaction-motion={animateInteractions ? "on" : "off"}
    >
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
              applicationView ? "Search this queue" : "Title, company or skill"
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
          {location && <input type="hidden" name="location" value={location} />}
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
                ["recommended", "Recommended"],
                ["all", "Browse"],
                ["saved", "Saved"],
                ["applications", "Applications"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => updateFilters({ view: value })}
              >
                {value === "recommended" && <Sparkles size={16} />}
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
                          : "all",
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
                      const disclosure = event.currentTarget.closest("details");
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
            {(
              [
                ["active", "Active"],
                ["submitted", "Submitted"],
                ["removed", "Removed"],
              ] as const
            ).map(([value, label]) => (
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
              : `${removedView ? "Removed · " : ""}${visible.length} ${visible.length === 1 ? "role" : "roles"} · ${groups.length} ${groups.length === 1 ? "location" : "locations"}`}
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
                  ? { view: "all" }
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
      {view === "all" && (
        <p className="discover-browse-scope">
          Saved roles and submitted applications have their own views.
        </p>
      )}
      {!inspectorOpen && (removal.feedback || removal.editor) && (
        <div className="discover-removal-inline">
          <RemovalFeedback
            {...feedbackProps}
            feedback={removal.feedback}
            editor={removal.editor}
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
            The change could not be confirmed. Your previous saved state is
            shown; retry the role’s save control or refresh.
          </p>
        </div>
      )}
      {loading && !rows.length && (
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
      {!loading && !error && !visible.length && !inspectorOpen && (
        <div className="discover-empty">
          <Search size={27} />
          <h2>
            {hasActiveFilters && scopedRows.length
              ? applicationView
                ? "No applications match these filters"
                : "No roles match these filters"
              : removedView
                ? "No removed roles here"
                : applicationView
                  ? `No ${section} applications`
                  : !rows.length
                    ? "Add your first opportunity"
                    : view === "saved"
                      ? "No saved roles here yet"
                      : "No roles match these filters"}
          </h2>
          <p>
            {hasActiveFilters && scopedRows.length
              ? "Clear the search and filters to see everything in this view."
              : removedView
                ? "Removed roles and their application documents and activity stay recoverable here."
                : applicationView
                  ? "Prepare a draft from a role to start an application. Your recorded submissions and decisions stay available in the other stage views."
                  : !rows.length
                    ? "Import a job URL, paste an advert or refresh a configured source in Search preferences."
                    : "Adjust your filters or choose All results to inspect the full assessment."}
          </p>
          {hasActiveFilters && scopedRows.length ? (
            <button
              type="button"
              className="discover-primary"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : !profile && !applicationView ? (
            <Link className="button discover-primary" href="/search/">
              Create a search profile
            </Link>
          ) : applicationView ? (
            <button
              type="button"
              className="discover-primary"
              onClick={() => updateFilters({ view: "recommended" })}
            >
              Find an opportunity
            </button>
          ) : !rows.length ? (
            <Link
              className="button discover-primary"
              href="/search/#add-opportunity"
            >
              Add opportunities
            </Link>
          ) : (
            <button
              type="button"
              onClick={() =>
                updateFilters({ q: "", location: "", status: "", view: "all" })
              }
            >
              Show all results
            </button>
          )}
        </div>
      )}
      {(visible.length > 0 || inspectorOpen) && (
        <div
          ref={inspectorLayout}
          className={`discover-layout ${inspectorOpen && !mobile ? "has-inspector" : ""} ${expandedApplication ? "has-workbench" : ""}`}
        >
          <div
            ref={board}
            className="discover-board"
            role="region"
            aria-label="Opportunities by location"
            tabIndex={selected && !mobile ? 0 : undefined}
          >
            {groups.map(([city, opportunities]) => (
              <section
                className="discover-column"
                key={city}
                aria-label={`${city} opportunities`}
              >
                <header>
                  <h2>
                    <MapPin size={17} />
                    {city}
                  </h2>
                  <span>{opportunities.length}</span>
                </header>
                {opportunities.map((row) => {
                  const { job, match } = row;
                  const status = roleStatus(job, applications.get(job.id));
                  const salary = advertisedSalary(job, {
                    compact: true,
                    missing: "",
                  });
                  const location = job.location || job.city;
                  const metadata = [
                    location && location !== city ? location : "",
                    job.work_arrangement,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const evidence =
                    view === "recommended"
                      ? requirementEvidence(match.evidence, state.facts, job)
                      : [];
                  const gaps = remainingEvidenceGaps(
                    match.gaps,
                    evidence,
                  ).length;
                  const caution =
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
                      key={job.id}
                    >
                      <div className="discover-card-top">
                        <span className={`discover-status ${status.tone}`}>
                          {status.label}
                        </span>
                        <div className="discover-card-tools">
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
                          {state.jobs.some((item) => item.id === job.id) && (
                            <Action
                              previewAllowed
                              keepContentWhileBusy
                              data-opportunity-id={job.id}
                              className={`discover-icon-button ${job.saved ? "is-saved" : ""}`}
                              disabled={savingIds.includes(job.id)}
                              aria-label={`${job.saved ? "Unsave" : "Save"} ${job.title}`}
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
                            if (selectedId === job.id) opener.current = element;
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
                      <p className="discover-card-company">
                        <span
                          className="discover-employer-mark"
                          aria-hidden="true"
                        >
                          {job.employer.slice(0, 1)}
                        </span>
                        {job.employer}
                      </p>
                      {metadata && (
                        <p className="discover-card-location">{metadata}</p>
                      )}
                      {client.preview && (
                        <OpportunityListingLink
                          job={job}
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
                      {view === "recommended" && (related > 0 || caution) && (
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
          {selected && !expandedApplication && (
            <OpportunityInspector
              animateInteractions={animateInteractions}
              motionRevision={motionRevision}
              row={selected}
              application={selectedApplication}
              onOpenPanel={openPanel}
              facts={state.facts}
              timezone={state._workspace.timezone}
              mobile={mobile}
              position={Math.max(0, selectedIndex)}
              count={selectedIndex < 0 ? 1 : visible.length}
              rankingCurrent={!loading && !error}
              assessmentAvailable={assessmentAvailable}
              hasListingRecord={hasListingRecord}
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
              onPrepare={async () => {
                await run(
                  "local-package",
                  { profile_id: profileId, job_id: selected.job.id },
                  "A new draft is ready for document review.",
                );
              }}
              onRemove={() => removeJob(selected.job)}
              onRestore={() => restoreJob(selected.job)}
              removalFeedback={removalNotice}
              removalEditor={removalEditor}
              reasonEditorId={removal.editor?.removalId}
            />
          )}
          {selectedApplication && (
            <OpportunityWorkbench
              removalFeedback={
                <>
                  {removalNotice}
                  {removalEditor}
                </>
              }
              application={selectedApplication}
              job={
                latestJobs.get(applicationRoleId(selectedApplication)) || {
                  title: selectedApplication.title,
                  employer: selectedApplication.employer,
                }
              }
              panel={panel}
              overviewAvailable={Boolean(selected)}
              mobile={mobile}
              onPanel={openPanel}
              onRemove={() =>
                removeJob(
                  latestJobs.get(applicationRoleId(selectedApplication))!,
                )
              }
              onRestore={() =>
                restoreJob(
                  latestJobs.get(applicationRoleId(selectedApplication))!,
                )
              }
              onVersion={(application) => {
                if (!canLeave()) return;
                const next = new URLSearchParams(queryString);
                next.set("application", application.id);
                next.set("panel", panel);
                if (applicationView)
                  next.set(
                    "section",
                    applicationSection(
                      application,
                      latestJobs.get(applicationRoleId(application)),
                    ),
                  );
                replaceQuery(next);
              }}
              onClose={closeInspector}
            />
          )}
        </div>
      )}
      {applicationView &&
        section === "submitted" &&
        Boolean(state.historical_decisions?.length) && (
          <section className="opportunities-historical">
            <h2>Earlier submission records</h2>
            <p>
              These records do not confirm which document bytes were submitted.
            </p>
            {state.historical_decisions?.map((record, index) => (
              <p key={index}>
                {record.employer} · {record.status}
              </p>
            ))}
          </section>
        )}
    </div>
  );
}
