// ── Island: FilingsTable ─────────────────────────────────────────────────────
// The org-profile "Filings & data" section. Lists each filing (year, form) and,
// on "View detail", opens a modal that lays out the filing's metadata AND lazily
// loads the parsed 990 field data (scrollable + filterable) from the scoped BFF
// proxy (/api/filings/data). The raw XML/JSON are still one click away. All
// filing rows are passed in as props; the island owns the modal + fetch state.

import { useEffect, useState } from "preact/hooks";
import { dateOnly } from "../lib/format.ts";
import type { Filing } from "../lib/types.ts";

const API_BASE = "/api";

/** One parsed 990 field as returned by /filings/data (field meta + value). */
interface FilingField {
  field_id?: number;
  xml_path?: string;
  box_label?: string | null;
  data_type?: string;
  value?: string | number | null;
  line?: { number?: string | null; label?: string | null } | null;
  part?: { number?: string | null; name?: string | null } | null;
  section?: { code?: string | null; name?: string | null } | null;
}

function form(f: Filing): string {
  return (f.form_code || "").replace(/^IRS/, "");
}

/** A field's display label: its line label, else box label, else xml leaf. */
function fieldLabel(fld: FilingField): string {
  return (fld.line?.label || fld.box_label ||
    (fld.xml_path ? fld.xml_path.split("/").pop() ?? fld.xml_path : "") ||
    `Field ${fld.field_id ?? ""}`).trim();
}

function fieldContext(fld: FilingField): string {
  const part = fld.part?.number ? `Part ${fld.part.number}` : "";
  const line = fld.line?.number ? `Line ${fld.line.number}` : "";
  return [part, line].filter(Boolean).join(" · ");
}

function Row(props: { label: string; value: string | null | undefined }) {
  if (!props.value) return null;
  return (
    <div
      class="flex justify-between gap-4"
      style={{
        padding: "7px 0",
        borderTop: "1px solid var(--color-line-soft)",
      }}
    >
      <span class="text-muted" style={{ fontSize: "12.5px" }}>
        {props.label}
      </span>
      <span
        class="mono text-navy"
        style={{
          fontSize: "12.5px",
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {props.value}
      </span>
    </div>
  );
}

/** The scrollable, filterable list of parsed 990 fields (lazy-loaded). */
function FormData(props: { filingId: string }) {
  const [fields, setFields] = useState<FilingField[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setFields(null);
    setError(null);
    fetch(
      `${API_BASE}/filings/data?filing_id=${
        encodeURIComponent(props.filingId)
      }`,
    )
      .then((r) =>
        r.ok ? r.json() : Promise.reject(
          new Error(r.status === 401 ? "sign in to view" : `HTTP ${r.status}`),
        )
      )
      .then((d) => {
        if (!alive) return;
        // A 2xx body can still carry a soft {error} (e.g. filing not found).
        if (d && typeof d === "object" && d.error) {
          setError(String(d.error));
        } else {
          setFields((d.fields ?? []) as FilingField[]);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      alive = false;
    };
  }, [props.filingId]);

  const needle = q.trim().toLowerCase();
  const shown = (fields ?? []).filter((fld) =>
    !needle ||
    fieldLabel(fld).toLowerCase().includes(needle) ||
    (fld.xml_path ?? "").toLowerCase().includes(needle)
  );

  return (
    <div style={{ marginTop: "18px" }}>
      <div
        class="flex items-center justify-between"
        style={{ marginBottom: "8px" }}
      >
        <div class="section-title">Reported data</div>
        {fields && fields.length > 0 && (
          <input
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            placeholder="filter…"
            class="input"
            style={{ width: "150px", padding: "4px 9px", fontSize: "12px" }}
          />
        )}
      </div>
      {error
        ? (
          <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
            Couldn't load form data ({error}).
          </p>
        )
        : fields === null
        ? (
          <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
            Loading form data…
          </p>
        )
        : fields.length === 0
        ? (
          <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
            No parsed field data for this filing.
          </p>
        )
        : (
          <div
            style={{
              maxHeight: "340px",
              overflowY: "auto",
              border: "1px solid var(--color-line)",
              borderRadius: "12px",
            }}
          >
            <table class="table" style={{ fontSize: "12.5px" }}>
              <tbody>
                {shown.map((fld, i) => (
                  <tr key={fld.field_id ?? i}>
                    <td style={{ padding: "6px 12px" }}>
                      <div class="text-navy" style={{ fontWeight: 600 }}>
                        {fieldLabel(fld)}
                      </div>
                      {fieldContext(fld) && (
                        <div
                          class="mono text-faint"
                          style={{ fontSize: "10.5px" }}
                        >
                          {fieldContext(fld)}
                        </div>
                      )}
                    </td>
                    <td
                      class="mono text-muted"
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        verticalAlign: "top",
                        wordBreak: "break-word",
                      }}
                    >
                      {fld.value === null || fld.value === undefined ||
                          fld.value === ""
                        ? "—"
                        : String(fld.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {fields && fields.length > 0 && (
        <div class="text-faint" style={{ fontSize: "11px", marginTop: "6px" }}>
          {shown.length} of {fields.length} fields
        </div>
      )}
    </div>
  );
}

function Modal(props: { filing: Filing; onClose: () => void }) {
  const f = props.filing;
  const link = (rel: keyof NonNullable<Filing["links"]>) =>
    `${API_BASE}${f.links?.[rel] ?? ""}`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: "0",
        background: "rgba(15,21,40,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 50,
      }}
    >
      <div
        class="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderRadius: "18px",
          padding: "26px",
          maxWidth: "640px",
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <div
          class="flex items-start justify-between"
          style={{ marginBottom: "14px" }}
        >
          <div>
            <div class="section-title" style={{ marginBottom: "4px" }}>
              Filing detail
            </div>
            <h3
              class="font-display font-bold text-navy"
              style={{ fontSize: "22px", margin: 0 }}
            >
              Form {form(f)} · FY{f.year}
            </h3>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="text-faint hover:text-navy"
            title="Close"
            style={{ fontSize: "20px", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div>
          <Row label="Fiscal year" value={String(f.year)} />
          <Row label="Form" value={form(f)} />
          <Row label="Filing ID" value={f.filing_id} />
          <Row label="IRS object ID" value={f.object_id ?? undefined} />
          <Row
            label="Ingested"
            value={f.created_at ? dateOnly(f.created_at) : undefined}
          />
          <Row label="XML file" value={f.xml_filename ?? undefined} />
          <Row label="Source archive" value={f.zip_filename ?? undefined} />
        </div>

        <FormData filingId={f.filing_id} />

        <div class="mt-5 flex flex-wrap" style={{ gap: "10px" }}>
          <a
            class="btn btn-secondary btn-sm"
            href={link("data")}
            target="_blank"
            rel="noopener"
          >
            Raw 990 data (XML)
          </a>
          <a
            class="btn btn-secondary btn-sm"
            href={link("detail")}
            target="_blank"
            rel="noopener"
          >
            Raw detail (JSON)
          </a>
          <a
            class="btn btn-secondary btn-sm"
            href={link("lookup")}
            target="_blank"
            rel="noopener"
          >
            Lookup
          </a>
        </div>
      </div>
    </div>
  );
}

export default function FilingsTable(props: { filings: Filing[] }) {
  const [selected, setSelected] = useState<Filing | null>(null);
  if (props.filings.length === 0) return null;
  return (
    <div style={{ padding: "0 44px 48px" }}>
      <h2
        class="font-display font-bold text-navy"
        style={{
          fontSize: "18px",
          letterSpacing: "-0.01em",
          margin: "0 0 16px",
        }}
      >
        Filings &amp; data
      </h2>
      <div class="card overflow-x-auto" style={{ borderRadius: "14px" }}>
        <table class="table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Year</th>
              <th style={{ textAlign: "left" }}>Form</th>
              <th style={{ textAlign: "left" }}>Filing ID</th>
              <th style={{ textAlign: "right" }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {props.filings.map((f) => (
              <tr key={f.filing_id}>
                <td class="mono">{f.year}</td>
                <td>{form(f)}</td>
                <td class="mono text-faint" style={{ fontSize: "11.5px" }}>
                  {f.filing_id}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    class="link"
                    style={{ fontSize: "12.5px" }}
                    onClick={() => setSelected(f)}
                  >
                    View detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <Modal
          filing={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
