"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { errorMessage } from "@/lib/format";
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
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
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
  className,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  children: ReactNode;
  onSave: (
    data: FormData,
    submitter: HTMLButtonElement | null,
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const { setDirty } = useDraft();
  useEffect(() => {
    if (error) errorNotice.current?.focus();
  }, [error]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    setBusy(true);
    setError("");
    try {
      await onSave(data, submitter);
      setDirty(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={className}
      onSubmit={submit}
      onChange={() => setDirty(true)}
      {...props}
    >
      <fieldset disabled={busy}>{children}</fieldset>
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
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  run: (button: HTMLButtonElement) => Promise<void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        {...props}
        disabled={busy || props.disabled}
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
        {busy ? "Working…" : children}
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
