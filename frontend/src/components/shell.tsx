"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Compass,
  ChevronDown,
  History,
  Search,
  Settings2,
  HardDrive,
  Cloud,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import Dock from "./react-bits/dock";
import { AppearanceControl } from "./appearance-control";
import { useWorkspace } from "./workspace-provider";
import { useDraft } from "./unsaved";
import { applicationQueues } from "@/features/applications/queues";
import { WorkspaceSetup } from "@/features/settings/workspace-settings";
import { PublicPreviewNotice } from "./public-preview-notice";
import type { Profile } from "@/lib/models";

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

const compactHeaderQuery = "(width < 720px)";

function subscribeToCompactHeader(listener: () => void) {
  const query = window.matchMedia?.(compactHeaderQuery);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

function hasCompactHeader() {
  return window.matchMedia?.(compactHeaderQuery).matches ?? false;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ProfileContext({
  profile,
  locations,
  children,
}: {
  profile?: Profile;
  locations: string[];
  children?: ReactNode;
}) {
  return (
    <div className="profile-context">
      <p className="profile-context-label">Active profile</p>
      <p className="profile-context-name">
        {profile?.name || "No search profile"}
      </p>
      <details className="profile-context-details">
        <summary>
          Profile details <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <dl>
          <div>
            <dt>Role family</dt>
            <dd>{profile?.roles.join(", ") || "Not set"}</dd>
          </div>
          <div>
            <dt>Locations</dt>
            <dd>{locations.join(", ") || "Not set"}</dd>
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
      </details>
      {children}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, client, refreshError, profileId, refresh } = useWorkspace();
  const { canLeave } = useDraft();
  const workspaceHeader = useRef<HTMLElement>(null);
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const keyboardInput = useRef(false);
  const compactHeader = useSyncExternalStore(
    subscribeToCompactHeader,
    hasCompactHeader,
    () => false,
  );
  const current = pages.find(({ href }) => href === pathname) || pages[0];
  const isDiscover = current.href === "/discover/";
  const profile = state.profiles.find(({ id }) => id === profileId);
  const locations = profile?.locations.length
    ? profile.locations
    : state._workspace.preferred_locations;
  const owner = state.identity.name || "Your workspace";
  const avatar = initials(state.identity.name || "Employment Agency");
  const label = client.preview
    ? "Public demo"
    : client.hosted
      ? "Private cloud workspace"
      : "Local workspace";
  const queueCount = applicationQueues(state.applications).length;
  const workspaceMode = (
    <span className="workspace-mode">
      {client.hosted ? (
        <Cloud aria-hidden="true" />
      ) : (
        <HardDrive aria-hidden="true" />
      )}
      {label}
    </span>
  );
  useEffect(() => {
    document.title = `${current.label} | Employment Agency | ${label}`;
    if (mobileMenu.current) mobileMenu.current.open = false;
  }, [current.label, label]);
  useEffect(() => {
    const header = workspaceHeader.current;
    if (!header) return;
    const root = document.documentElement;
    const syncHeaderHeight = () => {
      root.style.setProperty(
        "--workspace-header-height",
        `${header.offsetHeight}px`,
      );
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(syncHeaderHeight);
    observer?.observe(header);
    syncHeaderHeight();
    const closeMenu = ({ target }: PointerEvent) => {
      const menu = mobileMenu.current;
      if (menu?.open && target instanceof Node && !menu.contains(target)) {
        menu.open = false;
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--workspace-header-height");
      document.removeEventListener("pointerdown", closeMenu);
    };
  }, []);
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
  const workspaceNav = (
    <Dock
      key="sections"
      items={pages}
      pathname={current.href}
      canLeave={canLeave}
    />
  );
  const mobileActions = (
    <div key="utilities" className="mobile-header-actions">
      <AppearanceControl />
      <details
        className="mobile-menu"
        ref={mobileMenu}
        onBlur={(event) => {
          if (
            keyboardInput.current &&
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            event.currentTarget.open = false;
          }
        }}
        onKeyDown={(event) => {
          const menu = event.currentTarget;
          if (event.key === "Escape" && menu.open) {
            menu.open = false;
            menu.querySelector("summary")?.focus();
            event.stopPropagation();
          }
        }}
      >
        <summary
          aria-label={`${avatar} — Workspace options`}
          title="Workspace options"
        >
          <span className="workspace-avatar" aria-hidden="true">
            {avatar}
          </span>
        </summary>
        <div className="mobile-menu-panel">
          {!isDiscover && (
            <Link
              href="/search/#add-opportunity"
              onNavigate={guardedNavigation}
            >
              <Sparkles aria-hidden="true" />
              Add opportunities
            </Link>
          )}
          <ProfileContext profile={profile} locations={locations} />
          <div className="workspace-owner">
            <strong>{owner}</strong>
            {workspaceMode}
          </div>
        </div>
      </details>
    </div>
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
          !window.matchMedia?.("(max-width: 900px)").matches ||
          getComputedStyle(header).position !== "sticky"
        )
          return;
        requestAnimationFrame(() => {
          if (document.activeElement !== target) return;
          // WebKit can leave an in-viewport focus target behind sticky chrome.
          const bounds = target.getBoundingClientRect();
          const top = header.getBoundingClientRect().bottom + 8;
          const bottom = innerHeight - 8;
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
            src="/agency-header-on-dark.svg"
            alt=""
            width={1236}
            height={330}
            className="brand-wordmark brand-wordmark-dark"
            loading="eager"
          />
          <Image
            src="/agency-header-on-light.svg"
            alt=""
            width={1236}
            height={330}
            className="brand-wordmark brand-wordmark-light"
            loading="eager"
          />
        </Link>

        <div className="rail-context">
          <ProfileContext profile={profile} locations={locations}>
            <p className="rail-summary">
              <span>
                <strong>{state.jobs.length}</strong>{" "}
                {state.jobs.length === 1 ? "role" : "roles"}
              </span>
              <span>
                <strong>{queueCount}</strong>{" "}
                {queueCount === 1 ? "application" : "applications"}
              </span>
            </p>
          </ProfileContext>
        </div>

        {compactHeader
          ? [mobileActions, workspaceNav]
          : [workspaceNav, mobileActions]}

        <div className="rail-bottom">
          <span className="workspace-avatar" aria-hidden="true">
            {avatar}
          </span>
          <div className="workspace-owner">
            <strong>{owner}</strong>
            {workspaceMode}
          </div>
          <AppearanceControl />
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="page-heading">
            <h1>{current.label}</h1>
            {state._workspace.demo === true && (
              <span className="demo-label">
                {client.preview ? "Public demo" : "Demo · fictional profile"}
              </span>
            )}
          </div>
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
