import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/Layout.tsx";
import {
  Badge,
  EmptyState,
  ErrorAlert,
  PageHeader,
  Pagination,
  Table,
} from "../components/ui.tsx";
import { formatEin, titleCase } from "../lib/format.ts";
import type { OrgSummary, Sector } from "../lib/types.ts";

const LIMIT = 25;

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
  results: OrgSummary[];
  total: number;
  offset: number;
  states: { code: string; name: string }[];
  sectors: Sector[];
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

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const filters = readFilters(sp);
    const offset = Math.max(0, parseInt(sp.get("offset") ?? "0") || 0);
    const hasQuery = !!(filters.q || filters.ein || filters.state ||
      filters.city || filters.type || filters.sector || filters.grantmaker);

    // Vocab for dropdowns (best-effort).
    const vocab = await Promise.allSettled([
      api.orgs.states(),
      api.orgs.sectors(),
    ]);
    for (const r of vocab) {
      if (
        r.status === "rejected" && r.reason instanceof ApiError &&
        r.reason.status === 401
      ) {
        throw r.reason;
      }
    }
    const states = vocab[0].status === "fulfilled" ? vocab[0].value.states : [];
    const sectors = vocab[1].status === "fulfilled"
      ? vocab[1].value.sectors
      : [];

    let results: OrgSummary[] = [];
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

    return page<Data>({
      filters,
      hasQuery,
      results,
      total,
      offset,
      states,
      sectors,
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

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="Search organizations"
        subtitle="Find nonprofits and foundations by name, EIN, sector, or region."
      />

      <form method="GET" class="card card-pad mb-6">
        <div class="grid gap-4 md:grid-cols-3">
          <div class="md:col-span-2">
            <label class="label" for="q">Name</label>
            <input
              class="input"
              id="q"
              name="q"
              value={f.q}
              placeholder="Organization name…"
            />
          </div>
          <div>
            <label class="label" for="ein">EIN</label>
            <input
              class="input"
              id="ein"
              name="ein"
              value={f.ein}
              placeholder="12-3456789"
            />
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
            <label class="label" for="city">City</label>
            <input
              class="input"
              id="city"
              name="city"
              value={f.city}
              placeholder="City"
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
            <label class="label" for="type">Type</label>
            <select class="select" id="type" name="type">
              {TYPE_OPTIONS.map((o) => (
                <option value={o.value} selected={o.value === f.type}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div class="flex items-end gap-4">
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="grantmaker"
                value="1"
                checked={f.grantmaker}
              />
              Grantmakers only
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="fuzzy"
                value="0"
                checked={!f.fuzzy}
              />
              Exact match
            </label>
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="submit" class="btn btn-primary">Search</button>
          <a href="/search" class="btn btn-secondary">Clear</a>
        </div>
      </form>

      {data.error && (
        <div class="mb-4">
          <ErrorAlert message={data.error} />
        </div>
      )}

      {!data.hasQuery
        ? (
          <EmptyState
            title="Enter a search above"
            hint="Search by name (fuzzy by default), EIN prefix, or filter by state, sector, and type."
          />
        )
        : data.results.length === 0
        ? (
          <EmptyState
            title="No organizations matched"
            hint="Try broadening your filters."
          />
        )
        : (
          <>
            <Table
              head={
                <>
                  <th>Organization</th>
                  <th>EIN</th>
                  <th>Type</th>
                  <th>Sector</th>
                  <th>Location</th>
                </>
              }
            >
              {data.results.map((o) => (
                <tr>
                  <td>
                    <a href={`/orgs/${o.ein}`} class="link font-medium">
                      {o.name}
                    </a>
                    {o.following && (
                      <span class="ml-2">
                        <Badge variant="green">Following</Badge>
                      </span>
                    )}
                  </td>
                  <td class="tabular-nums text-slate-500">
                    {formatEin(o.ein)}
                  </td>
                  <td>
                    {o.org_type
                      ? (
                        <Badge
                          variant={o.org_type === "foundation"
                            ? "amber"
                            : "blue"}
                        >
                          {titleCase(o.org_type)}
                        </Badge>
                      )
                      : <span class="text-slate-400">—</span>}
                    {o.is_grantmaker && (
                      <span class="ml-1">
                        <Badge variant="gray">Grantmaker</Badge>
                      </span>
                    )}
                  </td>
                  <td class="text-slate-600">{o.sector_name ?? "—"}</td>
                  <td class="text-slate-600">
                    {o.address?.city
                      ? `${o.address.city}, ${o.address.state ?? ""}`
                      : "—"}
                  </td>
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
    </Layout>
  );
});
