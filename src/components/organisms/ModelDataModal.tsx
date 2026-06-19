// ── Organism: ModelDataModal ─────────────────────────────────────────────────
// A query-driven (?panel=<version>&panelYear=<year>) overlay opened from the top
// "Update data" button (or a pillar's "Manage data" link) for one MODEL + YEAR.
// It gathers, in one place (with a year selector):
//   1. Financial figures — EVERY concept, grouped by section (Revenue / Expenses
//      / Balance sheet). Per concept you can CHOOSE which source/observation is
//      the value of record (canonical, via /financials/value's set_canonical) and
//      set/correct a value (/financials/value). These feed the computed scores.
//   2. Model grading (MANUAL models only) — a value + comment per factor.
//   3. Notes scoped to this model + year.
//   4. Custom data fields scoped to this model + year.
// Server-rendered; every action is a form that POSTs to the org route handler,
// which redirects back to the same panel (PRG). Close = a link back to the org.

import { Fragment } from "preact";
import { Field } from "../molecules.tsx";
import { money, titleCase } from "../../lib/format.ts";
import type {
  FactorDef,
  FinancialFact,
  ModelYearField,
  ModelYearNote,
} from "../../lib/types.ts";

export interface ModelPanel {
  ein: string;
  version: string;
  modelLabel: string;
  scoringMode: string; // "computed" | "manual"
  year: number;
  years: number[];
  filingId?: string | null;
  facts: FinancialFact[]; // facts for `year` (each with all observations)
  concepts: { code: string; label: string; category?: string | null }[];
  factors: FactorDef[];
  notes: ModelYearNote[];
  fields: ModelYearField[];
  canData: boolean;
  canScore: boolean;
  canModelData: boolean;
}

/** Concept categories → section headings (revenue/expenses/balance, then other). */
const FIN_SECTIONS: { key: string; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "expense", label: "Expenses" },
  { key: "balance", label: "Balance sheet" },
  { key: "other", label: "Other" },
];
const KNOWN_CATS = new Set(["revenue", "expense", "balance"]);
const catOf = (
  cat?: string | null,
) => (cat && KNOWN_CATS.has(cat) ? cat : "other");

/** Friendly short label for a financial source code. */
function sourceLabel(code: string | null | undefined): string {
  if (!code) return "—";
  if (code.includes("ocr")) return "OCR";
  if (code.includes("manual")) return "Manual";
  if (code.includes("xml") || code.includes("efile") || code.includes("990")) {
    return "990";
  }
  if (code.includes("audit")) return "Audited";
  return titleCase(code);
}

function SectionTitle(props: { children: string; hint?: string }) {
  return (
    <div
      class="flex items-baseline justify-between"
      style={{ margin: "22px 0 10px" }}
    >
      <h4
        class="font-display font-bold text-navy"
        style={{ fontSize: "14.5px", margin: 0 }}
      >
        {props.children}
      </h4>
      {props.hint && (
        <span class="text-faint" style={{ fontSize: "11px" }}>
          {props.hint}
        </span>
      )}
    </div>
  );
}

/** Hidden fields carrying the panel context so the POST redirect reopens it. */
function PanelCtx(props: { p: ModelPanel; action: string }) {
  return (
    <>
      <input type="hidden" name="action" value={props.action} />
      <input type="hidden" name="version" value={props.p.version} />
      <input type="hidden" name="year" value={String(props.p.year)} />
    </>
  );
}

export function ModelDataModal(props: { panel: ModelPanel }) {
  const p = props.panel;
  const factOf = (code: string) => p.facts.find((f) => f.concept_code === code);
  const close = `/orgs/${p.ein}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
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
        style={{
          borderRadius: "18px",
          padding: "26px",
          maxWidth: "640px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* header */}
        <div
          class="flex items-start justify-between"
          style={{ marginBottom: "6px" }}
        >
          <div>
            <div class="section-title" style={{ marginBottom: "4px" }}>
              Manage data
            </div>
            <h3
              class="font-display font-bold text-navy"
              style={{ fontSize: "21px", margin: 0 }}
            >
              {p.modelLabel} · FY{p.year}
            </h3>
          </div>
          <a
            href={close}
            class="text-faint hover:text-navy"
            title="Close"
            style={{ fontSize: "20px", lineHeight: 1, textDecoration: "none" }}
          >
            ✕
          </a>
        </div>

        {/* year selector */}
        {p.years.length > 1 && (
          <div
            class="flex flex-wrap items-center"
            style={{ gap: "6px", marginTop: "10px" }}
          >
            <span class="text-faint" style={{ fontSize: "11.5px" }}>Year:</span>
            {p.years.map((y) => (
              <a
                key={y}
                href={`/orgs/${p.ein}?panel=${
                  encodeURIComponent(p.version)
                }&panelYear=${y}`}
                class="mono rounded-full"
                style={{
                  border: "1px solid",
                  borderColor: y === p.year ? "#2f4a85" : "var(--color-line)",
                  background: y === p.year ? "#2f4a85" : "transparent",
                  color: y === p.year ? "#fff" : "#6b7488",
                  padding: "3px 11px",
                  fontSize: "11.5px",
                  textDecoration: "none",
                }}
              >
                {y}
              </a>
            ))}
          </div>
        )}

        {
          /* 1. Financial figures — every concept, grouped by section; choose the
              source of record (canonical) and set/correct a value per year. */
        }
        <SectionTitle hint={`FY${p.year} · feeds computed scores`}>
          Financial figures
        </SectionTitle>
        {!p.canData && (
          <p class="text-faint" style={{ fontSize: "11px", margin: "0 0 8px" }}>
            <code>data:write</code> required to change figures.
          </p>
        )}
        <div
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            border: "1px solid var(--color-line)",
            borderRadius: "10px",
            padding: "4px 0",
          }}
        >
          {FIN_SECTIONS.map((sec) => {
            const secConcepts = p.concepts.filter((c) =>
              catOf(c.category) === sec.key
            );
            if (secConcepts.length === 0) return null;
            return (
              <Fragment key={sec.key}>
                <div
                  class="section-title"
                  style={{ padding: "10px 12px 4px", color: "#6b7488" }}
                >
                  {sec.label}
                </div>
                {secConcepts.map((c) => {
                  const fact = factOf(c.code);
                  const obs = fact?.observations ?? [];
                  const canon = fact?.canonical_value;
                  return (
                    <div
                      key={c.code}
                      style={{
                        padding: "7px 12px",
                        borderTop: "1px solid var(--color-line-soft)",
                      }}
                    >
                      <div class="flex items-baseline justify-between gap-3">
                        <span class="text-navy" style={{ fontSize: "12.5px" }}>
                          {c.label}
                        </span>
                        <span class="flex shrink-0 items-baseline gap-2">
                          <span
                            class="mono text-muted"
                            style={{ fontSize: "12px" }}
                          >
                            {canon !== null && canon !== undefined
                              ? money(canon)
                              : "—"}
                          </span>
                          {fact?.canonical_source && (
                            <span
                              class="mono text-faint"
                              style={{ fontSize: "10px" }}
                            >
                              {sourceLabel(fact.canonical_source)}
                            </span>
                          )}
                          {fact?.conflict && (
                            <span
                              class="mono"
                              style={{ fontSize: "10px", color: "#bf6a3e" }}
                              title="Sources disagree — choose one below"
                            >
                              conflict
                            </span>
                          )}
                        </span>
                      </div>
                      {/* choose which source/observation is the value of record */}
                      {p.canData && obs.length > 1 && (
                        <div
                          class="flex flex-wrap items-center"
                          style={{ gap: "5px", marginTop: "5px" }}
                        >
                          <span
                            class="text-faint"
                            style={{ fontSize: "10.5px" }}
                          >
                            use:
                          </span>
                          {obs.map((o) => (
                            <form
                              key={o.observation_id}
                              method="POST"
                              style={{ display: "inline" }}
                            >
                              <PanelCtx p={p} action="fin_set_canonical" />
                              <input
                                type="hidden"
                                name="concept"
                                value={c.code}
                              />
                              <input
                                type="hidden"
                                name="observation_id"
                                value={String(o.observation_id)}
                              />
                              <button
                                type="submit"
                                class="mono rounded-full"
                                style={{
                                  border: "1px solid",
                                  borderColor: o.is_canonical
                                    ? "#2f4a85"
                                    : "var(--color-line)",
                                  background: o.is_canonical
                                    ? "#2f4a85"
                                    : "transparent",
                                  color: o.is_canonical ? "#fff" : "#6b7488",
                                  padding: "2px 9px",
                                  fontSize: "10.5px",
                                }}
                              >
                                {sourceLabel(o.source_code)}: {money(o.value)}
                              </button>
                            </form>
                          ))}
                        </div>
                      )}
                      {/* set / correct the value (records a manual observation) */}
                      {p.canData && (
                        <form
                          method="POST"
                          class="flex items-end"
                          style={{ gap: "6px", marginTop: "5px" }}
                        >
                          <PanelCtx p={p} action="fin_value_edit" />
                          <input type="hidden" name="concept" value={c.code} />
                          <input
                            name="value"
                            type="number"
                            step="any"
                            placeholder="set value…"
                            class="input"
                            style={{
                              padding: "3px 9px",
                              fontSize: "11.5px",
                              maxWidth: "150px",
                            }}
                          />
                          <button
                            type="submit"
                            class="btn btn-secondary btn-sm"
                            style={{ fontSize: "11px" }}
                          >
                            Set
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>

        {/* 2. Grading (manual models only) */}
        <SectionTitle>Grade factors</SectionTitle>
        {p.scoringMode !== "manual"
          ? (
            <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
              This model is computed automatically from the financial data above
              — no manual grading.
            </p>
          )
          : !p.canScore || !p.filingId
          ? (
            <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
              {p.filingId
                ? (
                  <span>
                    <code>score:write</code> required to grade.
                  </span>
                )
                : "No filing on record for this year to attach grades to."}
            </p>
          )
          : (
            <div class="flex flex-col" style={{ gap: "8px" }}>
              {p.factors.map((f) => (
                <form
                  key={f.factor_id}
                  method="POST"
                  class="flex flex-wrap items-end"
                  style={{ gap: "8px" }}
                >
                  <PanelCtx p={p} action="grade_factor" />
                  <input
                    type="hidden"
                    name="filing_id"
                    value={p.filingId ?? ""}
                  />
                  <input
                    type="hidden"
                    name="factor_id"
                    value={String(f.factor_id)}
                  />
                  <div style={{ flex: 1, minWidth: "140px" }}>
                    <label class="label">{f.name}</label>
                    <div class="text-faint" style={{ fontSize: "10.5px" }}>
                      {f.manual_scale ?? "normalized"} scale · weight {f.weight}
                    </div>
                  </div>
                  <Field label="Value" name="value" type="number" />
                  <Field label="Comment" name="comment" />
                  <button type="submit" class="btn btn-secondary btn-sm">
                    Save
                  </button>
                </form>
              ))}
            </div>
          )}

        {/* 3. Notes */}
        <SectionTitle>Notes</SectionTitle>
        {p.notes.length === 0
          ? (
            <p
              class="text-faint"
              style={{ fontSize: "12.5px", margin: "0 0 8px" }}
            >
              No notes for this model + year yet.
            </p>
          )
          : (
            <div
              class="flex flex-col"
              style={{ gap: "8px", marginBottom: "10px" }}
            >
              {p.notes.map((n) => (
                <div
                  key={n.note_id}
                  class="card"
                  style={{ borderRadius: "12px", padding: "12px 14px" }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {n.body}
                  </p>
                  <div
                    class="flex items-center justify-between"
                    style={{ marginTop: "6px" }}
                  >
                    <span
                      class="mono text-faint"
                      style={{ fontSize: "10.5px" }}
                    >
                      {n.author_label ?? "unknown"}
                    </span>
                    {p.canModelData && (
                      <form method="POST" style={{ display: "inline" }}>
                        <PanelCtx p={p} action="mdnote_delete" />
                        <input
                          type="hidden"
                          name="note_id"
                          value={String(n.note_id)}
                        />
                        <button
                          type="submit"
                          class="text-faint hover:text-band-low"
                          title="Delete note"
                          style={{ fontSize: "12px", lineHeight: 1 }}
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        {p.canModelData && (
          <form method="POST">
            <PanelCtx p={p} action="mdnote_add" />
            <textarea
              name="body"
              class="input"
              required
              rows={2}
              placeholder="Add a note for this model + year…"
              style={{ resize: "vertical", marginBottom: "8px" }}
            />
            <button type="submit" class="btn btn-primary btn-sm">
              Add note
            </button>
          </form>
        )}

        {/* 4. Custom fields */}
        <SectionTitle>Custom data</SectionTitle>
        {p.fields.length === 0
          ? (
            <p
              class="text-faint"
              style={{ fontSize: "12.5px", margin: "0 0 8px" }}
            >
              No custom fields yet.
            </p>
          )
          : (
            <div
              style={{
                border: "1px solid var(--color-line)",
                borderRadius: "10px",
                marginBottom: "10px",
              }}
            >
              <table class="table" style={{ fontSize: "12.5px" }}>
                <tbody>
                  {p.fields.map((fld) => (
                    <tr key={fld.field_id}>
                      <td
                        class="text-navy"
                        style={{ padding: "6px 12px", fontWeight: 600 }}
                      >
                        {fld.label}
                      </td>
                      <td class="text-muted" style={{ padding: "6px 12px" }}>
                        {fld.value ?? "—"}
                      </td>
                      <td
                        style={{
                          padding: "6px 12px",
                          textAlign: "right",
                          width: "1%",
                        }}
                      >
                        {p.canModelData && (
                          <form method="POST" style={{ display: "inline" }}>
                            <PanelCtx p={p} action="mdatum_delete" />
                            <input
                              type="hidden"
                              name="field_id"
                              value={String(fld.field_id)}
                            />
                            <button
                              type="submit"
                              class="text-faint hover:text-band-low"
                              title="Delete field"
                              style={{ fontSize: "12px", lineHeight: 1 }}
                            >
                              ✕
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {p.canModelData && (
          <form
            method="POST"
            class="flex flex-wrap items-end"
            style={{ gap: "8px" }}
          >
            <PanelCtx p={p} action="mdatum_add" />
            <Field label="Label" name="label" />
            <div style={{ flex: 1, minWidth: "120px" }}>
              <Field label="Value" name="value" />
            </div>
            <button type="submit" class="btn btn-primary btn-sm">
              Add field
            </button>
          </form>
        )}

        <div style={{ marginTop: "20px", textAlign: "right" }}>
          <a href={close} class="btn btn-secondary btn-sm">Done</a>
        </div>
      </div>
    </div>
  );
}
