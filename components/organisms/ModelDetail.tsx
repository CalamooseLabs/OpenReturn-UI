// ── Organisms: Model Detail ──────────────────────────────────────────────────
// Bespoke sections of the Model Detail screen (routes/models/[version].tsx),
// extracted into reusable organisms composed from the atomic library:
//
//   ModelBreadcrumb   — Models / <name> trail.
//   ModelHeaderCard   — the model header card (title, version + source chips,
//                       description, right-side stats, score-composition bar).
//   WalkthroughCard    — the walkthrough shell (header band + children).
//
// Each organism takes plain data props — no fetching. Real trace data (the
// per-factor weights and the example org's composition) flows in from the route,
// which loads GET /scores/debug for an exemplar org.

import type { ComponentChildren } from "preact";
import { Eyebrow, Pill } from "../atoms.tsx";
import { titleCase } from "../../lib/format.ts";
import { scoreBand } from "../../lib/score.ts";

// ── breadcrumb ───────────────────────────────────────────────────────────────
export function ModelBreadcrumb(props: { name: string }) {
  return (
    <div
      class="flex items-center gap-2"
      style={{ fontSize: "13.5px", marginBottom: "18px" }}
    >
      <a href="/models" class="no-underline" style={{ color: "#9aa3b5" }}>
        Models
      </a>
      <span style={{ color: "#cfd5e2" }}>/</span>
      <span style={{ fontWeight: 600, color: "#3a4150" }}>{props.name}</span>
    </div>
  );
}

// ── header card ──────────────────────────────────────────────────────────────
/** One score-composition segment: a factor's share of total weight. */
export interface CompositionSegment {
  name: string;
  /** Raw factor weight (0–1). */
  weight: number;
  /** Percent share of total weight (0–100). */
  pct: number;
  color: string;
}

export interface ModelHeaderCardProps {
  name: string;
  version: number;
  /** 990-derived (blue dot) vs qualitative (gray dot). */
  derived: boolean;
  /** Reviewer-graded model (adds a "Manual" chip). */
  manual?: boolean;
  description?: string;
  /** model | composite | super_composite — shown in the "Kind" stat. */
  kind?: string;
  inputCount: number;
  segments: CompositionSegment[];
  /** A real exemplar score 0–100 (from the traced org), or null when unknown. */
  exampleScore: number | null;
  /** The traced org's name, for the composition caption. */
  exampleName?: string | null;
}

export function ModelHeaderCard(props: ModelHeaderCardProps) {
  const band = props.exampleScore !== null
    ? scoreBand(props.exampleScore)
    : null;
  return (
    <div
      class="card"
      style={{
        borderRadius: "18px",
        padding: "26px 28px",
        marginBottom: "18px",
      }}
    >
      <div
        class="flex flex-wrap items-start justify-between"
        style={{ gap: "24px" }}
      >
        <div style={{ maxWidth: "600px" }}>
          <div
            class="flex items-center"
            style={{ gap: "10px", marginBottom: "11px", flexWrap: "wrap" }}
          >
            <h1
              class="font-display font-bold text-navy"
              style={{ fontSize: "28px", letterSpacing: "-0.02em", margin: 0 }}
            >
              {props.name}
            </h1>
            {/* version chip */}
            <span
              class="mono"
              style={{
                fontSize: "11px",
                color: "#cdd9f0",
                background: "#192A54",
                borderRadius: "6px",
                padding: "3px 9px",
                letterSpacing: ".04em",
              }}
            >
              v{props.version}
            </span>
            {/* source-type tag */}
            <span
              class="mono inline-flex items-center"
              style={{
                gap: "6px",
                fontSize: "11.5px",
                color: props.derived ? "#2f4a85" : "#8893ab",
                background: props.derived ? "#eef2fa" : "#f3f5f9",
                borderRadius: "6px",
                padding: "3px 9px",
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
            {props.manual && (
              <span
                class="mono uppercase"
                style={{
                  fontSize: "10px",
                  color: "#9a6a1c",
                  background: "#f6ecd8",
                  borderRadius: "5px",
                  padding: "3px 8px",
                  letterSpacing: ".06em",
                }}
              >
                Manual
              </span>
            )}
          </div>
          <p
            class="text-muted"
            style={{
              fontSize: "14.5px",
              lineHeight: "1.6",
              margin: 0,
              textWrap: "pretty",
            }}
          >
            {props.description ??
              (props.derived
                ? "Measures this pillar from weighted features. Every input is sourced directly from the organization's Form 990 filing — select a feature below to trace its value back to the originating line."
                : "A reviewer-graded model. Select a feature below to walk its sub-score, metric, and the source material each input was drawn from.")}
          </p>
        </div>
        {/* right-side stats */}
        <div class="flex" style={{ gap: "26px" }}>
          <HeaderStat label="Total weight" value="100%" />
          <HeaderStat label="Inputs" value={String(props.inputCount)} />
          <HeaderStat
            label="Kind"
            value={props.kind ? titleCase(props.kind) : "Model"}
          />
        </div>
      </div>

      {/* ── score-composition bar + legend ────────────────────── */}
      {props.segments.length > 0 && (
        <div
          style={{
            marginTop: "22px",
            borderTop: "1px solid #f0f2f7",
            paddingTop: "20px",
          }}
        >
          <div
            class="flex items-center justify-between"
            style={{ marginBottom: "11px" }}
          >
            <Eyebrow>Score Composition</Eyebrow>
            {props.exampleScore !== null
              ? (
                <span style={{ fontSize: "12.5px", color: "#5a6172" }}>
                  {props.exampleName
                    ? <>Example: {props.exampleName}{" "}</>
                    : <>Example score{" "}</>}
                  <strong
                    class="mono"
                    style={{ color: band!.hex, fontSize: "14px" }}
                  >
                    {props.exampleScore}
                  </strong>{" "}
                  / 100
                </span>
              )
              : (
                <span style={{ fontSize: "12.5px", color: "#9aa3b5" }}>
                  No scored example available
                </span>
              )}
          </div>
          <div
            class="flex overflow-hidden"
            style={{
              height: "16px",
              borderRadius: "999px",
              marginBottom: "12px",
              background: "#eef1f6",
            }}
          >
            {props.segments.map((s, i) => (
              <div
                style={{
                  width: `${s.pct}%`,
                  background: s.color,
                  borderLeft: i > 0 ? "2px solid #fff" : "none",
                }}
              />
            ))}
          </div>
          <div
            class="flex flex-wrap"
            style={{ gap: "7px 20px", fontSize: "12px", color: "#5a6172" }}
          >
            {props.segments.map((s) => (
              <span class="inline-flex items-center" style={{ gap: "6px" }}>
                <span
                  class="inline-block"
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "2px",
                    background: s.color,
                  }}
                />
                {s.name} · {(s.weight * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A right-aligned header statistic (Bricolage number over a small label). */
function HeaderStat(props: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{ fontSize: "10.5px", color: "#9aa3b5", marginBottom: "3px" }}
      >
        {props.label}
      </div>
      <div
        class="font-display font-bold text-navy"
        style={{ fontSize: "22px" }}
      >
        {props.value}
      </div>
    </div>
  );
}

// ── walkthrough shell ──────────────────────────────────────────────────────────
/** The card around the 3-column explorer island: an icon + title band + body. */
export function WalkthroughCard(
  props: { live: boolean; children: ComponentChildren },
) {
  return (
    <div
      class="card"
      style={{ borderRadius: "18px", padding: 0, overflow: "hidden" }}
    >
      <div
        class="flex items-center justify-between"
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid #eef1f6",
          gap: "11px",
        }}
      >
        <div class="flex items-center" style={{ gap: "11px" }}>
          <div
            class="flex items-center justify-center"
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              background: "#eef2fa",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 1.5v15M9 1.5L5 5.5M9 1.5l4 4M3 16.5h12"
                stroke="#3a5da8"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div>
            <div
              class="font-display font-bold text-navy"
              style={{ fontSize: "16px", letterSpacing: "-0.01em" }}
            >
              Model walkthrough
            </div>
            <div style={{ fontSize: "12px", color: "#8893ab" }}>
              Trace a feature from score → metric → formula → source 990 line
            </div>
          </div>
        </div>
        {props.live
          ? (
            <Pill bg="#e3efe7" color="#245f45">
              Live trace
            </Pill>
          )
          : (
            <Pill bg="#f3f5f9" color="#8893ab">
              Definition only
            </Pill>
          )}
      </div>
      {props.children}
    </div>
  );
}
