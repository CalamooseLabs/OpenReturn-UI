import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError, softError } from "../lib/api/mod.ts";
import { Layout } from "../components/templates.tsx";
import { Badge, Button, LinkButton } from "../components/atoms.tsx";
import {
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  Flash,
  PageHeader,
  Section,
  Select,
  Table,
} from "../components/molecules.tsx";
import { formatEin, money, normalizeEin, titleCase } from "../lib/format.ts";
import { can } from "../lib/auth.ts";
import type { CodeNameDesc, FinancialFact } from "../lib/types.ts";

interface SourceInfo {
  code: string;
  name: string;
  rank?: number;
}

interface Data {
  ein: string;
  year: string;
  orgName?: string;
  hasEin: boolean;
  facts: FinancialFact[];
  conflicts: FinancialFact[];
  sources: SourceInfo[];
  concepts: CodeNameDesc[];
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
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const ein = normalizeEin(sp.get("ein")?.trim() ?? "");
    const year = sp.get("year")?.trim() ?? "";
    const msg = sp.get("msg") ?? undefined;
    const err = sp.get("err") ?? undefined;

    if (!ein) {
      return page<Data>({
        ein: "",
        year,
        hasEin: false,
        facts: [],
        conflicts: [],
        sources: [],
        concepts: [],
        msg,
        err,
      });
    }

    const yearNum = /^\d{4}$/.test(year) ? parseInt(year, 10) : undefined;

    const [factsR, conflictsR, sourcesR, conceptsR, orgR] = await Promise
      .allSettled([
        api.financials.facts(ein, yearNum),
        api.financials.conflicts(ein),
        api.financials.sources(),
        api.financials.concepts(),
        api.orgs.detail(ein),
      ]);
    for (const r of [factsR, conflictsR, sourcesR, conceptsR, orgR]) {
      if (r.status === "rejected") only(r.reason);
    }

    const facts = factsR.status === "fulfilled" ? factsR.value.facts ?? [] : [];
    const conflicts = conflictsR.status === "fulfilled"
      ? conflictsR.value.conflicts ?? []
      : [];
    const sources = sourcesR.status === "fulfilled"
      ? sourcesR.value.sources ?? []
      : [];
    const concepts = conceptsR.status === "fulfilled"
      ? conceptsR.value.concepts ?? []
      : [];
    const orgName = orgR.status === "fulfilled"
      ? (orgR.value as { name?: string }).name
      : undefined;

    const loadError = factsR.status === "rejected"
      ? (factsR.reason instanceof Error
        ? factsR.reason.message
        : "Failed to load financial data.")
      : undefined;

    return page<Data>({
      ein,
      year,
      orgName,
      hasEin: true,
      facts,
      conflicts,
      sources,
      concepts,
      loadError,
      msg,
      err,
    });
  },

  async POST(ctx) {
    if (!ctx.state.principal) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const ein = normalizeEin(String(form.get("ein") ?? ""));
    const year = String(form.get("year") ?? "").trim();

    const back = (extra: string) => {
      const sp = new URLSearchParams();
      if (ein) sp.set("ein", ein);
      if (year) sp.set("year", year);
      return ctx.redirect(`/financials?${sp.toString()}&${extra}`);
    };

    try {
      if (action === "canonical") {
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
          return back("err=" + encodeURIComponent("Pick an observation."));
        }
        const res = await api.financials.setCanonical({
          ein,
          fiscal_year: fiscalYear,
          concept,
          observation_id: observationId,
        });
        const soft = softError(res);
        if (soft) {
          return back("err=" + encodeURIComponent(soft));
        }
        return back("msg=" + encodeURIComponent("Resolved"));
      }
      if (action === "record") {
        const fiscalYear = parseInt(String(form.get("fiscal_year") ?? ""), 10);
        const source = String(form.get("source") ?? "").trim();
        if (!ein || Number.isNaN(fiscalYear) || !source) {
          return back(
            "err=" + encodeURIComponent("EIN, year, and source are required."),
          );
        }
        // Collect concept→value from the value_<concept> fields (blank = skip).
        const values: Record<string, number> = {};
        for (const [key, raw] of form.entries()) {
          if (!key.startsWith("value_")) continue;
          const v = String(raw).trim();
          if (v === "") continue;
          const num = Number(v);
          if (Number.isFinite(num)) values[key.slice("value_".length)] = num;
        }
        if (Object.keys(values).length === 0) {
          return back("err=" + encodeURIComponent("Enter at least one value."));
        }
        const note = String(form.get("note") ?? "").trim();
        const res = await api.financials.recordObservations({
          ein,
          fiscal_year: fiscalYear,
          source,
          values,
          ...(note ? { note } : {}),
        });
        const soft = softError(res);
        if (soft) return back("err=" + encodeURIComponent(soft));
        return back(
          "msg=" +
            encodeURIComponent(
              `Recorded ${Object.keys(values).length} value(s)`,
            ),
        );
      }
      if (action === "edit") {
        const fiscalYear = parseInt(String(form.get("fiscal_year") ?? ""), 10);
        const concept = String(form.get("concept") ?? "").trim();
        const raw = String(form.get("value") ?? "").trim();
        const num = Number(raw);
        if (
          !ein || Number.isNaN(fiscalYear) || !concept || raw === "" ||
          !Number.isFinite(num)
        ) {
          return back(
            "err=" + encodeURIComponent("A numeric value is required."),
          );
        }
        const res = await api.financials.editValue({
          ein,
          fiscal_year: fiscalYear,
          concept,
          value: num,
        });
        const soft = softError(res);
        if (soft) return back("err=" + encodeURIComponent(soft));
        return back(
          "msg=" +
            encodeURIComponent(
              `Updated ${titleCase(concept)} — re-run scoring to apply`,
            ),
        );
      }
      return back("err=" + encodeURIComponent("Unknown action."));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Request failed.";
      return back("err=" + encodeURIComponent(msg));
    }
  },
});

function sourceLabel(sources: SourceInfo[], code: string): string {
  const s = sources.find((x) => x.code === code);
  return s?.name ?? code;
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const canWrite = can(state.principal, "data:write");
  const yearLabel = data.year && /^\d{4}$/.test(data.year)
    ? data.year
    : "latest";
  // Low-confidence canonical values no human has verified (e.g. a sole OCR
  // reading). Conflicts have their own resolution flow, so exclude them here.
  const reviewFacts = data.facts.filter((f) => f.review && !f.conflict);

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        eyebrow="Financial Data"
        title="Financial data"
        subtitle="Inspect reported facts, verify low-confidence values, and resolve source conflicts."
      />

      <Flash msg={data.msg} err={data.err} />

      <Card class="mb-6">
        <form method="GET">
          <div class="grid gap-4 md:grid-cols-3 md:items-end">
            <div class="md:col-span-2">
              <Field
                label="EIN"
                name="ein"
                value={data.ein}
                placeholder="12-3456789"
                required
              />
            </div>
            <Field
              label="Fiscal year (optional)"
              name="year"
              value={data.year}
              placeholder="e.g. 2023"
            />
          </div>
          <div class="mt-4 flex gap-2">
            <Button type="submit" variant="primary">Load</Button>
            <LinkButton href="/financials">Clear</LinkButton>
          </div>
        </form>
      </Card>

      {!data.hasEin
        ? (
          <EmptyState
            title="Enter an EIN to begin"
            hint="Load an organization's financial facts to review canonical values and resolve any source conflicts."
          />
        )
        : (
          <>
            <div class="mb-6">
              <h2 class="font-display text-xl font-bold tracking-[-0.01em] text-navy">
                {data.orgName ?? "Organization"}
              </h2>
              <div class="mono mt-1.5 flex flex-wrap items-center gap-4 text-xs text-faint">
                <span>EIN {formatEin(data.ein)}</span>
                <a href={`/orgs/${data.ein}`} class="link">
                  View organization →
                </a>
              </div>
            </div>

            {data.loadError && (
              <div class="mb-4">
                <ErrorAlert message={data.loadError} />
              </div>
            )}

            {
              /* Add a source's values (data:write). One submit records every
              non-blank concept; new disagreements surface below as conflicts. */
            }
            {canWrite && data.concepts.length > 0 && (
              <Section title="Add financial data">
                <Card>
                  <form method="POST">
                    <input type="hidden" name="action" value="record" />
                    <input type="hidden" name="ein" value={data.ein} />
                    <div class="mb-4 grid gap-4 md:grid-cols-3 md:items-end">
                      <Select
                        label="Source"
                        name="source"
                        placeholder="Choose a source"
                        options={data.sources.map((s) => ({
                          value: s.code,
                          label: s.name,
                        }))}
                      />
                      <Field
                        label="Fiscal year"
                        name="fiscal_year"
                        value={/^\d{4}$/.test(data.year) ? data.year : ""}
                        placeholder="e.g. 2023"
                        required
                      />
                      <Field
                        label="Note (optional)"
                        name="note"
                        placeholder="Source / context"
                      />
                    </div>
                    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {data.concepts.map((c) => (
                        <div class="field">
                          <label class="label" for={`value_${c.code}`}>
                            {c.name ?? titleCase(c.code)}{" "}
                            <span class="mono text-xs text-faint">
                              {c.code}
                            </span>
                          </label>
                          <input
                            class="input"
                            id={`value_${c.code}`}
                            name={`value_${c.code}`}
                            type="number"
                            step="any"
                            placeholder="—"
                          />
                        </div>
                      ))}
                    </div>
                    <div class="mt-4 flex items-center gap-3">
                      <Button type="submit" variant="primary">
                        Record values
                      </Button>
                      <span class="text-xs text-faint">
                        Blank fields are skipped. Values join existing facts;
                        disagreements become conflicts to resolve below.
                      </span>
                    </div>
                  </form>
                </Card>
              </Section>
            )}

            {/* Low-confidence canonical values that need a human's eyes. */}
            {reviewFacts.length > 0 && (
              <Section title={`Needs review (${reviewFacts.length})`}>
                <Card>
                  <p class="mb-4 text-[13px] text-muted">
                    These canonical values come from a low-confidence reading
                    (e.g. OCR of a 990 PDF) and no one has verified them.
                    Confirm the value to mark it reviewed, or record a corrected
                    value above.
                  </p>
                  <Table
                    head={
                      <>
                        <th>Concept</th>
                        <th>Year</th>
                        <th>Value</th>
                        <th>Source</th>
                        <th>Confidence</th>
                        {canWrite && <th></th>}
                      </>
                    }
                  >
                    {reviewFacts.map((f) => {
                      const canon = f.observations.find((o) =>
                        o.is_canonical
                      );
                      return (
                        <tr>
                          <td class="font-medium text-ink">
                            {titleCase(f.concept_code)}{" "}
                            <Badge variant="amber">Review</Badge>
                          </td>
                          <td class="tabular-nums text-muted">
                            {f.fiscal_year}
                          </td>
                          <td class="tabular-nums font-semibold text-navy">
                            {money(f.canonical_value)}
                          </td>
                          <td class="text-muted">
                            {sourceLabel(
                              data.sources,
                              f.canonical_source ?? "",
                            )}
                          </td>
                          <td class="tabular-nums text-muted">
                            {f.canonical_confidence === null ||
                                f.canonical_confidence === undefined
                              ? "—"
                              : `${(f.canonical_confidence * 100).toFixed(0)}%`}
                          </td>
                          {canWrite && (
                            <td>
                              {canon && (
                                <form method="POST" class="inline">
                                  <input
                                    type="hidden"
                                    name="action"
                                    value="canonical"
                                  />
                                  <input
                                    type="hidden"
                                    name="ein"
                                    value={data.ein}
                                  />
                                  <input
                                    type="hidden"
                                    name="year"
                                    value={data.year}
                                  />
                                  <input
                                    type="hidden"
                                    name="concept"
                                    value={f.concept_code}
                                  />
                                  <input
                                    type="hidden"
                                    name="fiscal_year"
                                    value={f.fiscal_year}
                                  />
                                  <input
                                    type="hidden"
                                    name="observation_id"
                                    value={canon.observation_id}
                                  />
                                  <Button
                                    type="submit"
                                    variant="ghost"
                                    size="sm"
                                  >
                                    Confirm value
                                  </Button>
                                </form>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </Table>
                </Card>
              </Section>
            )}

            {/* Conflicts to resolve */}
            <Section title={`Conflicts (${data.conflicts.length})`}>
              {data.conflicts.length === 0
                ? (
                  <EmptyState
                    title="No unresolved conflicts"
                    hint="Every fact has a single agreed value or a chosen canonical observation."
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
                              {canWrite && <th></th>}
                              <th>Source</th>
                              <th>Value</th>
                              <th>Confidence</th>
                              <th>Canonical</th>
                            </>
                          }
                        >
                          {c.observations.map((o) => (
                            <tr>
                              {canWrite && (
                                <td>
                                  <input
                                    type="radio"
                                    form={`canon-${c.concept_code}-${c.fiscal_year}`}
                                    name="observation_id"
                                    value={o.observation_id}
                                    checked={o.is_canonical}
                                    required
                                  />
                                </td>
                              )}
                              <td class="text-ink">
                                {sourceLabel(data.sources, o.source_code)}
                                <div class="mono text-xs text-faint">
                                  <code>{o.source_code}</code>
                                </div>
                              </td>
                              <td class="tabular-nums font-semibold text-navy">
                                {money(o.value)}
                              </td>
                              <td class="tabular-nums text-muted">
                                {o.confidence === null ||
                                    o.confidence === undefined
                                  ? "—"
                                  : `${(o.confidence * 100).toFixed(0)}%`}
                              </td>
                              <td>
                                {o.is_canonical && (
                                  <Badge variant="green">Canonical</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </Table>

                        {canWrite && (
                          <form
                            method="POST"
                            id={`canon-${c.concept_code}-${c.fiscal_year}`}
                            class="mt-4 flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="action"
                              value="canonical"
                            />
                            <input type="hidden" name="ein" value={data.ein} />
                            <input
                              type="hidden"
                              name="year"
                              value={data.year}
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
                            <Button type="submit" variant="primary" size="sm">
                              Set canonical
                            </Button>
                            <span class="text-xs text-faint">
                              Select an observation above, then confirm.
                            </span>
                          </form>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
            </Section>

            {/* All facts */}
            <Section title={`All facts (${yearLabel})`}>
              {data.facts.length === 0
                ? (
                  <EmptyState
                    title="No financial facts"
                    hint="No canonical or observed facts for this organization and year."
                  />
                )
                : (
                  <Table
                    head={
                      <>
                        <th>Concept</th>
                        <th>Year</th>
                        <th>Value</th>
                        <th>Status</th>
                        <th>Chosen by</th>
                        {canWrite && <th>Edit value</th>}
                      </>
                    }
                  >
                    {data.facts.map((f) => (
                      <tr>
                        <td class="font-medium text-ink">
                          {titleCase(f.concept_code)}
                        </td>
                        <td class="tabular-nums text-muted">
                          {f.fiscal_year}
                        </td>
                        <td class="tabular-nums font-semibold text-navy">
                          {money(f.canonical_value)}
                        </td>
                        <td>
                          {f.conflict
                            ? <Badge variant="red">Conflict</Badge>
                            : f.review
                            ? <Badge variant="amber">Review</Badge>
                            : f.resolved
                            ? <Badge variant="green">Resolved</Badge>
                            : <Badge variant="gray">Single source</Badge>}
                        </td>
                        <td class="text-muted">{f.chosen_by ?? "—"}</td>
                        {canWrite && (
                          <td>
                            {
                              /* Inline hand-edit: a non-manual value mints a manual
                                observation; a manual one updates in place. */
                            }
                            <form
                              method="POST"
                              class="flex items-center gap-2"
                            >
                              <input type="hidden" name="action" value="edit" />
                              <input
                                type="hidden"
                                name="ein"
                                value={data.ein}
                              />
                              <input
                                type="hidden"
                                name="year"
                                value={data.year}
                              />
                              <input
                                type="hidden"
                                name="concept"
                                value={f.concept_code}
                              />
                              <input
                                type="hidden"
                                name="fiscal_year"
                                value={f.fiscal_year}
                              />
                              <input
                                class="input"
                                name="value"
                                type="number"
                                step="any"
                                value={f.canonical_value ?? ""}
                                style={{ width: "9rem" }}
                                aria-label={`Edit ${
                                  titleCase(f.concept_code)
                                } ${f.fiscal_year}`}
                              />
                              <Button type="submit" variant="ghost" size="sm">
                                Save
                              </Button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </Table>
                )}
            </Section>
          </>
        )}
    </Layout>
  );
});
