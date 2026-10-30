"use client";

/** Adapted from React Bits Dock, revision da6c709a5c46c172d0406ad626c5df31e509ee2e.
 * See public/licenses/react-bits.txt. Fixed link targets and persistent labels
 * replace expanding button containers so keyboard and touch navigation stay stable.
 */
import Link from "next/link";
import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

export interface DockItemData {
  href: string;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}

function DockItem({
  item,
  mouseX,
  active,
  canLeave,
}: {
  item: DockItemData;
  mouseX: MotionValue<number>;
  active: boolean;
  canLeave: () => boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reducedMotion = useReducedMotion();
  const distance = useTransform(mouseX, (x) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? x - rect.left - rect.width / 2 : Infinity;
  });
  const target = useTransform(distance, [-100, 0, 100], [1, 1.12, 1]);
  const scale = useSpring(target, { mass: 0.8, stiffness: 300, damping: 32 });
  return (
    <Link
      ref={ref}
      href={item.href}
      className="dock-item"
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onNavigate={(event) => {
        if (!canLeave()) event.preventDefault();
      }}
    >
      <motion.span
        className="dock-icon"
        aria-hidden="true"
        style={{ scale: reducedMotion ? 1 : scale }}
      >
        {item.icon}
      </motion.span>
      <span className="dock-label">{item.label}</span>
      <span className="dock-short-label" aria-hidden="true">
        {item.shortLabel}
      </span>
    </Link>
  );
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
  const mouseX = useMotionValue(Infinity);
  return (
    <nav
      className="dock-panel"
      aria-label="Workspace sections"
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") mouseX.set(event.clientX);
      }}
      onPointerLeave={() => mouseX.set(Infinity)}
    >
      {items.map((item) => (
        <DockItem
          key={item.href}
          item={item}
          mouseX={mouseX}
          active={pathname === item.href}
          canLeave={canLeave}
        />
      ))}
    </nav>
  );
}
