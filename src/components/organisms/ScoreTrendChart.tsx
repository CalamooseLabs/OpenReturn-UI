// ── Organism: ScoreTrendChart ────────────────────────────────────────────────
// A server-rendered SVG line chart of one or more orgs' overall-score history
// over filing years (0–100 band). Used compact inside the org-profile financial
// card (single series, area fill) and full-size on /compare (one line per org,
// head-to-head over time).
//
// Pure SVG, no client JS: points carry a native <title> so hovering shows the
// year + score (and an "estimated" note for imputed years). The viewBox scales
// UNIFORMLY (no preserveAspectRatio="none") so the axis text isn't distorted.

import type { ScoreHistoryRow } from "../../lib/types.ts";
import { to100 } from "../../lib/score.ts";

/** One plotted year: value is already 0–100 (null = no score that year). */
export interface TrendPoint {
  year: number;
  value: number | null;
  imputed?: boolean;
  sourceYear?: number | null;
}

/** A named line: an org (multi-series) or the single overall-score history. */
export interface TrendSeries {
  label: string;
  color: string;
  points: TrendPoint[];
}

/** Distinct, theme-aligned line colours for the head-to-head (cycled). */
export const SERIES_COLORS = [
  "#3a5da8", // blue (primary)
  "#2f7d5b", // green
  "#c98a2b", // amber
  "#bf6a3e", // terracotta
  "#7d5ba6", // violet
  "#2b8a9a", // teal
];

/** Build a single series from a /scores/history payload (rows → 0–100 points). */
export function seriesFromHistory(
  label: string,
  color: string,
  rows: ScoreHistoryRow[],
): TrendSeries {
  const points = [...rows]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: r.year,
      value: to100(r.total_score),
      imputed: r.imputed,
      sourceYear: r.source_year ?? null,
    }));
  return { label, color, points };
}

function fmtVal(v: number | null): string {
  return v === null ? "—" : String(v);
}

/**
 * @param series   one or more lines to plot
 * @param area     fill under the line (single-series only; ignored for ≥2)
 * @param compact  smaller viewBox + type for an in-card slot
 * @param maxWidth cap the rendered width (px); the SVG scales uniformly below it
 */
export function ScoreTrendChart(props: {
  series: TrendSeries[];
  area?: boolean;
  compact?: boolean;
  maxWidth?: number;
}) {
  const series = props.series.filter((s) => s.points.length > 0);
  if (series.length === 0) return null;

  const compact = props.compact ?? false;
  const multi = series.length > 1;

  // ---- viewBox + plot rectangle -------------------------------------------
  const VW = compact ? 470 : 620;
  const VH = compact ? 150 : 220;
  const m = {
    top: compact ? 12 : 16,
    right: compact ? 12 : 16,
    bottom: compact ? 24 : 30,
    left: compact ? 28 : 32,
  };
  const plotW = VW - m.left - m.right;
  const plotH = VH - m.top - m.bottom;
  const fs = compact ? 10 : 11.5;

  // ---- scales --------------------------------------------------------------
  const years = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.year))),
  ].sort((a, b) => a - b);
  const minY = years[0];
  const maxY = years[years.length - 1];
  const span = maxY - minY;
  const x = (year: number) =>
    span === 0 ? m.left + plotW / 2 : m.left + ((year - minY) / span) * plotW;
  // Score axis is the fixed 0–100 band, with a little headroom.
  const y = (v: number) =>
    m.top + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;

  // ---- y gridlines (0/25/50/75/100; label 0/50/100) ------------------------
  const gridVals = [0, 25, 50, 75, 100];

  // ---- x tick years (thin to ≤ ~8 to avoid label collisions) ---------------
  const maxTicks = compact ? 6 : 9;
  const step = Math.ceil(years.length / maxTicks);
  const tickYears = years.filter(
    (_yr, i) => i % step === 0 || i === years.length - 1,
  );

  return (
    <div
      style={{ maxWidth: props.maxWidth ? `${props.maxWidth}px` : undefined }}
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        style={{ display: "block", height: "auto", overflow: "visible" }}
        role="img"
        aria-label="Score trend over filing years"
      >
        {/* y gridlines + labels */}
        {gridVals.map((gv) => (
          <g key={`g${gv}`}>
            <line
              x1={m.left}
              x2={VW - m.right}
              y1={y(gv)}
              y2={y(gv)}
              stroke="#e6eaf1"
              stroke-width="1"
            />
            {(gv === 0 || gv === 50 || gv === 100) && (
              <text
                x={m.left - 6}
                y={y(gv) + fs * 0.34}
                text-anchor="end"
                font-size={fs}
                fill="#8893ab"
                class="mono"
              >
                {gv}
              </text>
            )}
          </g>
        ))}

        {/* x tick year labels */}
        {tickYears.map((yr) => (
          <text
            key={`x${yr}`}
            x={x(yr)}
            y={VH - m.bottom + fs * 1.4}
            text-anchor="middle"
            font-size={fs}
            fill="#8893ab"
            class="mono"
          >
            {yr}
          </text>
        ))}

        {/* one path (+ optional area) + points per series */}
        {series.map((s, si) => {
          // Break the line at null values into contiguous segments.
          const segs: TrendPoint[][] = [];
          let cur: TrendPoint[] = [];
          for (const p of s.points) {
            if (p.value === null) {
              if (cur.length) segs.push(cur);
              cur = [];
            } else cur.push(p);
          }
          if (cur.length) segs.push(cur);

          const d = segs
            .map((seg) =>
              seg
                .map((p, i) =>
                  `${i === 0 ? "M" : "L"}${x(p.year)},${y(p.value as number)}`
                )
                .join(" ")
            )
            .join(" ");

          const drawArea = props.area && !multi && segs.length === 1 &&
            segs[0].length > 1;
          const areaD = drawArea
            ? `${d} L${x(segs[0][segs[0].length - 1].year)},${m.top + plotH} L${
              x(segs[0][0].year)
            },${m.top + plotH} Z`
            : "";

          const last = s.points[s.points.length - 1];

          return (
            <g key={`s${si}`}>
              {drawArea && <path d={areaD} fill={`${s.color}22`} />}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                stroke-width={compact ? 2.5 : 2.25}
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              {s.points.filter((p) => p.value !== null).map((p, i) => {
                const isLast = p.year === last.year;
                const r = isLast ? (compact ? 4.5 : 4) : (compact ? 3.5 : 3.25);
                return (
                  <circle
                    key={`p${i}`}
                    cx={x(p.year)}
                    cy={y(p.value as number)}
                    r={r}
                    fill={p.imputed ? "#ffffff" : s.color}
                    stroke={s.color}
                    stroke-width={p.imputed ? 2 : 0}
                  >
                    <title>
                      {`${multi ? `${s.label} · ` : ""}${p.year}: ${
                        fmtVal(p.value)
                      }${
                        p.imputed
                          ? ` (estimated${
                            p.sourceYear ? ` from ${p.sourceYear}` : ""
                          })`
                          : ""
                      }`}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* legend (multi-series) */}
      {multi && (
        <div
          class="mono flex flex-wrap"
          style={{ gap: "14px", marginTop: "12px", fontSize: "12px" }}
        >
          {series.map((s, i) => (
            <span
              key={`l${i}`}
              class="inline-flex items-center"
              style={{ gap: "6px", color: "#454b58" }}
            >
              <span
                style={{
                  width: "11px",
                  height: "11px",
                  borderRadius: "3px",
                  background: s.color,
                  display: "inline-block",
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
