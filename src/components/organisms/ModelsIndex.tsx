// ── Organism: ModelsIndex ────────────────────────────────────────────────────
// The bespoke sections of the /models catalog screen, extracted into reusable
// organisms (Brad-Frost atomic layering). Each takes plain data props — no
// fetching. Composed from atoms (Eyebrow) + the molecules where one exists.
//
//   CompositeBanner  — the navy "OpenReturn Score" roll-up banner (links to a
//                       composite/super-composite model when one exists).
//   PillarGrid       — the 2×2 grid of pillar models, each a ModelCard.
//   ModelCard        — one pillar card (whole card links to the model inspector).
//   MethodologyNote  — the "Full provenance, every score" callout.

import type { ComponentChildren } from "preact";
import { titleCase } from "../../lib/format.ts";
import type { ModelOption } from "../../lib/models.ts";

// ---- shared pillar shape -----------------------------------------------------

/**
 * The four scoring pillars surfaced in the design comp. `type` maps to the
 * API's score_model.model_type vocabulary (financial / whole_person /
 * governance / christ_centeredness). `derived` drives the "990-derived"
 * (blue dot) vs "Qualitative" (gray dot) source tag.
 */
export interface Pillar {
  type: string;
  name: string;
  derived: boolean;
  desc: string;
  /** Fallback feature chips + source when no registered model matches the type. */
  features: string[];
  source: string;
}

// ---- small internal helpers --------------------------------------------------

/** A small mono uppercase eyebrow label (page-local style, not the section-title atom). */
function MonoEyebrow(props: { children: ComponentChildren; class?: string }) {
  return (
    <div
      class={`mono uppercase ${props.class ?? "text-faint"}`}
      style={{ fontSize: "11px", letterSpacing: ".16em" }}
    >
      {props.children}
    </div>
  );
}

/** The 990-derived (blue dot) / Qualitative (gray dot) source tag. */
function SourceTag(props: { derived: boolean }) {
  return (
    <span
      class="mono inline-flex items-center gap-1.5 rounded-md px-2.5 py-1"
      style={{
        fontSize: "11.5px",
        color: props.derived ? "#2f4a85" : "#8893ab",
        background: props.derived ? "#eef2fa" : "#f3f5f9",
      }}
    >
      <span
        class="inline-block rounded-full"
        style={{
          width: "6px",
          height: "6px",
          background: props.derived ? "#3a5da8" : "#aeb6c7",
        }}
      />
      {props.derived ? "990-derived" : "Qualitative"}
    </span>
  );
}

// ---- ModelCard ---------------------------------------------------------------

/** One pillar card in the 2×2 grid. Whole card links to the model inspector. */
export function ModelCard(
  props: { pillar: Pillar; model?: ModelOption; features: string[] },
) {
  const { pillar, model, features } = props;
  const chips = features.length ? features : pillar.features;
  const href = model ? `/models/${model.version}` : undefined;
  const inputs = model ? "Registered" : `${pillar.features.length} signals`;
  const inner = (
    <>
      {/* header row */}
      <div class="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <div class="mb-2 flex items-center gap-2.5">
            <h2
              class="font-display font-bold text-navy"
              style={{ fontSize: "19px", letterSpacing: "-0.015em" }}
            >
              {pillar.name}
            </h2>
            {pillar.type === "financial" && (
              <span
                class="mono font-bold"
                style={{
                  fontSize: "10px",
                  color: "#245f45",
                  background: "#e3efe7",
                  borderRadius: "5px",
                  padding: "2px 7px",
                  letterSpacing: ".04em",
                }}
              >
                WALKTHROUGH
              </span>
            )}
            {!model && (
              <span
                class="mono"
                style={{
                  fontSize: "10px",
                  color: "#9aa3b5",
                  background: "#f3f5f9",
                  borderRadius: "5px",
                  padding: "2px 7px",
                  letterSpacing: ".04em",
                }}
              >
                PENDING
              </span>
            )}
          </div>
          <SourceTag derived={pillar.derived} />
        </div>
        <div class="shrink-0 text-right">
          <div class="text-faint" style={{ fontSize: "10.5px" }}>Weight</div>
          <div
            class="font-display font-bold text-navy"
            style={{ fontSize: "20px" }}
          >
            25%
          </div>
        </div>
      </div>

      {/* description */}
      <p
        class="text-muted"
        style={{
          fontSize: "13.5px",
          lineHeight: "1.55",
          margin: "0 0 16px",
          textWrap: "pretty",
        }}
      >
        {pillar.desc}
      </p>

      {/* feature chips */}
      <div class="mb-4 flex flex-wrap gap-1.5">
        {chips.map((f) => (
          <span
            class="text-muted"
            style={{
              fontSize: "11.5px",
              background: "#f3f5f9",
              border: "1px solid #e7ebf2",
              borderRadius: "6px",
              padding: "4px 9px",
            }}
          >
            {titleCase(f)}
          </span>
        ))}
      </div>

      {/* footer meta */}
      <div
        class="mt-auto flex items-center justify-between gap-3"
        style={{ borderTop: "1px solid #f0f2f7", paddingTop: "14px" }}
      >
        <div class="flex gap-4">
          <div>
            <div class="text-faint" style={{ fontSize: "10.5px" }}>Inputs</div>
            <div
              class="font-semibold"
              style={{ fontSize: "12.5px", color: "#3a4150" }}
            >
              {inputs}
            </div>
          </div>
          <div>
            <div class="text-faint" style={{ fontSize: "10.5px" }}>Source</div>
            <div
              class="mono font-semibold"
              style={{ fontSize: "12.5px", color: "#3a4150" }}
            >
              {pillar.source}
            </div>
          </div>
        </div>
        <span
          class="font-semibold whitespace-nowrap"
          style={{ fontSize: "13px", color: model ? "#3a5da8" : "#aeb6c7" }}
        >
          {model ? "Walk the model →" : "No model yet"}
        </span>
      </div>
    </>
  );

  const cardStyle = { borderRadius: "18px" };
  return href
    ? (
      <a
        href={href}
        class="card card-hover card-pad flex flex-col no-underline"
        style={cardStyle}
      >
        {inner}
      </a>
    )
    : (
      <div class="card card-pad flex flex-col" style={cardStyle}>
        {inner}
      </div>
    );
}

// ---- PillarGrid --------------------------------------------------------------

/** Resolve the matched registered model for a pillar (caller-supplied). */
export interface PillarGridRow {
  pillar: Pillar;
  model?: ModelOption;
  features: string[];
}

/** The 2×2 grid of pillar model cards. */
export function PillarGrid(props: { rows: PillarGridRow[] }) {
  return (
    <div class="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {props.rows.map((r) => (
        <ModelCard pillar={r.pillar} model={r.model} features={r.features} />
      ))}
    </div>
  );
}

// ---- CompositeBanner ---------------------------------------------------------

/**
 * The navy "OpenReturn Score" roll-up banner. Links to the supplied composite
 * version when one exists, otherwise renders as a static block.
 */
export function CompositeBanner(
  props: { compositeVersion?: string; href?: string },
) {
  const bannerInner = (
    <div class="flex flex-wrap items-center gap-6">
      <div style={{ flex: "1", minWidth: "280px" }}>
        <div class="mb-3 flex items-center gap-3">
          <span
            class="mono uppercase"
            style={{
              fontSize: "10.5px",
              letterSpacing: ".14em",
              color: "#9fb6e6",
            }}
          >
            Composite
          </span>
          <span
            class="mono"
            style={{
              fontSize: "11px",
              color: "#cdd9f0",
              background: "rgba(159,182,230,.18)",
              borderRadius: "6px",
              padding: "2px 8px",
            }}
          >
            {props.compositeVersion !== undefined
              ? `v${props.compositeVersion}`
              : "v3.0"}
          </span>
        </div>
        <h2
          class="font-display font-bold"
          style={{
            fontSize: "24px",
            letterSpacing: "-0.02em",
            margin: "0 0 8px",
            color: "#fff",
          }}
        >
          OpenReturn Score
        </h2>
        <p
          style={{
            fontSize: "14px",
            lineHeight: "1.55",
            color: "rgba(238,241,247,.74)",
            margin: "0",
            maxWidth: "560px",
            textWrap: "pretty",
          }}
        >
          A weighted roll-up of the four pillar models into a single 0–100 score
          and letter grade. Each pillar contributes equally; the composite is
          what surfaces across the dashboard, search, and reports.
        </p>
      </div>
      {/* pillar weighting bar */}
      <div style={{ flexShrink: "0", minWidth: "300px" }}>
        <div
          class="mb-3 flex overflow-hidden"
          style={{ height: "14px", borderRadius: "999px" }}
        >
          <div style={{ width: "25%", background: "#9fb6e6" }} />
          <div
            style={{
              width: "25%",
              background: "#7e9ad8",
              borderLeft: "2px solid #192A54",
            }}
          />
          <div
            style={{
              width: "25%",
              background: "#9fb6e6",
              borderLeft: "2px solid #192A54",
            }}
          />
          <div
            style={{
              width: "25%",
              background: "#7e9ad8",
              borderLeft: "2px solid #192A54",
            }}
          />
        </div>
        <div
          class="grid"
          style={{
            gridTemplateColumns: "1fr 1fr",
            gap: "6px 16px",
            fontSize: "12px",
            color: "#cdd9f0",
          }}
        >
          <span>● Financial · 25%</span>
          <span>● Whole-Person · 25%</span>
          <span>● Leadership · 25%</span>
          <span>● Christ-Centered · 25%</span>
        </div>
      </div>
    </div>
  );
  const bannerStyle = {
    background: "#192A54",
    borderRadius: "18px",
    padding: "26px 30px",
    boxShadow: "0 20px 44px -28px rgba(25,42,84,.5)",
  };
  return props.href
    ? (
      <a href={props.href} class="mb-6 block no-underline" style={bannerStyle}>
        {bannerInner}
      </a>
    )
    : (
      <div class="mb-6 block" style={bannerStyle}>
        {bannerInner}
      </div>
    );
}

// ---- MethodologyNote ---------------------------------------------------------

/** The "Full provenance, every score" callout under the pillar grid. */
export function MethodologyNote() {
  return (
    <div
      class="mt-6 flex items-start gap-5 bg-surface"
      style={{
        border: "1px solid #dde2ec",
        borderRadius: "16px",
        padding: "22px 24px",
      }}
    >
      <div
        class="flex shrink-0 items-center justify-center"
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "9px",
          background: "#eef2fa",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2.5l6.5 3v4.2c0 4-2.8 6.7-6.5 7.8-3.7-1.1-6.5-3.8-6.5-7.8V5.5z"
            stroke="#3a5da8"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path
            d="M7.3 10l1.9 1.9 3.6-3.8"
            stroke="#3a5da8"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <div>
        <div
          class="font-bold text-navy"
          style={{ fontSize: "14px", marginBottom: "5px" }}
        >
          Full provenance, every score
        </div>
        <p
          class="text-muted"
          style={{
            fontSize: "13.5px",
            lineHeight: "1.6",
            margin: "0",
            textWrap: "pretty",
          }}
        >
          Models marked{" "}
          <strong style={{ color: "#3a4150" }}>990-derived</strong>{" "}
          trace every input to a specific filing, Part, line, and column — with
          the extracted value, source page, and OCR confidence shown in the
          walkthrough. Qualitative models cite the originating document and
          reviewer.
        </p>
      </div>
    </div>
  );
}

// Re-export so the route can import the eyebrow style alongside the organisms.
export { MonoEyebrow };
