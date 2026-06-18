// ── Organisms: Org Profile ───────────────────────────────────────────────────
// The bespoke sections of the org-profile screen (routes/orgs/[ein].tsx), each
// a self-contained organism taking plain data props (no fetching):
//   OrgHero          — navy hero: identity + meta + OVERALL gauge + follow form
//   ScoreRingsRail   — the four pillar gauge rings rail
//   FinancialPicture — KPI grid + score/revenue trend chart
//   WhyThisScore     — band-driven reason bullets + category percentile
//   KeyPersonnel     — program photo placeholder + personnel cards
//
// Composes atoms (GaugeRing) + molecule-grade vocabulary while preserving the
// faithful navy look. money/format + score-band logic come from lib/*.

import type { ComponentChildren } from "preact";
import { GaugeRing } from "../atoms.tsx";
import { formatEin, money, titleCase } from "../../lib/format.ts";
import { letterGrade, ordinal, scoreBand, to100 } from "../../lib/score.ts";
import type { Person, ScoreHistoryRow } from "../../lib/types.ts";

/** A pillar in the rings rail: its label + the (already 0–100) value. */
export interface PillarDatum {
  label: string;
  value: number | null;
}

/** A band-driven reason bullet (label + its 0–100 value). */
export interface Reason {
  label: string;
  value: number;
}

// ───────────────────────────── OrgHero ─────────────────────────────
export function OrgHero(props: {
  name: string;
  ein: string;
  category: string;
  city?: string | null;
  state?: string | null;
  latestYear?: number;
  overall: number | null;
  overallSub?: string;
  following?: boolean;
  showFollow?: boolean;
}) {
  return (
    <div class="bg-navy text-white" style={{ padding: "42px 44px" }}>
      <div
        class="mx-auto flex flex-wrap items-center gap-11"
        style={{ maxWidth: "1340px" }}
      >
        <div class="min-w-0 flex-1">
          <div
            class="mono mb-5 inline-flex items-center gap-2 rounded-full uppercase"
            style={{
              border: "1px solid rgba(238,241,247,.3)",
              padding: "5px 13px",
              fontSize: "12px",
              letterSpacing: ".04em",
              color: "#9fb6e6",
            }}
          >
            {props.category}
          </div>
          <h1
            class="font-display font-bold text-white"
            style={{
              fontSize: "50px",
              lineHeight: "1.0",
              letterSpacing: "-0.03em",
              margin: "0 0 16px",
            }}
          >
            {props.name}
          </h1>
          {/* TODO: wire to API — no mission text in /organizations/full yet */}
          <p
            style={{
              fontSize: "17px",
              lineHeight: "1.55",
              color: "rgba(238,241,247,.74)",
              maxWidth: "440px",
              margin: "0 0 22px",
              textWrap: "pretty",
            }}
          >
            Advancing its charitable mission through programs and services
            reported on its annual Form 990 filings.
          </p>
          <div
            class="mono flex flex-wrap"
            style={{
              gap: "18px",
              fontSize: "12px",
              color: "rgba(238,241,247,.6)",
            }}
          >
            <span>EIN {formatEin(props.ein)}</span>
            {props.city && (
              <span>
                {[props.city, props.state].filter(Boolean).join(", ")}
              </span>
            )}
            <span style={{ color: "#9fb6e6" }}>
              Verified 990{props.latestYear ? ` · FY${props.latestYear}` : ""}
            </span>
          </div>
          {props.showFollow && (
            <div class="mt-6">
              <form method="POST">
                <input
                  type="hidden"
                  name="action"
                  value={props.following ? "unfollow" : "follow"}
                />
                <button
                  type="submit"
                  class="mono inline-flex items-center rounded-full font-semibold"
                  style={{
                    border: "1px solid rgba(238,241,247,.4)",
                    padding: "9px 18px",
                    fontSize: "13px",
                    color: "#eef1f7",
                    background: props.following
                      ? "rgba(238,241,247,.12)"
                      : "transparent",
                  }}
                >
                  {props.following ? "✓ Following" : "+ Follow"}
                </button>
              </form>
            </div>
          )}
        </div>
        {/* overall gauge ring */}
        <div class="flex shrink-0 flex-col items-center gap-3.5">
          <GaugeRing
            dark
            value={props.overall}
            size={186}
            label="OVERALL"
            sub={props.overallSub}
          />
          {props.overall === null && (
            <span class="mono text-xs" style={{ color: "#9fb6e6" }}>
              Pending
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ScoreRingsRail ───────────────────────────
export function ScoreRingsRail(props: { pillars: PillarDatum[] }) {
  return (
    <div class="border-b border-line bg-page">
      <div
        class="mx-auto flex flex-wrap items-stretch"
        style={{ maxWidth: "1340px", padding: "30px 44px", gap: "18px" }}
      >
        {props.pillars.map((p, i) => {
          const v = p.value;
          const has = v !== null;
          return (
            <>
              {i > 0 && (
                <div class="self-stretch bg-line" style={{ width: "1px" }} />
              )}
              <div class="flex flex-1 items-center" style={{ gap: "16px" }}>
                <GaugeRing value={v} size={78} />
                <div>
                  <div
                    class="font-semibold text-navy"
                    style={{ fontSize: "13.5px", marginBottom: "3px" }}
                  >
                    {p.label}
                  </div>
                  {has
                    ? (
                      <div
                        class="mono font-semibold"
                        style={{
                          fontSize: "12px",
                          color: scoreBand(v).pillText,
                        }}
                      >
                        Grade {letterGrade(v)}
                      </div>
                    )
                    : (
                      <div
                        class="mono font-semibold text-faint"
                        style={{ fontSize: "12px" }}
                      >
                        Pending
                      </div>
                    )}
                </div>
              </div>
            </>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────── FinancialPicture ──────────────────────────
/** A big-figure financial KPI cell. */
function Kpi(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div class="text-muted" style={{ fontSize: "12px", marginBottom: "5px" }}>
        {props.label}
      </div>
      <div
        class="font-display font-bold"
        style={{
          fontSize: "27px",
          letterSpacing: "-0.02em",
          color: props.accent ? "#2f4a85" : "#222838",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

/** Compact "$18.4M" / "$920K" money for the big KPI figures. */
export function moneyCompact(value: number | null): string {
  if (value === null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return money(value);
}

/**
 * Area chart of the org's overall-score history (derived from /scores/history).
 * Score is 0–1 → 0–100; plotted across the org's filing years.
 */
function ScoreTrend(props: { rows: ScoreHistoryRow[] }) {
  const rows = props.rows;
  const W = 320;
  const H = 90;
  const vals = rows.map((r) => to100(r.total_score) ?? 0);
  const n = rows.length;
  const x = (i: number) => (n === 1 ? W : (i / (n - 1)) * W);
  // Scale the band 0..100 into the chart, with a little headroom.
  const y = (v: number) =>
    H - 10 - (Math.max(0, Math.min(100, v)) / 100) * (H - 20);
  const line = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const firstYear = rows[0].year;
  const lastYear = rows[rows.length - 1].year;
  return (
    <>
      <div class="text-muted" style={{ fontSize: "12px", marginBottom: "8px" }}>
        Score trend · {firstYear} → {lastYear}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="90"
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <path d={area} fill="#dde7f6" />
        <path
          d={line}
          fill="none"
          stroke="#3a5da8"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        {vals.map((v, i) => (
          <circle
            cx={x(i)}
            cy={y(v)}
            r={i === n - 1 ? 4.5 : 3.5}
            fill="#3a5da8"
          />
        ))}
      </svg>
    </>
  );
}

export function FinancialPicture(props: {
  revenue: number | null;
  expenses: number | null;
  netAssets: number | null;
  programRatio: number | null;
  trend: ScoreHistoryRow[];
}) {
  const haveTrend = props.trend.length >= 2;
  return (
    <div class="card" style={{ borderRadius: "20px", padding: "26px" }}>
      <h2
        class="font-display font-bold text-navy"
        style={{
          fontSize: "18px",
          margin: "0 0 20px",
          letterSpacing: "-0.01em",
        }}
      >
        Financial picture
      </h2>
      <div
        class="grid"
        style={{
          gridTemplateColumns: "1fr 1fr",
          gap: "20px 16px",
          marginBottom: "24px",
        }}
      >
        <Kpi label="Total revenue" value={moneyCompact(props.revenue)} />
        <Kpi label="Total expenses" value={moneyCompact(props.expenses)} />
        <Kpi label="Net assets" value={moneyCompact(props.netAssets)} />
        <Kpi
          label="Program ratio"
          value={props.programRatio !== null
            ? `${props.programRatio.toFixed(1)}%`
            : "—"}
          accent
        />
      </div>

      {haveTrend ? <ScoreTrend rows={props.trend} /> : (
        <>
          <div
            class="text-muted"
            style={{ fontSize: "12px", marginBottom: "8px" }}
          >
            Revenue trend
          </div>
          {/* TODO: wire to API — needs ≥2 years of canonical financials */}
          <svg
            viewBox="0 0 320 90"
            width="100%"
            height="90"
            preserveAspectRatio="none"
            style={{ display: "block" }}
          >
            <path
              d="M0,69.6 L80,53.5 L160,40.3 L240,24.2 L320,10 L320,90 L0,90 Z"
              fill="#dde7f6"
            />
            <path
              d="M0,69.6 L80,53.5 L160,40.3 L240,24.2 L320,10"
              fill="none"
              stroke="#3a5da8"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── WhyThisScore ───────────────────────────
export function WhyThisScore(props: {
  reasons: Reason[];
  percentile?: number;
  hasGlobalRank: boolean;
}) {
  return (
    <div class="card" style={{ borderRadius: "20px", padding: "26px" }}>
      <h2
        class="font-display font-bold text-navy"
        style={{
          fontSize: "18px",
          margin: "0 0 18px",
          letterSpacing: "-0.01em",
        }}
      >
        Why this score
      </h2>
      {props.reasons.length === 0
        ? (
          <p class="text-muted" style={{ fontSize: "13.5px" }}>
            This organization has not been scored yet.
          </p>
        )
        : (
          <div class="flex flex-col" style={{ gap: "14px" }}>
            {props.reasons.map((r) => (
              <div class="flex" style={{ gap: "12px" }}>
                <span
                  class="shrink-0"
                  style={{
                    width: "6px",
                    borderRadius: "3px",
                    background: scoreBand(r.value).hex,
                  }}
                />
                <p
                  style={{
                    margin: "0",
                    fontSize: "13.5px",
                    lineHeight: "1.55",
                    color: "#454b58",
                  }}
                >
                  <strong class="text-navy">
                    {r.label} ({r.value}).
                  </strong>{" "}
                  {scoreBand(r.value).name === "Strong"
                    ? "A standout strength — well above peer benchmarks."
                    : scoreBand(r.value).name === "Solid"
                    ? "Healthy and dependable, in line with strong peers."
                    : scoreBand(r.value).name === "Watch"
                    ? "Adequate, but worth monitoring against peers."
                    : "Below benchmark — a priority area for improvement."}
                  {/* TODO: wire to API — narrative factor commentary */}
                </p>
              </div>
            ))}
          </div>
        )}
      {props.hasGlobalRank && (
        <div
          class="flex items-center justify-between"
          style={{
            marginTop: "20px",
            borderTop: "1px solid #e6eaf1",
            paddingTop: "16px",
          }}
        >
          <span class="text-muted" style={{ fontSize: "13px" }}>
            Percentile in category
          </span>
          <span
            class="font-display font-bold text-navy"
            style={{ fontSize: "22px" }}
          >
            {props.percentile}
            <span
              class="text-faint"
              style={{ fontSize: "13px", fontWeight: "500" }}
            >
              {props.percentile !== undefined
                ? ordinal(props.percentile).slice(
                  String(props.percentile).length,
                )
                : ""}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── KeyPersonnel ───────────────────────────
export function KeyPersonnel(props: { people: Person[] }) {
  return (
    <div
      class="grid items-stretch"
      style={{
        padding: "0 44px 40px",
        gridTemplateColumns: "1fr 1.1fr",
        gap: "28px",
      }}
    >
      {/* program photo placeholder */}
      <div
        class="flex items-center justify-center"
        style={{
          borderRadius: "20px",
          border: "1px dashed #b7c1d6",
          background:
            "repeating-linear-gradient(135deg,#e4e8f0,#e4e8f0 11px,#dce1ec 11px,#dce1ec 22px)",
          minHeight: "200px",
        }}
      >
        {/* TODO: wire to API — no program imagery in the 990 dataset */}
        <span
          class="mono"
          style={{
            fontSize: "12px",
            color: "#8893ab",
            background: "#eceff5",
            padding: "6px 12px",
            borderRadius: "7px",
          }}
        >
          program photo — field operations
        </span>
      </div>

      {/* people cards */}
      <div>
        <h2
          class="font-display font-bold text-navy"
          style={{
            fontSize: "18px",
            margin: "0 0 16px",
            letterSpacing: "-0.01em",
          }}
        >
          Key personnel
        </h2>
        {props.people.length === 0
          ? (
            <div
              class="card text-muted"
              style={{
                borderRadius: "14px",
                padding: "15px",
                fontSize: "13px",
              }}
            >
              No personnel on record for this organization.
            </div>
          )
          : (
            <div
              class="grid"
              style={{ gridTemplateColumns: "1fr 1fr", gap: "12px" }}
            >
              {props.people.map((p) => (
                <div
                  class="card"
                  style={{ borderRadius: "14px", padding: "15px" }}
                >
                  <div
                    class="font-semibold text-navy"
                    style={{ fontSize: "13.5px" }}
                  >
                    {p.full_name}
                  </div>
                  <div
                    class="text-faint"
                    style={{ fontSize: "12px", margin: "2px 0 0" }}
                  >
                    {p.title ? titleCase(p.title) : "—"}
                  </div>
                  {/* comp shows comp $; omitted — no compensation in API */}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/** Two-column wrapper for the FinancialPicture + WhyThisScore narrative row. */
export function NarrativeRow(props: { children: ComponentChildren }) {
  return (
    <div
      class="grid"
      style={{
        padding: "34px 44px",
        gridTemplateColumns: "1fr 1fr",
        gap: "28px",
      }}
    >
      {props.children}
    </div>
  );
}
