// ── Organisms: Dashboard ─────────────────────────────────────────────────────
// The signed-in portfolio dashboard, broken into reusable sections (Brad-Frost
// atomic layering: atoms → molecules → organisms → templates). Each organism
// takes plain data props (no fetching) and composes the molecules/atoms — the
// route owns data-loading and feeds these.

import type { ComponentChildren } from "preact";
import { GradePill } from "../atoms.tsx";
import { Panel } from "../molecules.tsx";
import { letterGrade, scoreBand } from "../../lib/score.ts";
import { formatEin, titleCase } from "../../lib/format.ts";
import type { OrgSummary } from "../../lib/types.ts";

// ---- Signed-out landing ----------------------------------------------------

export interface QuickLink {
  href: string;
  title: string;
  desc: string;
}

/** Signed-out hero: eyebrow + headline + search form + sign-in CTA. */
export function LandingHero() {
  return (
    <div class="py-12 text-center">
      <div class="section-title mb-3">Nonprofit financial health</div>
      <h1
        class="font-display font-bold"
        style={{
          fontSize: "44px",
          lineHeight: "1.05",
          letterSpacing: "-0.03em",
          color: "#192A54",
          margin: 0,
        }}
      >
        Explore the integrity behind the numbers
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-muted" style={{ fontSize: "16px" }}>
        OpenReturn turns IRS Form 990 filings into searchable organizations,
        multi-year financial-health scores, and rankings.
      </p>
      <form
        method="GET"
        action="/search"
        class="mx-auto mt-7 flex max-w-xl gap-2"
      >
        <input
          class="input"
          type="text"
          name="q"
          placeholder="Search organizations by name or EIN…"
          autofocus
        />
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
      <div class="mt-5">
        <a href="/login" class="btn btn-primary">Sign in</a>
      </div>
    </div>
  );
}

/** Signed-out quick-link card grid. */
export function QuickLinks(props: { links: QuickLink[] }) {
  return (
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      {props.links.map((l) => (
        <a href={l.href} class="card card-pad card-hover">
          <h3
            class="font-display font-bold"
            style={{ fontSize: "17px", color: "#192A54", margin: 0 }}
          >
            {l.title}
          </h3>
          <p class="mt-1 text-sm text-muted">{l.desc}</p>
        </a>
      ))}
    </div>
  );
}

// ---- Signed-in header ------------------------------------------------------

/** Dashboard page header: eyebrow + heading + tracking line + action buttons. */
export function DashboardHeader(props: {
  heading: string;
  trackedCount: number;
  followCount: number;
}) {
  return (
    <div class="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div>
        <div class="section-title" style={{ marginBottom: "9px" }}>
          Portfolio Overview
        </div>
        <h1
          class="font-display font-bold"
          style={{
            fontSize: "34px",
            lineHeight: "1.05",
            letterSpacing: "-0.025em",
            color: "#192A54",
            margin: 0,
          }}
        >
          {props.heading}
        </h1>
        <p style={{ fontSize: "15px", color: "#6b7488", margin: "8px 0 0" }}>
          Tracking{" "}
          <strong style={{ color: "#2a2f3a", fontWeight: 600 }}>
            {props.trackedCount.toLocaleString()} organizations
          </strong>{" "}
          · {props.followCount} on your watchlist
        </p>
      </div>
      <div class="flex gap-2.5">
        <a href="/reports" class="btn btn-secondary">Export portfolio</a>
        <a href="/search" class="btn btn-primary">+ Add organization</a>
      </div>
    </div>
  );
}

// ---- Score distribution ----------------------------------------------------

export interface DistributionBucket {
  label: string;
  count: number;
  /** Band hex for the bar fill. */
  color: string;
}

/** A vertical bar chart of score buckets, with a band-colour legend. */
export function ScoreDistribution(props: { buckets: DistributionBucket[] }) {
  const total = props.buckets.reduce((a, b) => a + b.count, 0);
  const maxCount = Math.max(1, ...props.buckets.map((b) => b.count));
  const legend: { c: string; t: string }[] = [
    { c: scoreBand(95).hex, t: "A (90+)" },
    { c: scoreBand(85).hex, t: "B (80–89)" },
    { c: scoreBand(75).hex, t: "C (70–79)" },
    { c: scoreBand(50).hex, t: "<70" },
  ];
  return (
    <Panel
      title="Score distribution"
      legend={
        <div
          class="flex gap-3.5"
          style={{ fontSize: "11.5px", color: "#6b7488" }}
        >
          {legend.map((l) => (
            <span class="inline-flex items-center gap-1.5">
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "2px",
                  background: l.c,
                }}
              />
              {l.t}
            </span>
          ))}
        </div>
      }
    >
      {total === 0
        ? (
          <div
            class="flex items-center justify-center text-muted"
            style={{ height: "200px", fontSize: "13.5px" }}
          >
            No scored organizations in the portfolio yet.
          </div>
        )
        : (
          <div
            class="flex items-end gap-3.5"
            style={{ height: "200px", borderBottom: "1px solid #eef1f6" }}
          >
            {props.buckets.map((b) => {
              const h = b.count === 0
                ? 4
                : Math.round((b.count / maxCount) * 168);
              return (
                <div
                  class="flex flex-1 flex-col items-center justify-end gap-2"
                  style={{ height: "100%" }}
                >
                  <span
                    class="mono font-semibold"
                    style={{ fontSize: "12px", color: "#6b7488" }}
                  >
                    {b.count}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "46px",
                      height: `${h}px`,
                      background: b.color,
                      borderRadius: "5px 5px 0 0",
                    }}
                  />
                  <span
                    class="mono"
                    style={{ fontSize: "10.5px", color: "#9aa3b5" }}
                  >
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
    </Panel>
  );
}

// ---- Avg. by dimension -----------------------------------------------------

export interface DimensionRow {
  label: string;
  value: number | null;
  pending: boolean;
}

/** Horizontal pillar-average bars, with a footnote on pending coverage. */
export function DimensionBars(props: { dimensions: DimensionRow[] }) {
  return (
    <Panel title="Avg. by dimension">
      <div class="flex flex-col gap-4">
        {props.dimensions.map((d) => {
          const v = d.value;
          const has = v !== null;
          const band = has ? scoreBand(v) : null;
          return (
            <div>
              <div
                class="mb-1.5 flex items-center justify-between"
                style={{ fontSize: "13px" }}
              >
                <span style={{ color: "#3a4150", fontWeight: 500 }}>
                  {d.label}
                </span>
                <span class="flex items-center gap-2">
                  {d.pending && (
                    <span
                      class="mono uppercase"
                      style={{
                        fontSize: "9.5px",
                        letterSpacing: ".1em",
                        color: "#aeb6c7",
                      }}
                    >
                      Pending
                    </span>
                  )}
                  <span
                    class="mono font-semibold"
                    style={{ color: has ? "#192A54" : "#aeb6c7" }}
                  >
                    {has ? v : "—"}
                  </span>
                </span>
              </div>
              <div
                style={{
                  height: "8px",
                  borderRadius: "999px",
                  background: "#e7ebf2",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: has ? `${Math.max(0, Math.min(100, v))}%` : "0%",
                    background: band?.hex ?? "transparent",
                    borderRadius: "999px",
                    opacity: d.pending ? 0.4 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: "22px",
          borderTop: "1px solid #eef1f6",
          paddingTop: "16px",
          fontSize: "12.5px",
          color: "#9aa3b5",
          lineHeight: "1.5",
        }}
      >
        {
          /* TODO: wire to API — pillar models (whole_person / leadership /
            christ_centered) are not yet populated; only the financial
            dimension reflects live portfolio data. */
        }
        Only the financial dimension reflects live data today; the whole-person,
        leadership, and mission pillars are pending model coverage.
      </div>
    </Panel>
  );
}

// ---- Needs review ----------------------------------------------------------

export interface ReviewRow {
  ein: string;
  name: string;
  /** 0–100 score (already below the review threshold). */
  score: number;
  /** Sample YoY delta (negative); real history not yet wired. */
  delta: number;
  /** Sample concern flag. */
  flag: string;
}

const REVIEW_COLS = "2.4fr 1fr 1fr 1.1fr";

/** Table of below-threshold orgs (score, sample Δ YoY, sample flag). */
export function NeedsReviewTable(props: { rows: ReviewRow[] }) {
  return (
    <Panel
      title="Needs review"
      action={{ href: "/reports", label: "View all →" }}
    >
      <div
        class="grid gap-2.5"
        style={{
          gridTemplateColumns: REVIEW_COLS,
          padding: "12px 0",
          borderBottom: "1px solid #eef1f6",
        }}
      >
        {["Organization", "Score", "Δ YoY", "Flag"].map((h, i) => (
          <span
            class="mono uppercase"
            style={{
              fontSize: "10.5px",
              letterSpacing: ".08em",
              color: "#aeb6c7",
              textAlign: i === 0 ? "left" : "right",
            }}
          >
            {h}
          </span>
        ))}
      </div>
      {props.rows.length === 0
        ? (
          <div
            class="text-muted"
            style={{ padding: "22px 0", fontSize: "13.5px" }}
          >
            No organizations are below the review threshold. 🎉
          </div>
        )
        : (
          props.rows.map((r, i) => {
            const band = scoreBand(r.score);
            return (
              <a
                href={`/orgs/${r.ein}`}
                class="grid items-center no-underline"
                style={{
                  gridTemplateColumns: REVIEW_COLS,
                  gap: "10px",
                  padding: "13px 0",
                  borderBottom: i < props.rows.length - 1
                    ? "1px solid #f3f5f9"
                    : "none",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "13.5px",
                      fontWeight: 600,
                      color: "#192A54",
                    }}
                  >
                    {titleCase(r.name)}
                  </div>
                  <div
                    class="mono"
                    style={{
                      fontSize: "11.5px",
                      color: "#9aa3b5",
                      marginTop: "2px",
                    }}
                  >
                    EIN {formatEin(r.ein)}
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2">
                  <span
                    class="mono font-semibold"
                    style={{ fontSize: "14px", color: "#2a2f3a" }}
                  >
                    {r.score}
                  </span>
                  <GradePill value={r.score} band={band} />
                </div>
                {/* TODO: wire to API — real YoY delta from score history. */}
                <div
                  class="mono font-semibold"
                  style={{
                    textAlign: "right",
                    fontSize: "13px",
                    color: "#bf6a3e",
                  }}
                >
                  ▼ {r.delta}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: "#9a6a1c",
                      background: "#f6ecd8",
                      borderRadius: "6px",
                      padding: "3px 8px",
                    }}
                  >
                    {r.flag}
                  </span>
                </div>
              </a>
            );
          })
        )}
    </Panel>
  );
}

// ---- Watchlist -------------------------------------------------------------

/** The follow list with an empty-state, plus a letter-grade key footnote. */
export function Watchlist(props: { following: OrgSummary[] }) {
  const following = props.following;
  return (
    <Panel
      title="Your watchlist"
      action={{ href: "/search", label: "Find more →" }}
    >
      {following.length === 0
        ? (
          <div
            class="text-muted"
            style={{ padding: "8px 0", fontSize: "13.5px", lineHeight: "1.5" }}
          >
            You're not following any organizations yet. Follow orgs from their
            profile to track them here.
            <div class="mt-3">
              <a href="/search" class="btn btn-primary btn-sm">
                Browse organizations
              </a>
            </div>
          </div>
        )
        : (
          <div class="flex flex-col" style={{ gap: "2px" }}>
            {following.slice(0, 6).map((o, i) => (
              <a
                href={`/orgs/${o.ein}`}
                class="flex items-start gap-3 no-underline"
                style={{
                  padding: "11px 0",
                  borderBottom: i < Math.min(5, following.length - 1)
                    ? "1px solid #f3f5f9"
                    : "none",
                }}
              >
                <div
                  class="flex shrink-0 items-center justify-center font-semibold"
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "8px",
                    background: "#192A54",
                    color: "#eef1f7",
                    fontSize: "11px",
                  }}
                >
                  {(o.name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "13.5px",
                      fontWeight: 600,
                      color: "#192A54",
                      lineHeight: "1.35",
                    }}
                  >
                    {titleCase(o.name)}
                  </div>
                  <div
                    class="mono"
                    style={{
                      fontSize: "11.5px",
                      color: "#9aa3b5",
                      marginTop: "3px",
                    }}
                  >
                    {o.org_type
                      ? titleCase(o.org_type)
                      : "EIN " + formatEin(o.ein)}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      {/* Letter-grade key footnote so the band legend is explained once. */}
      <div
        style={{
          marginTop: "18px",
          borderTop: "1px solid #eef1f6",
          paddingTop: "14px",
          fontSize: "11.5px",
          color: "#9aa3b5",
        }}
      >
        Grades: {letterGrade(95)} ≥90 · {letterGrade(85)} 80–89 ·{" "}
        {letterGrade(75)} 70–79 · {letterGrade(50)} below 70.
      </div>
    </Panel>
  );
}

// ---- API-error banner ------------------------------------------------------

/** Muted banner shown when the API could not be reached. */
export function DashboardApiError(props: { message: ComponentChildren }) {
  return (
    <div
      class="mb-6 rounded-md border px-4 py-3 text-sm"
      style={{
        borderColor: "#dde2ec",
        background: "#f1f3f8",
        color: "#6b7488",
      }}
    >
      {props.message}
    </div>
  );
}
