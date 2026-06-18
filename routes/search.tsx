import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/templates.tsx";
import { OrgCard, type ScoredOrg } from "../components/organisms/OrgCard.tsx";
import { to100 } from "../lib/score.ts";
import type { ModelSummary, Sector } from "../lib/types.ts";

const LIMIT = 24;

interface Filters {
  q: string;
  ein: string;
  state: string;
  city: string;
  type: string;
  sector: string;
  grantmaker: boolean;
  fuzzy: boolean;
}

interface Data {
  filters: Filters;
  hasQuery: boolean;
  results: ScoredOrg[];
  total: number;
  offset: number;
  states: { code: string; name: string }[];
  sectors: Sector[];
  overallVersion?: number;
  error?: string;
}

function readFilters(sp: URLSearchParams): Filters {
  return {
    q: sp.get("q")?.trim() ?? "",
    ein: sp.get("ein")?.trim() ?? "",
    state: sp.get("state") ?? "",
    city: sp.get("city")?.trim() ?? "",
    type: sp.get("type") ?? "",
    sector: sp.get("sector") ?? "",
    grantmaker: sp.get("grantmaker") === "1",
    fuzzy: sp.get("fuzzy") !== "0", // default on
  };
}

function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

/** Normalize an EIN to its 9 digits for use as a map key. */
function einKey(ein: string): string {
  return ein.replace(/\D/g, "");
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const filters = readFilters(sp);
    const offset = Math.max(0, parseInt(sp.get("offset") ?? "0") || 0);
    const hasQuery = !!(filters.q || filters.ein || filters.state ||
      filters.city || filters.type || filters.sector || filters.grantmaker);

    // Vocab for dropdowns + the highest (super-composite) model version, which
    // backs the overall score. listModels may 403 for non-admins — tolerate it.
    const meta = await Promise.allSettled([
      api.orgs.states(),
      api.orgs.sectors(),
      api.admin.listModels(),
    ]);
    for (const r of meta) {
      if (
        r.status === "rejected" && r.reason instanceof ApiError &&
        r.reason.status === 401
      ) {
        throw r.reason;
      }
    }
    const states = meta[0].status === "fulfilled" ? meta[0].value.states : [];
    const sectors = meta[1].status === "fulfilled" ? meta[1].value.sectors : [];
    const models: ModelSummary[] = meta[2].status === "fulfilled"
      ? meta[2].value.models ?? []
      : [];
    // Prefer a super_composite (the overall score); else the highest version.
    const overallVersion = models.length
      ? Math.max(
        ...(models.some((m) => m.model_kind === "super_composite")
          ? models.filter((m) => m.model_kind === "super_composite")
          : models).map((m) => m.version),
      )
      : undefined;

    let results: ScoredOrg[] = [];
    let total = 0;
    let error: string | undefined;

    try {
      const res = await api.orgs.search({
        q: filters.q || undefined,
        ein: filters.ein || undefined,
        state: filters.state || undefined,
        city: filters.city || undefined,
        type: filters.type || undefined,
        sector: filters.sector || undefined,
        grantmaker: filters.grantmaker ? 1 : undefined,
        fuzzy: filters.fuzzy ? undefined : 0,
        limit: LIMIT,
        offset,
      });
      results = res.organizations ?? [];
      total = res.total ?? results.length;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      error = err instanceof Error ? err.message : "Search failed.";
    }

    // Overlay overall scores in ONE cheap call: the leaderboard for the same
    // filter subset returns total_score per org, which we join onto the page.
    if (results.length && overallVersion !== undefined) {
      const board = await api.scores.leaderboard({
        model: overallVersion,
        sector: filters.sector || undefined,
        state: filters.state || undefined,
        city: filters.city || undefined,
        type: filters.type || undefined,
        grantmaker: filters.grantmaker ? 1 : undefined,
        limit: 500,
      }).catch((e) => {
        only(e);
        return undefined;
      });
      if (board?.leaderboard?.length) {
        const byEin = new Map<string, number>();
        for (const row of board.leaderboard) {
          byEin.set(einKey(row.ein), row.total_score);
        }
        results = results.map((o) => ({
          ...o,
          score100: to100(byEin.get(einKey(o.ein))),
        }));
      }
    }

    return page<Data>({
      filters,
      hasQuery,
      results,
      total,
      offset,
      states,
      sectors,
      overallVersion,
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

  const makeHref = (offset: number) => {
    const sp = new URLSearchParams();
    if (f.q) sp.set("q", f.q);
    if (f.ein) sp.set("ein", f.ein);
    if (f.state) sp.set("state", f.state);
    if (f.city) sp.set("city", f.city);
    if (f.type) sp.set("type", f.type);
    if (f.sector) sp.set("sector", f.sector);
    if (f.grantmaker) sp.set("grantmaker", "1");
    if (!f.fuzzy) sp.set("fuzzy", "0");
    sp.set("offset", String(offset));
    return `/search?${sp.toString()}`;
  };

  const from = data.total === 0 ? 0 : data.offset + 1;
  const to = Math.min(data.offset + LIMIT, data.total);
  const hasPrev = data.offset > 0;
  const hasNext = data.offset + LIMIT < data.total;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {/* Header */}
      <div class="mb-5">
        <div class="section-title">Organization Directory</div>
        <h1
          class="mt-2 font-display font-bold text-navy"
          style={{
            fontSize: "34px",
            lineHeight: "1.05",
            letterSpacing: "-0.025em",
          }}
        >
          Search organizations
        </h1>
      </div>

      {/* Search + filters (GET form, no island) */}
      <form method="GET" class="mb-4">
        <div class="flex flex-wrap items-end gap-3">
          {/* Prominent name search with navy border + magnifier */}
          <label
            class="flex min-w-[280px] flex-1 items-center gap-2.5 bg-surface"
            style={{
              border: "1.5px solid #192a54",
              borderRadius: "12px",
              height: "46px",
              padding: "0 16px",
              boxShadow: "0 1px 2px rgba(25,42,84,.05)",
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="8"
                cy="8"
                r="5.6"
                stroke="#192a54"
                stroke-width="1.7"
              />
              <path
                d="M12.4 12.4l3.2 3.2"
                stroke="#192a54"
                stroke-width="1.7"
                stroke-linecap="round"
              />
            </svg>
            <input
              name="q"
              value={f.q}
              placeholder="Search by name, EIN, or city"
              class="min-w-0 flex-1 border-none bg-transparent text-ink outline-none"
              style={{ fontSize: "14.5px" }}
            />
          </label>
        </div>

        {/* Filter selects rendered as navy-bordered chips */}
        <div class="mt-3 flex flex-wrap items-center gap-2.5">
          <input
            class="input"
            name="ein"
            value={f.ein}
            placeholder="EIN"
            style={{ height: "40px", width: "150px", borderRadius: "999px" }}
          />
          <select
            class="select"
            name="state"
            style={{ height: "40px", width: "auto", borderRadius: "999px" }}
          >
            <option value="">Any state</option>
            {data.states.map((s) => (
              <option value={s.code} selected={s.code === f.state}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            class="input"
            name="city"
            value={f.city}
            placeholder="City"
            style={{ height: "40px", width: "150px", borderRadius: "999px" }}
          />
          <select
            class="select"
            name="sector"
            style={{ height: "40px", width: "auto", borderRadius: "999px" }}
          >
            <option value="">Any sector</option>
            {data.sectors.map((s) => (
              <option value={s.code} selected={s.code === f.sector}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
          <select
            class="select"
            name="type"
            style={{ height: "40px", width: "auto", borderRadius: "999px" }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option value={o.value} selected={o.value === f.type}>
                {o.label}
              </option>
            ))}
          </select>
          <label
            class="flex items-center gap-2 text-sm text-muted"
            style={{
              border: f.grantmaker ? "1px solid #192a54" : "1px solid #dde2ec",
              background: f.grantmaker ? "#192a54" : "#fff",
              color: f.grantmaker ? "#fff" : "#5a6172",
              borderRadius: "999px",
              padding: "0 15px",
              height: "40px",
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              name="grantmaker"
              value="1"
              checked={f.grantmaker}
            />
            Grantmakers
          </label>
          <label
            class="flex items-center gap-2 text-sm text-muted"
            style={{
              border: !f.fuzzy ? "1px solid #192a54" : "1px solid #dde2ec",
              background: !f.fuzzy ? "#192a54" : "#fff",
              color: !f.fuzzy ? "#fff" : "#5a6172",
              borderRadius: "999px",
              padding: "0 15px",
              height: "40px",
              fontWeight: 600,
            }}
          >
            <input type="checkbox" name="fuzzy" value="0" checked={!f.fuzzy} />
            Exact match
          </label>
          <button
            type="submit"
            class="btn btn-primary"
            style={{ height: "40px" }}
          >
            Search
          </button>
          <a
            href="/search"
            class="btn btn-secondary"
            style={{ height: "40px" }}
          >
            Clear
          </a>
        </div>
      </form>

      {data.error && (
        <div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {data.error}
        </div>
      )}

      {/* Results meta */}
      {data.hasQuery && !data.error && data.results.length > 0 && (
        <div class="mb-3.5 flex items-center justify-between">
          <div class="text-sm text-muted">
            {data.total} organization{data.total === 1 ? "" : "s"} · sorted by
            {" "}
            <strong class="font-semibold text-ink">relevance</strong>
          </div>
          <div
            class="mono uppercase text-faint"
            style={{ fontSize: "11px", letterSpacing: ".12em" }}
          >
            {from}–{to}
          </div>
        </div>
      )}

      {/* Body */}
      {!data.hasQuery
        ? (
          <div class="card card-pad text-center text-muted">
            <p class="font-medium text-ink">Enter a search above</p>
            <p class="mt-1 text-sm">
              Search by name (fuzzy by default), EIN prefix, or filter by state,
              sector, and type.
            </p>
          </div>
        )
        : data.results.length === 0
        ? (
          <div
            class="text-center text-faint"
            style={{ padding: "60px 20px", fontSize: "14px" }}
          >
            No organizations match your search.
          </div>
        )
        : (
          <>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.results.map((o) => <OrgCard key={o.ein} org={o} />)}
            </div>

            {/* Pagination — Load more / Prev-Next */}
            <div class="mt-7 flex items-center justify-center gap-3">
              {hasPrev && (
                <a
                  href={makeHref(Math.max(0, data.offset - LIMIT))}
                  class="btn btn-secondary"
                  style={{ height: "42px", borderRadius: "11px" }}
                >
                  ← Previous
                </a>
              )}
              {hasNext && (
                <a
                  href={makeHref(data.offset + LIMIT)}
                  class="btn btn-secondary"
                  style={{ height: "42px", borderRadius: "11px" }}
                >
                  Load more organizations
                </a>
              )}
            </div>
          </>
        )}
    </Layout>
  );
});
