// ── Organism: ComparisonTable ────────────────────────────────────────────────
// The two bespoke result tables of the /compare screen (Brad-Frost atomic
// layering). Both take plain data props — no fetching.
//
//   HeadToHeadTable — mode 2: several orgs head-to-head on one model
//                     (org header row → overall score → pillar rows → financials).
//   ModelsTable     — mode 1: one org's scores across every model.
//
// Composed from atoms (BandBar / GradePill) + molecules (EmptyState) and the
// score/format lib helpers.

import { BandBar, GradePill } from "../atoms.tsx";
import { EmptyState } from "../molecules.tsx";
import { formatEin, money, scorePct } from "../../lib/format.ts";
import { scoreBand, to100 } from "../../lib/score.ts";
import type { ScoreRow } from "../../lib/types.ts";

// ---- shared types ------------------------------------------------------------

/** One scoring pillar, keyed by model TYPE (mirrors the design comp). */
export interface ComparePillar {
  key: string;
  label: string;
  types: string[];
}

/** A single org column in the head-to-head table. */
export interface OrgColumn {
  ein: string;
  name: string;
  city: string;
  initials: string;
  /** latest 0–1 total_score on the chosen model. */
  total_score: number | null;
  imputed: boolean;
  missing: boolean;
  year?: number | null;
  /** pillar key -> 0–100 score (or null if that model type has no data). */
  pillars: Record<string, number | null>;
  /** financial row label -> raw value (or null). */
  fin: Record<string, number | null>;
}

// ---- shared layout helpers ---------------------------------------------------

/** Avatar background per column (navy, blue, slate — mirrors the comp). */
const AVATAR_BG = ["#192a54", "#3a5da8", "#6b7488", "#2f7d5b", "#c98a2b"];

/** The grid template for the comparison table: metric label + N org columns. */
function gridCols(n: number): string {
  return `1.3fr ${Array(n).fill("1fr").join(" ")}`;
}

// ---- FinRow ------------------------------------------------------------------

/** A financials row: label + one mono value per org column, with BEST badges. */
export function FinRow(props: {
  label: string;
  cols: OrgColumn[];
  n: number;
  colBg: (i: number) => string;
  render: (c: OrgColumn) => string;
  bestOf: (c: OrgColumn) => boolean;
  last?: boolean;
}) {
  return (
    <div
      class="grid items-stretch"
      style={{
        gridTemplateColumns: gridCols(props.n),
        borderBottom: props.last ? "none" : "1px solid #f0f2f7",
      }}
    >
      <div
        class="flex items-center"
        style={{
          padding: "15px 24px",
          fontSize: "13.5px",
          fontWeight: 500,
          color: "#3a4150",
        }}
      >
        {props.label}
      </div>
      {props.cols.map((c, i) => (
        <div
          class="flex items-center justify-center gap-2 text-center"
          style={{
            padding: "15px 20px",
            background: props.colBg(i),
            borderLeft: "1px solid #f0f2f7",
          }}
        >
          <span
            class="mono font-semibold"
            style={{ fontSize: "14.5px", color: "#2a2f3a" }}
          >
            {props.render(c)}
          </span>
          {props.bestOf(c) && (
            <span
              class="mono font-bold"
              style={{
                fontSize: "9px",
                color: "#2f7d5b",
                background: "#e3efe7",
                borderRadius: "4px",
                padding: "2px 5px",
              }}
            >
              BEST
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- HeadToHeadTable (mode 2) ------------------------------------------------

/** Several orgs head-to-head on one model. */
export function HeadToHeadTable(props: {
  modelLabel: string;
  cols: OrgColumn[];
  pillars: ComparePillar[];
  finRows: { label: string; concepts: string[] }[];
  hasFin: boolean;
  finYear?: number;
}) {
  const { cols, pillars } = props;
  const n = cols.length;

  // Highlight tint for the first org column.
  const colBg = (i: number) => (i === 0 ? "#f5f7fb" : "transparent");

  // Pre-compute the per-pillar column max for "BEST" badges.
  const pillarMax: Record<string, number | null> = {};
  for (const pl of pillars) {
    const vals = cols
      .map((c) => c.pillars[pl.key])
      .filter((v): v is number => v !== null);
    pillarMax[pl.key] = vals.length ? Math.max(...vals) : null;
  }

  return (
    <div class="mb-2">
      {/* Head-to-head · Model vN */}
      <h2 class="section-title mb-3">
        Head-to-head · {props.modelLabel}
      </h2>
      {n === 0
        ? (
          <EmptyState
            title="No organizations to compare"
            hint="Enter at least one valid EIN and pick a model."
          />
        )
        : (
          <div
            class="overflow-hidden bg-white"
            style={{
              border: "1px solid #dde2ec",
              borderRadius: "18px",
              boxShadow: "0 1px 2px rgba(25,42,84,.04)",
            }}
          >
            {/* org header row */}
            <div
              class="grid"
              style={{
                gridTemplateColumns: gridCols(n),
                borderBottom: "1px solid #e7ebf2",
              }}
            >
              <div class="flex items-end" style={{ padding: "22px 24px" }}>
                <span
                  class="mono uppercase"
                  style={{
                    fontSize: "11px",
                    letterSpacing: ".1em",
                    color: "#aeb6c7",
                  }}
                >
                  Metric
                </span>
              </div>
              {cols.map((c, i) => (
                <a
                  href={`/orgs/${c.ein}`}
                  class="block text-center no-underline"
                  style={{
                    padding: "22px 20px",
                    background: colBg(i),
                    borderLeft: "1px solid #e7ebf2",
                    borderTop: i === 0 ? "3px solid #192a54" : undefined,
                  }}
                >
                  <div
                    class="mx-auto mb-3 flex items-center justify-center font-display font-bold text-white"
                    style={{
                      width: "46px",
                      height: "46px",
                      borderRadius: "12px",
                      background: AVATAR_BG[i % AVATAR_BG.length],
                      fontSize: "16px",
                    }}
                  >
                    {c.initials}
                  </div>
                  <div
                    class="font-bold text-navy"
                    style={{ fontSize: "14px", lineHeight: "1.25" }}
                  >
                    {c.name}
                  </div>
                  <div
                    class="mt-1"
                    style={{ fontSize: "11px", color: "#9aa3b5" }}
                  >
                    {c.city || formatEin(c.ein)}
                  </div>
                </a>
              ))}
            </div>

            {/* overall score row */}
            <div
              class="grid"
              style={{
                gridTemplateColumns: gridCols(n),
                borderBottom: "1px solid #f0f2f7",
                background: "#fbfcfe",
              }}
            >
              <div
                class="flex items-center font-semibold"
                style={{
                  padding: "20px 24px",
                  fontSize: "13.5px",
                  color: "#3a4150",
                }}
              >
                Overall score
              </div>
              {cols.map((c, i) => {
                const v = to100(c.total_score);
                const has = v !== null;
                const band = has ? scoreBand(v) : null;
                return (
                  <div
                    class="text-center"
                    style={{
                      padding: "18px 20px",
                      background: colBg(i),
                      borderLeft: "1px solid #f0f2f7",
                    }}
                  >
                    <div
                      class="font-display font-bold"
                      style={{
                        fontSize: "38px",
                        lineHeight: "0.9",
                        letterSpacing: "-0.02em",
                        color: band ? band.hex : "#aeb6c7",
                      }}
                    >
                      {has ? v : "—"}
                    </div>
                    <div class="mt-2 flex items-center justify-center gap-1.5">
                      {has ? <GradePill value={v} /> : (
                        <span
                          class="mono"
                          style={{ fontSize: "10px", color: "#9aa3b5" }}
                        >
                          Pending
                        </span>
                      )}
                      {c.imputed && has && (
                        <span class="badge badge-amber">Est.</span>
                      )}
                    </div>
                    <div
                      class="mono mt-1"
                      style={{ fontSize: "10.5px", color: "#9aa3b5" }}
                    >
                      {scorePct(c.total_score)}
                      {c.year ? ` · ${c.year}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* dimension (pillar) rows */}
            {pillars.map((pl) => {
              const max = pillarMax[pl.key];
              return (
                <div
                  class="grid items-stretch"
                  style={{
                    gridTemplateColumns: gridCols(n),
                    borderBottom: "1px solid #f0f2f7",
                  }}
                >
                  <div
                    class="flex items-center"
                    style={{
                      padding: "16px 24px",
                      fontSize: "13.5px",
                      fontWeight: 500,
                      color: "#3a4150",
                    }}
                  >
                    {pl.label}
                  </div>
                  {cols.map((c, i) => {
                    const v = c.pillars[pl.key];
                    const has = v !== null;
                    const isBest = has && max !== null && v === max && n > 1;
                    return (
                      <div
                        class="flex flex-col justify-center gap-2"
                        style={{
                          padding: "14px 20px",
                          background: colBg(i),
                          borderLeft: "1px solid #f0f2f7",
                        }}
                      >
                        <div class="flex items-center justify-center gap-2">
                          <span
                            class="mono font-semibold"
                            style={{
                              fontSize: "16px",
                              color: has ? "#192a54" : "#aeb6c7",
                            }}
                          >
                            {has ? v : "—"}
                          </span>
                          {isBest && (
                            <span
                              class="mono font-bold"
                              style={{
                                fontSize: "9px",
                                color: "#2f7d5b",
                                background: "#e3efe7",
                                borderRadius: "4px",
                                padding: "2px 5px",
                              }}
                            >
                              BEST
                            </span>
                          )}
                        </div>
                        {has ? <BandBar value={v} /> : (
                          <div
                            class="mono text-center uppercase"
                            style={{
                              fontSize: "9px",
                              letterSpacing: ".1em",
                              color: "#aeb6c7",
                            }}
                          >
                            Pending
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* financials section */}
            {props.hasFin && (
              <>
                <div
                  class="grid"
                  style={{
                    gridTemplateColumns: gridCols(n),
                    borderBottom: "1px solid #f0f2f7",
                    background: "#f5f7fb",
                  }}
                >
                  <div
                    class="mono uppercase"
                    style={{
                      gridColumn: "1 / -1",
                      padding: "13px 24px",
                      fontSize: "10.5px",
                      letterSpacing: ".1em",
                      color: "#8893ab",
                    }}
                  >
                    Financials{props.finYear ? ` · FY${props.finYear}` : ""}
                  </div>
                </div>
                {props.finRows.map((fr) => {
                  const numeric = cols
                    .map((c) => c.fin[fr.label])
                    .filter((v): v is number => v !== null);
                  const best = numeric.length ? Math.max(...numeric) : null;
                  return (
                    <FinRow
                      label={fr.label}
                      cols={cols}
                      n={n}
                      colBg={colBg}
                      render={(c) => money(c.fin[fr.label])}
                      bestOf={(c) =>
                        c.fin[fr.label] !== null &&
                        c.fin[fr.label] === best && n > 1}
                    />
                  );
                })}
                {(() => {
                  const ratios = cols
                    .map((c) => c.fin["Program ratio"])
                    .filter((v): v is number => v !== null);
                  const best = ratios.length ? Math.max(...ratios) : null;
                  return (
                    <FinRow
                      label="Program ratio"
                      cols={cols}
                      n={n}
                      colBg={colBg}
                      last
                      render={(c) => {
                        const v = c.fin["Program ratio"];
                        return v === null ? "—" : v.toFixed(1) + "%";
                      }}
                      bestOf={(c) =>
                        c.fin["Program ratio"] !== null &&
                        c.fin["Program ratio"] === best && n > 1}
                    />
                  );
                })()}
              </>
            )}
          </div>
        )}
    </div>
  );
}

// ---- ModelsTable (mode 1) ----------------------------------------------------

/** One org's scores across every model. */
export function ModelsTable(props: {
  heading: string;
  orgEin: string;
  scores: ScoreRow[];
}) {
  const { scores } = props;
  return (
    <div>
      <h2 class="section-title mb-3">
        {props.heading}
        <a
          href={`/orgs/${props.orgEin}`}
          class="link ml-3 text-sm font-normal normal-case tracking-normal"
        >
          View organization →
        </a>
      </h2>
      {scores.length === 0
        ? (
          <EmptyState
            title="No scores for this organization"
            hint="No scored models for the selected year. Try another year or check the EIN."
          />
        )
        : (
          <div
            class="overflow-hidden bg-white"
            style={{
              border: "1px solid #dde2ec",
              borderRadius: "18px",
              boxShadow: "0 1px 2px rgba(25,42,84,.04)",
            }}
          >
            {scores.map((s, i) => {
              const v = to100(s.total_score);
              const has = v !== null;
              return (
                <div
                  class="grid items-center gap-4"
                  style={{
                    gridTemplateColumns: "1.2fr 2fr auto auto",
                    padding: "16px 24px",
                    borderBottom: i < scores.length - 1
                      ? "1px solid #f0f2f7"
                      : "none",
                  }}
                >
                  <span
                    class="font-semibold text-navy"
                    style={{ fontSize: "14px" }}
                  >
                    Model v{s.model_version}
                  </span>
                  {has
                    ? <BandBar value={v} height={8} />
                    : <span class="text-faint">—</span>}
                  <span class="mono text-right" style={{ minWidth: "78px" }}>
                    <span
                      class="font-semibold"
                      style={{
                        fontSize: "16px",
                        color: has ? scoreBand(v).hex : "#aeb6c7",
                      }}
                    >
                      {has ? v : "—"}
                    </span>
                    <span
                      class="ml-2"
                      style={{ fontSize: "11px", color: "#9aa3b5" }}
                    >
                      {scorePct(s.total_score)}
                    </span>
                  </span>
                  <span class="flex items-center gap-1.5">
                    {has && <GradePill value={v} />}
                    {s.imputed && <span class="badge badge-amber">Est.</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
