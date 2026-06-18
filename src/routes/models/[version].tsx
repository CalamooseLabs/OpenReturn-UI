// ── Model Detail — the provenance walkthrough ────────────────────────────────
// The centerpiece screen: open a scoring model and walk its logic from the
// headline score down to the exact Form 990 line each input was sourced from.
//
// COMP: "OpenReturn - Model Detail.dc.html" (README §7). The 3-column explorer
// is the ModelWalkthrough island; this route renders the breadcrumb, model
// header card, score-composition bar + legend, and the walkthrough shell.
//
// B-WIRING: the walkthrough is wired to GET /scores/debug for an example org
// (the model's top-ranked org, else any org's latest filing). The DebugTrace's
// per-factor variables carry the REAL Form 990 citation, value, canonical
// source and confidence — no invented Part/Line. When no scored org exists, we
// fall back to the factors-only header view (clearly labelled).

import { define } from "../../utils.ts";
import { page } from "fresh";
import { type Api, ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/templates.tsx";
import {
  ModelBreadcrumb,
  ModelHeaderCard,
  WalkthroughCard,
} from "../../components/organisms/ModelDetail.tsx";
import { titleCase } from "../../lib/format.ts";
import { to100 } from "../../lib/score.ts";
import ModelWalkthrough from "../../islands/ModelWalkthrough.tsx";
import type { DebugFactor, DebugTrace } from "../../lib/api/scores.ts";
import type {
  FactorDef,
  FactorsResponse,
  ModelSummary,
  TemplateSummary,
} from "../../lib/types.ts";

interface Data {
  version: string;
  factors?: FactorsResponse;
  factorsError?: string;
  // Best-effort model metadata for the header (name / kind), tolerated.
  modelName?: string;
  modelKind?: string;
  modelDescription?: string;
  // Live trace (from GET /scores/debug for an example org), when available.
  trace?: DebugTrace;
  exampleName?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const raw = ctx.params.version;
    if (!/^\d+(\.\d+)*$/.test(raw)) {
      return page<Data>({
        version: "",
        factorsError: "Unknown model version.",
      });
    }
    const version = raw;

    // Header metadata (model name / kind / description from the admin registry
    // or the public template catalog) is independent of the factor definitions,
    // so kick it off in parallel with scores.factors instead of serializing.
    const metaP = Promise.allSettled([
      api.templates.list(),
      api.admin.listModels(),
    ]);

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
    const [tplR, modelsR] = await metaP;
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

    // ── pick an EXAMPLE org and trace it via GET /scores/debug ──────────────
    // 1) the model's top-ranked org (ein + year), else 2) any org's latest
    //    filing year. Either feeds /scores/debug for the live walkthrough.
    let trace: DebugTrace | undefined;
    let exampleName: string | undefined;
    if (factors) {
      const example = await pickExample(api, version);
      if (example) {
        exampleName = example.name;
        try {
          trace = await api.scores.debug(
            example.ein,
            example.year,
            version,
          );
        } catch (err) {
          only(err); // bubble 401; otherwise fall back to factors-only.
        }
      }
    }

    return page<Data>({
      version,
      factors,
      factorsError,
      modelName,
      modelKind,
      modelDescription,
      trace,
      exampleName,
    });
  },
});

/** Resolve an example (ein, year, name) to trace: leaderboard top → org list. */
async function pickExample(
  api: Api,
  version: string,
): Promise<{ ein: string; year: number; name?: string } | null> {
  // 1) the model's top-ranked org carries an ein + year directly.
  try {
    const lb = await api.scores.leaderboard({ model: version, limit: 1 });
    const top = lb.leaderboard?.[0];
    if (top?.ein && typeof top.year === "number") {
      return { ein: top.ein, year: top.year, name: top.name };
    }
  } catch (err) {
    only(err);
  }
  // 2) fall back to any org, then its latest filing year.
  try {
    const orgs = await api.orgs.list({ limit: 1 });
    const org = orgs.organizations?.[0];
    if (org?.ein) {
      const full = await api.orgs.full(org.ein);
      const years = (full.filings ?? [])
        .map((f) => f.year)
        .filter((y): y is number => typeof y === "number");
      if (years.length) {
        return { ein: org.ein, year: Math.max(...years), name: org.name };
      }
    }
  } catch (err) {
    only(err);
  }
  return null;
}

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

  // Live trace factors (real, when /scores/debug succeeded for an example org).
  const traceFactors: DebugFactor[] = data.trace?.factors ?? [];
  const live = traceFactors.length > 0;

  // Score-composition segments. Prefer the trace's factor weights (live), else
  // the static factor definitions. Each factor's share of total weight.
  const segSource: { name: string; weight: number }[] = live
    ? traceFactors.map((f) => ({ name: f.name, weight: f.weight }))
    : factorDefs.map((f: FactorDef) => ({
      name: f.name,
      weight: typeof f.weight === "number" ? f.weight : 0,
    }));
  const totalWeight = segSource.reduce((s, f) => s + (f.weight || 0), 0) || 1;
  const segments = segSource.map((f, i) => ({
    name: f.name,
    weight: f.weight,
    pct: (f.weight / totalWeight) * 100,
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }));

  // Real exemplar score (0–100) from the trace's total_score, when live.
  const exampleScore = live ? to100(data.trace?.total_score) : null;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <ModelBreadcrumb name={headerName} />

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
            <ModelHeaderCard
              name={headerName}
              version={data.version}
              derived={derived}
              manual={scoringMode === "manual"}
              description={data.modelDescription}
              kind={data.modelKind}
              inputCount={factorDefs.length}
              segments={segments}
              exampleScore={exampleScore}
              exampleName={live ? data.exampleName ?? null : null}
            />

            <WalkthroughCard live={live}>
              {live
                ? (
                  <ModelWalkthrough
                    factors={traceFactors}
                    exampleName={data.exampleName ?? null}
                    exampleYear={data.trace?.year ?? null}
                  />
                )
                : factorDefs.length > 0
                ? (
                  <div
                    style={{
                      padding: "28px 24px",
                      fontSize: "13.5px",
                      color: "#5a6172",
                      lineHeight: "1.6",
                    }}
                  >
                    No scored organization is available to trace this model yet.
                    The model defines{" "}
                    <strong style={{ color: "#192A54" }}>
                      {factorDefs.length}
                    </strong>{" "}
                    factor{factorDefs.length === 1 ? "" : "s"}:
                    <ul
                      style={{
                        margin: "12px 0 0",
                        paddingLeft: "18px",
                        color: "#3a4150",
                      }}
                    >
                      {factorDefs.map((f: FactorDef) => (
                        <li style={{ marginBottom: "4px" }}>
                          {f.name} —{" "}
                          <span class="mono" style={{ color: "#8893ab" }}>
                            {(typeof f.weight === "number" ? f.weight * 100 : 0)
                              .toFixed(0)}% weight
                          </span>
                          {parseInputTokens(f.inputs).length > 0 && (
                            <span class="mono" style={{ color: "#aeb6c7" }}>
                              {" · "}
                              {parseInputTokens(f.inputs).join(", ")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
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
            </WalkthroughCard>
          </>
        )}
    </Layout>
  );
});
