import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/Layout.tsx";
import {
  Badge,
  Card,
  EmptyState,
  ErrorAlert,
  LinkButton,
  ScoreBar,
  Section,
  Stat,
  Table,
} from "../../components/ui.tsx";
import {
  dateOnly,
  formatEin,
  money,
  scorePct,
  titleCase,
} from "../../lib/format.ts";
import type {
  FinancialFact,
  OrgFull,
  RankCell,
  ScoreHistoryRow,
  ScoreRow,
} from "../../lib/types.ts";

interface GrantSummary {
  summary?: {
    grant_count: number;
    total_amount: number;
    counterparties: number;
  };
}

interface Data {
  ein: string;
  org?: OrgFull;
  notFound?: boolean;
  error?: string;
  overallVersion?: number;
  scores: ScoreRow[];
  history: ScoreHistoryRow[];
  ranking: Record<string, RankCell | null>;
  facts: FinancialFact[];
  factsYear?: number;
  grantsMade?: GrantSummary["summary"];
  grantsReceived?: GrantSummary["summary"];
}

function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    const api = ctx.state.api;

    let org: OrgFull;
    try {
      org = await api.orgs.full(ein);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      if (err instanceof ApiError && err.status === 404) {
        return page<Data>({
          ein,
          notFound: true,
          scores: [],
          history: [],
          ranking: {},
          facts: [],
        });
      }
      return page<Data>({
        ein,
        error: err instanceof Error
          ? err.message
          : "Failed to load organization.",
        scores: [],
        history: [],
        ranking: {},
        facts: [],
      });
    }
    if ((org as unknown as { error?: string }).error) {
      return page<Data>({
        ein,
        notFound: true,
        scores: [],
        history: [],
        ranking: {},
        facts: [],
      });
    }

    const scoresRes = await api.scores.list(ein).catch((e) => {
      only(e);
      return { ein, scores: [] as ScoreRow[] };
    });
    const scores = scoresRes.scores ?? [];
    const overallVersion = scores.length
      ? Math.max(...scores.map((s) => s.model_version))
      : 30;

    const latestYear = org.filings?.length
      ? Math.max(...org.filings.map((f) => f.year))
      : undefined;

    const [historyR, rankingR, finR, madeR, recvR] = await Promise.allSettled([
      api.scores.history(ein, overallVersion),
      api.scores.ranking(ein, overallVersion),
      latestYear !== undefined
        ? api.financials.facts(ein, latestYear)
        : Promise.resolve({ facts: [] as FinancialFact[] }),
      api.orgs.grants(ein, "made"),
      api.orgs.grants(ein, "received"),
    ]);
    for (const r of [historyR, rankingR, finR, madeR, recvR]) {
      if (r.status === "rejected") only(r.reason);
    }

    return page<Data>({
      ein,
      org,
      overallVersion,
      scores,
      history: historyR.status === "fulfilled"
        ? historyR.value.history ?? []
        : [],
      ranking: rankingR.status === "fulfilled"
        ? rankingR.value.dimensions ?? {}
        : {},
      facts: finR.status === "fulfilled" ? finR.value.facts ?? [] : [],
      factsYear: latestYear,
      grantsMade: madeR.status === "fulfilled"
        ? madeR.value.summary
        : undefined,
      grantsReceived: recvR.status === "fulfilled"
        ? recvR.value.summary
        : undefined,
    });
  },

  async POST(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    if (!ctx.state.principal) return ctx.redirect("/login");
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    try {
      if (action === "follow") {
        await ctx.state.api.follows.follow(ein);
      } else if (action === "unfollow") {
        await ctx.state.api.follows.unfollow(ein);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      // otherwise fall through and just reload
    }
    return ctx.redirect(`/orgs/${ein}`);
  },
});

const DIMENSION_LABELS: Record<string, string> = {
  global: "Global",
  sector: "Sector",
  state: "State",
  city: "City",
  county: "County",
};

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;

  if (data.notFound) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <EmptyState
          title="Organization not found"
          hint={`No organization with EIN ${formatEin(data.ein)}.`}
        >
          <LinkButton href="/search" variant="primary">
            Back to search
          </LinkButton>
        </EmptyState>
      </Layout>
    );
  }
  if (!data.org) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <ErrorAlert message={data.error ?? "Failed to load organization."} />
      </Layout>
    );
  }

  const org = data.org;
  const latest = data.history.length
    ? data.history[data.history.length - 1]
    : undefined;
  const overall = latest?.total_score;
  const addr = org.address;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {/* Header */}
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/search" class="link text-sm">← Search</a>
          <h1 class="mt-1 text-2xl font-bold text-slate-900">{org.name}</h1>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span class="text-sm text-slate-500">EIN {formatEin(org.ein)}</span>
            {org.org_type && (
              <Badge variant={org.org_type === "foundation" ? "amber" : "blue"}>
                {titleCase(org.org_type)}
              </Badge>
            )}
            {org.is_grantmaker && <Badge variant="gray">Grantmaker</Badge>}
            {org.sector_name && <Badge variant="gray">{org.sector_name}</Badge>}
          </div>
          {addr?.city && (
            <p class="mt-2 text-sm text-slate-500">
              {[addr.street, addr.city, addr.state, addr.zip].filter(Boolean)
                .join(", ")}
            </p>
          )}
          {org.website && (
            <a
              href={org.website}
              target="_blank"
              rel="noreferrer"
              class="link text-sm"
            >
              {org.website}
            </a>
          )}
        </div>
        {state.principal && (
          <form method="POST">
            <input
              type="hidden"
              name="action"
              value={org.following ? "unfollow" : "follow"}
            />
            <button
              type="submit"
              class={`btn ${org.following ? "btn-secondary" : "btn-primary"}`}
            >
              {org.following ? "✓ Following" : "+ Follow"}
            </button>
          </form>
        )}
      </div>

      {/* Score + ranking */}
      <div class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Overall score
          </div>
          <div class="mt-2 text-3xl font-bold text-slate-900">
            {scorePct(overall)}
          </div>
          <div class="mt-2">
            <ScoreBar value={overall} width="w-full" />
          </div>
          <div class="mt-2 text-xs text-slate-400">
            Model v{data.overallVersion}
            {latest?.imputed && (
              <span class="ml-1 text-amber-600">(estimated)</span>
            )}
          </div>
        </Card>
        {["global", "sector", "state", "city"].map((dim) => {
          const cell = data.ranking[dim];
          if (!cell) return null;
          return (
            <Stat
              label={`${DIMENSION_LABELS[dim]} rank`}
              value={`#${cell.rank}`}
              hint={`of ${cell.of} · ${cell.percentile.toFixed(0)}th pct`}
            />
          );
        })}
      </div>

      {/* Score history */}
      <Section
        title="Score history"
        actions={
          <a href={`/compare?ein=${org.ein}`} class="link text-sm">
            Compare models →
          </a>
        }
      >
        {data.history.length === 0
          ? (
            <EmptyState
              title="No scores yet"
              hint="This organization has not been scored."
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Year</th>
                  <th>Overall score</th>
                  <th></th>
                </>
              }
            >
              {[...data.history].reverse().map((h) => (
                <tr>
                  <td class="font-medium">{h.year}</td>
                  <td>
                    <ScoreBar value={h.total_score} />
                  </td>
                  <td>
                    {h.imputed && (
                      <Badge variant="amber">
                        Estimated{h.source_year
                          ? ` (from ${h.source_year})`
                          : ""}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {/* Grants */}
      {(data.grantsMade || data.grantsReceived) && (
        <Section title="Grants">
          <div class="grid gap-4 sm:grid-cols-2">
            <Card>
              <div class="section-title mb-2">Made</div>
              <div class="text-2xl font-bold text-slate-900">
                {money(data.grantsMade?.total_amount ?? 0)}
              </div>
              <div class="mt-1 text-sm text-slate-500">
                {data.grantsMade?.grant_count ?? 0} grants to{" "}
                {data.grantsMade?.counterparties ?? 0} recipients
              </div>
              <a href={`/organizations/grants?ein=${org.ein}`} class="hidden" />
            </Card>
            <Card>
              <div class="section-title mb-2">Received</div>
              <div class="text-2xl font-bold text-slate-900">
                {money(data.grantsReceived?.total_amount ?? 0)}
              </div>
              <div class="mt-1 text-sm text-slate-500">
                {data.grantsReceived?.grant_count ?? 0} grants from{" "}
                {data.grantsReceived?.counterparties ?? 0} funders
              </div>
            </Card>
          </div>
        </Section>
      )}

      {/* Financial snapshot */}
      <Section
        title={`Financials${data.factsYear ? ` · ${data.factsYear}` : ""}`}
      >
        {data.facts.length === 0
          ? (
            <EmptyState
              title="No financial data"
              hint="No canonical financial facts for the latest year."
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Concept</th>
                  <th>Value</th>
                  <th></th>
                </>
              }
            >
              {data.facts.map((f) => (
                <tr>
                  <td class="font-medium text-slate-700">
                    {titleCase(f.concept_code)}
                  </td>
                  <td class="tabular-nums">{money(f.canonical_value)}</td>
                  <td>{f.conflict && <Badge variant="red">Conflict</Badge>}</td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {/* Filings */}
      <Section title="Filings">
        {!org.filings?.length ? <EmptyState title="No filings" /> : (
          <Table
            head={
              <>
                <th>Year</th>
                <th>Form</th>
                <th>Filed</th>
              </>
            }
          >
            {[...org.filings].sort((a, b) => b.year - a.year).map((fl) => (
              <tr>
                <td class="font-medium">{fl.year}</td>
                <td>
                  <Badge variant="gray">{fl.form_code}</Badge>
                </td>
                <td class="text-slate-500">{dateOnly(fl.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </Layout>
  );
});
