// ── Model Detail — the provenance walkthrough ────────────────────────────────
// The centerpiece screen: open a scoring model and walk its logic from the
// headline score down to the exact Form 990 line each input was sourced from.
//
// COMP: "OpenReturn - Model Detail.dc.html" (README §7). The 3-column explorer
// is the ModelWalkthrough island; this route renders the breadcrumb, model
// header card, score-composition bar + legend, and the walkthrough shell.

import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/Layout.tsx";
import { titleCase } from "../../lib/format.ts";
import { scoreBand } from "../../lib/score.ts";
import ModelWalkthrough, {
  type WalkFactor,
} from "../../islands/ModelWalkthrough.tsx";
import type {
  FactorDef,
  FactorsResponse,
  ModelSummary,
  TemplateSummary,
} from "../../lib/types.ts";

interface Data {
  version: number;
  factors?: FactorsResponse;
  factorsError?: string;
  // Best-effort model metadata for the header (name / kind), tolerated.
  modelName?: string;
  modelKind?: string;
  modelDescription?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const raw = ctx.params.version;
    if (!/^\d+$/.test(raw)) {
      return page<Data>({ version: 0, factorsError: "Unknown model version." });
    }
    const version = parseInt(raw, 10);

    let factors: FactorsResponse | undefined;
    let factorsError: string | undefined;
    try {
      factors = await api.scores.factors(version);
    } catch (err) {
      only(err);
      factorsError = err instanceof Error
        ? err.message
        : "Failed to load model factors.";
    }

    // Model name / kind / description: prefer the admin registry (richer), else
    // the public template catalog. Both are tolerated (the page works without).
    const [tplR, modelsR] = await Promise.allSettled([
      api.templates.list(),
      api.admin.listModels(),
    ]);
    if (tplR.status === "rejected") only(tplR.reason);
    // listModels may 403 for non-admins — only re-throw a genuine 401.
    if (modelsR.status === "rejected") only(modelsR.reason);

    let modelName: string | undefined;
    let modelKind: string | undefined = factors?.model_kind ?? undefined;
    let modelDescription: string | undefined;

    if (modelsR.status === "fulfilled") {
      const m = (modelsR.value.models ?? []).find((x: ModelSummary) =>
        x.version === version
      );
      if (m) {
        modelDescription = m.description ?? undefined;
        modelKind = m.model_kind ?? modelKind;
        modelName = m.description ?? undefined;
      }
    }
    if (!modelName && tplR.status === "fulfilled") {
      const t = (tplR.value.templates ?? []).find((x: TemplateSummary) =>
        x.version === version
      );
      if (t) {
        modelName = t.name;
        modelKind = t.kind ?? modelKind;
        modelDescription = modelDescription ?? t.description;
      }
    }

    return page<Data>({
      version,
      factors,
      factorsError,
      modelName,
      modelKind,
      modelDescription,
    });
  },
});

/** Parse a factor's JSON-encoded inputs into an array of concept-code tokens. */
function parseInputTokens(inputs?: string | null): string[] {
  if (!inputs) return [];
  try {
    const arr = JSON.parse(inputs);
    if (Array.isArray(arr)) {
      return arr
        .map((x) => {
          if (typeof x === "string") return x;
          if (x && typeof x === "object") {
            const o = x as Record<string, unknown>;
            if ("key" in o) return String(o.key);
          }
          return "";
        })
        .filter((s): s is string => Boolean(s));
    }
  } catch {
    // Not JSON — treat the raw string as a single token.
    return [inputs];
  }
  return [];
}

/** A stable per-factor key for island state (factor_id, else slugged name). */
function factorKey(f: FactorDef): string {
  if (typeof f.factor_id === "number") return `f${f.factor_id}`;
  return f.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** 990-derived model types (blue dot) vs qualitative (gray dot). */
const DERIVED_TYPES = new Set(["financial", "governance", "leadership"]);

// The score-composition bar uses a fixed navy ramp so segments read as a single
// model split (the comp's blue ramp), independent of each factor's band colour.
const SEGMENT_COLORS = ["#3a5da8", "#5a7bc0", "#8aa3d6", "#b3c4e6", "#cdd9f0"];

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const factorDefs = data.factors?.factors ?? [];
  const modelType = data.factors?.model_type;
  const scoringMode = data.factors?.scoring_mode;
  const derived = modelType ? DERIVED_TYPES.has(modelType) : true;

  const headerName = data.modelName ??
    (modelType ? `${titleCase(modelType)} Model` : `Model v${data.version}`);

  // Build the island's factor list (parsed inputs).
  const walkFactors: WalkFactor[] = factorDefs.map((f) => ({
    key: factorKey(f),
    name: f.name,
    weight: typeof f.weight === "number" ? f.weight : 0,
    formulaType: f.formula_type ?? null,
    formulaDescription: f.formula_description ?? null,
    direction: f.direction ?? null,
    benchmarkLo: f.benchmark_lo ?? null,
    benchmarkHi: f.benchmark_hi ?? null,
    inputs: parseInputTokens(f.inputs),
  }));

  // Score-composition segments: each factor's share of total weight.
  const totalWeight = walkFactors.reduce((s, f) => s + (f.weight || 0), 0) || 1;
  const segments = walkFactors.map((f, i) => ({
    name: f.name,
    weight: f.weight,
    pct: (f.weight / totalWeight) * 100,
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }));

  // A representative composite score for the band tint (SAMPLE — no per-model
  // org score on this page). TODO: provenance API — surface a real exemplar.
  const sampleScore = 73;
  const sampleBand = scoreBand(sampleScore);

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {/* breadcrumb */}
      <div
        class="flex items-center gap-2"
        style={{ fontSize: "13.5px", marginBottom: "18px" }}
      >
        <a href="/models" class="no-underline" style={{ color: "#9aa3b5" }}>
          Models
        </a>
        <span style={{ color: "#cfd5e2" }}>/</span>
        <span style={{ fontWeight: 600, color: "#3a4150" }}>{headerName}</span>
      </div>

      {data.factorsError && !data.factors
        ? (
          <div
            class="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "#fbeaea",
              border: "1px solid #f0cdcd",
              color: "#9a2c2c",
            }}
          >
            {data.factorsError}
          </div>
        )
        : (
          <>
            {/* ── model header card ──────────────────────────────────── */}
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
                    style={{
                      gap: "10px",
                      marginBottom: "11px",
                      flexWrap: "wrap",
                    }}
                  >
                    <h1
                      class="font-display font-bold text-navy"
                      style={{
                        fontSize: "28px",
                        letterSpacing: "-0.02em",
                        margin: 0,
                      }}
                    >
                      {headerName}
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
                      v{data.version}
                    </span>
                    {/* source-type tag */}
                    <span
                      class="mono inline-flex items-center"
                      style={{
                        gap: "6px",
                        fontSize: "11.5px",
                        color: derived ? "#2f4a85" : "#8893ab",
                        background: derived ? "#eef2fa" : "#f3f5f9",
                        borderRadius: "6px",
                        padding: "3px 9px",
                      }}
                    >
                      <span
                        class="inline-block rounded-full"
                        style={{
                          width: "6px",
                          height: "6px",
                          background: derived ? "#3a5da8" : "#aeb6c7",
                        }}
                      />
                      {derived ? "990-derived" : "Qualitative"}
                    </span>
                    {scoringMode === "manual" && (
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
                    {data.modelDescription ??
                      (derived
                        ? "Measures this pillar from weighted features. Every input is sourced directly from the organization's Form 990 filing — select a feature below to trace its value back to the originating line."
                        : "A reviewer-graded model. Select a feature below to walk its sub-score, metric, and the source material each input was drawn from.")}
                  </p>
                </div>
                {/* right-side stats */}
                <div class="flex" style={{ gap: "26px" }}>
                  <HeaderStat label="Total weight" value="100%" />
                  <HeaderStat
                    label="Inputs"
                    value={String(factorDefs.length)}
                  />
                  <HeaderStat
                    label="Kind"
                    value={data.modelKind ? titleCase(data.modelKind) : "Model"}
                  />
                </div>
              </div>

              {/* ── score-composition bar + legend ────────────────────── */}
              {segments.length > 0 && (
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
                    <span
                      class="mono uppercase"
                      style={{
                        fontSize: "10.5px",
                        letterSpacing: ".12em",
                        color: "#aeb6c7",
                      }}
                    >
                      Score Composition
                    </span>
                    {/* SAMPLE exemplar score — TODO: provenance API */}
                    <span style={{ fontSize: "12.5px", color: "#5a6172" }}>
                      Sample Score{" "}
                      <strong
                        class="mono"
                        style={{ color: sampleBand.hex, fontSize: "14px" }}
                      >
                        {sampleScore}
                      </strong>{" "}
                      / 100
                    </span>
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
                    {segments.map((s, i) => (
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
                    style={{
                      gap: "7px 20px",
                      fontSize: "12px",
                      color: "#5a6172",
                    }}
                  >
                    {segments.map((s) => (
                      <span
                        class="inline-flex items-center"
                        style={{ gap: "6px" }}
                      >
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

            {/* ── the walkthrough card ──────────────────────────────── */}
            <div
              class="card"
              style={{ borderRadius: "18px", padding: 0, overflow: "hidden" }}
            >
              <div
                class="flex items-center"
                style={{
                  padding: "18px 24px",
                  borderBottom: "1px solid #eef1f6",
                  gap: "11px",
                }}
              >
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
                    Trace a feature from score → metric → formula → source 990
                    line
                  </div>
                </div>
              </div>

              {walkFactors.length > 0
                ? (
                  <ModelWalkthrough
                    factors={walkFactors}
                    sampleScore={sampleScore}
                  />
                )
                : (
                  <div
                    style={{
                      padding: "40px 24px",
                      fontSize: "13.5px",
                      color: "#5a6172",
                      textAlign: "center",
                    }}
                  >
                    This model has no factor definitions to walk through.
                  </div>
                )}
            </div>
          </>
        )}
    </Layout>
  );
});

/** A right-aligned header statistic (Bricolage number over a mono-ish label). */
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
