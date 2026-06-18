import type { ComponentChildren } from "preact";
import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/Layout.tsx";
import { titleCase } from "../lib/format.ts";
import { isAdmin } from "../lib/auth.ts";
import { listModelOptions, type ModelOption } from "../lib/models.ts";
import type {
  CodeNameDesc,
  FactorDef,
  FactorsResponse,
  TemplateSummary,
} from "../lib/types.ts";

/** Definition shape returned by /templates/detail and accepted by POST /admin/models. */
interface ModelDefinition {
  model: {
    version: number;
    type?: string;
    kind?: string;
    missing_data?: string;
    description?: string;
  };
  factor: Array<{
    name: string;
    weight: number;
    formula_type?: string;
    inputs?: string[];
    direction?: string;
    benchmark_lo?: number | null;
    benchmark_hi?: number | null;
    formula_description?: string;
  }>;
}

interface TemplateDetail {
  code: string;
  definition: ModelDefinition;
}

interface Data {
  admin: boolean;
  templates: TemplateSummary[];
  models: ModelOption[];
  kinds: CodeNameDesc[];
  types: CodeNameDesc[];
  // Pillar → matched registered model + its factor names (feature chips).
  pillarFactors: Record<string, string[]>;
  // Highest super-composite/composite version for the banner link, if any.
  compositeVersion?: number;
  // Selected model factor breakdown (?version=).
  selectedVersion?: number;
  factors?: FactorsResponse;
  factorsError?: string;
  // Selected template (?template=) — definition + prefill text.
  selectedTemplate?: string;
  templateDetail?: TemplateDetail;
  templateError?: string;
  prefill: string;
  // Flash messaging via PRG.
  msg?: string;
  err?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

const SKELETON = `{
  "model": {
    "version": 100,
    "type": "financial",
    "kind": "model",
    "description": "My scoring model"
  },
  "factor": [
    {
      "name": "Example factor",
      "weight": 1.0,
      "formula_type": "ratio",
      "inputs": ["total_exp", "total_rev"],
      "direction": "higher",
      "benchmark_lo": 0.0,
      "benchmark_hi": 1.0,
      "formula_description": "What this factor measures"
    }
  ]
}`;

// The four scoring pillars surfaced in the design comp. `type` maps to the
// API's score_model.model_type vocabulary (financial / whole_person /
// governance / christ_centeredness). `derived` drives the "990-derived"
// (blue dot) vs "Qualitative" (gray dot) source tag.
interface Pillar {
  type: string;
  name: string;
  derived: boolean;
  desc: string;
  // Fallback feature chips + source when no registered model matches the type.
  features: string[];
  source: string;
}

const PILLARS: Pillar[] = [
  {
    type: "financial",
    name: "Financial",
    derived: true,
    desc:
      "Fiscal health: operating reserves, program efficiency, revenue resilience, and fundraising cost.",
    features: [
      "Liquidity & Reserves",
      "Program Efficiency",
      "Revenue Resilience",
      "Fundraising Efficiency",
    ],
    source: "990 · Parts VIII · IX · X",
  },
  {
    type: "whole_person",
    name: "Whole-Person Impact",
    derived: false,
    desc:
      "Breadth of impact across the spiritual, mental, physical, educational, and social dimensions of a person.",
    features: ["Spiritual", "Mental", "Physical", "Educational", "Social"],
    source: "Annual report + outcome surveys",
  },
  {
    type: "governance",
    name: "Leadership",
    derived: true,
    desc:
      "Board independence, governance policies, executive tenure, compensation reasonableness, and succession.",
    features: [
      "Board Independence",
      "Governance Policies",
      "Exec Compensation",
      "Tenure & Succession",
    ],
    source: "990 · Parts VI · VII",
  },
  {
    type: "christ_centeredness",
    name: "Christ-Centered & Mission",
    derived: false,
    desc:
      "Clarity and consistency of a gospel-centered mission across filings, programs, and public materials.",
    features: [
      "Mission Statement",
      "Program Descriptions",
      "Public Materials",
      "Statement of Faith",
    ],
    source: "990 · Parts I · III + narrative",
  },
];

/** Find the best registered model matching a pillar's type (lowest version). */
function modelForType(
  models: ModelOption[],
  type: string,
): ModelOption | undefined {
  return models
    .filter((m) =>
      m.type === type && m.kind !== "composite" &&
      m.kind !== "super_composite"
    )
    .sort((a, b) => a.version - b.version)[0];
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const admin = isAdmin(ctx.state.principal);
    const sp = ctx.url.searchParams;

    const versionRaw = sp.get("version")?.trim() ?? "";
    const selectedVersion = versionRaw && /^\d+$/.test(versionRaw)
      ? parseInt(versionRaw, 10)
      : undefined;
    const selectedTemplate = sp.get("template")?.trim() || undefined;

    // Catalog + registered models + vocab (best-effort; bubble 401).
    const [tplR, kindsR, typesR] = await Promise.allSettled([
      api.templates.list(),
      api.scores.kinds(),
      api.scores.types(),
    ]);
    for (const r of [tplR, kindsR, typesR]) {
      if (r.status === "rejected") only(r.reason);
    }

    let models: ModelOption[] = [];
    try {
      models = await listModelOptions(api, { admin });
    } catch (err) {
      only(err);
      models = [];
    }

    const templates = tplR.status === "fulfilled"
      ? tplR.value.templates ?? []
      : [];
    const kinds = kindsR.status === "fulfilled" ? kindsR.value.kinds ?? [] : [];
    const types = typesR.status === "fulfilled" ? typesR.value.types ?? [] : [];

    // Banner link target: the highest composite/super-composite version, else
    // the highest model version, else none.
    const composites = models.filter((m) =>
      m.kind === "super_composite" || m.kind === "composite"
    );
    const compositeVersion = (composites.length ? composites : models)
      .map((m) => m.version)
      .sort((a, b) => b - a)[0];

    // Pull factor names for each matched pillar model (feature chips). These
    // are independent reads — fan them out and tolerate per-model failure.
    const pillarModels = PILLARS
      .map((p) => ({ type: p.type, model: modelForType(models, p.type) }))
      .filter((x) => x.model !== undefined) as Array<
        { type: string; model: ModelOption }
      >;
    const factorResults = await Promise.allSettled(
      pillarModels.map((x) => api.scores.factors(x.model.version)),
    );
    const pillarFactors: Record<string, string[]> = {};
    factorResults.forEach((r, i) => {
      if (r.status === "rejected") {
        only(r.reason);
        return;
      }
      const names = (r.value.factors ?? []).map((f) => f.name).filter(Boolean);
      if (names.length) pillarFactors[pillarModels[i].type] = names;
    });

    // Factor breakdown for an explicitly selected model version (inspector).
    let factors: FactorsResponse | undefined;
    let factorsError: string | undefined;
    if (selectedVersion !== undefined) {
      try {
        factors = await api.scores.factors(selectedVersion);
      } catch (err) {
        only(err);
        factorsError = err instanceof Error
          ? err.message
          : "Failed to load factors.";
      }
    }

    // Template detail (definition + prefill for the builder).
    let templateDetail: TemplateDetail | undefined;
    let templateError: string | undefined;
    let prefill = admin ? SKELETON : "";
    if (selectedTemplate) {
      try {
        templateDetail = await api.templates.detail(
          selectedTemplate,
        ) as unknown as TemplateDetail;
        if (templateDetail?.definition) {
          prefill = JSON.stringify(templateDetail.definition, null, 2);
        }
      } catch (err) {
        only(err);
        templateError = err instanceof Error
          ? err.message
          : "Failed to load template.";
      }
    }

    return page<Data>({
      admin,
      templates,
      models,
      kinds,
      types,
      pillarFactors,
      compositeVersion,
      selectedVersion,
      factors,
      factorsError,
      selectedTemplate,
      templateDetail,
      templateError,
      prefill,
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    });
  },

  async POST(ctx) {
    if (!isAdmin(ctx.state.principal)) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const raw = String(form.get("definition") ?? "");
    const dryRun = form.get("dry_run") === "1";
    const skipExisting = form.get("skip_existing") === "1";

    let definition: unknown;
    try {
      definition = JSON.parse(raw);
    } catch {
      return ctx.redirect(
        "/models?err=" + encodeURIComponent("Invalid JSON in definition."),
      );
    }

    try {
      const res = await api.admin.createModel({
        definition,
        dry_run: dryRun,
        skip_existing: skipExisting,
      });
      // A 2xx body may still carry a soft { error }.
      if (res && typeof res === "object" && (res as { error?: string }).error) {
        return ctx.redirect(
          "/models?err=" +
            encodeURIComponent((res as { error?: string }).error!),
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Model creation failed.";
      return ctx.redirect("/models?err=" + encodeURIComponent(msg));
    }

    const okMsg = dryRun ? "Valid (dry run)" : "Created";
    return ctx.redirect("/models?msg=" + encodeURIComponent(okMsg));
  },
});

/** A small mono uppercase eyebrow label. */
function Eyebrow(props: { children: ComponentChildren; class?: string }) {
  return (
    <div
      class={`mono uppercase ${props.class ?? "text-faint"}`}
      style={{ fontSize: "11px", letterSpacing: ".16em" }}
    >
      {props.children}
    </div>
  );
}

/** The 990-derived (blue dot) / Qualitative (gray dot) source tag. */
function SourceTag(props: { derived: boolean }) {
  return (
    <span
      class="mono inline-flex items-center gap-1.5 rounded-md px-2.5 py-1"
      style={{
        fontSize: "11.5px",
        color: props.derived ? "#2f4a85" : "#8893ab",
        background: props.derived ? "#eef2fa" : "#f3f5f9",
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
  );
}

/** One pillar card in the 2×2 grid. Whole card links to the model inspector. */
function PillarCard(
  props: { pillar: Pillar; model?: ModelOption; features: string[] },
) {
  const { pillar, model, features } = props;
  const chips = features.length ? features : pillar.features;
  const href = model ? `/models?version=${model.version}` : undefined;
  const inputs = model ? "Registered" : `${pillar.features.length} signals`;
  const inner = (
    <>
      {/* header row */}
      <div class="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <div class="mb-2 flex items-center gap-2.5">
            <h2
              class="font-display font-bold text-navy"
              style={{ fontSize: "19px", letterSpacing: "-0.015em" }}
            >
              {pillar.name}
            </h2>
            {pillar.type === "financial" && (
              <span
                class="mono font-bold"
                style={{
                  fontSize: "10px",
                  color: "#245f45",
                  background: "#e3efe7",
                  borderRadius: "5px",
                  padding: "2px 7px",
                  letterSpacing: ".04em",
                }}
              >
                WALKTHROUGH
              </span>
            )}
            {!model && (
              <span
                class="mono"
                style={{
                  fontSize: "10px",
                  color: "#9aa3b5",
                  background: "#f3f5f9",
                  borderRadius: "5px",
                  padding: "2px 7px",
                  letterSpacing: ".04em",
                }}
              >
                PENDING
              </span>
            )}
          </div>
          <SourceTag derived={pillar.derived} />
        </div>
        <div class="shrink-0 text-right">
          <div class="text-faint" style={{ fontSize: "10.5px" }}>Weight</div>
          <div
            class="font-display font-bold text-navy"
            style={{ fontSize: "20px" }}
          >
            25%
          </div>
        </div>
      </div>

      {/* description */}
      <p
        class="text-muted"
        style={{
          fontSize: "13.5px",
          lineHeight: "1.55",
          margin: "0 0 16px",
          textWrap: "pretty",
        }}
      >
        {pillar.desc}
      </p>

      {/* feature chips */}
      <div class="mb-4 flex flex-wrap gap-1.5">
        {chips.map((f) => (
          <span
            class="text-muted"
            style={{
              fontSize: "11.5px",
              background: "#f3f5f9",
              border: "1px solid #e7ebf2",
              borderRadius: "6px",
              padding: "4px 9px",
            }}
          >
            {titleCase(f)}
          </span>
        ))}
      </div>

      {/* footer meta */}
      <div
        class="mt-auto flex items-center justify-between gap-3"
        style={{ borderTop: "1px solid #f0f2f7", paddingTop: "14px" }}
      >
        <div class="flex gap-4">
          <div>
            <div class="text-faint" style={{ fontSize: "10.5px" }}>Inputs</div>
            <div
              class="font-semibold"
              style={{ fontSize: "12.5px", color: "#3a4150" }}
            >
              {inputs}
            </div>
          </div>
          <div>
            <div class="text-faint" style={{ fontSize: "10.5px" }}>Source</div>
            <div
              class="mono font-semibold"
              style={{ fontSize: "12.5px", color: "#3a4150" }}
            >
              {pillar.source}
            </div>
          </div>
        </div>
        <span
          class="font-semibold whitespace-nowrap"
          style={{ fontSize: "13px", color: model ? "#3a5da8" : "#aeb6c7" }}
        >
          {model ? "Walk the model →" : "No model yet"}
        </span>
      </div>
    </>
  );

  const cardStyle = { borderRadius: "18px" };
  return href
    ? (
      <a
        href={href}
        class="card card-hover card-pad flex flex-col no-underline"
        style={cardStyle}
      >
        {inner}
      </a>
    )
    : (
      <div class="card card-pad flex flex-col" style={cardStyle}>
        {inner}
      </div>
    );
}

/** Parse a factor's JSON-encoded inputs string into a readable list. */
function parseInputs(inputs?: string | null): string {
  if (!inputs) return "—";
  try {
    const arr = JSON.parse(inputs);
    if (Array.isArray(arr)) {
      const parts = arr.map((x) =>
        typeof x === "string" ? x : (x && typeof x === "object" &&
            "key" in (x as Record<string, unknown>))
          ? String((x as Record<string, unknown>).key)
          : JSON.stringify(x)
      );
      return parts.length ? parts.join(", ") : "—";
    }
  } catch {
    // Not JSON — show raw.
  }
  return inputs;
}

function benchmark(f: FactorDef): string {
  const lo = f.benchmark_lo;
  const hi = f.benchmark_hi;
  if (lo === null || lo === undefined) {
    if (hi === null || hi === undefined) return "—";
    return `…–${hi}`;
  }
  if (hi === null || hi === undefined) return `${lo}–…`;
  return `${lo}–${hi}`;
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const bannerHref = data.compositeVersion !== undefined
    ? `/models?version=${data.compositeVersion}`
    : undefined;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {/* flash messages */}
      {data.msg && (
        <div
          class="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "#e3efe7",
            border: "1px solid #cbe2d3",
            color: "#245f45",
          }}
        >
          {data.msg}
        </div>
      )}
      {data.err && (
        <div
          class="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "#fbeaea",
            border: "1px solid #f0cdcd",
            color: "#9a2c2c",
          }}
        >
          {data.err}
        </div>
      )}

      {/* header */}
      <div class="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div style={{ maxWidth: "640px" }}>
          <Eyebrow class="text-faint mb-2">Scoring Models</Eyebrow>
          <h1
            class="font-display font-bold text-navy"
            style={{
              fontSize: "34px",
              lineHeight: "1.05",
              letterSpacing: "-0.025em",
              margin: "0 0 10px",
            }}
          >
            Models &amp; methodology
          </h1>
          <p
            class="text-muted"
            style={{
              fontSize: "15px",
              lineHeight: "1.6",
              margin: "0",
              textWrap: "pretty",
            }}
          >
            Every OpenReturn score is produced by a transparent, auditable
            model. Open any model to walk its logic — from the headline score
            down to the exact 990 line item each variable was sourced from.
          </p>
        </div>
        <span
          class="mono bg-surface text-muted"
          style={{
            fontSize: "12px",
            border: "1px solid #dde2ec",
            borderRadius: "9px",
            padding: "8px 13px",
          }}
        >
          Methodology v3.0
        </span>
      </div>

      {/* composite model banner */}
      {(() => {
        const bannerInner = (
          <div class="flex flex-wrap items-center gap-6">
            <div style={{ flex: "1", minWidth: "280px" }}>
              <div class="mb-3 flex items-center gap-3">
                <span
                  class="mono uppercase"
                  style={{
                    fontSize: "10.5px",
                    letterSpacing: ".14em",
                    color: "#9fb6e6",
                  }}
                >
                  Composite
                </span>
                <span
                  class="mono"
                  style={{
                    fontSize: "11px",
                    color: "#cdd9f0",
                    background: "rgba(159,182,230,.18)",
                    borderRadius: "6px",
                    padding: "2px 8px",
                  }}
                >
                  {data.compositeVersion !== undefined
                    ? `v${data.compositeVersion}`
                    : "v3.0"}
                </span>
              </div>
              <h2
                class="font-display font-bold"
                style={{
                  fontSize: "24px",
                  letterSpacing: "-0.02em",
                  margin: "0 0 8px",
                  color: "#fff",
                }}
              >
                OpenReturn Score
              </h2>
              <p
                style={{
                  fontSize: "14px",
                  lineHeight: "1.55",
                  color: "rgba(238,241,247,.74)",
                  margin: "0",
                  maxWidth: "560px",
                  textWrap: "pretty",
                }}
              >
                A weighted roll-up of the four pillar models into a single 0–100
                score and letter grade. Each pillar contributes equally; the
                composite is what surfaces across the dashboard, search, and
                reports.
              </p>
            </div>
            {/* pillar weighting bar */}
            <div style={{ flexShrink: "0", minWidth: "300px" }}>
              <div
                class="mb-3 flex overflow-hidden"
                style={{ height: "14px", borderRadius: "999px" }}
              >
                <div style={{ width: "25%", background: "#9fb6e6" }} />
                <div
                  style={{
                    width: "25%",
                    background: "#7e9ad8",
                    borderLeft: "2px solid #192A54",
                  }}
                />
                <div
                  style={{
                    width: "25%",
                    background: "#9fb6e6",
                    borderLeft: "2px solid #192A54",
                  }}
                />
                <div
                  style={{
                    width: "25%",
                    background: "#7e9ad8",
                    borderLeft: "2px solid #192A54",
                  }}
                />
              </div>
              <div
                class="grid"
                style={{
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px 16px",
                  fontSize: "12px",
                  color: "#cdd9f0",
                }}
              >
                <span>● Financial · 25%</span>
                <span>● Whole-Person · 25%</span>
                <span>● Leadership · 25%</span>
                <span>● Christ-Centered · 25%</span>
              </div>
            </div>
          </div>
        );
        const bannerStyle = {
          background: "#192A54",
          borderRadius: "18px",
          padding: "26px 30px",
          boxShadow: "0 20px 44px -28px rgba(25,42,84,.5)",
        };
        return bannerHref
          ? (
            <a
              href={bannerHref}
              class="mb-6 block no-underline"
              style={bannerStyle}
            >
              {bannerInner}
            </a>
          )
          : (
            <div class="mb-6 block" style={bannerStyle}>
              {bannerInner}
            </div>
          );
      })()}

      {/* pillar models grid (2×2) */}
      <div
        class="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        {PILLARS.map((p) => (
          <PillarCard
            pillar={p}
            model={modelForType(data.models, p.type)}
            features={data.pillarFactors[p.type] ?? []}
          />
        ))}
      </div>

      {/* methodology note */}
      <div
        class="mt-6 flex items-start gap-5 bg-surface"
        style={{
          border: "1px solid #dde2ec",
          borderRadius: "16px",
          padding: "22px 24px",
        }}
      >
        <div
          class="flex shrink-0 items-center justify-center"
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "9px",
            background: "#eef2fa",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 2.5l6.5 3v4.2c0 4-2.8 6.7-6.5 7.8-3.7-1.1-6.5-3.8-6.5-7.8V5.5z"
              stroke="#3a5da8"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <path
              d="M7.3 10l1.9 1.9 3.6-3.8"
              stroke="#3a5da8"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div>
          <div
            class="font-bold text-navy"
            style={{ fontSize: "14px", marginBottom: "5px" }}
          >
            Full provenance, every score
          </div>
          <p
            class="text-muted"
            style={{
              fontSize: "13.5px",
              lineHeight: "1.6",
              margin: "0",
              textWrap: "pretty",
            }}
          >
            Models marked{" "}
            <strong style={{ color: "#3a4150" }}>990-derived</strong>{" "}
            trace every input to a specific filing, Part, line, and column —
            with the extracted value, source page, and OCR confidence shown in
            the walkthrough. Qualitative models cite the originating document
            and reviewer.
          </p>
        </div>
      </div>

      {/* factor inspector for a selected version (?version=) */}
      {data.selectedVersion !== undefined && (
        <div class="mt-8">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="section-title">
              Factor walkthrough · v{data.selectedVersion}
            </h2>
            <a href="/models" class="link" style={{ fontSize: "13px" }}>
              Clear selection
            </a>
          </div>
          {data.factorsError
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
            : !data.factors || data.factors.factors.length === 0
            ? (
              <div
                class="card card-pad text-muted"
                style={{ fontSize: "13.5px" }}
              >
                This model has no factor definitions.
              </div>
            )
            : (
              <div class="card card-pad" style={{ borderRadius: "16px" }}>
                <div class="mb-4 flex flex-wrap items-center gap-2">
                  {data.factors.model_kind && (
                    <span
                      class="mono uppercase"
                      style={{
                        fontSize: "10.5px",
                        letterSpacing: ".1em",
                        color: "#2f4a85",
                        background: "#eef2fa",
                        borderRadius: "5px",
                        padding: "3px 8px",
                      }}
                    >
                      {titleCase(data.factors.model_kind)}
                    </span>
                  )}
                  {data.factors.model_type && (
                    <span
                      class="mono uppercase"
                      style={{
                        fontSize: "10.5px",
                        letterSpacing: ".1em",
                        color: "#245f45",
                        background: "#e3efe7",
                        borderRadius: "5px",
                        padding: "3px 8px",
                      }}
                    >
                      {titleCase(data.factors.model_type)}
                    </span>
                  )}
                  {data.factors.scoring_mode && (
                    <span
                      class="mono uppercase"
                      style={{
                        fontSize: "10.5px",
                        letterSpacing: ".1em",
                        color: data.factors.scoring_mode === "manual"
                          ? "#9a6a1c"
                          : "#5a6172",
                        background: data.factors.scoring_mode === "manual"
                          ? "#f6ecd8"
                          : "#f3f5f9",
                        borderRadius: "5px",
                        padding: "3px 8px",
                      }}
                    >
                      {titleCase(data.factors.scoring_mode)}
                    </span>
                  )}
                </div>
                <div class="overflow-x-auto">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Factor</th>
                        <th>Weight</th>
                        <th>Formula</th>
                        <th>Inputs</th>
                        <th>Direction</th>
                        <th>Benchmark</th>
                        <th>Description</th>
                        <th>Manual scale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.factors.factors.map((f) => (
                        <tr>
                          <td class="font-semibold text-navy">{f.name}</td>
                          <td class="mono tabular-nums">{f.weight}</td>
                          <td class="text-muted">
                            {f.formula_type
                              ? <code class="mono">{f.formula_type}</code>
                              : "—"}
                          </td>
                          <td class="text-muted">
                            <code class="mono" style={{ fontSize: "11.5px" }}>
                              {parseInputs(f.inputs)}
                            </code>
                          </td>
                          <td class="text-muted">{f.direction ?? "—"}</td>
                          <td class="mono tabular-nums text-muted">
                            {benchmark(f)}
                          </td>
                          <td class="text-faint">
                            {f.formula_description ?? "—"}
                          </td>
                          <td class="text-muted">{f.manual_scale ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      )}

      {/* selected template detail (context for the builder) */}
      {data.selectedTemplate && (
        <div class="mt-8">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="section-title">Template · {data.selectedTemplate}</h2>
            <a href="/models" class="link" style={{ fontSize: "13px" }}>
              Clear selection
            </a>
          </div>
          {data.templateError
            ? (
              <div
                class="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "#fbeaea",
                  border: "1px solid #f0cdcd",
                  color: "#9a2c2c",
                }}
              >
                {data.templateError}
              </div>
            )
            : data.templateDetail
            ? (
              <div class="card card-pad" style={{ borderRadius: "16px" }}>
                <div class="mb-2 flex flex-wrap items-center gap-2">
                  <span class="font-semibold text-navy">
                    {data.templateDetail.definition?.model?.description ??
                      data.selectedTemplate}
                  </span>
                  {data.templateDetail.definition?.model?.kind && (
                    <span
                      class="mono uppercase"
                      style={{
                        fontSize: "10.5px",
                        letterSpacing: ".1em",
                        color: "#2f4a85",
                        background: "#eef2fa",
                        borderRadius: "5px",
                        padding: "3px 8px",
                      }}
                    >
                      {titleCase(data.templateDetail.definition.model.kind)}
                    </span>
                  )}
                  {data.templateDetail.definition?.model?.version !==
                      undefined && (
                    <span class="mono text-faint" style={{ fontSize: "11px" }}>
                      v{data.templateDetail.definition.model.version}
                    </span>
                  )}
                </div>
                <p class="text-muted" style={{ fontSize: "13.5px" }}>
                  {data.templateDetail.definition?.factor?.length ?? 0} factor
                  {(data.templateDetail.definition?.factor?.length ?? 0) === 1
                    ? ""
                    : "s"}.
                  {data.admin
                    ? " The definition is prefilled in the builder below."
                    : " Sign in as an administrator to create a model from this template."}
                </p>
              </div>
            )
            : (
              <div
                class="card card-pad text-muted"
                style={{ fontSize: "13.5px" }}
              >
                No template "{data.selectedTemplate}".
              </div>
            )}
        </div>
      )}

      {/* registered models — compact roster linking to the inspector */}
      {data.models.length > 0 && (
        <div class="mt-8">
          <h2 class="section-title mb-3">Registered models</h2>
          <div class="flex flex-wrap gap-2">
            {data.models.map((m) => (
              <a
                href={`/models?version=${m.version}`}
                class="card card-hover no-underline"
                style={{
                  borderRadius: "10px",
                  padding: "8px 13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "9px",
                }}
              >
                <span
                  class="mono text-faint"
                  style={{ fontSize: "11px" }}
                >
                  v{m.version}
                </span>
                <span
                  class="font-semibold text-navy"
                  style={{ fontSize: "13px" }}
                >
                  {m.label.replace(/^v\d+\s*—\s*/, "")}
                </span>
                {m.kind && (
                  <span
                    class="mono uppercase"
                    style={{
                      fontSize: "9.5px",
                      letterSpacing: ".08em",
                      color: "#5a6172",
                      background: "#f3f5f9",
                      borderRadius: "5px",
                      padding: "1px 6px",
                    }}
                  >
                    {titleCase(m.kind)}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* template catalog (prefill picker) */}
      {data.templates.length > 0 && (
        <div class="mt-8">
          <h2 class="section-title mb-3">Model catalog</h2>
          <div
            class="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            }}
          >
            {data.templates.map((t) => (
              <a
                href={`/models?template=${encodeURIComponent(t.code)}`}
                class="card card-hover card-pad block no-underline"
                style={{ borderRadius: "14px" }}
              >
                <div class="mb-1.5 flex items-center gap-2">
                  <span class="font-semibold text-navy">{t.name}</span>
                  <span
                    class="mono"
                    style={{
                      fontSize: "10px",
                      color: "#5a6172",
                      background: "#f3f5f9",
                      borderRadius: "5px",
                      padding: "1px 6px",
                    }}
                  >
                    {titleCase(t.kind)}
                  </span>
                </div>
                {t.description && (
                  <p
                    class="text-muted"
                    style={{ fontSize: "12.5px", lineHeight: "1.5", margin: 0 }}
                  >
                    {t.description}
                  </p>
                )}
                <div class="mono text-faint mt-2" style={{ fontSize: "11px" }}>
                  {t.code} · v{t.version} · {t.factor_count}{" "}
                  factor{t.factor_count === 1 ? "" : "s"}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* admin model builder (navy-styled) */}
      {data.admin
        ? (
          <div class="mt-8">
            <h2 class="section-title mb-3">Create a model</h2>
            <div
              class="overflow-hidden"
              style={{
                background: "#192A54",
                borderRadius: "18px",
                boxShadow: "0 20px 44px -28px rgba(25,42,84,.5)",
              }}
            >
              <div style={{ padding: "24px 28px 0" }}>
                <span
                  class="mono uppercase"
                  style={{
                    fontSize: "10.5px",
                    letterSpacing: ".14em",
                    color: "#9fb6e6",
                  }}
                >
                  Admin · Model builder
                </span>
                <p
                  style={{
                    fontSize: "13.5px",
                    lineHeight: "1.55",
                    color: "rgba(238,241,247,.74)",
                    margin: "8px 0 0",
                    maxWidth: "640px",
                  }}
                >
                  Paste or edit a model definition (JSON with{" "}
                  <code class="mono" style={{ color: "#cdd9f0" }}>model</code>
                  {" "}
                  and{" "}
                  <code class="mono" style={{ color: "#cdd9f0" }}>factor</code>
                  {" "}
                  keys). Use a template above to prefill this form, or start
                  from the skeleton. Validate first with a dry run before
                  creating.
                </p>
              </div>
              <form method="POST" style={{ padding: "18px 28px 26px" }}>
                <label
                  class="mono uppercase block"
                  for="definition"
                  style={{
                    fontSize: "10.5px",
                    letterSpacing: ".12em",
                    color: "#9fb6e6",
                    marginBottom: "8px",
                  }}
                >
                  Model definition (JSON)
                </label>
                <textarea
                  id="definition"
                  name="definition"
                  rows={20}
                  spellcheck={false}
                  class="mono w-full"
                  style={{
                    minHeight: "20rem",
                    background: "#0f1d3d",
                    color: "#dbe4f7",
                    border: "1px solid #2f4170",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    fontSize: "12.5px",
                    lineHeight: "1.55",
                    resize: "vertical",
                  }}
                >
                  {data.prefill}
                </textarea>
                <div class="mt-4 flex flex-wrap items-center gap-5">
                  <label
                    class="flex items-center gap-2"
                    style={{ fontSize: "13px", color: "#cdd9f0" }}
                  >
                    <input type="checkbox" name="dry_run" value="1" />
                    Validate only (dry run)
                  </label>
                  <label
                    class="flex items-center gap-2"
                    style={{ fontSize: "13px", color: "#cdd9f0" }}
                  >
                    <input type="checkbox" name="skip_existing" value="1" />
                    Skip if exists
                  </label>
                  <div class="ml-auto flex gap-2">
                    <button
                      type="submit"
                      class="font-semibold"
                      style={{
                        background: "#fff",
                        color: "#192A54",
                        borderRadius: "9px",
                        padding: "9px 18px",
                        fontSize: "13.5px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Submit
                    </button>
                    <a
                      href="/models"
                      class="font-semibold no-underline"
                      style={{
                        color: "#cdd9f0",
                        border: "1px solid #3a4f82",
                        borderRadius: "9px",
                        padding: "9px 18px",
                        fontSize: "13.5px",
                      }}
                    >
                      Reset
                    </a>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )
        : (
          <div
            class="mt-8 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "#eef2fa",
              border: "1px solid #d7e0f2",
              color: "#2f4a85",
            }}
          >
            Administrator access is required to create models. You can browse
            the catalog and inspect any model's factor breakdown above.
          </div>
        )}
    </Layout>
  );
});
