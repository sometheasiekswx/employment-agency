"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GooeySelection } from "./gooey-selection";

export interface DockItemData {
  href: string;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}

export default function Dock({
  items,
  pathname,
  canLeave,
}: {
  items: DockItemData[];
  pathname: string;
  canLeave: () => boolean;
}) {
  return (
    <nav className="dock-panel" aria-label="Workspace sections">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="dock-item"
          aria-label={item.label}
          aria-current={pathname === item.href ? "page" : undefined}
          onNavigate={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          <span
            className="dock-highlight"
            data-gooey-anchor=""
            aria-hidden="true"
          />
          <span className="dock-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="dock-label">{item.label}</span>
          <span className="dock-short-label" aria-hidden="true">
            {item.shortLabel}
          </span>
        </Link>
      ))}
      <GooeySelection
        selectedKey={pathname}
        activeSelector='[aria-current="page"]'
      />
    </nav>
  );
}
