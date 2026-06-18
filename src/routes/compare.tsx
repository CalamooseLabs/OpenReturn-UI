import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/templates.tsx";
import { EmptyState, ErrorAlert } from "../components/molecules.tsx";
import {
  type ComparePillar,
  HeadToHeadTable,
  ModelsTable,
  type OrgColumn,
} from "../components/organisms/ComparisonTable.tsx";
import { formatEin, normalizeEin } from "../lib/format.ts";
import { to100 } from "../lib/score.ts";
import { compareVersions, listModelOptions } from "../lib/models.ts";
import { isAdmin } from "../lib/auth.ts";
import type { FinancialFact, OrgFull, ScoreRow } from "../lib/types.ts";

/* ------------------------------------------------------------------ types */

interface ModelOpt {
  version: string;
  label: string;
  type?: string;
}

/** The four scoring pillars, keyed by model TYPE (mirrors the design comp). */
const PILLARS: ComparePillar[] = [
  { key: "financial", label: "Financial Health", types: ["financial"] },
  {
    key: "whole_person",
    label: "Whole-Person Impact",
    types: ["whole_person"],
  },
  {
    key: "leadership",
    label: "Leadership",
    types: ["leadership", "governance"],
  },
  {
    key: "christ_centered",
    label: "Christ-Centered & Mission",
    types: ["christ_centered", "christ_centeredness"],
  },
];

/** Financial rows shown in the comparison (concept-code aliases the API uses). */
const FIN_ROWS: { label: string; concepts: string[] }[] = [
  { label: "Total revenue", concepts: ["cy_rev", "total_rev", "revenue"] },
  { label: "Total expenses", concepts: ["total_exp", "cy_exp", "expenses"] },
  { label: "Net assets", concepts: ["equity", "net_assets"] },
];

// `OrgColumn` (a single org column in the head-to-head table) is defined with
// the ComparisonTable organism that renders it.

interface Data {
  // raw query echoed back into the forms
  ein: string;
  year: string;
  einsRaw: string;
  model: string;
  // model picker
  models: ModelOpt[];
  // mode 1 — one org across models
  mode1Active: boolean;
  mode1Year?: number;
  mode1Name?: string;
  mode1Scores: ScoreRow[];
  // mode 2 — orgs head-to-head
  mode2Active: boolean;
  mode2Cols: OrgColumn[];
  mode2Year?: number;
  mode2HasFin: boolean;
  error?: string;
}

/* -------------------------------------------------------------- handler */

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

/** Split a free-form EIN list (commas / spaces / newlines) into normalized EINs. */
function parseEins(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(/[\s,]+/)) {
    const e = normalizeEin(tok);
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

/** Two-letter avatar initials from an org name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2) || "??").toUpperCase();
}

/** "City, ST" from an org's filer address. */
function cityOf(org: OrgFull | undefined): string {
  const a = org?.address;
  if (!a) return "";
  return [a.city, a.state].filter(Boolean).join(", ");
}

/** Latest filing year for an org (or undefined). */
function latestYear(org: OrgFull): number | undefined {
  return org.filings?.length
    ? Math.max(...org.filings.map((f) => f.year))
    : undefined;
}

/** Latest score for the model whose type matches one of `types` (0–100). */
function pillarScore(
  scores: ScoreRow[],
  typeOfVersion: Map<string, string | undefined>,
  types: string[],
): number | null {
  const matching = scores.filter((s) =>
    types.includes(typeOfVersion.get(s.model_version) ?? "")
  );
  if (!matching.length) return null;
  const latest = matching.reduce((a, b) => (b.year >= a.year ? b : a));
  return to100(latest.total_score);
}

/** First non-null canonical value among the candidate concept codes. */
function factValue(
  facts: FinancialFact[],
  concepts: string[],
): number | null {
  for (const code of concepts) {
    const f = facts.find((x) => x.concept_code === code);
    if (f && f.canonical_value !== null && f.canonical_value !== undefined) {
      return f.canonical_value;
    }
  }
  return null;
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;

    const einRaw = sp.get("ein")?.trim() ?? "";
    const yearParam = sp.get("year")?.trim() ?? "";
    const einsRaw = sp.get("eins") ?? "";
    const modelParam = sp.get("model")?.trim() ?? "";

    const ein = einRaw ? normalizeEin(einRaw) : "";
    const eins = parseEins(einsRaw);
    const modelVersion = modelParam ?? "";

    const mode1Active = !!ein;
    const mode2Active = eins.length > 0 && modelVersion !== "";

    // Model options for the head-to-head picker + a version→type lookup so we
    // can route each org's scores into the right pillar column. Only needed at
    // render (mode-1) / in the mode-2 pillar pass, so kick the fetch off now and
    // consume it after the mode-1 org calls below (they share no input with it).
    const optsP = listModelOptions(api, {
      admin: isAdmin(ctx.state.principal),
    });

    let models: ModelOpt[] = [];
    const typeOfVersion = new Map<string, string | undefined>();

    let mode1Year: number | undefined;
    let mode1Name: string | undefined;
    let mode1Scores: ScoreRow[] = [];
    const mode2Cols: OrgColumn[] = [];
    let mode2Year: number | undefined;
    let mode2HasFin = false;
    let error: string | undefined;

    // ---- Mode 1: one org across every model -------------------------------
    if (mode1Active) {
      // Resolve the year. If supplied use it; else default to the org's latest
      // filing year (omit entirely if the org has no filings). We always read
      // /organizations/full for the name when available.
      const parsedYear = yearParam ? parseInt(yearParam, 10) : NaN;
      if (Number.isFinite(parsedYear)) {
        mode1Year = parsedYear;
        // The name (orgs.detail) is cosmetic — it isn't an input to compare(),
        // which is keyed by the explicit year — so run both concurrently.
        const [detailR, cmpR] = await Promise.allSettled([
          api.orgs.detail(ein),
          api.scores.compare(ein, parsedYear),
        ]);
        if (detailR.status === "fulfilled") {
          if (detailR.value.name) mode1Name = detailR.value.name;
        } else {
          only(detailR.reason);
        }
        if (cmpR.status === "fulfilled") {
          mode1Scores = (cmpR.value.scores ?? []).slice().sort(
            (a, b) => compareVersions(a.model_version, b.model_version),
          );
        } else {
          only(cmpR.reason);
          error = cmpR.reason instanceof Error
            ? cmpR.reason.message
            : "Failed to load scores.";
        }
      } else {
        try {
          const org = await api.orgs.full(ein);
          mode1Name = org.name;
          if (org.filings?.length) mode1Year = latestYear(org);
        } catch (e) {
          only(e);
          // fall through with no year
        }

        try {
          const res = await api.scores.compare(ein, mode1Year as number);
          mode1Scores = (res.scores ?? []).slice().sort(
            (a, b) => compareVersions(a.model_version, b.model_version),
          );
        } catch (e) {
          only(e);
          error = e instanceof Error ? e.message : "Failed to load scores.";
        }
      }
    }

    // Consume the model-options fetch we kicked off above (needed by the mode-2
    // pillar pass and the render-time picker).
    try {
      const opts = await optsP;
      models = opts.map((o) => ({
        version: o.version,
        label: o.label,
        type: o.type,
      }));
      for (const o of opts) typeOfVersion.set(o.version, o.type);
    } catch (e) {
      only(e);
    }

    // ---- Mode 2: many orgs head-to-head on one model ----------------------
    if (mode2Active) {
      // Per the original loader: the overall column + name come from
      // /scores/history (latest on the chosen model) + /organizations/detail.
      // We ADD /organizations/full (city + latest year), /scores (every model,
      // for the per-pillar rows) and /financials (the financials section).
      const settled = await Promise.allSettled(
        eins.map((e) =>
          Promise.allSettled([
            api.scores.history(e, modelVersion),
            api.orgs.detail(e),
            api.orgs.full(e),
            api.scores.list(e),
          ])
        ),
      );

      // First pass: names, overall score, scores list, latest year.
      const prelim: {
        ein: string;
        name: string;
        city: string;
        total_score: number | null;
        imputed: boolean;
        missing: boolean;
        year?: number | null;
        scores: ScoreRow[];
        finYear?: number;
      }[] = [];

      for (let i = 0; i < eins.length; i++) {
        const e = eins[i];
        const r = settled[i];
        if (r.status !== "fulfilled") {
          only(r.reason);
          prelim.push({
            ein: e,
            name: formatEin(e),
            city: "",
            total_score: null,
            imputed: false,
            missing: true,
            scores: [],
          });
          continue;
        }
        const [histR, detailR, fullR, listR] = r.value;
        if (histR.status === "rejected") only(histR.reason);
        if (detailR.status === "rejected") only(detailR.reason);
        if (fullR.status === "rejected") only(fullR.reason);
        if (listR.status === "rejected") only(listR.reason);

        const history = histR.status === "fulfilled"
          ? histR.value.history ?? []
          : [];
        const latest = history.length ? history[history.length - 1] : undefined;
        const name = detailR.status === "fulfilled" && detailR.value.name
          ? detailR.value.name
          : formatEin(e);
        const full = fullR.status === "fulfilled" ? fullR.value : undefined;
        const scores = listR.status === "fulfilled"
          ? listR.value.scores ?? []
          : [];

        prelim.push({
          ein: e,
          name,
          city: cityOf(full),
          total_score: latest?.total_score ?? null,
          imputed: latest?.imputed ?? false,
          missing: !latest,
          year: latest?.year,
          scores,
          finYear: full ? latestYear(full) : undefined,
        });
      }

      // The financials header uses one fiscal year — the newest across columns.
      mode2Year = prelim
        .map((p) => p.finYear)
        .filter((y): y is number => y !== undefined)
        .reduce<number | undefined>(
          (a, y) => (a === undefined || y > a ? y : a),
          undefined,
        );

      // Second pass: pull financial facts per org (best-effort).
      const finSettled = await Promise.allSettled(
        prelim.map((p) =>
          p.finYear !== undefined
            ? api.financials.facts(p.ein, p.finYear)
            : Promise.resolve({ ein: p.ein, facts: [] as FinancialFact[] })
        ),
      );

      for (let i = 0; i < prelim.length; i++) {
        const p = prelim[i];
        const finR = finSettled[i];
        if (finR.status === "rejected") only(finR.reason);
        const facts = finR.status === "fulfilled" ? finR.value.facts ?? [] : [];

        const pillars: Record<string, number | null> = {};
        for (const pl of PILLARS) {
          pillars[pl.key] = pillarScore(p.scores, typeOfVersion, pl.types);
        }

        const fin: Record<string, number | null> = {};
        for (const fr of FIN_ROWS) {
          const v = factValue(facts, fr.concepts);
          fin[fr.label] = v;
          if (v !== null) mode2HasFin = true;
        }
        // Program ratio = program expense / total expense (when both present).
        const prog = factValue(facts, ["prog", "program_exp"]);
        const totExp = fin["Total expenses"];
        const ratio = prog !== null && totExp && totExp > 0
          ? (prog / totExp) * 100
          : null;
        fin["Program ratio"] = ratio;
        if (ratio !== null) mode2HasFin = true;

        mode2Cols.push({
          ein: p.ein,
          name: p.name,
          city: p.city,
          initials: initialsOf(p.name),
          total_score: p.total_score,
          imputed: p.imputed,
          missing: p.missing,
          year: p.year,
          pillars,
          fin,
        });
      }
    }

    return page<Data>({
      ein: einRaw,
      year: yearParam,
      einsRaw,
      model: modelParam,
      models,
      mode1Active,
      mode1Year,
      mode1Name,
      mode1Scores,
      mode2Active,
      mode2Cols,
      mode2Year,
      mode2HasFin,
      error,
    });
  },
});

/* ----------------------------------------------------------------- view */

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const anyResults = data.mode1Active || data.mode2Active;
  const cols = data.mode2Cols;

  // Mode-1 heading: org name (or EIN) + the resolved fiscal year.
  const mode1Heading = `${data.mode1Name ?? formatEin(normalizeEin(data.ein))}${
    data.mode1Year !== undefined ? ` · ${data.mode1Year}` : ""
  }`;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {/* Header */}
      <div class="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div
            class="mono uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: ".16em",
              color: "#8893ab",
              marginBottom: "9px",
            }}
          >
            Side-by-Side Analysis
          </div>
          <h1
            class="font-display font-bold text-navy"
            style={{
              fontSize: "34px",
              lineHeight: "1.05",
              letterSpacing: "-0.025em",
              margin: "0",
            }}
          >
            Compare organizations
          </h1>
          <p class="mt-2 text-[15px] text-muted">
            Line up peers head-to-head, or trace one organization across every
            scoring model.
          </p>
        </div>
      </div>

      {data.error && (
        <div class="mb-6">
          <ErrorAlert message={data.error} />
        </div>
      )}

      {/* Input forms */}
      <div class="mb-8 grid gap-4 lg:grid-cols-2">
        {/* (a) Orgs head-to-head — primary */}
        <div class="card card-pad">
          <h2 class="section-title mb-3">Organizations head-to-head</h2>
          <form method="GET" class="grid gap-4">
            <div>
              <label class="label" for="eins">EINs (one per line)</label>
              <textarea
                class="input"
                id="eins"
                name="eins"
                rows={3}
                placeholder="One EIN per line (e.g. 12-3456789)"
                value={data.einsRaw}
              />
            </div>
            <div>
              <label class="label" for="model">Model</label>
              <select class="select" id="model" name="model">
                <option value="">Select a model…</option>
                {data.models.map((m) => (
                  <option
                    value={String(m.version)}
                    selected={String(m.version) === data.model}
                  >
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button type="submit" class="btn btn-primary">
                Compare orgs
              </button>
            </div>
          </form>
        </div>

        {/* (b) One org across models */}
        <div class="card card-pad">
          <h2 class="section-title mb-3">One org across models</h2>
          <form method="GET" class="grid gap-4">
            <div>
              <label class="label" for="ein">EIN</label>
              <input
                class="input"
                id="ein"
                name="ein"
                value={data.ein}
                placeholder="12-3456789"
              />
            </div>
            <div>
              <label class="label" for="year">Year (optional)</label>
              <input
                class="input"
                id="year"
                name="year"
                value={data.year}
                placeholder="defaults to latest filing"
                inputMode="numeric"
              />
            </div>
            <div>
              <button type="submit" class="btn btn-primary">
                Compare models
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Mode 2 results: orgs head-to-head — the big comparison table card */}
      {data.mode2Active && (
        <HeadToHeadTable
          modelLabel={`Model v${data.model}`}
          cols={cols}
          pillars={PILLARS}
          finRows={FIN_ROWS}
          hasFin={data.mode2HasFin}
          finYear={data.mode2Year}
        />
      )}

      {/* Mode 1 results: one org across models */}
      {data.mode1Active && (
        <div class={data.mode2Active ? "mt-8" : ""}>
          <ModelsTable
            heading={mode1Heading}
            orgEin={normalizeEin(data.ein)}
            scores={data.mode1Scores}
          />
        </div>
      )}

      {/* Prompt when neither mode has input */}
      {!anyResults && (
        <EmptyState
          title="Pick a comparison above"
          hint="Line up several organizations head-to-head, or trace one organization across every scoring model."
        />
      )}
    </Layout>
  );
});
