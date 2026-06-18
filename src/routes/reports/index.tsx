import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/Layout.tsx";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  Pagination,
  ScoreBar,
  Table,
} from "../../components/ui.tsx";
import {
  listModelOptions,
  type ModelOption,
  pickOverallModel,
} from "../../lib/models.ts";
import { FilterChip } from "../../components/molecules.tsx";
import { isAdmin } from "../../lib/auth.ts";
import { formatEin } from "../../lib/format.ts";
import type { LeaderboardRow, Sector } from "../../lib/types.ts";

const LIMIT = 25;

interface Filters {
  model: string | undefined;
  year: string;
  sector: string;
  state: string;
  type: string;
  grantmaker: boolean;
}

interface Data {
  filters: Filters;
  models: ModelOption[];
  sectors: Sector[];
  states: { code: string; name: string }[];
  rows: LeaderboardRow[];
  total: number;
  offset: number;
  resolvedYear: number | null;
  error?: string;
}

function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const offset = Math.max(0, parseInt(sp.get("offset") ?? "0") || 0);

    // The org-type toggle scopes the board and drives the default model.
    const type = sp.get("type") === "foundation"
      ? "foundation"
      : sp.get("type") === "other"
      ? "other"
      : sp.get("type") === "nonprofit"
      ? "nonprofit"
      : "nonprofit";

    const modelParam = sp.get("model");

    // listModelOptions populates the picker; pickOverallModel resolves the
    // default selection for the active type. Both independently hit
    // /admin/models, so run them concurrently rather than serially (the leftover
    // duplicate fetch overlaps instead of adding a round-trip). pickOverallModel
    // is only consumed (and only run) when no explicit ?model= was given. We
    // resolve its no-admin/error fallback against `models` once both settle, so
    // the .catch fan-out matches the original behaviour exactly.
    const PICK_FAILED = Symbol("pick-failed");
    const [models, picked] = await Promise.all([
      listModelOptions(api, { admin: isAdmin(ctx.state.principal) }),
      modelParam
        ? Promise.resolve<string | undefined>(undefined)
        : pickOverallModel(api, type).catch(
          (e): string | undefined | typeof PICK_FAILED => {
            bubble401(e);
            return PICK_FAILED;
          },
        ),
    ]);

    let model: string | undefined;
    if (modelParam) {
      model = modelParam;
    } else if (picked === PICK_FAILED) {
      // pickOverallModel failed (non-401): fall back to the highest version
      // in the picker, mirroring the original .catch behaviour.
      model = models.length ? models[models.length - 1].version : undefined;
    } else {
      // No explicit model: the overall model for the active type
      // (foundation → applies_to=foundation; else → super-composite).
      model = picked;
    }

    const filters: Filters = {
      model,
      year: sp.get("year")?.trim() ?? "",
      sector: sp.get("sector") ?? "",
      state: sp.get("state") ?? "",
      type,
      grantmaker: sp.get("grantmaker") === "1",
    };

    // Subset-filter vocab (best-effort).
    const vocab = await Promise.allSettled([
      api.orgs.sectors(),
      api.orgs.states(),
    ]);
    for (const r of vocab) if (r.status === "rejected") bubble401(r.reason);
    const sectors = vocab[0].status === "fulfilled"
      ? vocab[0].value.sectors ?? []
      : [];
    const states = vocab[1].status === "fulfilled"
      ? vocab[1].value.states ?? []
      : [];

    let rows: LeaderboardRow[] = [];
    let total = 0;
    let resolvedYear: number | null = null;
    let error: string | undefined;

    if (model !== undefined) {
      const yearNum = filters.year ? parseInt(filters.year, 10) : NaN;
      try {
        const res = await api.scores.leaderboard({
          model,
          year: !isNaN(yearNum) ? yearNum : undefined,
          sector: filters.sector || undefined,
          state: filters.state || undefined,
          type: filters.type || undefined,
          grantmaker: filters.grantmaker ? 1 : undefined,
          limit: LIMIT,
          offset,
        });
        rows = res.leaderboard ?? [];
        total = res.total ?? rows.length;
        resolvedYear = res.year ?? null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) throw err;
        error = err instanceof Error
          ? err.message
          : "Failed to load leaderboard.";
      }
    }

    return page<Data>({
      filters,
      models,
      sectors,
      states,
      rows,
      total,
      offset,
      resolvedYear,
      error,
    });
  },
});

const TYPE_OPTIONS = [
  { value: "", label: "Any type" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "foundation", label: "Foundation" },
  { value: "other", label: "Other" },
];

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const f = data.filters;

  const filterParams = () => {
    const sp = new URLSearchParams();
    if (f.model !== undefined) sp.set("model", String(f.model));
    if (f.year) sp.set("year", f.year);
    if (f.sector) sp.set("sector", f.sector);
    if (f.state) sp.set("state", f.state);
    if (f.type) sp.set("type", f.type);
    if (f.grantmaker) sp.set("grantmaker", "1");
    return sp;
  };

  const makeHref = (offset: number) => {
    const sp = filterParams();
    sp.set("offset", String(offset));
    return `/reports?${sp.toString()}`;
  };

  const exportHref = (format: string) => {
    const sp = filterParams();
    sp.set("format", format);
    return `/reports/export?${sp.toString()}`;
  };

  const noModels = data.models.length === 0;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="Leaderboards & rankings"
        subtitle="Rank organizations by any scoring model — globally or scoped to a sector, state, or type."
      />

      {
        /* Org-type toggle: re-scope the board to non-profits or foundations.
          Clears the model so the type's default overall model is chosen. */
      }
      <div class="mb-6 flex gap-2">
        <FilterChip
          href="/reports?type=nonprofit"
          label="Non-Profits"
          active={f.type !== "foundation"}
        />
        <FilterChip
          href="/reports?type=foundation"
          label="Foundations"
          active={f.type === "foundation"}
        />
      </div>

      {noModels
        ? (
          <EmptyState
            title="No scoring models available"
            hint="No models are registered yet. Register a model from a template to build leaderboards."
          />
        )
        : (
          <>
            <form method="GET" class="card card-pad mb-6">
              <div class="grid gap-4 md:grid-cols-3">
                <div class="md:col-span-2">
                  <label class="label" for="model">Model</label>
                  <select class="select" id="model" name="model">
                    {data.models.map((m) => (
                      <option
                        value={String(m.version)}
                        selected={m.version === f.model}
                      >
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="label" for="year">Year</label>
                  <input
                    class="input"
                    id="year"
                    name="year"
                    value={f.year}
                    placeholder="Latest"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label class="label" for="sector">Sector</label>
                  <select class="select" id="sector" name="sector">
                    <option value="">Any sector</option>
                    {data.sectors.map((s) => (
                      <option value={s.code} selected={s.code === f.sector}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="label" for="state">State</label>
                  <select class="select" id="state" name="state">
                    <option value="">Any state</option>
                    {data.states.map((s) => (
                      <option value={s.code} selected={s.code === f.state}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="label" for="type">Type</label>
                  <select class="select" id="type" name="type">
                    {TYPE_OPTIONS.map((o) => (
                      <option value={o.value} selected={o.value === f.type}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="flex items-end">
                  <label class="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      name="grantmaker"
                      value="1"
                      checked={f.grantmaker}
                    />
                    Grantmakers only
                  </label>
                </div>
              </div>
              <div class="mt-4 flex gap-2">
                <button type="submit" class="btn btn-primary">Apply</button>
                <a href="/reports" class="btn btn-secondary">Clear</a>
              </div>
            </form>

            {data.error && (
              <div class="mb-4">
                <ErrorAlert message={data.error} />
              </div>
            )}

            {!data.error && data.rows.length === 0
              ? (
                <EmptyState
                  title="No ranked organizations"
                  hint="No scored organizations match these filters. Try clearing the subset filters or choosing a different model or year."
                />
              )
              : !data.error && (
                <>
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div class="text-sm text-slate-500">
                      Ranked by model v{f.model}
                      {data.resolvedYear !== null
                        ? ` · ${data.resolvedYear}`
                        : " · latest year per organization"}
                    </div>
                    <div class="flex gap-2">
                      {
                        /* `download` marks these as file downloads (the responses
                        are Content-Disposition: attachment), so they don't trigger
                        the global navigation progress bar (which would otherwise
                        never clear, since a download doesn't unload the page). */
                      }
                      <a
                        href={exportHref("pdf")}
                        download
                        class="btn btn-sm btn-primary"
                      >
                        Export PDF
                      </a>
                      <a
                        href={exportHref("csv")}
                        download
                        class="btn btn-sm btn-secondary"
                      >
                        Export CSV
                      </a>
                    </div>
                  </div>
                  <Table
                    head={
                      <>
                        <th class="w-16">Rank</th>
                        <th>Organization</th>
                        <th>Score</th>
                        <th class="w-20">Year</th>
                      </>
                    }
                  >
                    {data.rows.map((r) => (
                      <tr>
                        <td class="font-semibold tabular-nums text-slate-700">
                          #{r.rank}
                        </td>
                        <td>
                          <a href={`/orgs/${r.ein}`} class="link font-medium">
                            {r.name}
                          </a>
                          <div class="text-xs text-slate-400 tabular-nums">
                            {formatEin(r.ein)}
                          </div>
                        </td>
                        <td>
                          <ScoreBar value={r.total_score} />
                        </td>
                        <td class="tabular-nums text-slate-500">{r.year}</td>
                      </tr>
                    ))}
                  </Table>
                  <Pagination
                    total={data.total}
                    limit={LIMIT}
                    offset={data.offset}
                    makeHref={makeHref}
                  />
                </>
              )}
          </>
        )}
    </Layout>
  );
});
