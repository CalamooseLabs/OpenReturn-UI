import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/Layout.tsx";
import {
  Badge,
  Card,
  EmptyState,
  ErrorAlert,
  PageHeader,
  ScoreBar,
  Section,
  Table,
} from "../components/ui.tsx";
import { formatEin, normalizeEin } from "../lib/format.ts";
import { listModelOptions } from "../lib/models.ts";
import { isAdmin } from "../lib/auth.ts";
import type { ScoreRow } from "../lib/types.ts";

/** One row of the head-to-head (Mode 2) table: an org's latest score on a model. */
interface OrgScoreRow {
  ein: string;
  name: string;
  total_score: number | null;
  year?: number | null;
  imputed?: boolean;
  missing?: boolean;
}

interface ModelOpt {
  version: number;
  label: string;
}

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
  mode1Scores: ScoreRow[];
  // mode 2 — orgs head-to-head
  mode2Active: boolean;
  mode2Rows: OrgScoreRow[];
  error?: string;
}

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
    const modelVersion = modelParam ? parseInt(modelParam, 10) : NaN;

    const mode1Active = !!ein;
    const mode2Active = eins.length > 0 && Number.isFinite(modelVersion);

    // Model options for the head-to-head picker (best-effort).
    let models: ModelOpt[] = [];
    try {
      const opts = await listModelOptions(api, {
        admin: isAdmin(ctx.state.principal),
      });
      models = opts.map((o) => ({ version: o.version, label: o.label }));
    } catch (e) {
      only(e);
    }

    let mode1Year: number | undefined;
    let mode1Scores: ScoreRow[] = [];
    const mode2Rows: OrgScoreRow[] = [];
    let error: string | undefined;

    // ---- Mode 1: one org across every model -------------------------------
    if (mode1Active) {
      // Resolve the year. If supplied use it; else default to the org's latest
      // filing year (omit entirely if the org has no filings).
      const parsedYear = yearParam ? parseInt(yearParam, 10) : NaN;
      if (Number.isFinite(parsedYear)) {
        mode1Year = parsedYear;
      } else {
        try {
          const org = await api.orgs.full(ein);
          if (org.filings?.length) {
            mode1Year = Math.max(...org.filings.map((f) => f.year));
          }
        } catch (e) {
          only(e);
          // fall through with no year
        }
      }

      try {
        const res = await api.scores.compare(ein, mode1Year as number);
        mode1Scores = (res.scores ?? []).slice().sort(
          (a, b) => a.model_version - b.model_version,
        );
      } catch (e) {
        only(e);
        error = e instanceof Error ? e.message : "Failed to load scores.";
      }
    }

    // ---- Mode 2: many orgs on one model -----------------------------------
    if (mode2Active) {
      // One row per EIN: latest history row on the chosen model + the org name.
      const settled = await Promise.allSettled(
        eins.map((e) =>
          Promise.allSettled([
            api.scores.history(e, modelVersion),
            api.orgs.detail(e),
          ])
        ),
      );
      for (let i = 0; i < eins.length; i++) {
        const e = eins[i];
        const r = settled[i];
        // The inner allSettled never rejects; this guard is for completeness.
        if (r.status !== "fulfilled") {
          only(r.reason);
          mode2Rows.push({
            ein: e,
            name: formatEin(e),
            total_score: null,
            missing: true,
          });
          continue;
        }
        const [histR, detailR] = r.value;
        // Bubble a 401 from either call so the app redirects to login.
        if (histR.status === "rejected") only(histR.reason);
        if (detailR.status === "rejected") only(detailR.reason);

        const history = histR.status === "fulfilled"
          ? histR.value.history ?? []
          : [];
        const latest = history.length ? history[history.length - 1] : undefined;
        const name = detailR.status === "fulfilled" && detailR.value.name
          ? detailR.value.name
          : formatEin(e);

        mode2Rows.push({
          ein: e,
          name,
          total_score: latest?.total_score ?? null,
          year: latest?.year,
          imputed: latest?.imputed,
          missing: !latest,
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
      mode1Scores,
      mode2Active,
      mode2Rows,
      error,
    });
  },
});

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const anyResults = data.mode1Active || data.mode2Active;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="Compare"
        subtitle="Compare an organization across models, or organizations head-to-head."
      />

      {data.error && (
        <div class="mb-6">
          <ErrorAlert message={data.error} />
        </div>
      )}

      {/* Input forms */}
      <div class="mb-8 grid gap-4 lg:grid-cols-2">
        {/* (a) One org across models */}
        <Card>
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
        </Card>

        {/* (b) Orgs head-to-head */}
        <Card>
          <h2 class="section-title mb-3">Organizations head-to-head</h2>
          <form method="GET" class="grid gap-4">
            <div>
              <label class="label" for="eins">EINs (one per line)</label>
              <textarea
                class="input"
                id="eins"
                name="eins"
                rows={4}
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
        </Card>
      </div>

      {/* Mode 1 results: one org across models */}
      {data.mode1Active && (
        <Section
          title={`Models for ${formatEin(normalizeEin(data.ein))}${
            data.mode1Year !== undefined ? ` · ${data.mode1Year}` : ""
          }`}
          actions={
            <a href={`/orgs/${normalizeEin(data.ein)}`} class="link text-sm">
              View organization →
            </a>
          }
        >
          {data.mode1Scores.length === 0
            ? (
              <EmptyState
                title="No scores for this organization"
                hint="No scored models for the selected year. Try another year or check the EIN."
              />
            )
            : (
              <Table
                head={
                  <>
                    <th>Model</th>
                    <th>Score</th>
                    <th></th>
                  </>
                }
              >
                {data.mode1Scores.map((s) => (
                  <tr>
                    <td class="font-medium">Model v{s.model_version}</td>
                    <td>
                      <ScoreBar value={s.total_score} width="w-48" />
                    </td>
                    <td>
                      {s.imputed && <Badge variant="amber">Estimated</Badge>}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
        </Section>
      )}

      {/* Mode 2 results: orgs head-to-head on one model */}
      {data.mode2Active && (
        <Section title={`Head-to-head · Model v${data.model}`}>
          {data.mode2Rows.length === 0
            ? (
              <EmptyState
                title="No organizations to compare"
                hint="Enter at least one valid EIN and pick a model."
              />
            )
            : (
              <Table
                head={
                  <>
                    <th>Organization</th>
                    <th>Latest score</th>
                    <th>Year</th>
                  </>
                }
              >
                {data.mode2Rows.map((r) => (
                  <tr>
                    <td>
                      <a href={`/orgs/${r.ein}`} class="link font-medium">
                        {r.name}
                      </a>
                      <div class="text-xs text-slate-400 tabular-nums">
                        {formatEin(r.ein)}
                      </div>
                    </td>
                    <td>
                      {r.missing
                        ? <span class="text-slate-400">—</span>
                        : (
                          <div class="flex items-center gap-2">
                            <ScoreBar value={r.total_score} width="w-48" />
                            {r.imputed && (
                              <Badge variant="amber">Estimated</Badge>
                            )}
                          </div>
                        )}
                    </td>
                    <td class="tabular-nums text-slate-600">{r.year ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
        </Section>
      )}

      {/* Prompt when neither mode has input */}
      {!anyResults && (
        <EmptyState
          title="Pick a comparison above"
          hint="Compare one organization across every scoring model, or line up several organizations on a single model."
        />
      )}
    </Layout>
  );
});
