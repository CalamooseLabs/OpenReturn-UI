// ── Island: FinancialTabs ────────────────────────────────────────────────────
// The org-profile "Financial picture" card with two views the user toggles
// client-side: an Overview (latest-year KPI figures + the score-trend chart) and
// a Table of canonical financial facts by year (every concept we hold, one column
// per filing year). All data is loaded server-side and passed as plain props —
// the island only owns the active-tab state.

import { useState } from "preact/hooks";
import { Fragment } from "preact";
import { moneyCompact } from "../lib/format.ts";
import {
  ScoreTrendChart,
  seriesFromHistory,
} from "../components/organisms/ScoreTrendChart.tsx";
import type { ScoreHistoryRow } from "../lib/types.ts";

/** One financial-concept row of the by-year table (values aligned to `years`). */
export interface FinTableRow {
  code: string;
  label: string;
  category?: string | null;
  values: (number | null)[];
}

/** Concept categories → section headings, in display order (MinistryWatch-style:
 * revenue, expenses, then balance sheet). Anything else falls under "Other". */
const SECTIONS: { key: string; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "expense", label: "Expenses" },
  { key: "balance", label: "Balance sheet" },
  { key: "other", label: "Other" },
];

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

function TabButton(
  props: { active: boolean; onClick: () => void; children: string },
) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="mono rounded-full font-semibold transition-colors"
      style={{
        border: "1px solid",
        borderColor: props.active ? "#2f4a85" : "var(--color-line)",
        background: props.active ? "#2f4a85" : "transparent",
        color: props.active ? "#fff" : "#6b7488",
        padding: "5px 14px",
        fontSize: "12px",
      }}
    >
      {props.children}
    </button>
  );
}

export default function FinancialTabs(props: {
  revenue: number | null;
  expenses: number | null;
  netAssets: number | null;
  programRatio: number | null;
  trend: ScoreHistoryRow[];
  years: number[];
  rows: FinTableRow[];
}) {
  const [tab, setTab] = useState<"overview" | "table">("overview");
  const haveTrend = props.trend.length >= 2;
  const haveTable = props.years.length > 0 && props.rows.length > 0;

  return (
    <div class="card" style={{ borderRadius: "20px", padding: "26px" }}>
      <div
        class="flex flex-wrap items-center justify-between gap-3"
        style={{ marginBottom: "20px" }}
      >
        <h2
          class="font-display font-bold text-navy"
          style={{ fontSize: "18px", letterSpacing: "-0.01em", margin: 0 }}
        >
          Financial picture
        </h2>
        <div class="flex gap-2">
          <TabButton
            active={tab === "overview"}
            onClick={() => setTab("overview")}
          >
            Overview
          </TabButton>
          <TabButton active={tab === "table"} onClick={() => setTab("table")}>
            By year
          </TabButton>
        </div>
      </div>

      {tab === "overview"
        ? (
          <>
            <div
              class="grid"
              style={{
                gridTemplateColumns: "1fr 1fr",
                gap: "20px 16px",
                marginBottom: "24px",
              }}
            >
              <Kpi label="Total revenue" value={moneyCompact(props.revenue)} />
              <Kpi
                label="Total expenses"
                value={moneyCompact(props.expenses)}
              />
              <Kpi label="Net assets" value={moneyCompact(props.netAssets)} />
              <Kpi
                label="Program ratio"
                value={props.programRatio !== null
                  ? `${props.programRatio.toFixed(1)}%`
                  : "—"}
                accent
              />
            </div>
            {haveTrend
              ? (
                <>
                  <div
                    class="text-muted"
                    style={{ fontSize: "12px", marginBottom: "8px" }}
                  >
                    Score trend · {props.trend[0].year} →{" "}
                    {props.trend[props.trend.length - 1].year}
                  </div>
                  <ScoreTrendChart
                    series={[
                      seriesFromHistory("Overall", "#3a5da8", props.trend),
                    ]}
                    area
                    compact
                  />
                </>
              )
              : (
                <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
                  Not enough scored history to chart a trend yet.
                </p>
              )}
          </>
        )
        : haveTable
        ? (
          <div style={{ overflowX: "auto" }}>
            <table class="table" style={{ fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Item</th>
                  {props.years.map((y) => (
                    <th key={y} class="mono" style={{ textAlign: "right" }}>
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((sec) => {
                  const known = new Set(["revenue", "expense", "balance"]);
                  const secRows = props.rows.filter((r) => {
                    const cat = r.category && known.has(r.category)
                      ? r.category
                      : "other";
                    return cat === sec.key;
                  });
                  if (secRows.length === 0) return null;
                  return (
                    <Fragment key={sec.key}>
                      <tr>
                        <th
                          colSpan={props.years.length + 1}
                          class="section-title"
                          style={{
                            textAlign: "left",
                            paddingTop: "14px",
                            color: "#6b7488",
                          }}
                        >
                          {sec.label}
                        </th>
                      </tr>
                      {secRows.map((r) => (
                        <tr key={r.code}>
                          <td class="text-navy" style={{ fontWeight: 600 }}>
                            {r.label}
                          </td>
                          {r.values.map((v, i) => (
                            <td
                              key={i}
                              class="mono text-muted"
                              style={{ textAlign: "right" }}
                            >
                              {v === null ? "—" : moneyCompact(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
        : (
          <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
            No canonical financial data on record yet.
          </p>
        )}
    </div>
  );
}
