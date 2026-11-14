"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useIsPresent,
} from "motion/react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import "./notification-center.css";

type Kind = "success" | "info" | "error" | "undo";

interface NotificationDetail {
  kind: Kind;
  message: string;
  label?: string;
  dismissLabel?: string;
  onDismiss?: () => void;
  actions?: { label: string; run: () => void }[];
  externallyTimed?: boolean;
  onInteraction?: (held: boolean) => void;
  jobId?: string;
  removalId?: string;
}

type Notification = NotificationDetail & { id: string };

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const shortLifetime = 5_000;
const longLifetime = 8_000;

function subscribeToVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

export function usePageHidden() {
  return useSyncExternalStore(
    subscribeToVisibility,
    () => document.hidden,
    () => false,
  );
}

export function useNotificationExpiry(
  event: unknown,
  duration: number | null,
  paused: boolean,
  dismiss: () => void,
) {
  const budget = useRef<{ event: unknown; duration: number; left: number }>(
    undefined,
  );
  const onExpiry = useEffectEvent(dismiss);
  useLayoutEffect(() => {
    if (duration === null) {
      budget.current = undefined;
      return;
    }
    if (
      budget.current?.event !== event ||
      budget.current?.duration !== duration
    )
      budget.current = { event, duration, left: duration };
    if (paused) return;
    const remaining = budget.current;
    const started = performance.now();
    const timer = window.setTimeout(() => onExpiry(), remaining.left);
    return () => {
      window.clearTimeout(timer);
      remaining.left = Math.max(
        0,
        remaining.left - (performance.now() - started),
      );
    };
  }, [event, duration, paused]);
}

interface NotificationControls {
  notify(message: string, kind?: Kind): void;
  setNotification(id: string, detail: NotificationDetail): void;
  removeNotification(id: string): void;
  clearNotifications(): void;
}

const NotificationContext = createContext<NotificationControls>({
  notify: () => {},
  setNotification: () => {},
  removeNotification: () => {},
  clearNotifications: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const icons = { success: Check, info: Info, error: CircleAlert, undo: Info };

function NotificationCard({
  item,
  paused,
  reduced,
  dismiss,
}: {
  item: Notification;
  paused: boolean;
  reduced: boolean;
  dismiss: () => void;
}) {
  const present = useIsPresent();
  const previousFocus = useRef<HTMLElement | null>(null);
  const Icon = icons[item.kind];
  useNotificationExpiry(
    item.id,
    item.externallyTimed
      ? null
      : item.kind === "error" || item.kind === "undo"
        ? longLifetime
        : shortLifetime,
    paused || !present,
    dismiss,
  );
  return (
    <motion.div
      className="notification-slot"
      layout={reduced ? false : "position"}
      transition={{ layout: { duration: reduced ? 0 : 0.22 } }}
    >
      <motion.div
        className={`notification-card${item.removalId ? " removal-feedback-notice" : ""}`}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
        transition={{
          duration: reduced ? 0 : 0.18,
          ease: [0.16, 1, 0.3, 1],
        }}
        data-notification-id={item.id}
        data-kind={item.kind}
        data-job-id={item.jobId}
        data-removal-id={item.removalId}
        role={item.label ? "region" : undefined}
        aria-label={item.label}
        aria-hidden={!present || undefined}
        inert={!present}
        onFocusCapture={(event) => {
          if (
            event.relatedTarget instanceof HTMLElement &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            previousFocus.current = event.relatedTarget;
        }}
      >
        <Icon size={17} aria-hidden="true" className="notification-icon" />
        <div className="notification-content">
          <p>{item.message}</p>
          {item.actions && (
            <div className="notification-actions">
              {item.actions.map(({ label, run }) => (
                <button
                  className="secondary"
                  type="button"
                  key={label}
                  onClick={run}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="secondary notification-dismiss"
          type="button"
          aria-label={item.dismissLabel || "Dismiss notification"}
          onClick={() => {
            if (previousFocus.current?.isConnected)
              previousFocus.current.focus({ preventScroll: true });
            dismiss();
            item.onDismiss?.();
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </motion.div>
    </motion.div>
  );
}

function useNotificationHost() {
  const [host, setHost] = useState<HTMLDivElement>();
  useLayoutEffect(() => {
    const element = document.createElement("div");
    element.className = "notification-host";
    const place = () => {
      const modal = Array.from(document.querySelectorAll("dialog:modal")).at(
        -1,
      );
      const anchor =
        modal &&
        Array.from(modal.querySelectorAll("[data-notification-anchor]")).find(
          (candidate) => candidate.closest("dialog") === modal,
        );
      const parent = anchor ?? document.body;
      if (element.parentElement !== parent) parent.appendChild(element);
    };
    place();
    const frame = requestAnimationFrame(() => setHost(element));
    const observer = new MutationObserver(place);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.remove();
    };
  }, []);
  return host;
}

function NotificationViewport({
  items,
  dismiss,
}: {
  items: Notification[];
  dismiss: (id: string) => void;
}) {
  const host = useNotificationHost();
  const [reduced, setReduced] = useState(true);
  const hidden = usePageHidden();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const held = hovered || focused;
  const announced = useRef(new Map<string, string>());
  const [announcements, setAnnouncements] = useState<Notification[]>([]);

  useEffect(() => {
    const preference = window.matchMedia?.(reducedMotionQuery);
    if (!preference) return;
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!host) return;
    // Removing a focused action or moving the host into a dialog can blur it
    // without dispatching focusout. Reconcile with the actual focused element.
    const observer = new MutationObserver(() => {
      setFocused(Boolean(viewport.current?.contains(document.activeElement)));
    });
    observer.observe(host, { subtree: true, childList: true });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [host]);
  useEffect(() => {
    const scoped = items.filter((item) => item.onInteraction);
    scoped.forEach((item) => item.onInteraction?.(held));
    return () => scoped.forEach((item) => item.onInteraction?.(false));
  }, [items, held]);
  useEffect(() => {
    if (!host) return;
    const next = items.filter(
      (item) => announced.current.get(item.id) !== item.message,
    );
    announced.current = new Map(items.map((item) => [item.id, item.message]));
    setAnnouncements((current) => [
      ...current.filter((entry) =>
        items.some(
          (item) => item.id === entry.id && item.message === entry.message,
        ),
      ),
      ...next,
    ]);
    if (!items.length) {
      setHovered(false);
      setFocused(false);
    }
  }, [host, items]);

  if (!host) return null;
  return createPortal(
    <div
      className="notification-viewport"
      ref={viewport}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <div
        className="visually-hidden"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {announcements
          .filter(({ kind }) => kind !== "error")
          .map(({ id, message }) => (
            <span key={JSON.stringify([id, message])}>{message}</span>
          ))}
      </div>
      <div
        className="visually-hidden"
        aria-live="assertive"
        aria-relevant="additions text"
      >
        {announcements
          .filter(({ kind }) => kind === "error")
          .map(({ id, message }) => (
            <span key={JSON.stringify([id, message])}>{message}</span>
          ))}
      </div>
      <div
        className="notification-list"
        role="region"
        aria-label="Notifications"
      >
        <LayoutGroup>
          <AnimatePresence>
            {items.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                paused={hidden || held}
                reduced={reduced}
                dismiss={() => dismiss(item.id)}
              />
            ))}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>,
    host,
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const nextId = useRef(0);
  const setNotification = useCallback(
    (id: string, detail: NotificationDetail) => {
      setItems((before) => {
        const current = before.find((item) => item.id === id);
        if (current) {
          return before.map((item) =>
            item.id === id ? { ...detail, id } : item,
          );
        }
        return [...before, { ...detail, id }];
      });
    },
    [],
  );
  const removeNotification = useCallback((id: string) => {
    setItems((before) => {
      const next = before.filter((item) => item.id !== id);
      return before.length === next.length ? before : next;
    });
  }, []);
  const notify = useCallback((message: string, kind: Kind = "success") => {
    if (!message) return;
    const id = String(++nextId.current);
    const focusedId = document.activeElement?.closest<HTMLElement>(
      "[data-notification-id]",
    )?.dataset.notificationId;
    setItems((before) => {
      const ordinary = before.filter((item) => !item.externallyTimed);
      const oldest =
        ordinary.length >= 3
          ? ordinary.find((item) => item.id !== focusedId)
          : undefined;
      return [
        ...before.filter((item) => item !== oldest),
        { id, message, kind },
      ];
    });
  }, []);
  const clearNotifications = useCallback(() => setItems([]), []);
  // Only the viewport consumes the queue. Publishing does not rerender forms
  // and in-progress actions that use the stable operations below.
  const controls = useMemo(
    () => ({ notify, setNotification, removeNotification, clearNotifications }),
    [notify, setNotification, removeNotification, clearNotifications],
  );
  return (
    <NotificationContext.Provider value={controls}>
      {children}
      <NotificationViewport items={items} dismiss={removeNotification} />
    </NotificationContext.Provider>
  );
}
