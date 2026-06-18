// ── Island: PrintButton ──────────────────────────────────────────────────────
// The summary report's toolbar buttons (Print / Export PDF) both trigger the
// browser print dialog — the only client JS the printable report needs. The
// @media print rules in the document hide the chrome so only the article prints.

import type { ComponentChildren } from "preact";

export default function PrintButton(
  props: { children: ComponentChildren; variant?: "ghost" | "navy" },
) {
  const navy = props.variant === "navy";
  return (
    <button
      type="button"
      onClick={() => globalThis.print()}
      class="mono inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold transition-colors"
      style={navy
        ? { border: "none", background: "#192a54", color: "#fff" }
        : { border: "1px solid #d2d9e6", background: "#fff", color: "#3a4150" }}
    >
      {props.children}
    </button>
  );
}
