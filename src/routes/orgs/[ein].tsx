import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError, softError } from "../../lib/api/mod.ts";
import type { Grant } from "../../lib/api/orgs.ts";
import { Layout } from "../../components/templates.tsx";
import { EmptyState, ErrorAlert, Flash } from "../../components/molecules.tsx";
import { LinkButton } from "../../components/atoms.tsx";
import {
  NarrativeRow,
  OrgHero,
  type PillarBreakdown,
  type PillarDatum,
  ScoreRingsRail,
  UpdatesPanel,
  WhyThisScore,
} from "../../components/organisms/OrgProfile.tsx";
import {
  ModelDataModal,
  type ModelPanel,
} from "../../components/organisms/ModelDataModal.tsx";
import FinancialTabs, {
  type FinTableRow,
} from "../../islands/FinancialTabs.tsx";
import GrantsPanel from "../../islands/GrantsPanel.tsx";
import KeyPersonnel from "../../islands/KeyPersonnel.tsx";
import FilingsTable from "../../islands/FilingsTable.tsx";
import { formatEin, titleCase } from "../../lib/format.ts";
import { letterGrade, ordinal, to100 } from "../../lib/score.ts";
import { can } from "../../lib/auth.ts";
import { compareVersions, maxVersion } from "../../lib/models.ts";
import type { ScoreDetail } from "../../lib/api/scores.ts";
import type {
  FinancialFact,
  Gift,
  OrgFull,
  OrgNote,
  Person,
  Personnel,
  RankCell,
  ScoreHistoryRow,
  ScoreRow,
} from "../../lib/types.ts";

interface GrantSummary {
  grant_count: number;
  total_amount: number;
  counterparties: number;
}

interface GrantFlow {
  summary: GrantSummary;
  grants: Grant[];
}

interface GivingData {
  gifts: Gift[];
  summary: { gift_count: number; total_amount: number };
}

interface Data {
  ein: string;
  org?: OrgFull;
  notFound?: boolean;
  error?: string;
  err?: string;
  msg?: string;
  overallVersion?: string;
  scores: ScoreRow[];
  history: ScoreHistoryRow[];
  ranking: Record<string, RankCell | null>;
  pillarBreakdown: PillarBreakdown[];
  facts: FinancialFact[];
  conceptNames: Record<string, string>;
  conceptCats: Record<string, string | null>;
  people: Person[];
  personnel: Personnel[];
  personnelYear?: number | null;
  personnelYears: number[];
  tags: string[];
  notes: OrgNote[];
  giving: GivingData;
  grantsMade?: GrantFlow;
  grantsReceived?: GrantFlow;
  panel?: ModelPanel;
}

const EMPTY_GIVING: GivingData = {
  gifts: [],
  summary: { gift_count: 0, total_amount: 0 },
};

function blank(ein: string, extra: Partial<Data> = {}): Data {
  return {
    ein,
    scores: [],
    history: [],
    ranking: {},
    pillarBreakdown: [],
    facts: [],
    conceptNames: {},
    conceptCats: {},
    people: [],
    personnel: [],
    personnelYears: [],
    tags: [],
    notes: [],
    giving: EMPTY_GIVING,
    ...extra,
  };
}

function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const flash = {
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    };

    // Everything that depends only on the EIN (not the model version) fans out in
    // parallel with full(). On a 404 the results are simply discarded.
    const sideP = Promise.allSettled([
      api.scores.list(ein),
      api.people.list({ ein }),
      api.orgs.grants(ein, "made"),
      api.orgs.grants(ein, "received"),
      api.orgs.personnel(ein),
      api.tags.forOrg(ein),
      api.notes.list(ein),
      api.giving.list(ein),
      api.financials.facts(ein), // all years (for the by-year table)
      api.financials.concepts(), // code → name labels for the table
    ]);

    let org: OrgFull;
    try {
      org = await api.orgs.full(ein);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      if (err instanceof ApiError && err.status === 404) {
        return page<Data>(blank(ein, { notFound: true }));
      }
      return page<Data>(blank(ein, {
        error: err instanceof Error
          ? err.message
          : "Failed to load organization.",
      }));
    }
    if ((org as unknown as { error?: string }).error) {
      return page<Data>(blank(ein, { notFound: true }));
    }

    const [
      scoresR,
      peopleR,
      madeR,
      recvR,
      personnelR,
      tagsR,
      notesR,
      givingR,
      factsR,
      conceptsR,
    ] = await sideP;
    for (
      const r of [
        scoresR,
        peopleR,
        madeR,
        recvR,
        personnelR,
        tagsR,
        notesR,
        givingR,
        factsR,
        conceptsR,
      ]
    ) {
      if (r.status === "rejected") only(r.reason);
    }

    const scores = scoresR.status === "fulfilled"
      ? (scoresR.value.scores ?? [])
      : [];
    const overallVersion = scores.length
      ? maxVersion(scores.map((s) => s.model_version))!
      : "30";

    // history + ranking genuinely depend on the resolved model version.
    const [historyR, rankingR] = await Promise.allSettled([
      api.scores.history(ein, overallVersion),
      api.scores.ranking(ein, overallVersion),
    ]);
    for (const r of [historyR, rankingR]) {
      if (r.status === "rejected") only(r.reason);
    }

    // Per-pillar factor breakdown for "Why this score": the latest scored row per
    // pillar type, then its per-factor detail (name / weight / contribution).
    const pillarRows = PILLARS.map((p) => {
      // Break down the pillar's COMPOSITE/base model — never the super_composite
      // (a pass-through wrapper whose single factor is the composite, which would
      // render as one meaningless bar). The super_composite drives the OVERALL
      // gauge instead; the pillar shows the dimension's own factors.
      const rows = scores
        .filter((s) =>
          !!s.model_type && p.types.includes(s.model_type) &&
          s.model_kind !== "super_composite"
        )
        .sort((a, b) =>
          compareVersions(b.model_version, a.model_version) || b.year - a.year
        );
      return rows.length
        ? {
          label: p.label,
          scoreId: rows[0].score_id,
          version: rows[0].model_version,
        }
        : null;
    }).filter((x): x is { label: string; scoreId: number; version: string } =>
      x !== null
    );
    const detailR = await Promise.allSettled(
      pillarRows.map((pr) => api.scores.detail(pr.scoreId)),
    );
    for (const r of detailR) if (r.status === "rejected") only(r.reason);
    const pillarBreakdown: PillarBreakdown[] = pillarRows.map((pr, i) => {
      const d = detailR[i].status === "fulfilled"
        ? (detailR[i] as PromiseFulfilledResult<ScoreDetail>).value
        : null;
      return {
        label: pr.label,
        version: pr.version,
        total: d?.total_score ?? null,
        factors: (d?.factors ?? []).map((f) => ({
          name: f.name,
          weight: f.weight,
          weighted_value: f.weighted_value,
        })),
      };
    });

    const conceptNames: Record<string, string> = {};
    const conceptCats: Record<string, string | null> = {};
    const conceptList: { code: string; label: string }[] = [];
    if (conceptsR.status === "fulfilled") {
      for (const c of conceptsR.value.concepts ?? []) {
        conceptNames[c.code] = c.label; // backend returns `label` (the full name)
        conceptCats[c.code] = c.category ?? null;
        conceptList.push({ code: c.code, label: c.label });
      }
    }

    // Model-data panel (?panel=<version>&panelYear=<year>): the per-model/year
    // editor (financial figures + grading + notes + custom fields). Fetched only
    // when open + the caller is a logged-in user.
    let panel: ModelPanel | undefined;
    const panelVersion = sp.get("panel")?.trim();
    // Only open the panel for a model the org is actually scored on (a real,
    // non-arbitrary version) — an unknown ?panel= is ignored.
    const knownVersion = !!panelVersion &&
      scores.some((sc) => String(sc.model_version) === panelVersion);
    if (panelVersion && knownVersion && ctx.state.principal) {
      const filingRows = (org.filings ?? []).filter((f) =>
        f.form_code !== "FIN"
      );
      const fYears = [...new Set(filingRows.map((f) => f.year))].sort((a, b) =>
        b - a
      );
      const reqYear = Number(sp.get("panelYear"));
      const pYear = fYears.includes(reqYear) ? reqYear : (fYears[0] ?? reqYear);
      const allFacts = factsR.status === "fulfilled"
        ? factsR.value.facts ?? []
        : [];
      const [factorsPR, mdR] = await Promise.allSettled([
        api.scores.factors(panelVersion),
        Number.isFinite(pYear)
          ? api.modelData.load(ein, panelVersion, pYear)
          : Promise.resolve(null),
      ]);
      for (const r of [factorsPR, mdR]) {
        if (r.status === "rejected") only(r.reason);
      }
      const fp = factorsPR.status === "fulfilled" ? factorsPR.value : null;
      const md = mdR.status === "fulfilled" ? mdR.value : null;
      panel = {
        ein,
        version: panelVersion,
        modelLabel: pillarBreakdown.find((b) =>
          b.version === panelVersion
        )?.label ??
          `Model ${panelVersion}`,
        scoringMode: fp?.scoring_mode ?? "computed",
        year: pYear,
        years: fYears,
        filingId: filingRows.find((f) => f.year === pYear)?.filing_id ?? null,
        facts: allFacts.filter((f) => f.fiscal_year === pYear),
        concepts: conceptList,
        factors: fp?.factors ?? [],
        notes: md?.notes ?? [],
        fields: md?.fields ?? [],
        canData: can(ctx.state.principal, "data:write"),
        canScore: can(ctx.state.principal, "score:write"),
        canModelData: can(ctx.state.principal, "model_data:write"),
      };
    }

    return page<Data>({
      ein,
      org,
      ...flash,
      overallVersion,
      scores,
      history: historyR.status === "fulfilled"
        ? historyR.value.history ?? []
        : [],
      ranking: rankingR.status === "fulfilled"
        ? rankingR.value.dimensions ?? {}
        : {},
      pillarBreakdown,
      facts: factsR.status === "fulfilled" ? factsR.value.facts ?? [] : [],
      conceptNames,
      conceptCats,
      people: peopleR.status === "fulfilled" ? peopleR.value.people ?? [] : [],
      personnel: personnelR.status === "fulfilled"
        ? personnelR.value.personnel ?? []
        : [],
      personnelYear: personnelR.status === "fulfilled"
        ? personnelR.value.year
        : null,
      personnelYears: personnelR.status === "fulfilled"
        ? personnelR.value.years ?? []
        : [],
      tags: tagsR.status === "fulfilled" ? tagsR.value.tags ?? [] : [],
      notes: notesR.status === "fulfilled" ? notesR.value.notes ?? [] : [],
      giving: givingR.status === "fulfilled"
        ? { gifts: givingR.value.gifts ?? [], summary: givingR.value.summary }
        : EMPTY_GIVING,
      grantsMade: madeR.status === "fulfilled"
        ? { summary: madeR.value.summary, grants: madeR.value.grants ?? [] }
        : undefined,
      grantsReceived: recvR.status === "fulfilled"
        ? { summary: recvR.value.summary, grants: recvR.value.grants ?? [] }
        : undefined,
      panel,
    });
  },

  async POST(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    if (!ctx.state.principal) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const back = (extra = "") => ctx.redirect(`/orgs/${ein}${extra}`);
    const s = (k: string) => {
      const v = form.get(k);
      return v === null ? "" : String(v).trim();
    };
    // Panel actions carry the (version, year) context so the PRG redirect reopens
    // the model-data modal at the same place.
    const panelV = s("version");
    const panelY = s("year");
    const panelQ = (err?: string) => {
      const parts: string[] = [];
      if (panelV && panelY) {
        parts.push(`panel=${encodeURIComponent(panelV)}`);
        parts.push(`panelYear=${encodeURIComponent(panelY)}`);
      }
      if (err) parts.push(`err=${encodeURIComponent(err)}`);
      return parts.length ? `?${parts.join("&")}` : "";
    };
    try {
      switch (action) {
        case "follow":
          await api.follows.follow(ein);
          break;
        case "unfollow":
          await api.follows.unfollow(ein);
          break;
        case "portfolio_add":
          await api.orgs.portfolio(ein, true);
          break;
        case "portfolio_remove":
          await api.orgs.portfolio(ein, false);
          break;
        case "tag_add":
          if (s("tag")) await api.tags.apply(ein, s("tag"));
          break;
        case "tag_remove":
          if (s("tag")) await api.tags.remove(ein, s("tag"));
          break;
        case "note_add":
          if (s("body")) await api.notes.add(ein, s("body"));
          break;
        case "note_delete":
          await api.notes.remove(Number(s("note_id")));
          break;
        case "gift_add": {
          const amount = Number(s("amount"));
          if (!isNaN(amount)) {
            const yr = s("fiscal_year");
            await api.giving.add({
              ein,
              amount,
              fiscal_year: yr ? Number(yr) : undefined,
              purpose: s("purpose") || undefined,
            });
          }
          break;
        }
        case "gift_delete":
          await api.giving.remove(Number(s("gift_id")));
          break;
        // ── model-data panel actions (redirect back to the open panel) ──
        case "fin_value_edit": {
          const raw = s("value");
          const value = Number(raw);
          // Number("") === 0 — treat an empty field as "no value", not zero.
          if (s("concept") && panelY && raw !== "" && !isNaN(value)) {
            const res = await api.financials.editValue({
              ein,
              fiscal_year: Number(panelY),
              concept: s("concept"),
              value,
              note: s("note") || undefined,
            });
            const e = softError(res);
            if (e) return back(panelQ(e));
          }
          return back(panelQ());
        }
        case "grade_factor": {
          const raw = s("value");
          const value = Number(raw);
          const filingId = s("filing_id");
          if (
            filingId && panelV && s("factor_id") && raw !== "" && !isNaN(value)
          ) {
            // Backend find-or-creates (reusing the row for later factors) and
            // refuses a computed model (manual_only). Surface either soft error.
            const created = await api.scores.create(filingId, panelV);
            const cErr = softError(created);
            if (cErr) return back(panelQ(cErr));
            const sid = (created as { score_id?: number }).score_id;
            if (sid) {
              const graded = await api.scores.grade({
                score_id: sid,
                factor_id: Number(s("factor_id")),
                value,
                comment: s("comment") || undefined,
              });
              const gErr = softError(graded);
              if (gErr) return back(panelQ(gErr));
            }
          }
          return back(panelQ());
        }
        case "mdnote_add":
          if (s("body") && panelV && panelY) {
            await api.modelData.addNote({
              ein,
              version: panelV,
              year: Number(panelY),
              body: s("body"),
            });
          }
          return back(panelQ());
        case "mdnote_delete":
          await api.modelData.removeNote(Number(s("note_id")));
          return back(panelQ());
        case "mdatum_add":
          if (s("label") && panelV && panelY) {
            await api.modelData.addField({
              ein,
              version: panelV,
              year: Number(panelY),
              label: s("label"),
              value: s("value") || undefined,
            });
          }
          return back(panelQ());
        case "mdatum_delete":
          await api.modelData.removeField(Number(s("field_id")));
          return back(panelQ());
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Action failed.";
      return back(panelQ(msg));
    }
    return back();
  },
});

/** The four pillars, in display order, keyed to model TYPE codes. */
const PILLARS: { label: string; types: string[] }[] = [
  { label: "Financial Health", types: ["financial"] },
  { label: "Whole-Person Impact", types: ["whole_person"] },
  { label: "Leadership", types: ["leadership", "governance"] },
  {
    label: "Christ-Centered",
    types: ["christ_centeredness", "christ_centered"],
  },
];

/** Concept codes the financial picture reads (with reasonable fallbacks). */
function factValue(facts: FinancialFact[], codes: string[]): number | null {
  for (const code of codes) {
    const f = facts.find((x) => x.concept_code === code);
    if (f && f.canonical_value !== null && f.canonical_value !== undefined) {
      return f.canonical_value;
    }
  }
  return null;
}

/** Preferred intra-section ordering for the by-year table — the real concept
 * codes (the engine's _PATHS keys), revenue → expenses → balance sheet. */
const TABLE_ORDER = [
  // revenue
  "cy_rev",
  "contrib",
  "gov_grants",
  "invest_inc",
  // expenses
  "total_exp",
  "cy_exp",
  "prog",
  "admin",
  "fund",
  "cy_grants",
  "py_grants",
  "pf_total_exp",
  "pf_grants_paid",
  "pf_charitable_disb",
  // balance sheet
  "assets",
  "liabilities",
  "equity",
  "cash",
  "savings",
  "invest_val",
  "accts_pay",
  "pf_total_assets",
  "pf_net_assets",
];

/** Map an observation source code to a short human "how it was entered" label. */
function provenanceLabel(
  source: string | null | undefined,
): string | undefined {
  if (!source) return undefined;
  // Order matters: a manually-entered 990 source (e.g. "manual_990") must read
  // as hand-entered, not e-filed — so test ocr, then manual, then e-file/xml.
  if (source.includes("ocr")) return "OCR from PDF";
  if (source.includes("manual")) return "hand-entered";
  if (
    source.includes("990") || source.includes("xml") || source.includes("efile")
  ) {
    return "e-filed";
  }
  return titleCase(source);
}

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
  const addr = org.address;

  // ----- Overall score: latest row of the highest model version -----
  const latestHist = data.history.length
    ? data.history[data.history.length - 1]
    : undefined;
  const overall = to100(latestHist?.total_score);
  // Real IRS filings only — FIN rows are synthetic anchors for non-990 financial
  // years (no form, no XML), so they must not drive the "verified" line or appear
  // in the filings list.
  const realFilings = (org.filings ?? []).filter((f) => f.form_code !== "FIN");
  const latestFiling = realFilings.length
    ? [...realFilings].sort((a, b) => b.year - a.year)[0]
    : undefined;
  const latestYear = latestFiling?.year;
  const globalRank = data.ranking.global;
  const percentile = globalRank ? Math.round(globalRank.percentile) : undefined;
  const overallSub = overall !== null
    ? `${letterGrade(overall)}${
      percentile !== undefined ? ` · ${ordinal(percentile)}` : ""
    }`
    : undefined;

  // ----- Pillar rings: the pillar's composite/base score (NOT the super-composite,
  // which is the OVERALL gauge), to stay consistent with the breakdown below. -----
  const pillarValues = PILLARS.map((p) => {
    const rows = data.scores
      .filter((s) =>
        !!s.model_type && p.types.includes(s.model_type) &&
        s.model_kind !== "super_composite"
      )
      .sort((a, b) =>
        compareVersions(b.model_version, a.model_version) || b.year - a.year
      );
    return rows.length ? to100(rows[0].total_score) : null;
  });

  // ----- Financials: latest-year KPIs + the by-year table -----
  // KPIs read the latest filing year's facts, but the most recent filing can be
  // a 990-N (no financials) — fall back to the most recent year that actually
  // has canonical facts so the Overview tab isn't all "—" while the table shows data.
  const factYears = [...new Set(data.facts.map((f) => f.fiscal_year))];
  const kpiYear = (latestYear !== undefined &&
      data.facts.some((f) => f.fiscal_year === latestYear))
    ? latestYear
    : (factYears.length ? Math.max(...factYears) : undefined);
  const latestFacts = kpiYear !== undefined
    ? data.facts.filter((f) => f.fiscal_year === kpiYear)
    : data.facts;
  const revenue = factValue(latestFacts, ["cy_rev", "total_rev", "contrib"]);
  const expenses = factValue(latestFacts, ["total_exp", "cy_exp"]);
  const netAssets = factValue(latestFacts, ["equity", "net_assets"]);
  const program = factValue(latestFacts, ["prog", "prog_exp"]);
  const programRatio = program !== null && expenses && expenses !== 0
    ? (program / expenses) * 100
    : null;

  // provenance of the most recent year's data (the dominant canonical source).
  const provSource = latestFacts.map((f) => f.canonical_source).find(Boolean) ??
    null;
  const provenance = provenanceLabel(provSource);

  // by-year table: concepts (rows) × years (cols).
  const years = [...new Set(data.facts.map((f) => f.fiscal_year))].sort((
    a,
    b,
  ) => b - a);
  const codes = [...new Set(data.facts.map((f) => f.concept_code))].sort(
    (a, b) => {
      const ia = TABLE_ORDER.indexOf(a);
      const ib = TABLE_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }
      return a.localeCompare(b);
    },
  );
  const byKey = new Map<string, number | null>();
  for (const f of data.facts) {
    byKey.set(`${f.fiscal_year}:${f.concept_code}`, f.canonical_value);
  }
  const tableRows: FinTableRow[] = codes.map((code) => ({
    code,
    label: data.conceptNames[code] || titleCase(code),
    category: data.conceptCats[code] ?? null,
    values: years.map((y) => byKey.get(`${y}:${code}`) ?? null),
  }));

  // ----- Revenue / score trend (derived from /scores/history years) -----
  const trend = [...data.history]
    .filter((h) =>
      h.total_score !== null && h.total_score !== undefined &&
      !isNaN(h.total_score)
    )
    .sort((a, b) => a.year - b.year);

  const pillars: PillarDatum[] = PILLARS.map((p, i) => ({
    label: p.label,
    value: pillarValues[i],
  }));

  const loggedIn = !!state.principal;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} bleed>
      <OrgHero
        name={org.name}
        ein={org.ein}
        category={org.sector_name || titleCase(org.org_type) || "Nonprofit"}
        city={addr?.city}
        state={addr?.state}
        website={org.website}
        mission={org.mission}
        latestForm={latestFiling?.form_code}
        latestYear={latestYear}
        provenance={provenance}
        overall={overall}
        overallSub={overallSub}
        orgType={org.org_type}
        following={org.following}
        inPortfolio={org.in_portfolio}
        showActions={loggedIn}
        canPortfolio={can(state.principal, "org:write")}
        canEdit={can(state.principal, "org:write")}
        tags={data.tags}
        canTag={can(state.principal, "tag:write")}
      />

      <ScoreRingsRail pillars={pillars} />

      {data.err || data.msg
        ? (
          <div
            class="mx-auto"
            style={{ maxWidth: "1340px", padding: "16px 44px 0" }}
          >
            <Flash msg={data.msg} err={data.err} />
          </div>
        )
        : null}

      <div class="mx-auto" style={{ maxWidth: "1340px" }}>
        <NarrativeRow>
          <FinancialTabs
            revenue={revenue}
            expenses={expenses}
            netAssets={netAssets}
            programRatio={programRatio}
            trend={trend}
            years={years}
            rows={tableRows}
          />
          <WhyThisScore
            breakdown={data.pillarBreakdown}
            percentile={percentile}
            hasGlobalRank={!!globalRank}
            ein={org.ein}
            manageYear={latestYear}
            canManage={can(state.principal, "model_data:write") ||
              can(state.principal, "data:write") ||
              can(state.principal, "score:write")}
          />
        </NarrativeRow>

        <GrantsPanel
          ein={org.ein}
          made={data.grantsMade}
          received={data.grantsReceived}
          giving={data.giving}
          canGive={can(state.principal, "giving:write")}
        />

        <div
          class="grid"
          style={{
            padding: "0 44px 40px",
            gridTemplateColumns: "1fr 1.1fr",
            gap: "28px",
          }}
        >
          <UpdatesPanel
            notes={data.notes}
            canPost={can(state.principal, "note:write")}
          />
          <KeyPersonnel
            personnel={data.personnel}
            contacts={data.people}
            recentYear={data.personnelYear}
            multiYear={data.personnelYears.length > 1}
          />
        </div>

        <FilingsTable filings={realFilings} />
      </div>

      {data.panel && <ModelDataModal panel={data.panel} />}
    </Layout>
  );
});
