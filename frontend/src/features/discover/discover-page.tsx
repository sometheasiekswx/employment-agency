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
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useDraft } from "@/components/unsaved";
import { applicationQueues } from "@/features/applications/queues";
import { OpportunityWorkbench } from "./opportunity-workbench";
import { Action, Check, Select } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import {
  applicationRoleId,
  applicationSection,
  compareDestinations,
  destination,
  errorMessage,
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
  roleStatus,
  type DiscoveryView,
} from "./discovery";
import { OpportunityInspector } from "./opportunity-inspector";
import { useInteractionMotion } from "./interaction-motion";
import { cachedRanking, loadRanking } from "./rankings";
import "./discover.css";

interface RankingState {
  key: string;
  profileId: string;
  rows: RankedJob[];
  error: string;
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
  const { canLeave } = useDraft();
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
  const { replace } = useRouter();
  const [queryString, setOptimisticQuery] = useOptimistic(params.toString());
  const filters = new URLSearchParams(queryString);
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
  const query = filters.get("q") || "";
  const location = filters.get("location") || "";
  const rawStatus = filters.get("status") || "";
  const statusFilter = rawStatus === "rejected" ? "" : rawStatus;
  const rawView = filters.get("view");
  const rawSection = filters.get("section");
  const removedView =
    filters.get("removed") === "true" ||
    rawStatus === "rejected" ||
    (rawView === "applications" &&
      (rawSection === "removed" || rawSection === "rejected")) ||
    Boolean(currentRemoval(latestJobs.get(requestedRoleId)));
  const view: DiscoveryView = removedView
    ? "applications"
    : rawView === "all" || rawView === "saved" || rawView === "applications"
      ? rawView
      : "recommended";
  const applicationView = view === "applications";
  const section = removedView ? "removed" : rawSection || "active";
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
  useLayoutEffect(() => {
    currentRoute.current = { queryString, profileId };
  }, [queryString, profileId]);
  const replaceQuery = useCallback(
    (next: URLSearchParams, localSearch = false) => {
      startTransition(() => {
        setOptimisticQuery(next.toString());
        const href = `/discover/${next.size ? `?${next}` : ""}`;
        // Next's native-history integration updates useSearchParams without a
        // router fetch for every character. Ranking inputs do not change.
        if (localSearch) window.history.replaceState(null, "", href);
        else replace(href, { scroll: false });
      });
    },
    [replace, setOptimisticQuery],
  );
  const setSelectedId = useCallback(
    (id: string, guardChecked = false) => {
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
      replaceQuery(next);
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
  const opener = useRef<HTMLButtonElement | null>(null);
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const triageFocus = useRef<{
    adjacentId: string;
    pressed: Element | null;
    disappearingCard: Element | null;
  } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const inspectorLayout = useRef<HTMLDivElement>(null);
  const mobile = useMobileInspector();
  const profile = state.profiles.find((item) => item.id === profileId);
  const priorities = profile?.locations.length
    ? profile.locations
    : state._workspace.preferred_locations;
  // Saving a role or refreshing application decisions must not reload the board.
  const rankInput = JSON.stringify({
    profile,
    facts: state.facts,
    jobs: state.jobs.map((job) => ({
      ...job,
      saved: undefined,
      removals: undefined,
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
              saved: savedOverrides[row.job.id] ?? latest.saved ?? false,
            },
          },
        ]
      : [];
  });
  const applicationRecords = applicationQueues(
    state.applications,
    includeHistorical,
  ).filter((app) => !currentRemoval(latestJobs.get(applicationRoleId(app))));
  const applicationRows: RankedJob[] = applicationRecords
    .filter((app) => section === "all" || applicationSection(app) === section)
    .map((app) => ({
      job: latestJobs.get(applicationRoleId(app))!,
      match: {
        eligible_for_preparation: false,
        hard_conflicts: [],
        unknowns: [],
        gaps: [],
        evidence: [],
        preferences: [],
        salary_expectation: {},
      },
    }));
  const removedRows: RankedJob[] = [...latestJobs.values()]
    .filter((job) => currentRemoval(job))
    .map(
      (job) =>
        rows.find((row) => row.job.id === job.id) || {
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
        },
    );
  const sourceRows = removedView
    ? removedRows
    : applicationView
      ? applicationRows
      : rows;
  const browsingRows = applicationView
    ? sourceRows
    : sourceRows.filter(
        ({ job }) => Boolean(currentRemoval(job)) === removedView,
      );
  const locations = [
    ...new Set(browsingRows.map(({ job }) => destination(job, priorities))),
  ].sort((a, b) => compareDestinations(a, b, priorities));
  const visible = filterOpportunities(
    sourceRows,
    {
      query,
      location:
        location || (applicationView ? filters.get("destination") || "" : ""),
      view,
      removed: removedView,
    },
    priorities,
  ).filter(
    ({ job }) =>
      !statusFilter ||
      roleStatus(job, applications.get(job.id)).label.toLowerCase() ===
        statusFilter,
  );
  const groups = groupOpportunities(visible, priorities);
  const navigationRows = groups.flatMap(([, rows]) => rows);
  const selectedRow = visible.find((row) => row.job.id === selectedId);
  const selected =
    selectedRow ||
    requestedApplication ||
    removal.feedback?.job.id === selectedId
      ? rows.find((row) => row.job.id === selectedId) || selectedRow
      : undefined;
  const assessmentAvailable = rows.some((row) => row.job.id === selectedId);
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
        document.querySelector<HTMLButtonElement>(".discover-removed-filter") ||
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

  const closeInspector = useCallback(() => {
    if (!setSelectedId("")) return false;
    closeRemovalReason();
    window.setTimeout(() => {
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
    return true;
  }, [setSelectedId, closeRemovalReason]);

  const updateFilters = (
    values: Record<string, string>,
    localSearch = false,
  ) => {
    if (!canLeave()) return;
    const next = new URLSearchParams(queryString);
    if (values.view) {
      next.delete("removed");
      next.delete("section");
      next.delete("location");
      next.delete("status");
      next.delete("destination");
      next.delete("q");
    }
    if (values.section) next.delete("removed");
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    next.delete("opportunity");
    next.delete("assessment_profile");
    next.delete("application");
    next.delete("panel");
    if (next.toString() !== queryString) replaceQuery(next, localSearch);
  };

  const scheduleTriageFocus = (
    adjacent: RankedJob | undefined,
    pressed: Element | null,
    jobId: string,
  ) => {
    triageFocus.current = {
      adjacentId: adjacent?.job.id || "",
      pressed,
      disappearingCard:
        cardButtons.current.get(jobId)?.closest(".discover-card") || null,
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
            updateFilters({ q: query }, true);
          }}
        >
          <Search size={18} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="discover-role-search">
            Filter roles
          </label>
          <input
            id="discover-role-search"
            name="q"
            type="search"
            value={query}
            onChange={(event) => updateFilters({ q: event.target.value }, true)}
            placeholder="Search role, employer or skill"
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
                updateFilters({ q: "" }, true);
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
                ["all", "All roles"],
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
              <Select
                label="Application status"
                value={statusFilter}
                options={[
                  ["", "Any status"],
                  ["new", "New"],
                  ["saved", "Saved"],
                  ["draft", "Draft"],
                  ["reviewed", "Reviewed"],
                  ["submitted", "Submitted"],
                ]}
                onChange={(event) =>
                  updateFilters({
                    status: event.target.value,
                    ...(event.target.value === "submitted" && !removedView
                      ? applicationView
                        ? { section: event.target.value }
                        : { view: "all" }
                      : {}),
                  })
                }
              />
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
            {[
              ["active", "Active"],
              ["submitted", "Submitted"],
              ["removed", "Removed"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={section === value}
                onClick={() =>
                  updateFilters({
                    section: value,
                    location: "",
                    destination: "",
                    status: "",
                  })
                }
              >
                {label}{" "}
                <span>
                  {value === "removed"
                    ? removedRows.length
                    : applicationRecords.filter(
                        (app) => applicationSection(app) === value,
                      ).length}
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
      {!inspectorOpen && (removal.feedback || removal.editor) && (
        <div className="discover-removal-inline">
          <RemovalFeedback
            {...feedbackProps}
            feedback={removal.feedback}
            editor={removal.editor}
          />
        </div>
      )}
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
      {!loading && !error && !visible.length && !requestedApplication && (
        <div className="discover-empty">
          <Search size={27} />
          <h2>
            {removedView
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
            {removedView
              ? "Removed roles and their application documents and activity stay recoverable here."
              : applicationView
                ? "Prepare a draft from a role to start an application. Your recorded submissions and decisions stay available in the other stage views."
                : !rows.length
                  ? "Import a job URL, paste an advert or refresh a configured source in Search preferences."
                  : "Adjust your filters or choose All results to inspect the full assessment."}
          </p>
          {!profile && !applicationView ? (
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
      {(visible.length > 0 || requestedApplication) && (
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
                  const { job } = row;
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
                          if (setSelectedId(job.id)) {
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
                      {salary && (
                        <p
                          className="discover-card-salary"
                          title={advertisedSalary(job)}
                        >
                          {salary}
                        </p>
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
