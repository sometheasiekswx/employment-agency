"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  BriefcaseBusiness,
  FileCheck2,
  FolderClock,
  ScanText,
  Search,
  Settings2,
  HardDrive,
  Cloud,
  ShieldCheck,
} from "lucide-react";
import Dock from "./react-bits/dock";
import { useWorkspace } from "./workspace-provider";
import { useDraft } from "./unsaved";
import { WorkspaceSetup } from "@/features/settings/workspace-settings";

const pages = [
  {
    href: "/",
    label: "Applications",
    shortLabel: "Applications",
    icon: <FileCheck2 />,
    description:
      "Review your documents, keep track of decisions, and take the next step.",
  },
  {
    href: "/career/",
    label: "Career evidence",
    shortLabel: "Career",
    icon: <ScanText />,
    description:
      "Your experience, confirmed facts and the sources behind every application.",
  },
  {
    href: "/search/",
    label: "Search profiles",
    shortLabel: "Search",
    icon: <Search />,
    description:
      "Define the right role, discover opportunities and prepare considered drafts.",
  },
  {
    href: "/history/",
    label: "Application history",
    shortLabel: "History",
    icon: <FolderClock />,
    description:
      "Every preserved version, with the original documents exactly where you left them.",
  },
  {
    href: "/settings/",
    label: "Settings & recovery",
    shortLabel: "Settings",
    icon: <Settings2 />,
    description:
      "Manage your workspace, provider permissions and recovery options.",
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, client, notice } = useWorkspace();
  const { canLeave } = useDraft();
  const current = pages.find(({ href }) => href === pathname) || pages[0];
  const title =
    current.href === "/settings/" ? "Your workspace" : current.label;
  const label = client.hosted ? "Private cloud workspace" : "Local workspace";
  useEffect(() => {
    document.title = `${title} | ${label}`;
  }, [title, label]);
  return (
    <div className="workspace">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="workspace-header">
        <Link
          href="/"
          className="brand"
          onNavigate={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            <BriefcaseBusiness />
          </span>
          <span>Employment Agency</span>
        </Link>
        <Dock items={pages} pathname={pathname} canLeave={canLeave} />
        <span className="workspace-mode">
          {client.hosted ? (
            <Cloud aria-hidden="true" />
          ) : (
            <HardDrive aria-hidden="true" />
          )}
          {label}
        </span>
      </header>
      <div className="desk">
        <div className="page-heading">
          <div>
            <h1>{title}</h1>
            <p>{current.description}</p>
          </div>
          <span className="privacy-note">
            <ShieldCheck aria-hidden="true" />
            Prepared here. Sent by you.
          </span>
        </div>
        <p id="notice" role="status" aria-live="polite">
          {notice}
        </p>
        <main id="content" tabIndex={-1}>
          {state._workspace.setup_complete ? children : <WorkspaceSetup />}
        </main>
        <footer className="workspace-footer">
          <span>
            Employment Agency ·{" "}
            {client.hosted ? "Invite-only hosted pilot" : "Local edition"}
          </span>
          <span>You review. You decide. You submit.</span>
        </footer>
      </div>
    </div>
  );
}
