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
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Action, Select } from "@/components/controls";
import { useWorkspace } from "@/components/workspace-provider";
import {
  compareDestinations,
  destination,
  displayDate,
  errorMessage,
} from "@/lib/format";
import type { RankedJob } from "@/lib/models";
import {
  advertisedSalary,
  applicationsByJob,
  checkedDate,
  filterOpportunities,
  groupOpportunities,
  requirementEvidence,
  roleStatus,
  type DiscoveryView,
} from "./discovery";
import { OpportunityInspector } from "./opportunity-inspector";
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
  const { state, client, run, profileId, selectProfile } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [queryString, setOptimisticQuery] = useOptimistic(params.toString());
  const filters = new URLSearchParams(queryString);
  const query = filters.get("q") || "";
  const location = filters.get("location") || "";
  const statusFilter = filters.get("status") || "";
  const rawView = filters.get("view");
  const view: DiscoveryView =
    rawView === "all" || rawView === "saved" ? rawView : "recommended";
  const [attempt, setAttempt] = useState(0);
  const [ranking, setRanking] = useState<RankingState>({
    key: "",
    profileId: "",
    rows: [],
    error: "",
  });
  const [selection, setSelection] = useState({ id: "", profileId: "" });
  const selectedId = selection.profileId === profileId ? selection.id : "";
  const setSelectedId = (id: string) => setSelection({ id, profileId });
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const saveErrorNotice = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const inspectorLayout = useRef<HTMLDivElement>(null);
  const mobile = useMobileInspector();
  const profile = state.profiles.find((item) => item.id === profileId);
  const priorities = profile?.locations || state._workspace.preferred_locations;
  // Saving a role or refreshing application decisions must not reload the board.
  const rankInput = JSON.stringify({
    profile,
    facts: state.facts,
    jobs: state.jobs.map((job) => ({ ...job, saved: undefined })),
  });
  const requestKey = `${profileId}:${attempt}:${rankInput}`;
  const loading = Boolean(profile) && ranking.key !== requestKey;

  useEffect(() => {
    if (!profileId) return;
    let active = true;
    client.action<RankedJob[]>("rank", { profile_id: profileId }).then(
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
  }, [client, profileId, requestKey]);

  const applications = useMemo(
    () => applicationsByJob(state.applications),
    [state.applications],
  );
  const latestJobs = new Map(state.jobs.map((job) => [job.id, job]));
  const rows = (ranking.profileId === profileId ? ranking.rows : []).flatMap(
    (row) => {
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
    },
  );
  const locations = [
    ...new Set(rows.map(({ job }) => destination(job, priorities))),
  ].sort((a, b) => compareDestinations(a, b, priorities));
  const visible = filterOpportunities(
    rows,
    { query, location, view },
    priorities,
  ).filter(
    ({ job }) =>
      !statusFilter ||
      roleStatus(job, applications.get(job.id)).label.toLowerCase() ===
        statusFilter,
  );
  const groups = groupOpportunities(visible, priorities);
  const selected = visible.find((row) => row.job.id === selectedId);
  const inspectorOpen = Boolean(selected);
  const selectedIndex = visible.findIndex((row) => row.job.id === selectedId);
  const error = ranking.key === requestKey ? ranking.error : "";

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
    if (selectedId && !mobile)
      cardButtons.current
        .get(selectedId)
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedId, mobile]);

  useEffect(() => {
    if (saveError && (!inspectorOpen || !mobile))
      saveErrorNotice.current?.focus({ preventScroll: true });
  }, [saveError, inspectorOpen, mobile]);

  const closeInspector = useCallback(() => {
    setSelection((previous) => ({ ...previous, id: "" }));
    window.setTimeout(() => {
      if (opener.current?.isConnected) {
        opener.current.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
        });
        opener.current.focus({ preventScroll: true });
      }
    }, 0);
  }, []);

  const updateFilters = (values: Record<string, string>) => {
    const next = new URLSearchParams(queryString);
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    setSelectedId("");
    startTransition(() => {
      setOptimisticQuery(next.toString());
      router.replace(`/discover/${next.size ? `?${next}` : ""}`, {
        scroll: false,
      });
    });
  };

  const saveJob = async (id: string, saved: boolean) => {
    setSaveError("");
    setSavedOverrides((previous) => ({ ...previous, [id]: saved }));
    setSavingIds((previous) => [...previous, id]);
    try {
      await run(
        "save-job",
        { id, saved },
        saved ? "Role saved." : "Role removed from Saved.",
      );
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
    const row = visible[index];
    if (!row) return;
    opener.current = cardButtons.current.get(row.job.id) || null;
    setSelectedId(row.job.id);
  };

  if (!profile)
    return (
      <section className="discover-screen discover-empty">
        <Sparkles size={27} />
        <h2>Choose your next search</h2>
        <p>
          Create a search profile with your roles and preferred locations to
          assess opportunities.
        </p>
        <Link className="button discover-primary" href="/search/">
          Create a search profile
        </Link>
      </section>
    );

  return (
    <div className="discover-screen">
      <div className="discover-toolbar">
        <div
          className="discover-views"
          role="group"
          aria-label="Opportunity views"
        >
          {(
            [
              ["recommended", "Recommended"],
              ["all", "All results"],
              ["saved", "Saved"],
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
        <Action
          className="discover-refresh"
          previewAllowed
          disabled={loading}
          run={async () => setAttempt((value) => value + 1)}
        >
          <RefreshCw size={15} />
          Refresh matches
        </Action>
        <details className="discover-filters">
          <summary>
            <SlidersHorizontal size={16} />
            Filters
          </summary>
          <div className="discover-filter-panel">
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
              <label>
                Filter roles
                <input
                  name="q"
                  value={query}
                  onChange={(event) => updateFilters({ q: event.target.value })}
                  placeholder="Search role, employer or skill"
                />
              </label>
              <input type="hidden" name="view" value={view} />
              {location && (
                <input type="hidden" name="location" value={location} />
              )}
              {statusFilter && (
                <input type="hidden" name="status" value={statusFilter} />
              )}
            </form>
            <Select
              label="Search profile"
              value={profileId}
              options={state.profiles.map((item) => [item.id, item.name])}
              onChange={(event) => {
                setSelectedId("");
                selectProfile(event.target.value);
              }}
            />
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
                ["rejected", "Rejected"],
              ]}
              onChange={(event) =>
                updateFilters({
                  status: event.target.value,
                  ...(event.target.value === "submitted" ||
                  event.target.value === "rejected"
                    ? { view: "all" }
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
      <div className="discover-search-row">
        <span className="discover-result-count" role="status">
          {loading
            ? "Assessing your opportunities…"
            : `${visible.length} ${visible.length === 1 ? "role" : "roles"} · ${groups.length} ${groups.length === 1 ? "location" : "locations"}`}
        </span>
      </div>
      <div className="discover-profile-context">
        <Sparkles size={15} />
        <p>
          <strong>{profile.name}.</strong> Ranked from confirmed career evidence
          and your location preferences.
        </p>
        <span className="discover-desktop-count" role="status">
          {loading
            ? "Assessing opportunities…"
            : `${visible.length} roles · ${groups.length} locations`}
        </span>
        <details>
          <summary>Search context</summary>
          <dl>
            <div>
              <dt>Roles</dt>
              <dd>{profile.roles.join(", ") || "Any role"}</dd>
            </div>
            <div>
              <dt>Locations</dt>
              <dd>{profile.locations.join(", ") || "Any location"}</dd>
            </div>
            <div>
              <dt>Work models</dt>
              <dd>{profile.arrangements.join(", ") || "Any work model"}</dd>
            </div>
            <div>
              <dt>Seniority</dt>
              <dd>{profile.seniority.join(", ") || "Any level"}</dd>
            </div>
          </dl>
        </details>
      </div>
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
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry assessment
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
      {view === "recommended" &&
        rows.some(({ match }) => match.hard_conflicts.length) && (
          <p className="discover-hidden-note">
            Opportunities with confirmed conflicts remain available in All
            results.
          </p>
        )}
      {loading && !rows.length && (
        <div className="discover-empty" role="status">
          <RefreshCw size={25} />
          <h2>Assessing opportunities</h2>
          <p>Comparing imported roles with this search profile.</p>
        </div>
      )}
      {!loading && !error && !visible.length && (
        <div className="discover-empty">
          <Search size={27} />
          <h2>
            {!rows.length
              ? "Add your first opportunity"
              : view === "saved"
                ? "No saved roles here yet"
                : "No roles match these filters"}
          </h2>
          <p>
            {!rows.length
              ? "Import a job URL, paste an advert or refresh a configured source in Search preferences."
              : "Adjust your filters or choose All results to inspect the full assessment."}
          </p>
          {!rows.length ? (
            <Link className="button discover-primary" href="/search/">
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
      {visible.length > 0 && (
        <div
          ref={inspectorLayout}
          className={`discover-layout ${selected && !mobile ? "has-inspector" : ""}`}
        >
          <div
            className="discover-board"
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
                  const related = requirementEvidence(
                    match.evidence,
                    state.facts,
                  )
                    .filter((item) => item.facts.length)
                    .map((item) => item.requirement);
                  return (
                    <article
                      className={`discover-card ${selectedId === job.id ? "is-selected" : ""}`}
                      key={job.id}
                    >
                      <div className="discover-card-top">
                        <span className={`discover-status ${status.tone}`}>
                          {status.label}
                        </span>
                        <Action
                          previewAllowed
                          className={`discover-icon-button ${job.saved ? "is-saved" : ""}`}
                          disabled={savingIds.includes(job.id)}
                          aria-label={`${job.saved ? "Unsave" : "Save"} ${job.title}`}
                          aria-pressed={Boolean(job.saved)}
                          run={async () => saveJob(job.id, !job.saved)}
                        >
                          <Bookmark
                            size={16}
                            fill={job.saved ? "currentColor" : "none"}
                          />
                        </Action>
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
                          opener.current = event.currentTarget;
                          setSelectedId(job.id);
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
                      <p className="discover-card-location">
                        <MapPin size={13} />
                        {job.location || job.city || "Location unconfirmed"}
                        {job.work_arrangement && <> · {job.work_arrangement}</>}
                      </p>
                      <p
                        className="discover-card-salary"
                        title={advertisedSalary(job)}
                      >
                        {advertisedSalary(job, true)}
                      </p>
                      <p className="discover-card-fit">
                        <Sparkles size={14} />
                        <span>
                          {related.length
                            ? `Related evidence: ${related.slice(0, 3).join(", ")}`
                            : "Review requirements and career evidence"}
                        </span>
                      </p>
                      <span className="discover-card-footer">
                        <span
                          title={
                            job.checked_at
                              ? displayDate(
                                  job.checked_at,
                                  state._workspace.timezone,
                                )
                              : "No verified retrieval time"
                          }
                        >
                          {job.checked_at
                            ? `Checked ${checkedDate(job.checked_at, state._workspace.timezone)}`
                            : "Not checked"}
                        </span>
                        <span>
                          Assess role <ArrowUpRight size={13} />
                        </span>
                      </span>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
          {selected && (
            <OpportunityInspector
              row={selected}
              application={applications.get(selected.job.id)}
              facts={state.facts}
              timezone={state._workspace.timezone}
              mobile={mobile}
              position={selectedIndex}
              count={visible.length}
              rankingCurrent={!loading && !error}
              saving={savingIds.includes(selected.job.id)}
              saveError={saveError}
              preview={client.preview}
              onClose={closeInspector}
              onPrevious={() => moveSelection(selectedIndex - 1)}
              onNext={() => moveSelection(selectedIndex + 1)}
              onSave={async () => saveJob(selected.job.id, !selected.job.saved)}
              onPrepare={async () => {
                await run(
                  "local-package",
                  { profile_id: profileId, job_id: selected.job.id },
                  "A new draft is ready for document review.",
                );
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
