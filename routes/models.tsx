import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/Layout.tsx";
import {
  Badge,
  Card,
  EmptyState,
  ErrorAlert,
  InfoAlert,
  PageHeader,
  Section,
  Table,
} from "../components/ui.tsx";
import { titleCase } from "../lib/format.ts";
import { isAdmin } from "../lib/auth.ts";
import { listModelOptions, type ModelOption } from "../lib/models.ts";
import type {
  CodeNameDesc,
  FactorDef,
  FactorsResponse,
  TemplateSummary,
} from "../lib/types.ts";

/** Definition shape returned by /templates/detail and accepted by POST /admin/models. */
interface ModelDefinition {
  model: {
    version: number;
    type?: string;
    kind?: string;
    missing_data?: string;
    description?: string;
  };
  factor: Array<{
    name: string;
    weight: number;
    formula_type?: string;
    inputs?: string[];
    direction?: string;
    benchmark_lo?: number | null;
    benchmark_hi?: number | null;
    formula_description?: string;
  }>;
}

interface TemplateDetail {
  code: string;
  definition: ModelDefinition;
}

interface Data {
  admin: boolean;
  templates: TemplateSummary[];
  models: ModelOption[];
  kinds: CodeNameDesc[];
  types: CodeNameDesc[];
  // Selected model factor breakdown (?version=).
  selectedVersion?: number;
  factors?: FactorsResponse;
  factorsError?: string;
  // Selected template (?template=) — definition + prefill text.
  selectedTemplate?: string;
  templateDetail?: TemplateDetail;
  templateError?: string;
  prefill: string;
  // Flash messaging via PRG.
  msg?: string;
  err?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

const SKELETON = `{
  "model": {
    "version": 100,
    "type": "financial",
    "kind": "model",
    "description": "My scoring model"
  },
  "factor": [
    {
      "name": "Example factor",
      "weight": 1.0,
      "formula_type": "ratio",
      "inputs": ["total_exp", "total_rev"],
      "direction": "higher",
      "benchmark_lo": 0.0,
      "benchmark_hi": 1.0,
      "formula_description": "What this factor measures"
    }
  ]
}`;

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const admin = isAdmin(ctx.state.principal);
    const sp = ctx.url.searchParams;

    const versionRaw = sp.get("version")?.trim() ?? "";
    const selectedVersion = versionRaw && /^\d+$/.test(versionRaw)
      ? parseInt(versionRaw, 10)
      : undefined;
    const selectedTemplate = sp.get("template")?.trim() || undefined;

    // Catalog + registered models + vocab (best-effort; bubble 401).
    const [tplR, kindsR, typesR] = await Promise.allSettled([
      api.templates.list(),
      api.scores.kinds(),
      api.scores.types(),
    ]);
    for (const r of [tplR, kindsR, typesR]) {
      if (r.status === "rejected") only(r.reason);
    }

    let models: ModelOption[] = [];
    try {
      models = await listModelOptions(api, { admin });
    } catch (err) {
      only(err);
      models = [];
    }

    const templates = tplR.status === "fulfilled"
      ? tplR.value.templates ?? []
      : [];
    const kinds = kindsR.status === "fulfilled" ? kindsR.value.kinds ?? [] : [];
    const types = typesR.status === "fulfilled" ? typesR.value.types ?? [] : [];

    // Factor breakdown for a selected model version.
    let factors: FactorsResponse | undefined;
    let factorsError: string | undefined;
    if (selectedVersion !== undefined) {
      try {
        factors = await api.scores.factors(selectedVersion);
      } catch (err) {
        only(err);
        factorsError = err instanceof Error
          ? err.message
          : "Failed to load factors.";
      }
    }

    // Template detail (definition + prefill for the builder).
    let templateDetail: TemplateDetail | undefined;
    let templateError: string | undefined;
    let prefill = admin ? SKELETON : "";
    if (selectedTemplate) {
      try {
        templateDetail = await api.templates.detail(
          selectedTemplate,
        ) as unknown as TemplateDetail;
        if (templateDetail?.definition) {
          prefill = JSON.stringify(templateDetail.definition, null, 2);
        }
      } catch (err) {
        only(err);
        templateError = err instanceof Error
          ? err.message
          : "Failed to load template.";
      }
    }

    return page<Data>({
      admin,
      templates,
      models,
      kinds,
      types,
      selectedVersion,
      factors,
      factorsError,
      selectedTemplate,
      templateDetail,
      templateError,
      prefill,
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    });
  },

  async POST(ctx) {
    if (!isAdmin(ctx.state.principal)) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const raw = String(form.get("definition") ?? "");
    const dryRun = form.get("dry_run") === "1";
    const skipExisting = form.get("skip_existing") === "1";

    let definition: unknown;
    try {
      definition = JSON.parse(raw);
    } catch {
      return ctx.redirect(
        "/models?err=" + encodeURIComponent("Invalid JSON in definition."),
      );
    }

    try {
      const res = await api.admin.createModel({
        definition,
        dry_run: dryRun,
        skip_existing: skipExisting,
      });
      // A 2xx body may still carry a soft { error }.
      if (res && typeof res === "object" && (res as { error?: string }).error) {
        return ctx.redirect(
          "/models?err=" +
            encodeURIComponent((res as { error?: string }).error!),
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Model creation failed.";
      return ctx.redirect("/models?err=" + encodeURIComponent(msg));
    }

    const okMsg = dryRun ? "Valid (dry run)" : "Created";
    return ctx.redirect("/models?msg=" + encodeURIComponent(okMsg));
  },
});

function kindVariant(
  kind?: string | null,
): "gray" | "blue" | "green" | "amber" | "red" {
  if (kind === "composite") return "blue";
  if (kind === "super_composite") return "amber";
  return "gray";
}

function typeVariant(
  type?: string | null,
): "gray" | "blue" | "green" | "amber" | "red" {
  switch (type) {
    case "financial":
      return "green";
    case "governance":
      return "blue";
    case "whole_person":
      return "amber";
    case "christ_centeredness":
      return "red";
    default:
      return "gray";
  }
}

/** Parse a factor's JSON-encoded inputs string into a readable list. */
function parseInputs(inputs?: string | null): string {
  if (!inputs) return "—";
  try {
    const arr = JSON.parse(inputs);
    if (Array.isArray(arr)) {
      const parts = arr.map((x) =>
        typeof x === "string" ? x : (x && typeof x === "object" &&
            "key" in (x as Record<string, unknown>))
          ? String((x as Record<string, unknown>).key)
          : JSON.stringify(x)
      );
      return parts.length ? parts.join(", ") : "—";
    }
  } catch {
    // Not JSON — show raw.
  }
  return inputs;
}

function benchmark(f: FactorDef): string {
  const lo = f.benchmark_lo;
  const hi = f.benchmark_hi;
  if (lo === null || lo === undefined) {
    if (hi === null || hi === undefined) return "—";
    return `…–${hi}`;
  }
  if (hi === null || hi === undefined) return `${lo}–…`;
  return `${lo}–${hi}`;
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="Scoring models"
        subtitle="Browse the template catalog, inspect factor definitions, and build new models."
      />

      {data.msg && (
        <div class="mb-4">
          <InfoAlert>{data.msg}</InfoAlert>
        </div>
      )}
      {data.err && (
        <div class="mb-4">
          <ErrorAlert message={data.err} />
        </div>
      )}

      {/* Template catalog */}
      <Section title="Model catalog (templates)">
        {data.templates.length === 0
          ? (
            <EmptyState
              title="No templates available"
              hint="The template catalog is empty or could not be reached."
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Template</th>
                  <th>Kind</th>
                  <th>Type</th>
                  <th>Factors</th>
                  <th></th>
                </>
              }
            >
              {data.templates.map((t) => (
                <tr>
                  <td>
                    <a
                      href={`/models?template=${encodeURIComponent(t.code)}`}
                      class="link font-medium"
                    >
                      {t.name}
                    </a>
                    {t.description && (
                      <div class="mt-0.5 text-xs text-slate-500">
                        {t.description}
                      </div>
                    )}
                    <div class="mt-0.5 text-xs text-slate-400">
                      <code>{t.code}</code> · v{t.version}
                    </div>
                  </td>
                  <td>
                    <Badge variant={kindVariant(t.kind)}>
                      {titleCase(t.kind)}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={typeVariant(t.type)}>
                      {titleCase(t.type)}
                    </Badge>
                  </td>
                  <td class="tabular-nums text-slate-600">{t.factor_count}</td>
                  <td class="space-x-3 whitespace-nowrap">
                    <a
                      href={`/models?version=${t.version}`}
                      class="link text-sm"
                    >
                      View factors
                    </a>
                    {data.admin && (
                      <a
                        href={`/models?template=${encodeURIComponent(t.code)}`}
                        class="link text-sm"
                      >
                        Use as template
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {/* Registered models */}
      <Section title="Registered models">
        {data.models.length === 0
          ? (
            <EmptyState
              title="No registered models"
              hint={data.admin
                ? "No models have been created yet. Use the builder below to create one."
                : "No models are available to inspect."}
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Model</th>
                  <th>Kind</th>
                  <th>Type</th>
                  <th></th>
                </>
              }
            >
              {data.models.map((m) => (
                <tr>
                  <td class="font-medium text-slate-800">{m.label}</td>
                  <td>
                    {m.kind
                      ? (
                        <Badge variant={kindVariant(m.kind)}>
                          {titleCase(m.kind)}
                        </Badge>
                      )
                      : <span class="text-slate-400">—</span>}
                  </td>
                  <td>
                    {m.type
                      ? (
                        <Badge variant={typeVariant(m.type)}>
                          {titleCase(m.type)}
                        </Badge>
                      )
                      : <span class="text-slate-400">—</span>}
                  </td>
                  <td class="whitespace-nowrap">
                    <a
                      href={`/models?version=${m.version}`}
                      class="link text-sm"
                    >
                      View factors
                    </a>
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {/* Factor breakdown for a selected version */}
      {data.selectedVersion !== undefined && (
        <Section
          title={`Factors — v${data.selectedVersion}`}
          actions={<a href="/models" class="link text-sm">Clear selection</a>}
        >
          {data.factorsError
            ? <ErrorAlert message={data.factorsError} />
            : !data.factors || data.factors.factors.length === 0
            ? (
              <EmptyState
                title="No factors"
                hint="This model has no factor definitions."
              />
            )
            : (
              <>
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  {data.factors.model_kind && (
                    <Badge variant={kindVariant(data.factors.model_kind)}>
                      {titleCase(data.factors.model_kind)}
                    </Badge>
                  )}
                  {data.factors.model_type && (
                    <Badge variant={typeVariant(data.factors.model_type)}>
                      {titleCase(data.factors.model_type)}
                    </Badge>
                  )}
                  {data.factors.scoring_mode && (
                    <Badge
                      variant={data.factors.scoring_mode === "manual"
                        ? "amber"
                        : "gray"}
                    >
                      {titleCase(data.factors.scoring_mode)}
                    </Badge>
                  )}
                </div>
                <Table
                  head={
                    <>
                      <th>Factor</th>
                      <th>Weight</th>
                      <th>Formula</th>
                      <th>Inputs</th>
                      <th>Direction</th>
                      <th>Benchmark</th>
                      <th>Description</th>
                      <th>Manual scale</th>
                    </>
                  }
                >
                  {data.factors.factors.map((f) => (
                    <tr>
                      <td class="font-medium text-slate-800">{f.name}</td>
                      <td class="tabular-nums">{f.weight}</td>
                      <td class="text-slate-600">
                        {f.formula_type ? <code>{f.formula_type}</code> : "—"}
                      </td>
                      <td class="text-slate-600">
                        <code class="text-xs">{parseInputs(f.inputs)}</code>
                      </td>
                      <td class="text-slate-600">{f.direction ?? "—"}</td>
                      <td class="tabular-nums text-slate-600">
                        {benchmark(f)}
                      </td>
                      <td class="text-slate-500">
                        {f.formula_description ?? "—"}
                      </td>
                      <td class="text-slate-600">{f.manual_scale ?? "—"}</td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
        </Section>
      )}

      {/* Selected template detail (mostly useful as context for the builder) */}
      {data.selectedTemplate && (
        <Section
          title={`Template — ${data.selectedTemplate}`}
          actions={<a href="/models" class="link text-sm">Clear selection</a>}
        >
          {data.templateError
            ? <ErrorAlert message={data.templateError} />
            : data.templateDetail
            ? (
              <Card>
                <div class="mb-2 flex flex-wrap items-center gap-2">
                  <span class="font-medium text-slate-800">
                    {data.templateDetail.definition?.model?.description ??
                      data.selectedTemplate}
                  </span>
                  {data.templateDetail.definition?.model?.kind && (
                    <Badge
                      variant={kindVariant(
                        data.templateDetail.definition.model.kind,
                      )}
                    >
                      {titleCase(data.templateDetail.definition.model.kind)}
                    </Badge>
                  )}
                  {data.templateDetail.definition?.model?.type && (
                    <Badge
                      variant={typeVariant(
                        data.templateDetail.definition.model.type,
                      )}
                    >
                      {titleCase(data.templateDetail.definition.model.type)}
                    </Badge>
                  )}
                  {data.templateDetail.definition?.model?.version !==
                      undefined && (
                    <span class="text-xs text-slate-400">
                      v{data.templateDetail.definition.model.version}
                    </span>
                  )}
                </div>
                <p class="text-sm text-slate-500">
                  {data.templateDetail.definition?.factor?.length ?? 0} factor
                  {(data.templateDetail.definition?.factor?.length ?? 0) === 1
                    ? ""
                    : "s"}.
                  {data.admin
                    ? " The definition is prefilled in the builder below."
                    : " Sign in as an administrator to create a model from this template."}
                </p>
              </Card>
            )
            : (
              <EmptyState
                title="Template not found"
                hint={`No template "${data.selectedTemplate}".`}
              />
            )}
        </Section>
      )}

      {/* Admin model builder */}
      {data.admin && (
        <Section title="Create a model">
          <Card>
            <p class="mb-3 text-sm text-slate-500">
              Paste or edit a model definition (JSON with <code>model</code> and
              {" "}
              <code>factor</code>{" "}
              keys). Use a template above to prefill this form, or start from
              the skeleton. Validate first with a dry run before creating.
            </p>
            <form method="POST">
              <label class="label" for="definition">
                Model definition (JSON)
              </label>
              <textarea
                id="definition"
                name="definition"
                rows={20}
                spellcheck={false}
                class="input font-mono text-xs"
                style={{ minHeight: "20rem" }}
              >
                {data.prefill}
              </textarea>
              <div class="mt-4 flex flex-wrap items-center gap-4">
                <label class="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="dry_run" value="1" />
                  Validate only (dry run)
                </label>
                <label class="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="skip_existing" value="1" />
                  Skip if exists
                </label>
                <div class="ml-auto flex gap-2">
                  <button type="submit" class="btn btn-primary">Submit</button>
                  <a href="/models" class="btn btn-secondary">Reset</a>
                </div>
              </div>
            </form>
          </Card>
        </Section>
      )}

      {!data.admin && (
        <div class="mt-4">
          <InfoAlert>
            Administrator access is required to create models. You can browse
            the catalog and inspect any model's factor breakdown above.
          </InfoAlert>
        </div>
      )}
    </Layout>
  );
});
