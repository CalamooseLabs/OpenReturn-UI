// Conflicts inbox: list organizations with unresolved financial-fact conflicts
// (index, no query), then drill into one org (?ein=) to resolve each diverging
// fact by picking a canonical observation. Mirrors the resolution flow on
// /financials but framed as a work queue. Gated on data:read / data:write.

import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError, softError } from "../lib/api/mod.ts";
import { Layout } from "../components/templates.tsx";
import { Badge, Button } from "../components/atoms.tsx";
import {
  Card,
  EmptyState,
  ErrorAlert,
  Flash,
  PageHeader,
  Pagination,
  Section,
  Table,
} from "../components/molecules.tsx";
import { formatEin, money, normalizeEin, titleCase } from "../lib/format.ts";
import { can } from "../lib/auth.ts";
import type { ConflictOrg } from "../lib/api/financials.ts";
import type { FinancialFact } from "../lib/types.ts";

const LIMIT = 25;

interface Data {
  /** Detail view when an ein is selected; otherwise the inbox list. */
  ein: string;
  orgName?: string;
  /** Inbox rows (no ein). */
  orgs: ConflictOrg[];
  total: number;
  offset: number;
  /** Per-org diverging facts (ein selected). */
  conflicts: FinancialFact[];
  loadError?: string;
  msg?: string;
  err?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    if (!can(ctx.state.principal, "data:read")) {
      return page<Data>({
        ein: "",
        orgs: [],
        total: 0,
        offset: 0,
        conflicts: [],
      });
    }
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const ein = normalizeEin(sp.get("ein")?.trim() ?? "");
    const msg = sp.get("msg") ?? undefined;
    const err = sp.get("err") ?? undefined;
    const offset = Math.max(0, parseInt(sp.get("offset") ?? "0") || 0);

    // ---- Detail view: one org's diverging facts -----------------------------
    if (ein) {
      const [conflictsR, orgR] = await Promise.allSettled([
        api.financials.conflicts(ein),
        api.orgs.detail(ein),
      ]);
      for (const r of [conflictsR, orgR]) {
        if (r.status === "rejected") only(r.reason);
      }
      const conflicts = conflictsR.status === "fulfilled"
        ? conflictsR.value.conflicts ?? []
        : [];
      const orgName = orgR.status === "fulfilled"
        ? (orgR.value as { name?: string }).name
        : undefined;
      const loadError = conflictsR.status === "rejected"
        ? (conflictsR.reason instanceof Error
          ? conflictsR.reason.message
          : "Failed to load conflicts.")
        : undefined;
      return page<Data>({
        ein,
        orgName,
        orgs: [],
        total: 0,
        offset: 0,
        conflicts,
        loadError,
        msg,
        err,
      });
    }

    // ---- Index view: the inbox of orgs with conflicts -----------------------
    let orgs: ConflictOrg[] = [];
    let total = 0;
    let loadError: string | undefined;
    try {
      const res = await api.financials.conflictOrgs({ limit: LIMIT, offset });
      orgs = res.organizations ?? [];
      total = res.total ?? orgs.length;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      loadError = e instanceof Error ? e.message : "Failed to load conflicts.";
    }

    return page<Data>({
      ein: "",
      orgs,
      total,
      offset,
      conflicts: [],
      loadError,
      msg,
      err,
    });
  },

  async POST(ctx) {
    if (!can(ctx.state.principal, "data:write")) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const ein = normalizeEin(String(form.get("ein") ?? ""));

    const back = (extra: string) => {
      const sp = new URLSearchParams();
      if (ein) sp.set("ein", ein);
      return ctx.redirect(`/conflicts?${sp.toString()}&${extra}`);
    };

    try {
      const fiscalYear = parseInt(String(form.get("fiscal_year") ?? ""), 10);
      const observationId = parseInt(
        String(form.get("observation_id") ?? ""),
        10,
      );
      const concept = String(form.get("concept") ?? "").trim();
      if (
        !ein || !concept || Number.isNaN(fiscalYear) ||
        Number.isNaN(observationId)
      ) {
        return back("err=" + encodeURIComponent("Pick a value to use."));
      }
      const res = await api.financials.setCanonical({
        ein,
        fiscal_year: fiscalYear,
        concept,
        observation_id: observationId,
      });
      const soft = softError(res);
      if (soft) return back("err=" + encodeURIComponent(soft));
      return back("msg=" + encodeURIComponent("Resolved"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Request failed.";
      return back("err=" + encodeURIComponent(msg));
    }
  },
});

function AccessRequired(props: { path: string; principal: unknown }) {
  return (
    <Layout
      principal={props.principal as never}
      path={props.path}
    >
      <PageHeader eyebrow="Financial Data" title="Conflicts" />
      <Card>
        <h2 class="font-display text-lg font-bold tracking-[-0.01em] text-navy">
          Access required
        </h2>
        <p class="mt-2 text-sm text-muted">
          You need the <code class="text-ink">data:read</code>{" "}
          permission to review financial conflicts.
        </p>
      </Card>
    </Layout>
  );
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;

  if (!can(state.principal, "data:read")) {
    return (
      <AccessRequired path={ctx.url.pathname} principal={state.principal} />
    );
  }

  const canWrite = can(state.principal, "data:write");

  // ---- Detail view --------------------------------------------------------
  if (data.ein) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname} wide>
        <PageHeader
          eyebrow="Conflicts"
          title={data.orgName ?? "Organization"}
          subtitle="Resolve each diverging fact by choosing the value to treat as canonical."
        />

        <div class="mono mb-6 flex flex-wrap items-center gap-4 text-xs text-faint">
          <span>EIN {formatEin(data.ein)}</span>
          <a href="/conflicts" class="link">← Back to inbox</a>
          <a href={`/orgs/${data.ein}`} class="link">View organization →</a>
        </div>

        <Flash msg={data.msg} err={data.err} />
        {data.loadError && (
          <div class="mb-4">
            <ErrorAlert message={data.loadError} />
          </div>
        )}

        <Section title={`Conflicts (${data.conflicts.length})`}>
          {data.conflicts.length === 0
            ? (
              <EmptyState
                title="No unresolved conflicts"
                hint="Every fact for this organization has a single agreed value or a chosen canonical observation."
              />
            )
            : (
              <div class="grid gap-4">
                {data.conflicts.map((c) => (
                  <Card>
                    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div class="font-display font-bold text-navy">
                          {titleCase(c.concept_code)}
                        </div>
                        <div class="mono mt-0.5 text-xs text-faint">
                          Fiscal year {c.fiscal_year}
                          {c.chosen_by ? ` · chosen by ${c.chosen_by}` : ""}
                        </div>
                      </div>
                      <Badge variant="red">Conflict</Badge>
                    </div>

                    <Table
                      head={
                        <>
                          <th>Source</th>
                          <th>Value</th>
                          <th>Confidence</th>
                          {canWrite && <th class="text-right">Action</th>}
                        </>
                      }
                    >
                      {c.observations.map((o) => (
                        <tr>
                          <td class="text-ink">
                            <code>{o.source_code}</code>
                          </td>
                          <td class="tabular-nums font-semibold text-navy">
                            {money(o.value)}
                            {o.is_canonical && (
                              <span class="ml-2">
                                <Badge variant="green">Canonical</Badge>
                              </span>
                            )}
                          </td>
                          <td class="tabular-nums text-muted">
                            {o.confidence === null ||
                                o.confidence === undefined
                              ? "—"
                              : `${(o.confidence * 100).toFixed(0)}%`}
                          </td>
                          {canWrite && (
                            <td class="text-right">
                              <form method="POST" class="inline">
                                <input
                                  type="hidden"
                                  name="ein"
                                  value={data.ein}
                                />
                                <input
                                  type="hidden"
                                  name="concept"
                                  value={c.concept_code}
                                />
                                <input
                                  type="hidden"
                                  name="fiscal_year"
                                  value={c.fiscal_year}
                                />
                                <input
                                  type="hidden"
                                  name="observation_id"
                                  value={o.observation_id}
                                />
                                <Button
                                  type="submit"
                                  variant="primary"
                                  size="sm"
                                >
                                  Use this value
                                </Button>
                              </form>
                            </td>
                          )}
                        </tr>
                      ))}
                    </Table>
                  </Card>
                ))}
              </div>
            )}
        </Section>
      </Layout>
    );
  }

  // ---- Index view (the inbox) ---------------------------------------------
  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        eyebrow="Financial Data"
        title="Conflicts"
        subtitle="Organizations whose financial facts diverge across sources and need a canonical value chosen."
      />

      <Flash msg={data.msg} err={data.err} />
      {data.loadError && (
        <div class="mb-4">
          <ErrorAlert message={data.loadError} />
        </div>
      )}

      {data.orgs.length === 0
        ? (
          <EmptyState
            title="No conflicts to resolve"
            hint="Every organization's financial facts agree or already have a chosen canonical value."
          />
        )
        : (
          <>
            <Table
              head={
                <>
                  <th>Organization</th>
                  <th class="text-right">Conflicts</th>
                  <th class="w-32"></th>
                </>
              }
            >
              {data.orgs.map((o) => (
                <tr>
                  <td>
                    <a
                      href={`/conflicts?ein=${o.ein}`}
                      class="link font-medium"
                    >
                      {o.name}
                    </a>
                    <div class="mono text-xs text-faint tabular-nums">
                      {formatEin(o.ein)}
                    </div>
                  </td>
                  <td class="text-right">
                    <Badge variant="red">{o.conflict_count}</Badge>
                  </td>
                  <td class="text-right">
                    <a href={`/conflicts?ein=${o.ein}`} class="link text-sm">
                      Review →
                    </a>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              total={data.total}
              limit={LIMIT}
              offset={data.offset}
              makeHref={(offset) => `/conflicts?offset=${offset}`}
            />
          </>
        )}
    </Layout>
  );
});
