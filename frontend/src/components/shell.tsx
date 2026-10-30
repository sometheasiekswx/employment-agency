"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useWorkspace } from "./workspace-provider";
import { useDraft } from "./unsaved";
import { WorkspaceSetup } from "@/features/settings/workspace-settings";

const pages = [
  [
    "/",
    "Applications",
    "Your next chapter",
    "A considered next move starts with a well-prepared application.",
  ],
  [
    "/career/",
    "Career evidence",
    "The experience behind you",
    "Your skills, your experience, and the facts that make each application yours.",
  ],
  [
    "/search/",
    "Search profiles",
    "The possibilities ahead",
    "Define where you want to go and what the right role looks like.",
  ],
  [
    "/settings/",
    "Settings & recovery",
    "A little housekeeping",
    "Manage provider consent, recovery and your private setup.",
  ],
  [
    "/history/",
    "Application history",
    "Your work, preserved",
    "Browse previous application versions and their original documents.",
  ],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, client, notice } = useWorkspace();
  const { canLeave } = useDraft();
  const current = pages.find(([path]) => path === pathname) || pages[0];
  const title = current[0] === "/settings/" ? "Your workspace" : current[1];
  const label = client.hosted ? "Private cloud workspace" : "Local workspace";
  useEffect(() => {
    document.title = `${title} | ${label}`;
  }, [title, label]);
  return (
    <div className="workspace">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside className="rail">
        <Link
          href="/"
          className="brand"
          onNavigate={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            ea
          </span>
          <span>
            Employment
            <br />
            Agency
          </span>
        </Link>
        <p className="rail-caption">{label}</p>
        <nav aria-label="Workspace sections">
          {pages.map(([path, name]) => (
            <Link
              key={path}
              href={path}
              aria-current={pathname === path ? "page" : undefined}
              onNavigate={(event) => {
                if (!canLeave()) event.preventDefault();
              }}
            >
              {name}
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>
        <div className="rail-bottom">
          <span className="local-dot" aria-hidden="true" /> {label}
          <p>
            Your next move.
            <br />
            On your terms.
          </p>
        </div>
      </aside>
      <div className="desk">
        <header className="workspace-header">
          <span>Private career desk</span>
          <span className="badge">Prepared here. Sent by you.</span>
        </header>
        <div className="page-heading">
          <div>
            <p id="page-context">{current[2]}</p>
            <h1>{title}</h1>
            <p>{current[3]}</p>
          </div>
          {pathname === "/" && (
            <div className="batch-count">
              <strong>
                {String(
                  state.applications.filter((app) => !app.archived).length,
                ).padStart(2, "0")}
              </strong>
              <span>application packages</span>
            </div>
          )}
        </div>
        <p id="notice" role="status" aria-live="polite">
          {notice}
        </p>
        <main id="content" tabIndex={-1}>
          {state._workspace.setup_complete ? children : <WorkspaceSetup />}
        </main>
        <footer>
          <span>
            Employment Agency /{" "}
            {client.hosted ? "Invite-only hosted pilot" : "Local edition"}
          </span>
          <span>Review carefully. Apply confidently.</span>
        </footer>
      </div>
    </div>
  );
}
