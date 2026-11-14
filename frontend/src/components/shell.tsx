"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Compass,
  History,
  Menu,
  Search,
  Settings2,
  HardDrive,
  Cloud,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import Dock from "./react-bits/dock";
import { useAppearance } from "./appearance";
import { Select } from "./controls";
import { useWorkspace } from "./workspace-provider";
import { useDraft } from "./unsaved";
import { applicationQueues } from "@/features/applications/queues";
import { WorkspaceSetup } from "@/features/settings/workspace-settings";
import { PublicPreviewNotice } from "./public-preview-notice";
import { appearanceOptions } from "@/lib/appearance";

const pages = [
  {
    href: "/discover/",
    label: "Opportunities",
    shortLabel: "Opportunities",
    icon: <Compass />,
  },
  {
    href: "/career/",
    label: "Career profile",
    shortLabel: "Profile",
    icon: <UserRound />,
  },
  {
    href: "/search/",
    label: "Search preferences",
    shortLabel: "Search",
    icon: <SlidersHorizontal />,
  },
  {
    href: "/history/",
    label: "History",
    shortLabel: "History",
    icon: <History />,
  },
  {
    href: "/settings/",
    label: "Settings",
    shortLabel: "Settings",
    icon: <Settings2 />,
  },
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, client, refreshError, profileId, refresh } = useWorkspace();
  const { canLeave } = useDraft();
  const { appearance, setAppearance } = useAppearance();
  const workspaceHeader = useRef<HTMLElement>(null);
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const keyboardInput = useRef(false);
  const current = pages.find(({ href }) => href === pathname) || pages[0];
  const isDiscover = current.href === "/discover/";
  const profile = state.profiles.find(({ id }) => id === profileId);
  const locations = profile?.locations.length
    ? profile.locations
    : state._workspace.preferred_locations;
  const owner = state.identity.name || "Your workspace";
  const label = client.preview
    ? "Public demo"
    : client.hosted
      ? "Private cloud workspace"
      : "Local workspace";
  const queueCount = applicationQueues(state.applications).length;
  useEffect(() => {
    document.title = `${current.label} | Employment Agency | ${label}`;
    if (mobileMenu.current) mobileMenu.current.open = false;
  }, [current.label, label]);
  const guardedNavigation = (event: { preventDefault: () => void }) => {
    if (!canLeave()) {
      event.preventDefault();
      return;
    }
    if (mobileMenu.current) mobileMenu.current.open = false;
  };
  const searchRoles = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canLeave()) return;
    const query = new FormData(event.currentTarget).get("q");
    const search = new URLSearchParams();
    if (typeof query === "string" && query.trim())
      search.set("q", query.trim());
    router.push(`/discover/${search.size ? `?${search}` : ""}`);
  };
  const themeControl = (
    <Select
      label="Color theme"
      options={appearanceOptions}
      value={appearance}
      onChange={(event) => setAppearance(event.target.value)}
    />
  );
  return (
    <div
      className="workspace"
      onKeyDownCapture={() => {
        keyboardInput.current = true;
      }}
      onPointerDownCapture={() => {
        keyboardInput.current = false;
      }}
      onFocusCapture={({ target }) => {
        const header = workspaceHeader.current;
        if (
          !header ||
          !keyboardInput.current ||
          !(target instanceof HTMLElement) ||
          !target.closest("main") ||
          target.closest("dialog[open]") ||
          !window.matchMedia?.("(max-width: 900px)").matches
        )
          return;
        requestAnimationFrame(() => {
          if (document.activeElement !== target) return;
          // WebKit can leave an in-viewport focus target behind sticky chrome.
          const bounds = target.getBoundingClientRect();
          const top = header.getBoundingClientRect().bottom + 8;
          const dock = header.querySelector(".dock-panel");
          const bottom = (dock?.getBoundingClientRect().top ?? innerHeight) - 8;
          const offset =
            bounds.top < top
              ? bounds.top - top
              : Math.max(0, bounds.bottom - bottom);
          if (offset) window.scrollBy({ top: offset, behavior: "instant" });
        });
      }}
      data-page={current.href.split("/")[1]}
    >
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside
        ref={workspaceHeader}
        className="workspace-header"
        aria-label="Workspace navigation"
      >
        <Link
          href="/discover/"
          className="brand"
          aria-label="Employment Agency — Opportunities"
          onNavigate={guardedNavigation}
        >
          <Image
            src="/employment-mark.svg"
            alt=""
            width={32}
            height={34}
            className="brand-mark"
            priority
          />
          <span>Agency</span>
        </Link>
        {state._workspace.demo === true && (
          <span className="demo-label mobile-demo-label">
            Demo<span className="visually-hidden"> · fictional profile</span>
          </span>
        )}

        <div className="rail-context">
          <p className="rail-context-label">
            {profile?.name || "Your career workspace"}
          </p>
          <dl>
            <div>
              <dt>Role family</dt>
              <dd>{profile?.roles.join(", ") || "Choose your roles"}</dd>
            </div>
            <div>
              <dt>Locations</dt>
              <dd>
                {locations.length ? `${locations.length} selected` : "Not set"}
              </dd>
            </div>
            <div>
              <dt>Work model</dt>
              <dd>{profile?.arrangements.join(", ") || "Any work model"}</dd>
            </div>
            <div>
              <dt>Seniority</dt>
              <dd>{profile?.seniority.join(", ") || "Not specified"}</dd>
            </div>
          </dl>
          <div className="rail-summary">
            <strong>{state.jobs.length}</strong>
            <span>
              {state.jobs.length === 1
                ? "role in your workspace"
                : "roles in your workspace"}
            </span>
          </div>
          <p className="rail-caption">
            {queueCount} {queueCount === 1 ? "application" : "applications"}
          </p>
        </div>

        <Dock items={pages} pathname={current.href} canLeave={canLeave} />

        <div className="rail-appearance">{themeControl}</div>
        <div className="rail-bottom">
          <span className="workspace-avatar" aria-hidden="true">
            {initials(state.identity.name || "Employment Agency")}
          </span>
          <div className="workspace-owner">
            <strong>{owner}</strong>
            <span className="workspace-mode">
              {client.hosted ? (
                <Cloud aria-hidden="true" />
              ) : (
                <HardDrive aria-hidden="true" />
              )}
              {label}
            </span>
          </div>
        </div>

        <div className="mobile-header-actions">
          <Link
            href="/career/"
            className="workspace-avatar"
            aria-label={`${initials(state.identity.name || "Employment Agency")} — Open career profile`}
            onNavigate={guardedNavigation}
          >
            <span aria-hidden="true">
              {initials(state.identity.name || "Employment Agency")}
            </span>
          </Link>
          <details
            className="mobile-menu"
            ref={mobileMenu}
            onKeyDown={(event) => {
              if (event.key === "Escape" && mobileMenu.current?.open) {
                mobileMenu.current.open = false;
                mobileMenu.current.querySelector("summary")?.focus();
                event.stopPropagation();
              }
            }}
          >
            <summary aria-label="All workspace pages">
              <Menu aria-hidden="true" />
            </summary>
            <nav aria-label="All workspace pages">
              <Link
                href="/search/#add-opportunity"
                onNavigate={guardedNavigation}
              >
                <Sparkles aria-hidden="true" />
                Add opportunities
              </Link>
              {pages.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  aria-current={page.href === current.href ? "page" : undefined}
                  onNavigate={guardedNavigation}
                >
                  <span aria-hidden="true">{page.icon}</span>
                  {page.label}
                </Link>
              ))}
              <div className="mobile-appearance">{themeControl}</div>
              <p>{label}</p>
            </nav>
          </details>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="page-heading">
            <h1>{current.label}</h1>
          </div>
          {state._workspace.demo === true && (
            <span className="demo-label">Demo · fictional profile</span>
          )}
          {!isDiscover && (
            <form
              className="workspace-search"
              role="search"
              aria-label="Search roles"
              action="/discover/"
              method="get"
              onSubmit={searchRoles}
            >
              <Search aria-hidden="true" />
              <label
                className="visually-hidden"
                htmlFor="workspace-role-search"
              >
                Search roles
              </label>
              <input
                id="workspace-role-search"
                type="search"
                name="q"
                placeholder="Search roles"
              />
              <button
                type="submit"
                className="secondary"
                aria-label="Search roles"
              >
                <Search aria-hidden="true" />
              </button>
            </form>
          )}
          {isDiscover && (
            <Link
              className="button primary workspace-primary-action"
              href="/search/#add-opportunity"
              onNavigate={guardedNavigation}
            >
              <Sparkles aria-hidden="true" />
              Add opportunities
            </Link>
          )}
        </header>
        <div className="desk">
          {client.preview && (
            <PublicPreviewNotice resume={client.demoDrafts?.demoResume} />
          )}
          {refreshError && (
            <p role="alert" className="error">
              {refreshError}{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => void refresh().catch(() => {})}
              >
                Retry workspace refresh
              </button>
            </p>
          )}
          <main
            key={JSON.stringify([pathname, state._workspace.path])}
            id="content"
            tabIndex={-1}
          >
            {state._workspace.setup_complete ? children : <WorkspaceSetup />}
          </main>
        </div>
      </div>
    </div>
  );
}
