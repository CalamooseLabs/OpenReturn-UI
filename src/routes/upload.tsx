import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError, softError } from "../lib/api/mod.ts";
import type { Api } from "../lib/api/mod.ts";
import { Layout } from "../components/templates.tsx";
import { LinkButton } from "../components/atoms.tsx";
import SubmitButton from "../islands/SubmitButton.tsx";
import {
  Card,
  ErrorAlert,
  Field,
  Flash,
  InfoAlert,
  PageHeader,
  Section,
} from "../components/molecules.tsx";
import {
  GrabFromIrs,
  IngestedArchives,
} from "../components/organisms/IrsGrab.tsx";
import type {
  DiscoverResponse,
  GrabResponse,
  IngestedResponse,
} from "../lib/api/upload.ts";
import { can } from "../lib/auth.ts";

const IRS_DOWNLOADS_URL =
  "https://www.irs.gov/charities-non-profits/form-990-series-downloads";

interface Data {
  /** Detailed API result, re-rendered inline (not via PRG) so it isn't lost. */
  result?: unknown;
  /** Which form produced the result: "zip" | "pdf". */
  kind?: string;
  /** An error from the POST attempt or a soft API failure. */
  error?: string;
  /** The grabbed/ingested ledger (null + unreachable if the API is down). */
  ingested?: IngestedResponse | null;
  ingestUnreachable?: boolean;
  /** A discover/grab outcome + the URL that produced it (to prefill the form). */
  discovered?: DiscoverResponse;
  grab?: GrabResponse;
  submittedUrl?: string;
  /** Flash messages read from the query string. */
  msg?: string;
  err?: string;
}

/** Load the ingested ledger, tolerating an API that is mid-restart during an ingest. */
async function loadIngested(
  api: Api,
): Promise<{ ingested: IngestedResponse | null; ingestUnreachable: boolean }> {
  try {
    return { ingested: await api.upload.ingested(), ingestUnreachable: false };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw err;
    // status 0 = cannot reach the API (likely a restart for an in-flight ingest).
    return {
      ingested: null,
      ingestUnreachable: err instanceof ApiError && err.status === 0,
    };
  }
}

/** Render a result object as readable key/value rows, falling back to JSON. */
function summarizeResult(
  result: unknown,
): { rows: [string, string][]; raw: string } {
  const raw = JSON.stringify(result, null, 2);
  const rows: [string, string][] = [];
  if (result && typeof result === "object" && !Array.isArray(result)) {
    for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "object") continue; // nested objects shown in the raw block
      rows.push([k, String(v)]);
    }
  }
  return { rows, raw };
}

export const handler = define.handlers({
  async GET(ctx) {
    const sp = ctx.url.searchParams;
    const base: Data = {
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    };
    if (!can(ctx.state.principal, "upload:write")) return page<Data>(base);
    const { ingested, ingestUnreachable } = await loadIngested(ctx.state.api);
    return page<Data>({ ...base, ingested, ingestUnreachable });
  },

  async POST(ctx) {
    if (!can(ctx.state.principal, "upload:write")) {
      return ctx.redirect("/login");
    }
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");

    // Discover / grab share the IRS-grab form; both re-render with the ledger.
    if (action === "discover" || action === "grab") {
      const url = String(form.get("url") ?? "").trim();
      const force = form.get("force") === "1";
      // "When" control: a named clock time, "now", or a custom HH:MM input.
      const when = String(form.get("schedule_when") ?? "now");
      const custom = String(form.get("schedule_time") ?? "").trim();
      const schedule = when === "custom" ? (custom || undefined) : when;
      const extra: Partial<Data> = { submittedUrl: url };
      try {
        if (action === "discover") {
          extra.discovered = await api.upload.discover(url);
        } else {
          extra.grab = await api.upload.grab(url, force, schedule);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return ctx.redirect("/login");
        }
        const message = err instanceof Error ? err.message : "Request failed.";
        if (action === "discover") {
          extra.discovered = {
            source: url,
            count: 0,
            new: 0,
            archives: [],
            error: message,
          };
        } else {
          extra.grab = { error: message };
        }
      }
      const { ingested, ingestUnreachable } = await loadIngested(api);
      return page<Data>({ ...extra, ingested, ingestUnreachable });
    }

    if (action === "zip") {
      const file = form.get("zipfile");
      if (!(file instanceof File) || file.size === 0) {
        return page<Data>({ error: "Choose a .zip file to upload." });
      }
      const out = new FormData();
      out.append("zipfile", file, file.name);
      try {
        const result = await api.upload.zip(out);
        return page<Data>({ result, kind: "zip" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return ctx.redirect("/login");
        }
        return page<Data>({
          error: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    }

    if (action === "pdf") {
      const ein = String(form.get("ein") ?? "").trim();
      const year = String(form.get("year") ?? "").trim();
      const file = form.get("pdffile");
      if (!ein || !year) {
        return page<Data>({ error: "EIN and fiscal year are required." });
      }
      if (!(file instanceof File) || file.size === 0) {
        return page<Data>({ error: "Choose a .pdf file to upload." });
      }
      const out = new FormData();
      out.append("pdffile", file, file.name);
      try {
        const result = await api.upload.pdf(ein, year, out);
        return page<Data>({ result, kind: "pdf" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return ctx.redirect("/login");
        }
        return page<Data>({
          error: err instanceof Error ? err.message : "OCR upload failed.",
        });
      }
    }

    return page<Data>({ error: "Unknown action." });
  },
});

function ResultCard(props: { result: unknown; kind?: string }) {
  const soft = softError(props.result);
  const { rows, raw } = summarizeResult(props.result);
  const title = props.kind === "pdf"
    ? "OCR result"
    : props.kind === "zip"
    ? "Ingest result"
    : "Result";
  return (
    <Section title={title}>
      <Card>
        {soft
          ? (
            <div class="mb-4">
              <ErrorAlert message={soft} />
            </div>
          )
          : (
            <div class="mb-4">
              <InfoAlert>
                {props.kind === "pdf" ? "PDF processed." : "Upload processed."}
              </InfoAlert>
            </div>
          )}
        {rows.length > 0 && (
          <dl class="mb-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div class="flex justify-between gap-4 border-b border-line-soft py-1.5">
                <dt class="mono text-xs uppercase tracking-wide text-faint">
                  {k}
                </dt>
                <dd class="text-sm font-semibold tabular-nums text-navy">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <details>
          <summary class="mono cursor-pointer text-xs uppercase tracking-wide text-faint">
            Raw response
          </summary>
          <pre class="mt-2 overflow-x-auto rounded-xl bg-page p-3 text-xs text-ink">{raw}</pre>
        </details>
      </Card>
    </Section>
  );
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const allowed = can(state.principal, "upload:write");

  if (!allowed) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <PageHeader eyebrow="Data Ingestion" title="Upload" />
        <Card>
          <h2 class="font-display text-lg font-bold tracking-[-0.01em] text-navy">
            Upload access required
          </h2>
          <p class="mt-2 text-sm text-muted">
            You need the <code class="text-ink">upload:write</code>{" "}
            permission to ingest filings or OCR PDFs.
          </p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        eyebrow="Data Ingestion"
        title="Upload"
        subtitle="Bulk-ingest a ZIP of 990 XML filings, or OCR a single 990 PDF."
      />

      <Flash msg={data.msg} err={data.err} />
      {data.error && (
        <div class="mb-4">
          <ErrorAlert message={data.error} />
        </div>
      )}

      {data.result !== undefined && (
        <ResultCard result={data.result} kind={data.kind} />
      )}

      <GrabFromIrs
        defaultUrl={data.ingested?.default_source ?? IRS_DOWNLOADS_URL}
        url={data.submittedUrl}
        discovered={data.discovered}
        grab={data.grab}
        ingestRunning={data.ingested?.ingest_running ?? false}
      />

      {(data.ingested?.ingest_running || data.ingestUnreachable) && (
        <div class="mb-6 -mt-2">
          <LinkButton href="/upload" size="sm">Refresh status</LinkButton>
        </div>
      )}

      <IngestedArchives
        data={data.ingested ?? null}
        unreachable={data.ingestUnreachable}
      />

      <Section title="Upload a ZIP of 990 filings">
        <Card>
          <p class="mb-4 text-sm text-muted">
            Upload a <code>.zip</code>{" "}
            archive of IRS Form 990 XML filings. Each filing is parsed, stored,
            and scored.
          </p>
          <form method="POST" enctype="multipart/form-data">
            <input type="hidden" name="action" value="zip" />
            <div class="field">
              <label class="label" for="zipfile">ZIP archive</label>
              <input
                class="input"
                id="zipfile"
                name="zipfile"
                type="file"
                accept=".zip"
                required
              />
            </div>
            <div class="mt-4">
              <SubmitButton variant="primary" pendingLabel="Uploading…">
                Upload ZIP
              </SubmitButton>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="OCR a 990 PDF">
        <Card>
          <p class="mb-4 text-sm text-muted">
            Extract financial observations from a scanned or printed 990{" "}
            <code>.pdf</code>{" "}
            via OCR. The OCR engine may be unavailable on the server, in which
            case the response reports an error.
          </p>
          <form method="POST" enctype="multipart/form-data">
            <input type="hidden" name="action" value="pdf" />
            <div class="grid gap-4 md:grid-cols-2">
              <Field
                label="EIN"
                name="ein"
                placeholder="12-3456789"
                required
              />
              <Field
                label="Fiscal year"
                name="year"
                type="number"
                placeholder="2024"
                required
              />
            </div>
            <div class="field mt-4">
              <label class="label" for="pdffile">PDF file</label>
              <input
                class="input"
                id="pdffile"
                name="pdffile"
                type="file"
                accept=".pdf"
                required
              />
            </div>
            <div class="mt-4">
              <SubmitButton variant="primary" pendingLabel="Processing…">
                Upload &amp; OCR
              </SubmitButton>
            </div>
          </form>
        </Card>
      </Section>
    </Layout>
  );
});
