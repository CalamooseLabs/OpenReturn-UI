// ── ModelWalkthrough (island) ───────────────────────────────────────────────
// The centerpiece of the Model Detail page: a 3-column provenance explorer that
// traces a factor from its sub-score → metric → formula → the exact Form 990
// line each input was sourced from.
//
// Ported from the design comp's React-class component (state = { feature, lineId })
// to a Preact island (useState). Real factor data (name / weight / formula /
// inputs / benchmark) comes from the API via props; the per-input Form 990
// Part / Line / Col / page / confidence are NOT exposed by our API yet, so they
// are rendered as faithful SAMPLE values and marked with a provenance TODO.

import { useState } from "preact/hooks";
import { scoreBand } from "../lib/score.ts";

/** One factor, parsed by the route from the API's /scores/factors payload. */
export interface WalkFactor {
  key: string;
  name: string;
  weight: number;
  formulaType: string | null;
  formulaDescription: string | null;
  direction: string | null;
  benchmarkLo: number | null;
  benchmarkHi: number | null;
  /** Concept-code input tokens (parsed from the factor's inputs JSON). */
  inputs: string[];
}

interface Props {
  factors: WalkFactor[];
  /** A representative score 0–100 used to colour the bands (sample). */
  sampleScore?: number;
}

/* ── Sample provenance lookup ──────────────────────────────────────────────
 * Our API does not expose the originating Form 990 Part / Line / Col / page /
 * confidence for a concept code, so we map the common scoring concepts to a
 * plausible citation here. These Part/Line/Col/page/confidence values are
 * SAMPLE and must be replaced once a provenance API exists.
 * TODO: provenance API — replace SAMPLE Part/Line/Col/page/confidence. */
interface SampleLine {
  variable: string;
  value: string;
  filing: string;
  part: string;
  line: string;
  col: string;
  page: string;
  conf: string;
}

const SAMPLE_LINES: Record<string, SampleLine> = {
  // Balance sheet (Part X)
  equity: {
    variable: "Net Assets without Donor Restrictions",
    value: "$1,840,000",
    filing: "2024",
    part: "X",
    line: "27",
    col: "EOY",
    page: "p. 11",
    conf: "99.6%",
  },
  assets: {
    variable: "Total assets",
    value: "$1,860,300",
    filing: "2024",
    part: "X",
    line: "16",
    col: "EOY",
    page: "p. 11",
    conf: "99.7%",
  },
  liabilities: {
    variable: "Total liabilities",
    value: "$74,300",
    filing: "2024",
    part: "X",
    line: "26",
    col: "EOY",
    page: "p. 11",
    conf: "99.5%",
  },
  net_assets: {
    variable: "Total net assets or fund balances",
    value: "$1,786,000",
    filing: "2024",
    part: "X",
    line: "33",
    col: "EOY",
    page: "p. 11",
    conf: "99.6%",
  },
  // Functional expenses (Part IX)
  total_exp: {
    variable: "Total Functional Expenses",
    value: "$1,461,000",
    filing: "2024",
    part: "IX",
    line: "25",
    col: "A",
    page: "p. 10",
    conf: "99.8%",
  },
  cy_exp: {
    variable: "Total Functional Expenses",
    value: "$1,461,000",
    filing: "2024",
    part: "IX",
    line: "25",
    col: "A",
    page: "p. 10",
    conf: "99.8%",
  },
  prog: {
    variable: "Program Service Expenses",
    value: "$1,180,000",
    filing: "2024",
    part: "IX",
    line: "25",
    col: "B",
    page: "p. 10",
    conf: "99.7%",
  },
  prog_exp: {
    variable: "Program Service Expenses",
    value: "$1,180,000",
    filing: "2024",
    part: "IX",
    line: "25",
    col: "B",
    page: "p. 10",
    conf: "99.7%",
  },
  mgmt_exp: {
    variable: "Management & General Expenses",
    value: "$183,000",
    filing: "2024",
    part: "IX",
    line: "25",
    col: "C",
    page: "p. 10",
    conf: "99.4%",
  },
  fund_exp: {
    variable: "Fundraising Expenses",
    value: "$98,000",
    filing: "2024",
    part: "IX",
    line: "25",
    col: "D",
    page: "p. 10",
    conf: "99.4%",
  },
  // Revenue (Part VIII)
  cy_rev: {
    variable: "Total Revenue (current year)",
    value: "$1,287,000",
    filing: "2024",
    part: "VIII",
    line: "12",
    col: "A",
    page: "p. 9",
    conf: "99.5%",
  },
  total_rev: {
    variable: "Total Revenue",
    value: "$1,287,000",
    filing: "2024",
    part: "VIII",
    line: "12",
    col: "A",
    page: "p. 9",
    conf: "99.5%",
  },
  contrib: {
    variable: "Total Contributions & Grants",
    value: "$1,201,000",
    filing: "2024",
    part: "VIII",
    line: "1h",
    col: "A",
    page: "p. 9",
    conf: "99.6%",
  },
  gov_grants: {
    variable: "Government grants (contributions)",
    value: "$19,000",
    filing: "2024",
    part: "VIII",
    line: "1e",
    col: "A",
    page: "p. 9",
    conf: "98.9%",
  },
};

const PART_TITLE: Record<string, string> = {
  VIII: "Statement of Revenue",
  IX: "Statement of Functional Expenses",
  X: "Balance Sheet",
};

/** Fall back to a generic citation for an unmapped concept token. */
function lineFor(token: string): SampleLine {
  return SAMPLE_LINES[token] ?? {
    variable: token,
    value: "—",
    filing: "2024",
    part: "IX",
    line: "25",
    col: "A",
    page: "p. 10",
    conf: "99.0%",
  };
}

/* ── Sample facsimile tables (per Part) — SAMPLE.
 * TODO: provenance API — replace with the real extracted filing rows. */
interface FacRow {
  line: string;
  desc: string;
  cells: string[];
  total?: boolean;
}
interface Facsimile {
  cols: string[];
  colKeys: string[];
  rows: FacRow[];
}

function facsimile(part: string): Facsimile {
  if (part === "IX") {
    return {
      cols: ["(A) Total", "(B) Program", "(C) Mgmt", "(D) Fundraising"],
      colKeys: ["A", "B", "C", "D"],
      rows: [
        {
          line: "5",
          desc: "Compensation of officers & key employees",
          cells: ["412,300", "288,610", "82,460", "41,230"],
        },
        {
          line: "7",
          desc: "Other salaries and wages",
          cells: ["468,900", "375,120", "46,890", "46,890"],
        },
        {
          line: "11",
          desc: "Fees for services (legal, accounting)",
          cells: ["96,400", "72,300", "19,280", "4,820"],
        },
        {
          line: "13",
          desc: "Office expenses",
          cells: ["88,200", "61,740", "17,640", "8,820"],
        },
        {
          line: "24",
          desc: "Other expenses",
          cells: ["395,200", "382,230", "16,730", "−4,760"],
        },
        {
          line: "25",
          desc: "Total functional expenses",
          total: true,
          cells: ["1,461,000", "1,180,000", "183,000", "98,000"],
        },
      ],
    };
  }
  if (part === "X") {
    return {
      cols: ["(A) Beg. of year", "(B) End of year"],
      colKeys: ["BOY", "EOY"],
      rows: [
        { line: "16", desc: "Total assets", cells: ["1,704,000", "1,860,300"] },
        { line: "26", desc: "Total liabilities", cells: ["68,900", "74,300"] },
        {
          line: "27",
          desc: "Net assets without donor restrictions",
          cells: ["1,556,200", "1,840,000"],
        },
        {
          line: "28",
          desc: "Net assets with donor restrictions",
          cells: ["78,900", "(54,000)"],
        },
        {
          line: "33",
          desc: "Total net assets or fund balances",
          total: true,
          cells: ["1,635,100", "1,786,000"],
        },
      ],
    };
  }
  // VIII — Statement of Revenue
  return {
    cols: ["Amount"],
    colKeys: ["A"],
    rows: [
      {
        line: "1e",
        desc: "Government grants (contributions)",
        cells: ["19,000"],
      },
      {
        line: "1f",
        desc: "All other contributions & gifts",
        cells: ["1,182,000"],
      },
      {
        line: "1h",
        desc: "Total contributions. Add 1a–1g",
        total: true,
        cells: ["1,201,000"],
      },
      {
        line: "8a",
        desc: "Gross income from fundraising events",
        cells: ["64,500"],
      },
      { line: "12", desc: "Total revenue", total: true, cells: ["1,287,000"] },
    ],
  };
}

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";

/** A small vertical connector with a labelled chip + down-arrow. */
function Connector(props: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "4px 0",
      }}
    >
      <div style={{ width: "2px", height: "12px", background: "#cfd9e8" }} />
      <div
        style={{
          fontFamily: MONO,
          fontSize: "9.5px",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "#aeb6c7",
          background: "#f4f6fa",
          borderRadius: "5px",
          padding: "3px 9px",
          margin: "2px 0",
        }}
      >
        {props.label}
      </div>
      <div style={{ width: "2px", height: "12px", background: "#cfd9e8" }} />
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          borderTop: "5px solid #cfd9e8",
        }}
      />
    </div>
  );
}

export default function ModelWalkthrough(props: Props) {
  const factors = props.factors;
  const [factorKey, setFactorKey] = useState(factors[0]?.key ?? "");
  const feat = factors.find((f) => f.key === factorKey) ?? factors[0];

  const [lineId, setLineId] = useState<string>(feat?.inputs[0] ?? "");

  if (!feat) {
    return (
      <div
        style={{ padding: "28px 24px", fontSize: "13.5px", color: "#5a6172" }}
      >
        This model has no factor definitions to walk through.
      </div>
    );
  }

  // Sample sub-score for the selected factor (we have no per-org sub-score on
  // this page) — derived from the model-level sample score, weighted.
  // TODO: provenance API — surface the real per-factor sub-score for an org.
  const sampleScore = props.sampleScore ?? 73;
  const pct = Math.max(
    0,
    Math.min(100, Math.round(sampleScore + (feat.weight - 0.25) * 40)),
  );
  const band = scoreBand(pct).hex;

  // Switch factor → reset to its first source line.
  const selectFactor = (k: string) => {
    const f = factors.find((x) => x.key === k);
    setFactorKey(k);
    setLineId(f?.inputs[0] ?? "");
  };

  const sel = lineFor(lineId || feat.inputs[0] || "");
  const num = feat.inputs[0] ? lineFor(feat.inputs[0]) : sel;
  const den = feat.inputs[1] ? lineFor(feat.inputs[1]) : undefined;
  const fac = facsimile(sel.part);

  const benchLabel = (() => {
    const lo = feat.benchmarkLo;
    const hi = feat.benchmarkHi;
    if (lo == null && hi == null) return null;
    if (lo == null) return `up to ${hi}`;
    if (hi == null) return `${lo}+`;
    return `${lo} → ${hi}`;
  })();

  /* ── Left rail: factor selector ─────────────────────────────────────── */
  const rail = (
    <div
      style={{
        borderRight: "1px solid #eef1f6",
        padding: "18px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "10px",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "#aeb6c7",
          padding: "2px 8px 8px",
        }}
      >
        Features
      </div>
      {factors.map((f) => {
        const active = f.key === factorKey;
        const p = Math.max(
          0,
          Math.min(100, Math.round(sampleScore + (f.weight - 0.25) * 40)),
        );
        const b = scoreBand(p).hex;
        return (
          <button
            type="button"
            onClick={() => selectFactor(f.key)}
            style={{
              textAlign: "left",
              border: active ? "1px solid #c4d2ec" : "1px solid transparent",
              background: active ? "#eef2fa" : "transparent",
              borderRadius: "11px",
              padding: "11px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all .12s",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: active ? "#192A54" : "#3a4150",
                  lineHeight: "1.25",
                }}
              >
                {f.name}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "12px",
                  fontWeight: 700,
                  color: b,
                  flexShrink: 0,
                }}
              >
                {(f.weight * 100).toFixed(0)}%
              </span>
            </div>
            {/* mini BandBar */}
            <div
              style={{
                height: "5px",
                borderRadius: "999px",
                background: "#e7ebf2",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${p}%`,
                  background: b,
                  borderRadius: "999px",
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );

  /* ── Middle: lineage chain ──────────────────────────────────────────── */
  const sourceCard = (id: string) => {
    const ln = lineFor(id);
    const active = id === lineId;
    return (
      <button
        type="button"
        onClick={() => setLineId(id)}
        style={{
          textAlign: "left",
          width: "100%",
          cursor: "pointer",
          fontFamily: "inherit",
          background: active ? "#fff" : "#fafbfd",
          border: active ? "1.5px solid #3a5da8" : "1px solid #e2e7f0",
          borderRadius: "12px",
          padding: "13px 15px",
          transition: "all .12s",
          boxShadow: active ? "0 6px 18px -10px rgba(58,93,168,.5)" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#192A54" }}>
            {ln.variable}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: "14px",
              fontWeight: 700,
              color: "#192A54",
              flexShrink: 0,
            }}
          >
            {ln.value}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            flexWrap: "wrap",
          }}
        >
          {/* SAMPLE citation — TODO: provenance API */}
          <span
            style={{
              fontFamily: MONO,
              fontSize: "10.5px",
              color: "#2f4a85",
              background: "#eef2fa",
              borderRadius: "5px",
              padding: "2px 7px",
            }}
          >
            Form 990 · Part {ln.part} · Line {ln.line}
          </span>
          <span
            style={{ fontFamily: MONO, fontSize: "10px", color: "#aeb6c7" }}
          >
            {id}
          </span>
          {active
            ? (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  color: "#3a5da8",
                  fontWeight: 600,
                }}
              >
                ◀ shown
              </span>
            )
            : (
              <span style={{ fontSize: "10.5px", color: "#aeb6c7" }}>
                click to view
              </span>
            )}
        </div>
      </button>
    );
  };

  const chain = (
    <div style={{ padding: "22px" }}>
      {/* stage 1: sub-score */}
      <div
        style={{
          background: "#192A54",
          borderRadius: "14px",
          padding: "18px 20px",
          color: "#eef1f7",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#9fb6e6",
            }}
          >
            Sub-score output
          </span>
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: 700,
              color: "#192A54",
              background: "#9fb6e6",
              borderRadius: "5px",
              padding: "2px 7px",
              fontFamily: MONO,
            }}
          >
            weight {(feat.weight * 100).toFixed(0)}%
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
            {feat.name}
          </span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
            {/* SAMPLE sub-score — TODO: provenance API */}
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "34px",
                lineHeight: "0.85",
                letterSpacing: "-0.02em",
              }}
            >
              {pct}
            </span>
            <span
              style={{
                fontSize: "14px",
                color: "#9fb6e6",
                marginBottom: "3px",
              }}
            >
              / 100
            </span>
          </div>
        </div>
      </div>

      <Connector label="is computed from" />

      {/* stage 2: metric */}
      <div
        style={{
          background: "#f7f9fc",
          border: "1px solid #e7ebf2",
          borderRadius: "14px",
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "6px",
          }}
        >
          <span
            style={{ fontSize: "13.5px", fontWeight: 600, color: "#192A54" }}
          >
            {feat.formulaType ? feat.formulaType.replace(/_/g, " ") : "Metric"}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: "11px",
              color: "#5a6172",
              background: "#eef1f6",
              borderRadius: "5px",
              padding: "2px 8px",
            }}
          >
            {feat.direction
              ? `${feat.direction} is better`
              : "higher is better"}
          </span>
        </div>
        <p
          style={{
            fontSize: "12.5px",
            lineHeight: "1.5",
            color: "#5a6172",
            margin: 0,
            textWrap: "pretty",
          }}
        >
          {feat.formulaDescription ??
            "Computed from the inputs below and normalized against the model's benchmark range."}
        </p>
      </div>

      <Connector label="using formula" />

      {/* stage 3: formula */}
      <div
        style={{
          background: "#fff",
          border: "1px dashed #c4d2ec",
          borderRadius: "14px",
          padding: "18px 20px",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "#aeb6c7",
            marginBottom: "14px",
          }}
        >
          Formula
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          {den
            ? (
              // fraction (ratio-style)
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "12.5px",
                    color: "#3a4150",
                    fontWeight: 600,
                  }}
                >
                  {num.variable}
                </span>
                <div
                  style={{
                    height: "2px",
                    width: "100%",
                    minWidth: "180px",
                    background: "#192A54",
                  }}
                />
                <span
                  style={{
                    fontSize: "12.5px",
                    color: "#3a4150",
                    fontWeight: 600,
                  }}
                >
                  {den.variable}
                </span>
              </div>
            )
            : (
              <span
                style={{ fontSize: "13px", color: "#3a4150", fontWeight: 600 }}
              >
                {num.variable}
              </span>
            )}
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: "22px",
              color: "#9aa3b5",
              fontWeight: 700,
            }}
          >
            →
          </span>
          <div style={{ textAlign: "center" }}>
            {/* SAMPLE result — TODO: provenance API */}
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "26px",
                letterSpacing: "-0.01em",
                color: band,
              }}
            >
              {pct} / 100
            </div>
            <div
              style={{
                fontSize: "10.5px",
                color: "#9aa3b5",
                marginTop: "2px",
                fontFamily: MONO,
              }}
            >
              {benchLabel
                ? `benchmark ${benchLabel}`
                : (feat.formulaType ?? "normalized score")}
            </div>
          </div>
        </div>
      </div>

      <Connector
        label={`sourced from ${feat.inputs.length} input${
          feat.inputs.length === 1 ? "" : "s"
        }`}
      />

      {/* stage 4: source items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {feat.inputs.length ? feat.inputs.map((id) => sourceCard(id)) : (
          <div
            style={{
              fontSize: "12.5px",
              color: "#8893ab",
              fontStyle: "italic",
              padding: "8px 2px",
            }}
          >
            This factor declares no field inputs.
          </div>
        )}
      </div>
    </div>
  );

  /* ── Right: Form 990 facsimile viewer ───────────────────────────────── */
  const gridCols = `34px 1fr ${
    fac.colKeys.map(() => "minmax(74px,auto)").join(" ")
  }`;
  const viewer = (
    <div
      style={{
        background: "#fbfcfe",
        borderLeft: "1px solid #eef1f6",
        padding: "22px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "#aeb6c7",
          }}
        >
          Source Document
        </span>
        {/* SAMPLE page — TODO: provenance API */}
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10.5px",
            color: "#8893ab",
            background: "#eef1f6",
            borderRadius: "5px",
            padding: "2px 8px",
          }}
        >
          {sel.page}
        </span>
      </div>

      {/* form facsimile card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e7f0",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#f4f6fa",
            borderBottom: "1px solid #e7ebf2",
            padding: "13px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "14px",
                color: "#192A54",
              }}
            >
              Form 990
            </span>
            <span
              style={{ fontFamily: MONO, fontSize: "11px", color: "#8893ab" }}
            >
              Tax year {sel.filing}
            </span>
          </div>
          <div
            style={{ fontSize: "11.5px", color: "#5a6172", marginTop: "3px" }}
          >
            Part {sel.part} · {PART_TITLE[sel.part] ?? "Form 990"}
          </div>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <div
            style={{ display: "grid", gridTemplateColumns: gridCols, gap: 0 }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: "9.5px",
                color: "#aeb6c7",
                padding: "0 0 8px",
              }}
            >
              Ln
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "#aeb6c7",
                padding: "0 0 8px",
                fontFamily: MONO,
              }}
            >
              Description
            </div>
            {fac.cols.map((c) => (
              <div
                style={{
                  fontSize: "9.5px",
                  color: "#aeb6c7",
                  padding: "0 0 8px",
                  textAlign: "right",
                  fontFamily: MONO,
                }}
              >
                {c}
              </div>
            ))}
            {fac.rows.map((row) => {
              const isLine = row.line === sel.line;
              return (
                <>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: "11px",
                      color: isLine ? "#192A54" : "#9aa3b5",
                      fontWeight: isLine ? 700 : 400,
                      padding: "8px 0",
                      borderTop: "1px solid #f0f2f7",
                      background: isLine ? "#eef2fa" : "transparent",
                    }}
                  >
                    {row.line}
                  </div>
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: isLine ? "#192A54" : "#5a6172",
                      fontWeight: row.total ? 700 : (isLine ? 600 : 400),
                      padding: "8px 8px 8px 0",
                      borderTop: "1px solid #f0f2f7",
                      background: isLine ? "#eef2fa" : "transparent",
                    }}
                  >
                    {row.desc}
                  </div>
                  {row.cells.map((cell, ci) => {
                    const isCell = isLine && fac.colKeys[ci] === sel.col;
                    return (
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: "11.5px",
                          textAlign: "right",
                          padding: "8px 4px",
                          borderTop: "1px solid #f0f2f7",
                          color: isCell
                            ? "#fff"
                            : (isLine ? "#192A54" : "#7a8398"),
                          fontWeight: isCell || row.total ? 700 : 400,
                          background: isCell
                            ? "#3a5da8"
                            : (isLine ? "#eef2fa" : "transparent"),
                          borderRadius: isCell ? "5px" : "0",
                        }}
                      >
                        {cell}
                      </div>
                    );
                  })}
                </>
              );
            })}
          </div>
        </div>
      </div>

      {/* provenance trail */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e7f0",
          borderRadius: "12px",
          padding: "15px 16px",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "#aeb6c7",
            marginBottom: "12px",
          }}
        >
          Provenance trail
        </div>
        {/* SAMPLE crumbs — TODO: provenance API */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "14px",
          }}
        >
          {[
            `Filing ${sel.filing}`,
            `Part ${sel.part}`,
            `Line ${sel.line}`,
            `Col ${sel.col}`,
          ]
            .map((c, i, arr) => (
              <>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: "11px",
                    color: "#2f4a85",
                    background: "#eef2fa",
                    borderRadius: "6px",
                    padding: "4px 9px",
                  }}
                >
                  {c}
                </span>
                {i < arr.length - 1 && (
                  <span style={{ color: "#cfd9e8", fontSize: "11px" }}>→</span>
                )}
              </>
            ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            padding: "12px 14px",
            background: "#eef6f1",
            border: "1px solid #cfe6da",
            borderRadius: "10px",
            marginBottom: "14px",
          }}
        >
          <span
            style={{ fontSize: "12.5px", color: "#3f6b56", fontWeight: 600 }}
          >
            {sel.variable}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: "15px",
              fontWeight: 700,
              color: "#245f45",
            }}
          >
            {sel.value}
          </span>
        </div>
        {/* SAMPLE extraction meta — TODO: provenance API */}
        <div style={{ display: "flex", gap: "20px" }}>
          <div>
            <div
              style={{
                fontSize: "10px",
                color: "#9aa3b5",
                marginBottom: "3px",
              }}
            >
              Extraction
            </div>
            <div
              style={{ fontSize: "12px", color: "#3a4150", fontWeight: 600 }}
            >
              OCR + schema map
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "10px",
                color: "#9aa3b5",
                marginBottom: "3px",
              }}
            >
              Confidence
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#2f7d5b",
                fontWeight: 700,
                fontFamily: MONO,
              }}
            >
              {sel.conf}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "10px",
                color: "#9aa3b5",
                marginBottom: "3px",
              }}
            >
              Source page
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#3a4150",
                fontWeight: 600,
                fontFamily: MONO,
              }}
            >
              {sel.page}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      class="or-walkthrough"
      style={{ display: "grid", gridTemplateColumns: "236px 1fr 1.02fr" }}
    >
      {rail}
      {chain}
      {viewer}
    </div>
  );
}
