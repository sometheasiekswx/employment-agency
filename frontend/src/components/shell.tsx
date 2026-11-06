"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { animate } from "motion";
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
import { useWorkspace } from "./workspace-provider";
import { useDraft } from "./unsaved";
import { applicationQueues } from "@/features/applications/queues";
import { WorkspaceSetup } from "@/features/settings/workspace-settings";
import { PublicPreviewNotice } from "./public-preview-notice";
import "./shell-motion.css";

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

function revealShellFeedback(
  element: HTMLParagraphElement | null,
  message: string,
  keyboardInput: boolean,
  distance: number,
  duration: number,
) {
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (
    !element ||
    !message ||
    keyboardInput ||
    !preference ||
    preference.matches
  )
    return () => {};

  const controls = animate(
    element,
    {
      opacity: [0.5, 1],
      transform: [`translateY(${distance}px)`, "translateY(0px)"],
    },
    { duration, ease: [0.16, 1, 0.3, 1] },
  );
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false;
    preference.removeEventListener("change", stopIfReduced);
    controls.cancel();
    // cancel() restores the first frame; return the notice to its visible CSS state.
    element.style.removeProperty("opacity");
    element.style.removeProperty("transform");
  };
  const stopIfReduced = () => {
    if (preference.matches) stop();
  };
  preference.addEventListener("change", stopIfReduced);
  return stop;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, client, notice, notify, refreshError, profileId } =
    useWorkspace();
  const { canLeave } = useDraft();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const noticeElement = useRef<HTMLParagraphElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const keyboardInput = useRef(false);
  const stopNoticeMotion = useRef(() => {});
  const stopErrorMotion = useRef(() => {});
  const feedbackRoute = useRef(pathname);
  useEffect(() => {
    if (feedbackRoute.current !== pathname) notify("");
    feedbackRoute.current = pathname;
  }, [pathname, notify]);
  const current = pages.find(({ href }) => href === pathname) || pages[0];
  const isDiscover = current.href === "/discover/";
  const profile = state.profiles.find(({ id }) => id === profileId);
  const locations = profile?.locations.length
    ? profile.locations
    : state._workspace.preferred_locations;
  const owner = state.identity.name || "Your workspace";
  const label = client.preview
    ? "Public fictional preview"
    : client.hosted
      ? "Private cloud workspace"
      : "Local workspace";
  const queueCount = applicationQueues(state.applications).length;
  useEffect(() => {
    document.title = `${current.label} | Employment Agency | ${label}`;
    if (mobileMenu.current) mobileMenu.current.open = false;
  }, [current.label, label]);
  useLayoutEffect(() => {
    const stop = revealShellFeedback(
      noticeElement.current,
      notice,
      keyboardInput.current,
      4,
      0.18,
    );
    stopNoticeMotion.current = stop;
    return stop;
  }, [notice]);
  useLayoutEffect(() => {
    const stop = revealShellFeedback(
      errorElement.current,
      refreshError,
      keyboardInput.current,
      0,
      0.14,
    );
    stopErrorMotion.current = stop;
    return stop;
  }, [refreshError]);
  const guardedNavigation = (event: { preventDefault: () => void }) => {
    if (!canLeave()) event.preventDefault();
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
  return (
    <div
      className="workspace"
      onKeyDownCapture={(event) => {
        keyboardInput.current = true;
        event.currentTarget.dataset.feedbackInput = "keyboard";
        stopNoticeMotion.current();
        stopErrorMotion.current();
      }}
      onPointerDownCapture={(event) => {
        keyboardInput.current = false;
        event.currentTarget.dataset.feedbackInput = "pointer";
      }}
      data-page={current.href.split("/")[1]}
    >
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside className="workspace-header" aria-label="Workspace navigation">
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
              <p>{label}</p>
            </nav>
          </details>
        </div>

        {state._workspace.demo === true && (
          <span className="demo-label mobile-demo-label">
            Demo · fictional profile
          </span>
        )}
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          {state._workspace.demo === true && (
            <span className="demo-label">Demo · fictional profile</span>
          )}
          <form
            className="workspace-search"
            role="search"
            aria-label="Search roles"
            action="/discover/"
            method="get"
            onSubmit={searchRoles}
          >
            <Search aria-hidden="true" />
            <label className="visually-hidden" htmlFor="workspace-role-search">
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
          <Link
            className="button primary workspace-primary-action"
            href={isDiscover ? "/search/#add-opportunity" : "/discover/"}
            onNavigate={guardedNavigation}
          >
            {isDiscover ? (
              <Sparkles aria-hidden="true" />
            ) : (
              <Compass aria-hidden="true" />
            )}
            {isDiscover ? "Add opportunities" : "Explore opportunities"}
          </Link>
        </header>
        <div className="desk">
          {client.preview && <PublicPreviewNotice />}
          <div className={isDiscover ? "visually-hidden" : "page-heading"}>
            <div>
              <h1>{current.label}</h1>
            </div>
          </div>
          <p
            ref={noticeElement}
            id="notice"
            className="shell-feedback"
            role="status"
            aria-live="polite"
          >
            {notice}
          </p>
          {refreshError && (
            <p ref={errorElement} role="alert" className="error shell-feedback">
              {refreshError}
            </p>
          )}
          <main id="content" tabIndex={-1}>
            {state._workspace.setup_complete ? children : <WorkspaceSetup />}
          </main>
        </div>
      </div>
    </div>
  );
}
