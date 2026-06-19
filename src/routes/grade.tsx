// Manual grading — enter a grader's value + comment for each factor of a MANUAL
// scoring model, for one organization + year. Manual models can't be computed
// from 990 data, so a person scores them here (POST /scores/grade). A score row
// is created on first save (POST /scores) and reused thereafter.
//
// Stages (by query params): no ?version → pick a manual model; ?version but no
// ?ein → enter an EIN; ?ein&?version → the grading form for the chosen year.

import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/templates.tsx";
import {
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  Flash,
  PageHeader,
  Section,
} from "../components/molecules.tsx";
import { LinkButton } from "../components/atoms.tsx";
import { can } from "../lib/auth.ts";
import { formatEin } from "../lib/format.ts";
import { to100 } from "../lib/score.ts";
import type { Filing, OrgFull } from "../lib/types.ts";

interface ManualModel {
  version: string;
  description?: string | null;
}

interface FactorRow {
  factor_id: number;
  name: string;
  weight: number;
  manual_scale: string | null;
  value: number | null;
  comment: string | null;
}

interface Data {
  canGrade: boolean;
  ein?: string;
  version?: string;
  notManual?: boolean;
  manualModels: ManualModel[];
  org?: OrgFull;
  filings: Filing[];
  year?: number;
  factors: FactorRow[];
  total: number | null;
  error?: string;
  msg?: string;
}

function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

const empty = (over: Partial<Data> = {}): Data => ({
  canGrade: true,
  manualModels: [],
  filings: [],
  factors: [],
  total: null,
  ...over,
});

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const principal = ctx.state.principal;
    if (!principal) return ctx.redirect("/login");
    const canGrade = can(principal, "score:write");
    const sp = ctx.url.searchParams;
    const ein = sp.get("ein")?.replace(/\D/g, "") || undefined;
    const version = sp.get("version")?.trim() || undefined;
    const msg = sp.get("msg") ?? undefined;
    const err = sp.get("err") ?? undefined;

    // Manual-model list for the picker (best-effort; /admin/models is admin-only,
    // so a non-admin grader just won't see the picker and opens from a model page).
    let manualModels: ManualModel[] = [];
    try {
      const r = await api.admin.listModels();
      manualModels = (r.models ?? [])
        .filter((m) => m.scoring_mode === "manual")
        .map((m) => ({
          version: String(m.version),
          description: m.description,
        }));
    } catch (e) {
      bubble401(e);
    }

    if (!version) {
      return page<Data>(empty({ canGrade, manualModels, msg, error: err }));
    }

    // Confirm the model is manual + get its factors.
    let factorsResp;
    try {
      factorsResp = await api.scores.factors(version);
    } catch (e) {
      bubble401(e);
      return page<Data>(
        empty({ canGrade, version, manualModels, error: "Model not found." }),
      );
    }
    if (factorsResp.scoring_mode !== "manual") {
      return page<Data>(
        empty({ canGrade, version, manualModels, notManual: true }),
      );
    }
    const modelFactors = factorsResp.factors ?? [];

    if (!ein) {
      return page<Data>(empty({ canGrade, version, manualModels, msg }));
    }

    // Org + its filings (to pick the year a grade applies to).
    let org: OrgFull | undefined;
    try {
      org = await api.orgs.full(ein);
    } catch (e) {
      bubble401(e);
      return page<Data>(empty({
        canGrade,
        ein,
        version,
        manualModels,
        error: `Organization ${formatEin(ein)} not found.`,
      }));
    }
    const filings = org.filings ?? [];
    const yearParam = parseInt(sp.get("year") ?? "", 10);
    const latestYear = filings.length
      ? Math.max(...filings.map((f) => f.year))
      : undefined;
    const year = Number.isFinite(yearParam) ? yearParam : latestYear;

    // Existing score (+ graded values) for this org/model/year, if any.
    const graded = new Map<
      number,
      { value: number | null; comment: string | null }
    >();
    let total: number | null = null;
    if (year !== undefined) {
      const scoresRes = await api.scores.list(ein).catch((e) => {
        bubble401(e);
        return { ein, scores: [] };
      });
      const existing = (scoresRes.scores ?? []).find((s) =>
        String(s.model_version) === String(version) && s.year === year
      );
      if (existing) {
        const detail = await api.scores.detail(existing.score_id).catch((e) => {
          bubble401(e);
          return undefined;
        });
        if (detail && !detail.error) {
          total = detail.total_score ?? null;
          for (const f of detail.factors ?? []) {
            graded.set(f.factor_id, {
              value: f.raw_value,
              comment: f.comment,
            });
          }
        }
      }
    }

    const factors: FactorRow[] = modelFactors.map((
      f: {
        factor_id: number;
        name: string;
        weight: number;
        manual_scale?: string | null;
      },
    ) => ({
      factor_id: f.factor_id,
      name: f.name,
      weight: f.weight,
      manual_scale: f.manual_scale ?? null,
      value: graded.get(f.factor_id)?.value ?? null,
      comment: graded.get(f.factor_id)?.comment ?? null,
    }));

    return page<Data>(empty({
      canGrade,
      ein,
      version,
      manualModels,
      org,
      filings,
      year,
      factors,
      total,
      msg,
      error: err,
    }));
  },

  async POST(ctx) {
    const api = ctx.state.api;
    if (!ctx.state.principal) return ctx.redirect("/login");
    const form = await ctx.req.formData();
    const ein = String(form.get("ein") ?? "").replace(/\D/g, "");
    const version = String(form.get("version") ?? "").trim();
    const year = parseInt(String(form.get("year") ?? ""), 10);
    const back = `/grade?ein=${ein}&version=${encodeURIComponent(version)}` +
      (Number.isFinite(year) ? `&year=${year}` : "");
    if (!ein || !version || !Number.isFinite(year)) {
      return ctx.redirect(
        back + "&err=" + encodeURIComponent("Missing org, model, or year."),
      );
    }

    try {
      // Resolve the filing for the chosen year, then find-or-create its score.
      const org = await api.orgs.full(ein);
      const filing = (org.filings ?? []).find((f) => f.year === year);
      if (!filing) {
        return ctx.redirect(
          back + "&err=" + encodeURIComponent("No filing for that year."),
        );
      }
      const scoresRes = await api.scores.list(ein);
      const existing = (scoresRes.scores ?? []).find((s) =>
        String(s.model_version) === String(version) && s.year === year
      );
      let scoreId = existing?.score_id;
      if (scoreId === undefined) {
        const created = await api.scores.create(filing.filing_id, version);
        if (created.error || created.score_id === undefined) {
          return ctx.redirect(
            back + "&err=" +
              encodeURIComponent(created.error ?? "Could not create score."),
          );
        }
        scoreId = created.score_id;
      }

      // Grade every factor that has a value entered (blank = leave as-is).
      for (const [key, raw] of form.entries()) {
        if (!key.startsWith("value_")) continue;
        const value = String(raw).trim();
        if (value === "") continue;
        const num = Number(value);
        if (!Number.isFinite(num)) continue;
        const factorId = parseInt(key.slice("value_".length), 10);
        const comment = String(form.get(`comment_${factorId}`) ?? "").trim();
        await api.scores.grade({
          score_id: scoreId,
          factor_id: factorId,
          value: num,
          comment: comment || undefined,
        });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const m = err instanceof Error ? err.message : "Grading failed.";
      return ctx.redirect(back + "&err=" + encodeURIComponent(m));
    }
    return ctx.redirect(back + "&msg=" + encodeURIComponent("Grades saved"));
  },
});

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const path = ctx.url.pathname;

  if (!data.canGrade) {
    return (
      <Layout principal={state.principal} path={path}>
        <PageHeader title="Manual grading" />
        <EmptyState
          title="Grading access required"
          hint="You need the score:write permission to grade manual models."
        />
      </Layout>
    );
  }

  // Stage A — pick a manual model.
  if (!data.version) {
    return (
      <Layout principal={state.principal} path={path}>
        <PageHeader
          title="Manual grading"
          subtitle="Score a manual model for an organization by grading each of its factors."
        />
        <Flash msg={data.msg} err={data.error} />
        <Section title="Choose a manual model">
          {data.manualModels.length === 0
            ? (
              <EmptyState
                title="No manual models"
                hint="Open the grader from a manual model's page, or register a manual-mode model first."
              />
            )
            : (
              <div class="flex flex-wrap gap-2">
                {data.manualModels.map((m) => (
                  <a
                    href={`/grade?version=${encodeURIComponent(m.version)}`}
                    class="card card-hover no-underline"
                    style={{ borderRadius: "10px", padding: "10px 14px" }}
                  >
                    <span class="font-semibold text-navy">v{m.version}</span>
                    {m.description && (
                      <span class="ml-2 text-sm text-muted">
                        {m.description}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
        </Section>
      </Layout>
    );
  }

  if (data.notManual) {
    return (
      <Layout principal={state.principal} path={path}>
        <PageHeader title="Manual grading" />
        <ErrorAlert
          message={`Model v${data.version} is a computed model — only manual models are graded by hand.`}
        />
        <div class="mt-4">
          <LinkButton href="/grade" variant="secondary">
            Pick a manual model
          </LinkButton>
        </div>
      </Layout>
    );
  }

  // Stage B — choose an organization (EIN).
  if (!data.ein) {
    return (
      <Layout principal={state.principal} path={path}>
        <PageHeader
          title={`Grade · model v${data.version}`}
          subtitle="Enter the organization to grade against this model."
        />
        <Flash msg={data.msg} err={data.error} />
        <Section title="Organization">
          <form method="GET" class="flex items-end gap-3">
            <input type="hidden" name="version" value={data.version} />
            <div class="flex-1">
              <Field label="EIN" name="ein" placeholder="12-3456789" required />
            </div>
            <button type="submit" class="btn btn-primary">Open</button>
          </form>
        </Section>
      </Layout>
    );
  }

  // Stage C — the grading form.
  const overall = to100(data.total);
  return (
    <Layout principal={state.principal} path={path}>
      <PageHeader
        title={`Grade · ${data.org?.name ?? formatEin(data.ein)}`}
        subtitle={`Manual model v${data.version} · EIN ${formatEin(data.ein)}`}
      />
      <Flash msg={data.msg} err={data.error} />

      {data.filings.length === 0
        ? (
          <EmptyState
            title="No filings on record"
            hint="A grade is anchored to a filing year; this organization has none."
          />
        )
        : (
          <Section title="Grade factors">
            <Card>
              {/* Year picker (reloads to show that year's existing grades). */}
              <form method="GET" class="mb-5 flex items-end gap-3">
                <input type="hidden" name="ein" value={data.ein} />
                <input type="hidden" name="version" value={data.version} />
                <div>
                  <label class="label" for="year">Filing year</label>
                  <select class="select" id="year" name="year">
                    {data.filings
                      .slice()
                      .sort((a, b) => b.year - a.year)
                      .map((f) => (
                        <option value={f.year} selected={f.year === data.year}>
                          {f.year}
                        </option>
                      ))}
                  </select>
                </div>
                <button type="submit" class="btn btn-sm btn-secondary">
                  Load year
                </button>
                <div class="ml-auto text-right">
                  <div class="text-xs text-muted">Current total</div>
                  <div class="font-display text-2xl font-bold text-navy">
                    {overall !== null ? overall : "—"}
                  </div>
                </div>
              </form>

              <form method="POST">
                <input type="hidden" name="ein" value={data.ein} />
                <input type="hidden" name="version" value={data.version} />
                <input
                  type="hidden"
                  name="year"
                  value={String(data.year ?? "")}
                />
                <div class="flex flex-col gap-4">
                  {data.factors.map((f) => (
                    <div class="rounded-xl border border-line p-4">
                      <div class="mb-2 flex items-baseline justify-between gap-3">
                        <span class="font-semibold text-navy">{f.name}</span>
                        <span class="mono text-xs text-faint">
                          weight {f.weight}
                          {f.manual_scale ? ` · ${f.manual_scale} scale` : ""}
                        </span>
                      </div>
                      <div
                        class="grid gap-3"
                        style={{ gridTemplateColumns: "160px 1fr" }}
                      >
                        <div class="field">
                          <label class="label" for={`value_${f.factor_id}`}>
                            Value
                          </label>
                          <input
                            class="input"
                            id={`value_${f.factor_id}`}
                            name={`value_${f.factor_id}`}
                            type="number"
                            step="any"
                            value={f.value ?? ""}
                            placeholder={f.manual_scale === "percent"
                              ? "0–100"
                              : "score"}
                          />
                        </div>
                        <div class="field">
                          <label class="label" for={`comment_${f.factor_id}`}>
                            Comment
                          </label>
                          <input
                            class="input"
                            id={`comment_${f.factor_id}`}
                            name={`comment_${f.factor_id}`}
                            value={f.comment ?? ""}
                            placeholder="Rationale (optional)"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div class="mt-5 flex items-center gap-3">
                  <button type="submit" class="btn btn-primary">
                    Save grades
                  </button>
                  <span class="text-xs text-faint">
                    Blank values are left unchanged. Saving recomputes the
                    total.
                  </span>
                </div>
              </form>
            </Card>
          </Section>
        )}
    </Layout>
  );
});
