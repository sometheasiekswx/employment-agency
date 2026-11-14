"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { errorMessage, isConnectionError } from "@/lib/format";
import { PREVIEW_READ_ONLY, publicPreviewEnabled } from "@/lib/public-preview";
import { useDraft } from "./unsaved";

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      {label}
      <input
        autoComplete="off"
        spellCheck={
          props.type === "email" || props.type === "url" ? false : undefined
        }
        {...props}
      />
    </label>
  );
}
export function TextArea({
  label,
  ...props
}: React.ComponentPropsWithRef<"textarea"> & { label: string }) {
  return (
    <label>
      {label}
      <textarea aria-label={label} {...props} />
    </label>
  );
}
export function Check({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}
export function Select({
  label,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label>
      {label}
      <select aria-label={label} {...props}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Json({
  value,
  className,
}: {
  value: unknown;
  className?: string;
}) {
  return <pre className={className}>{JSON.stringify(value, null, 2)}</pre>;
}

/** Errors stay beside their form. Failed submissions never discard the draft. */
export function Form({
  children,
  onSave,
  onBusyChange,
  className,
  previewAllowed = false,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  children: ReactNode;
  onSave: (
    data: FormData,
    submitter: HTMLButtonElement | null,
  ) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  previewAllowed?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const { setDirty } = useDraft();
  const readOnly = publicPreviewEnabled() && !previewAllowed;
  useEffect(() => {
    if (error) errorNotice.current?.focus();
  }, [error]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) {
      setError(PREVIEW_READ_ONLY);
      return;
    }
    if (saving.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    saving.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      await onSave(data, submitter);
      setDirty(false);
    } catch (error) {
      const message = errorMessage(error);
      setError(
        isConnectionError(error)
          ? `Your unsaved input is still in this form. ${message}`
          : message,
      );
    } finally {
      saving.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <form
      className={className}
      onSubmit={submit}
      onChange={() => setDirty(true)}
      {...props}
    >
      <fieldset
        disabled={busy || readOnly}
        title={readOnly ? PREVIEW_READ_ONLY : undefined}
      >
        {children}
      </fieldset>
      {busy && <p role="status">Saving…</p>}
      {error && (
        <p role="alert" className="error" tabIndex={-1} ref={errorNotice}>
          {error}
        </p>
      )}
    </form>
  );
}

export function Action({
  children,
  run,
  className = "secondary",
  previewAllowed = false,
  keepContentWhileBusy = false,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  run: (button: HTMLButtonElement) => Promise<void>;
  children: ReactNode;
  previewAllowed?: boolean;
  keepContentWhileBusy?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        {...props}
        title={
          publicPreviewEnabled() && !previewAllowed
            ? PREVIEW_READ_ONLY
            : props.title
        }
        disabled={
          busy || props.disabled || (publicPreviewEnabled() && !previewAllowed)
        }
        aria-busy={busy}
        onClick={async (event) => {
          setBusy(true);
          setError("");
          try {
            await run(event.currentTarget);
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && !keepContentWhileBusy ? "Working…" : children}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}

export const values = (data: FormData) => Object.fromEntries(data.entries());
export const text = (data: FormData, key: string) =>
  String(data.get(key) || "");
export const checked = (data: FormData, key: string) => data.get(key) === "on";
