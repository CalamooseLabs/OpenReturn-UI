// ── Island: SubmitButton ─────────────────────────────────────────────────────
// A submit button that disables itself and shows a spinner once its form starts
// submitting. The global NavProgress bar covers ordinary navigations; this is
// for the *slow* form actions (upload a ZIP, OCR a PDF, kick off an IRS ingest,
// create a model) where the user needs button-level "working…" feedback and
// protection against a double submit.
//
// It listens to the associated <form>'s `submit` event rather than its own click
// so it only flips to the busy state when the form actually submits (i.e. native
// validation passed) — not on a click that gets cancelled.

import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { ComponentChildren } from "preact";

type BtnVariant = "primary" | "secondary" | "navy" | "ghost" | "danger";

export default function SubmitButton(
  props:
    & {
      variant?: BtnVariant;
      size?: "sm";
      /** Label shown while submitting (defaults to the normal children). */
      pendingLabel?: ComponentChildren;
      children: ComponentChildren;
    }
    & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
) {
  const {
    variant = "primary",
    size,
    pendingLabel,
    children,
    class: cls,
    ...rest
  } = props;
  const ref = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = (e: Event) => {
      // In a multi-submit form (e.g. Discover vs Start-ingest) only the button
      // that actually drove the submit should show its spinner.
      const submitter = (e as SubmitEvent).submitter;
      if (submitter && submitter !== ref.current) return;
      setBusy(true);
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  // We deliberately do NOT toggle the `disabled` attribute on submit: a disabled
  // submitter is dropped from the form's entry list, which would strip a button's
  // name/value (e.g. action=discover). Instead the busy state is purely visual
  // (spinner + pointer-events:none) so the submission payload is untouched while
  // still preventing a double click.
  // Only an object style can be safely spread; a string style would otherwise
  // turn into indexed-char props.
  const restStyle = rest.style && typeof rest.style === "object"
    ? rest.style
    : undefined;
  return (
    <button
      {...rest}
      ref={ref}
      type="submit"
      aria-busy={busy ? "true" : undefined}
      // Keep the button focusable normally, but drop it from the tab order while
      // busy so Enter can't re-fire the submit (we avoid the disabled attribute
      // so the submitter's name/value stays in the form payload).
      tabIndex={busy ? -1 : rest.tabIndex}
      class={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${cls ?? ""}`}
      style={busy
        ? { pointerEvents: "none", opacity: "0.85", ...restStyle }
        : rest.style}
    >
      {busy && (
        <span
          aria-hidden="true"
          class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent align-[-1px]"
        />
      )}
      <span>{busy ? (pendingLabel ?? children) : children}</span>
    </button>
  );
}
