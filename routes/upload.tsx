import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError, softError } from "../lib/api/mod.ts";
import { Layout } from "../components/Layout.tsx";
import {
  Card,
  ErrorAlert,
  InfoAlert,
  PageHeader,
  Section,
} from "../components/ui.tsx";
import { can } from "../lib/auth.ts";

interface Data {
  /** Detailed API result, re-rendered inline (not via PRG) so it isn't lost. */
  result?: unknown;
  /** Which form produced the result: "zip" | "pdf". */
  kind?: string;
  /** An error from the POST attempt or a soft API failure. */
  error?: string;
  /** Flash messages read from the query string. */
  msg?: string;
  err?: string;
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
  GET(ctx) {
    const sp = ctx.url.searchParams;
    return page<Data>({
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    });
  },

  async POST(ctx) {
    if (!can(ctx.state.principal, "upload:write")) {
      return ctx.redirect("/login");
    }
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");

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
            <div class="mb-3">
              <ErrorAlert message={soft} />
            </div>
          )
          : (
            <div class="mb-3">
              <InfoAlert>
                {props.kind === "pdf" ? "PDF processed." : "Upload processed."}
              </InfoAlert>
            </div>
          )}
        {rows.length > 0 && (
          <dl class="mb-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div class="flex justify-between gap-4 border-b border-slate-100 py-1">
                <dt class="text-sm text-slate-500">{k}</dt>
                <dd class="text-sm font-medium tabular-nums text-slate-800">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <details>
          <summary class="cursor-pointer text-sm text-slate-500">
            Raw response
          </summary>
          <pre class="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{raw}</pre>
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
        <PageHeader title="Upload" />
        <Card>
          <h2 class="text-lg font-semibold text-slate-900">
            Upload access required
          </h2>
          <p class="mt-2 text-sm text-slate-500">
            You need the <code class="text-slate-700">upload:write</code>{" "}
            permission to ingest filings or OCR PDFs.
          </p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="Upload"
        subtitle="Bulk-ingest a ZIP of 990 XML filings, or OCR a single 990 PDF."
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
      {data.error && (
        <div class="mb-4">
          <ErrorAlert message={data.error} />
        </div>
      )}

      {data.result !== undefined && (
        <ResultCard result={data.result} kind={data.kind} />
      )}

      <Section title="Upload a ZIP of 990 filings">
        <Card>
          <p class="mb-3 text-sm text-slate-500">
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
              <button type="submit" class="btn btn-primary">
                Upload ZIP
              </button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="OCR a 990 PDF">
        <Card>
          <p class="mb-3 text-sm text-slate-500">
            Extract financial observations from a scanned or printed 990{" "}
            <code>.pdf</code>{" "}
            via OCR. The OCR engine may be unavailable on the server, in which
            case the response reports an error.
          </p>
          <form method="POST" enctype="multipart/form-data">
            <input type="hidden" name="action" value="pdf" />
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field">
                <label class="label" for="ein">EIN</label>
                <input
                  class="input"
                  id="ein"
                  name="ein"
                  type="text"
                  placeholder="12-3456789"
                  required
                />
              </div>
              <div class="field">
                <label class="label" for="year">Fiscal year</label>
                <input
                  class="input"
                  id="year"
                  name="year"
                  type="number"
                  placeholder="2024"
                  required
                />
              </div>
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
              <button type="submit" class="btn btn-primary">
                Upload &amp; OCR
              </button>
            </div>
          </form>
        </Card>
      </Section>
    </Layout>
  );
});
