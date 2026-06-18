// ── ModelWalkthrough (island) ───────────────────────────────────────────────
// The centerpiece of the Model Detail page: a 3-column provenance explorer that
// traces a factor from its sub-score → metric → formula → the exact Form 990
// line each input was sourced from.
//
// Wired to GET /scores/debug (via the route): every value, formula, citation,
// canonical source and confidence here is REAL trace data for an example org —
// nothing is invented. The route passes the DebugTrace.factors as props; we
// fall back to "(not available)" only where the trace itself has no source.

import { useState } from "preact/hooks";
import { scoreBand, to100 } from "../lib/score.ts";
import { money } from "../lib/format.ts";
import type { DebugFactor, DebugVariable } from "../lib/api/scores.ts";

interface Props {
  /** Factor traces straight from GET /scores/debug for the example org. */
  factors: DebugFactor[];
  /** The example org traced (for context labels). */
  exampleName?: string | null;
  /** The example org's filing year. */
  exampleYear?: number | null;
}

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";

/** A stable per-factor key for island state. */
function factorKey(f: DebugFactor): string {
  return `f${f.factor_id}`;
}

/** A stable per-variable key for island state. */
function variableKey(v: DebugVariable, i: number): string {
  return `${v.key}#${i}`;
}

/** Format a numeric trace value as currency when it looks like a dollar amount,
 * else a plain number; "—" when absent. */
function fmtValue(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  // Amounts in 990 financials are large integers; ratios are small fractions.
  if (Math.abs(v) >= 1000) return money(v);
  // Keep small numbers readable (ratios / counts) without currency styling.
  return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, "");
}

/** Build a "Form 990 · Part IX · Line 25 · Col B" citation from a variable's source. */
function citationFor(v: DebugVariable): string | null {
  const s = v.source;
  if (!s) return null;
  const parts: string[] = [];
  parts.push(`Form ${s.form?.code ?? "990"}`);
  if (s.part?.number) parts.push(`Part ${s.part.number}`);
  if (s.line?.number) parts.push(`Line ${s.line.number}`);
  if (s.column_code) parts.push(`Col ${s.column_code}`);
  return parts.join(" · ");
}

/** Confidence 0–1 (or 0–100) → a "99.6%" string, or null. */
function confLabel(conf: number | null | undefined): string | null {
  if (conf === null || conf === undefined || isNaN(conf)) return null;
  const pct = conf <= 1.0001 ? conf * 100 : conf;
  return `${pct.toFixed(1)}%`;
}

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
  const [factorK, setFactorK] = useState(
    factors[0] ? factorKey(factors[0]) : "",
  );
  const feat = factors.find((f) => factorKey(f) === factorK) ?? factors[0];

  // The concept variables are the ones with a 990 source to inspect; default to
  // the first concept variable (else the first variable).
  const firstInspectable = (f: DebugFactor | undefined): string => {
    if (!f) return "";
    const idx = f.variables.findIndex((v) => v.kind === "concept");
    const i = idx >= 0 ? idx : 0;
    const v = f.variables[i];
    return v ? variableKey(v, i) : "";
  };

  const [varK, setVarK] = useState<string>(firstInspectable(feat));

  if (!feat) {
    return (
      <div
        style={{ padding: "28px 24px", fontSize: "13.5px", color: "#5a6172" }}
      >
        This model has no factor definitions to walk through.
      </div>
    );
  }

  // Switch factor → reset to its first inspectable variable.
  const selectFactor = (k: string) => {
    const f = factors.find((x) => factorKey(x) === k);
    setFactorK(k);
    setVarK(firstInspectable(f));
  };

  // Selected variable (real trace record).
  const selVar = feat.variables.find((v, i) => variableKey(v, i) === varK) ??
    feat.variables[0];

  // Per-factor sub-score (REAL normalized 0–1 → 0–100).
  const pct = to100(feat.normalized);
  const band = pct !== null ? scoreBand(pct).hex : "#8893ab";

  // The factor's numerator/denominator variables, for the formula fraction.
  const conceptVars = feat.variables.filter((v) => v.kind === "concept");
  const num = conceptVars[0] ?? feat.variables[0];
  const den = conceptVars[1];

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
        const k = factorKey(f);
        const active = k === factorK;
        const p = to100(f.normalized) ?? 0;
        const b = scoreBand(p).hex;
        return (
          <button
            type="button"
            onClick={() => selectFactor(k)}
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
            {/* mini band bar from the REAL normalized sub-score */}
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
  /** A source-variable card (one per trace variable). */
  const variableCard = (v: DebugVariable, i: number) => {
    const k = variableKey(v, i);
    const active = k === varK;
    const isConcept = v.kind === "concept";
    const cite = citationFor(v);
    const label = v.concept ?? v.key;
    const valStr = isConcept
      ? fmtValue(v.value)
      : (v.kind === "literal" ? String(v.raw_value ?? v.value ?? "") : "");

    // Non-concept (factor/model/literal) variables render compactly.
    if (!isConcept) {
      return (
        <button
          type="button"
          onClick={() => setVarK(k)}
          style={{
            textAlign: "left",
            width: "100%",
            cursor: "pointer",
            fontFamily: "inherit",
            background: active ? "#fff" : "#fafbfd",
            border: active ? "1.5px solid #3a5da8" : "1px solid #e2e7f0",
            borderRadius: "12px",
            padding: "10px 14px",
            transition: "all .12s",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "#8893ab",
                background: "#f3f5f9",
                borderRadius: "5px",
                padding: "2px 7px",
              }}
            >
              {v.kind}
            </span>
            <span style={{ fontSize: "12.5px", color: "#3a4150", flex: 1 }}>
              {label}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#192A54",
                flexShrink: 0,
              }}
            >
              {valStr || fmtValue(v.value)}
            </span>
          </div>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setVarK(k)}
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
            {label}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: "14px",
              fontWeight: 700,
              color: v.present === false ? "#aeb6c7" : "#192A54",
              flexShrink: 0,
            }}
          >
            {valStr}
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
          {/* REAL citation from the trace (else the xml_path, else key) */}
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
            {cite ?? v.source?.xml_path ?? v.xml_path ?? v.key}
          </span>
          {v.conflict && (
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                color: "#9a6a1c",
                background: "#f6ecd8",
                borderRadius: "5px",
                padding: "2px 7px",
              }}
            >
              conflict
            </span>
          )}
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

  const benchLabel = feat.normalization ?? null;

  const chain = (
    <div style={{ padding: "22px" }}>
      {/* stage 1: sub-score (REAL normalized × weight) */}
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
            {/* REAL normalized sub-score (0–100) */}
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "34px",
                lineHeight: "0.85",
                letterSpacing: "-0.02em",
              }}
            >
              {pct ?? "—"}
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
            {feat.formula_type
              ? feat.formula_type.replace(/_/g, " ")
              : "Metric"}
          </span>
          {benchLabel && (
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
              {benchLabel}
            </span>
          )}
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
          {feat.formula_description ??
            "Computed from the inputs below and normalized against the model's benchmark range."}
        </p>
      </div>

      <Connector label="using formula" />

      {/* stage 3: formula (REAL formula string + raw value) */}
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
          {feat.formula
            ? (
              <code
                style={{
                  fontFamily: MONO,
                  fontSize: "13px",
                  color: "#3a4150",
                  fontWeight: 600,
                  background: "#f7f9fc",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  maxWidth: "100%",
                  overflowWrap: "anywhere",
                }}
              >
                {feat.formula}
              </code>
            )
            : den
            ? (
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
                  {num?.concept ?? num?.key}
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
                  {den.concept ?? den.key}
                </span>
              </div>
            )
            : (
              <span
                style={{ fontSize: "13px", color: "#3a4150", fontWeight: 600 }}
              >
                {num?.concept ?? num?.key ?? feat.name}
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
            {/* REAL raw value → normalized score */}
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "26px",
                letterSpacing: "-0.01em",
                color: band,
              }}
            >
              {pct ?? "—"} / 100
            </div>
            <div
              style={{
                fontSize: "10.5px",
                color: "#9aa3b5",
                marginTop: "2px",
                fontFamily: MONO,
              }}
            >
              {feat.raw_value !== null
                ? `raw ${fmtValue(feat.raw_value)}`
                : (feat.formula_type ?? "normalized score")}
            </div>
          </div>
        </div>
      </div>

      <Connector
        label={`sourced from ${feat.variables.length} variable${
          feat.variables.length === 1 ? "" : "s"
        }`}
      />

      {/* stage 4: source variables (REAL trace variables) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {feat.variables.length
          ? feat.variables.map((v, i) => variableCard(v, i))
          : (
            <div
              style={{
                fontSize: "12.5px",
                color: "#8893ab",
                fontStyle: "italic",
                padding: "8px 2px",
              }}
            >
              This factor declares no inputs.
            </div>
          )}
      </div>
    </div>
  );

  /* ── Right: 990 source viewer (REAL provenance, no facsimile) ────────── */
  const viewer = <SourceViewer variable={selVar} year={props.exampleYear} />;

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

/** Right column: a faithful panel of the selected variable's REAL 990 source. */
function SourceViewer(
  props: { variable: DebugVariable | undefined; year?: number | null },
) {
  const v = props.variable;
  const isConcept = v?.kind === "concept";
  const src = v?.source ?? null;
  const cite = v ? citationFor(v) : null;
  const conf = confLabel(v?.confidence);

  return (
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
        {props.year && (
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
            Tax year {props.year}
          </span>
        )}
      </div>

      {/* form source card */}
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
              {`Form ${src?.form?.code ?? "990"}`}
            </span>
            {v?.canonical_source && (
              <span
                style={{ fontFamily: MONO, fontSize: "11px", color: "#8893ab" }}
              >
                {v.canonical_source}
              </span>
            )}
          </div>
          <div
            style={{ fontSize: "11.5px", color: "#5a6172", marginTop: "3px" }}
          >
            {src?.part?.number
              ? `Part ${src.part.number}${
                src.part.name ? ` · ${src.part.name}` : ""
              }`
              : (isConcept ? "Schema location pending" : "Computed input")}
          </div>
        </div>

        {/* the located line/value */}
        <div style={{ padding: "16px" }}>
          {isConcept && (src || v?.xml_path)
            ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    rowGap: "9px",
                    columnGap: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <SrcRow label="Concept" value={v?.concept ?? v?.key ?? "—"} />
                  {src?.box_label && (
                    <SrcRow label="Field" value={src.box_label} />
                  )}
                  {(src?.part?.number || src?.line?.number) && (
                    <SrcRow
                      label="Location"
                      value={[
                        src?.part?.number ? `Part ${src.part.number}` : null,
                        src?.line?.number ? `Line ${src.line.number}` : null,
                        src?.column_code ? `Col ${src.column_code}` : null,
                      ].filter(Boolean).join(" · ") || "—"}
                    />
                  )}
                  <SrcRow
                    label="XPath"
                    value={src?.xml_path ?? v?.xml_path ?? "—"}
                    mono
                  />
                </div>
                {/* located value */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "12px 14px",
                    background: v?.present === false ? "#f3f5f9" : "#eef6f1",
                    border: `1px solid ${
                      v?.present === false ? "#e2e7f0" : "#cfe6da"
                    }`,
                    borderRadius: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12.5px",
                      color: v?.present === false ? "#8893ab" : "#3f6b56",
                      fontWeight: 600,
                    }}
                  >
                    {v?.present === false ? "Not reported" : "Reported value"}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: "15px",
                      fontWeight: 700,
                      color: v?.present === false ? "#aeb6c7" : "#245f45",
                    }}
                  >
                    {fmtValue(v?.value)}
                  </span>
                </div>
              </>
            )
            : (
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#8893ab",
                  lineHeight: "1.6",
                }}
              >
                {v
                  ? (
                    <>
                      <span style={{ fontWeight: 600, color: "#5a6172" }}>
                        {v.kind === "literal"
                          ? "Literal constant"
                          : v.kind === "factor"
                          ? "Derived from another factor"
                          : v.kind === "model"
                          ? "Derived from a child model"
                          : "Source"}
                      </span>{" "}
                      — {v.concept ?? v.key}: {fmtValue(v.value)}
                      <br />
                      <span style={{ color: "#aeb6c7" }}>
                        (not available) — no Form 990 line backs this input.
                      </span>
                    </>
                  )
                  : "Select a variable to view its source."}
              </div>
            )}
        </div>
      </div>

      {/* provenance trail (REAL crumbs from the trace) */}
      {isConcept && cite && (
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "6px",
              marginBottom: conf || v?.canonical_source ? "14px" : "0",
            }}
          >
            {[
              props.year ? `Filing ${props.year}` : null,
              src?.part?.number ? `Part ${src.part.number}` : null,
              src?.line?.number ? `Line ${src.line.number}` : null,
              src?.column_code ? `Col ${src.column_code}` : null,
            ]
              .filter((c): c is string => Boolean(c))
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
                    <span style={{ color: "#cfd9e8", fontSize: "11px" }}>
                      →
                    </span>
                  )}
                </>
              ))}
          </div>
          {(conf || v?.canonical_source || v?.conflict) && (
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              {v?.canonical_source && (
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#9aa3b5",
                      marginBottom: "3px",
                    }}
                  >
                    Canonical source
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#3a4150",
                      fontWeight: 600,
                    }}
                  >
                    {v.canonical_source}
                  </div>
                </div>
              )}
              {conf && (
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
                    {conf}
                  </div>
                </div>
              )}
              {v?.conflict && (
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#9aa3b5",
                      marginBottom: "3px",
                    }}
                  >
                    Status
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#9a6a1c",
                      fontWeight: 700,
                    }}
                  >
                    Conflicting sources
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A label/value row in the source grid. */
function SrcRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <span
        style={{ fontSize: "11px", color: "#9aa3b5", whiteSpace: "nowrap" }}
      >
        {props.label}
      </span>
      <span
        style={{
          fontSize: props.mono ? "11px" : "12.5px",
          color: "#3a4150",
          fontWeight: props.mono ? 400 : 600,
          fontFamily: props.mono ? MONO : "inherit",
          overflowWrap: "anywhere",
          textAlign: "right",
        }}
      >
        {props.value}
      </span>
    </>
  );
}
