// ── Island: ModelBuilder ─────────────────────────────────────────────────────
// A structured, field-by-field builder for a scoring-model definition — the
// friendly alternative to hand-writing the JSON the admin model builder used to
// require. It manages model-level fields + a list of factor rows, shows a LIVE
// preview of the exact JSON it will submit, and posts that JSON to the same
// POST /models handler (hidden `definition` field). An "Advanced (JSON)" toggle
// drops to a raw editor for the cases the form doesn't cover (composites with
// model:/factor: input tokens, exotic formula types) without losing the data.

import { useEffect, useMemo, useState } from "preact/hooks";

/** Formula types the backend accepts, with their fixed input count (null = 1+).
 * Kept in sync with scoring/engine.py FORMULA_TYPES / FORMULA_INPUT_COUNTS. */
const FORMULAS: { id: string; inputs: number | null; group: string }[] = [
  { id: "ratio", inputs: 2, group: "Ratio" },
  { id: "ratio_positive", inputs: 2, group: "Ratio" },
  { id: "sum_ratio", inputs: 3, group: "Ratio" },
  { id: "growth", inputs: 2, group: "Change" },
  { id: "difference", inputs: 2, group: "Change" },
  { id: "product", inputs: 2, group: "Arithmetic" },
  { id: "working_capital", inputs: 4, group: "Arithmetic" },
  { id: "clamp", inputs: 3, group: "Arithmetic" },
  { id: "abs_value", inputs: 1, group: "Arithmetic" },
  { id: "inverse", inputs: 1, group: "Arithmetic" },
  { id: "sum", inputs: null, group: "Aggregate (1+)" },
  { id: "average", inputs: null, group: "Aggregate (1+)" },
  { id: "min", inputs: null, group: "Aggregate (1+)" },
  { id: "max", inputs: null, group: "Aggregate (1+)" },
  { id: "median", inputs: null, group: "Aggregate (1+)" },
  { id: "running_average", inputs: 1, group: "Historical (1)" },
  { id: "cumulative_sum", inputs: 1, group: "Historical (1)" },
  { id: "historical_min", inputs: 1, group: "Historical (1)" },
  { id: "historical_max", inputs: 1, group: "Historical (1)" },
  { id: "cagr", inputs: 1, group: "Historical (1)" },
  { id: "historical_std_dev", inputs: 1, group: "Historical (1)" },
  { id: "coefficient_of_variation", inputs: 1, group: "Historical (1)" },
];
const FORMULA_BY_ID = new Map(FORMULAS.map((f) => [f.id, f]));
const MANUAL_SCALES = ["benchmark", "percent", "normalized"];
const APPLIES_TO = ["both", "nonprofit", "foundation"];

interface FactorRow {
  name: string;
  weight: string;
  formula_type: string;
  direction: string;
  inputs: string; // space/comma-separated concept codes (or model:/factor: tokens)
  benchmark_lo: string;
  benchmark_hi: string;
  scale: string; // manual only
}

interface Model {
  version: string;
  description: string;
  type: string;
  mode: string;
  kind: string;
  applies_to: string;
  missing_data: string;
}

const blankFactor = (): FactorRow => ({
  name: "",
  weight: "1",
  formula_type: "ratio",
  direction: "higher",
  inputs: "",
  benchmark_lo: "",
  benchmark_hi: "",
  scale: "benchmark",
});

/** Split the inputs text into tokens (concept codes / model: / factor: refs). */
function parseInputs(s: string): string[] {
  return s.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
}

const numOrUndef = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

/** Build the {model, factor} definition object from the structured state. */
function buildDefinition(model: Model, factors: FactorRow[]): unknown {
  const m: Record<string, unknown> = { version: model.version.trim() };
  if (model.description.trim()) m.description = model.description.trim();
  if (model.type) m.type = model.type;
  m.mode = model.mode;
  m.kind = model.kind;
  if (model.applies_to && model.applies_to !== "both") {
    m.applies_to = model.applies_to;
  }
  if (model.missing_data.trim()) m.missing_data = model.missing_data.trim();

  const factor = factors.map((f) => {
    const base: Record<string, unknown> = {
      name: f.name.trim(),
      weight: numOrUndef(f.weight) ?? 0,
    };
    if (model.mode === "manual") {
      base.scale = f.scale;
      return base;
    }
    base.formula_type = f.formula_type;
    base.direction = f.direction;
    base.inputs = parseInputs(f.inputs);
    // benchmark_lo/hi are REQUIRED for computed factors (they define the
    // normalization band); default to 0..1 when the admin leaves them blank.
    base.benchmark_lo = numOrUndef(f.benchmark_lo) ?? 0;
    base.benchmark_hi = numOrUndef(f.benchmark_hi) ?? 1;
    return base;
  });
  return { model: m, factor };
}

/** Best-effort: hydrate the structured fields from a pasted/template definition. */
function fromDefinition(
  raw: string,
): { model: Model; factors: FactorRow[] } | null {
  try {
    const d = JSON.parse(raw) as {
      model?: Record<string, unknown>;
      factor?: Record<string, unknown>[];
    };
    if (!d || typeof d !== "object" || !d.model) return null;
    const m = d.model;
    const model: Model = {
      version: String(m.version ?? ""),
      description: String(m.description ?? ""),
      type: String(m.type ?? ""),
      mode: m.mode === "manual" ? "manual" : "computed",
      kind: typeof m.kind === "string" ? m.kind : "model",
      applies_to: typeof m.applies_to === "string" ? m.applies_to : "both",
      missing_data: m.missing_data ? String(m.missing_data) : "",
    };
    const factors = (d.factor ?? []).map((f): FactorRow => {
      const blank = blankFactor();
      const inputs = Array.isArray(f.inputs)
        ? (f.inputs as unknown[]).map((x) =>
          typeof x === "string" ? x : (x as { key?: string })?.key ?? ""
        ).filter(Boolean).join(" ")
        : "";
      return {
        ...blank,
        name: String(f.name ?? ""),
        weight: f.weight !== undefined ? String(f.weight) : "1",
        formula_type:
          typeof f.formula_type === "string" && f.formula_type !== "manual"
            ? f.formula_type
            : blank.formula_type,
        direction: f.direction === "lower" ? "lower" : "higher",
        inputs,
        benchmark_lo: f.benchmark_lo !== undefined
          ? String(f.benchmark_lo)
          : "",
        benchmark_hi: f.benchmark_hi !== undefined
          ? String(f.benchmark_hi)
          : "",
        scale: typeof f.scale === "string" ? f.scale : "benchmark",
      };
    });
    return { model, factors: factors.length ? factors : [blankFactor()] };
  } catch {
    return null;
  }
}

// ── styling (the builder card is navy; fields are light-on-dark) ──────────────
const LABEL =
  "mono uppercase block text-[10.5px] tracking-[.12em] text-[#9fb6e6] mb-1.5";
const FIELD =
  "w-full bg-[#0f1d3d] text-[#dbe4f7] border border-[#2f4170] rounded-[9px] px-3 py-2 text-[13px]";

export default function ModelBuilder(
  props: {
    prefill?: string;
    types: { code: string; name: string }[];
    kinds: { code: string; name: string }[];
    /** When set, the form EDITS this existing version (locks it, posts update). */
    editing?: string;
  },
) {
  const editing = !!props.editing;
  const seeded = props.prefill ? fromDefinition(props.prefill) : null;
  const [model, setModel] = useState<Model>(
    seeded?.model ?? {
      version: "",
      description: "",
      type: props.types[0]?.code ?? "financial",
      mode: "computed",
      kind: "model",
      applies_to: "both",
      missing_data: "",
    },
  );
  const [factors, setFactors] = useState<FactorRow[]>(
    seeded?.factors ?? [blankFactor()],
  );
  const [advanced, setAdvanced] = useState(false);
  const [rawJson, setRawJson] = useState(props.prefill ?? "");

  const built = useMemo(
    () => JSON.stringify(buildDefinition(model, factors), null, 2),
    [model, factors],
  );
  // The exact JSON that posts: the raw editor in advanced mode, else the built.
  const definition = advanced ? rawJson : built;

  // Keep the advanced editor seeded with the structured JSON the first time the
  // admin switches into it, so they edit what they built (not a stale prefill).
  useEffect(() => {
    if (advanced && !rawJson.trim()) setRawJson(built);
  }, [advanced]);

  const setM = (k: keyof Model, v: string) =>
    setModel((m) => ({ ...m, [k]: v }));
  const setF = (i: number, k: keyof FactorRow, v: string) =>
    setFactors((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const addFactor = () => setFactors((fs) => [...fs, blankFactor()]);
  const removeFactor = (i: number) =>
    setFactors((fs) => fs.length > 1 ? fs.filter((_, j) => j !== i) : fs);

  const manual = model.mode === "manual";
  const typeOptions = props.types.length
    ? props.types
    : [{ code: "financial", name: "Financial" }];
  const kindOptions = props.kinds.length
    ? props.kinds
    : [{ code: "model", name: "Model" }];

  return (
    <form method="POST" style={{ padding: "18px 28px 26px" }}>
      <input type="hidden" name="definition" value={definition} />
      {/* Non-empty → the route's POST updates this version instead of creating. */}
      <input type="hidden" name="editing" value={props.editing ?? ""} />

      <div class="mb-4 flex items-center justify-between">
        <span class={LABEL} style={{ marginBottom: 0 }}>
          {advanced ? "Definition (raw JSON)" : "Model"}
        </span>
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          class="mono text-[12px] text-[#9fb6e6] underline"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          {advanced ? "← Structured form" : "Advanced (JSON) →"}
        </button>
      </div>

      {advanced
        ? (
          <textarea
            name="definition_raw"
            rows={20}
            spellcheck={false}
            value={rawJson}
            onInput={(e) => setRawJson((e.target as HTMLTextAreaElement).value)}
            class={`mono ${FIELD}`}
            style={{
              minHeight: "20rem",
              lineHeight: "1.55",
              resize: "vertical",
            }}
          />
        )
        : (
          <>
            {/* model-level fields */}
            <div
              class="grid gap-3"
              style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
            >
              <div>
                <label class={LABEL}>
                  Version {editing ? "(locked)" : "*"}
                </label>
                <input
                  class={FIELD}
                  value={model.version}
                  placeholder="e.g. 50 or 50.1"
                  readOnly={editing}
                  style={editing
                    ? { opacity: "0.6", cursor: "not-allowed" }
                    : {}}
                  onInput={(e) =>
                    setM("version", (e.target as HTMLInputElement).value)}
                />
              </div>
              <div>
                <label class={LABEL}>Type</label>
                <select
                  class={FIELD}
                  value={model.type}
                  onChange={(e) =>
                    setM("type", (e.target as HTMLSelectElement).value)}
                >
                  {typeOptions.map((t) => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label class={LABEL}>Applies to</label>
                <select
                  class={FIELD}
                  value={model.applies_to}
                  onChange={(e) =>
                    setM("applies_to", (e.target as HTMLSelectElement).value)}
                >
                  {APPLIES_TO.map((a) => <option key={a} value={a}>{a}
                  </option>)}
                </select>
              </div>
              <div>
                <label class={LABEL}>Mode</label>
                <select
                  class={FIELD}
                  value={model.mode}
                  onChange={(e) =>
                    setM("mode", (e.target as HTMLSelectElement).value)}
                >
                  <option value="computed">computed</option>
                  <option value="manual">manual</option>
                </select>
              </div>
              <div>
                <label class={LABEL}>Kind</label>
                <select
                  class={FIELD}
                  value={model.kind}
                  onChange={(e) =>
                    setM("kind", (e.target as HTMLSelectElement).value)}
                >
                  {kindOptions.map((k) => (
                    <option key={k.code} value={k.code}>{k.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label class={LABEL}>Missing data</label>
                <input
                  class={FIELD}
                  value={model.missing_data}
                  placeholder="(optional) e.g. closest_newer"
                  onInput={(e) =>
                    setM("missing_data", (e.target as HTMLInputElement).value)}
                />
              </div>
            </div>
            <div class="mt-3">
              <label class={LABEL}>Description</label>
              <input
                class={FIELD}
                value={model.description}
                placeholder="What this model measures"
                onInput={(e) =>
                  setM("description", (e.target as HTMLInputElement).value)}
              />
            </div>

            {/* factor rows */}
            <div class="mb-2 mt-6 flex items-center justify-between">
              <span class={LABEL} style={{ marginBottom: 0 }}>
                Factors ({factors.length})
              </span>
              {model.kind !== "model" && (
                <span class="text-[11px] text-[#c98a2b]">
                  {model.kind}{" "}
                  factors reference children via model:&lt;version&gt; inputs —
                  use Advanced (JSON)
                </span>
              )}
            </div>
            {factors.map((f, i) => (
              <div
                key={i}
                class="mb-2 rounded-[10px] border border-[#2f4170] p-3"
                style={{ background: "rgba(15,29,61,.55)" }}
              >
                <div
                  class="grid gap-2"
                  style={{ gridTemplateColumns: "2fr 1fr auto" }}
                >
                  <input
                    class={FIELD}
                    value={f.name}
                    placeholder="Factor name"
                    onInput={(e) =>
                      setF(i, "name", (e.target as HTMLInputElement).value)}
                  />
                  <input
                    class={FIELD}
                    type="number"
                    step="0.01"
                    value={f.weight}
                    placeholder="weight"
                    onInput={(e) =>
                      setF(i, "weight", (e.target as HTMLInputElement).value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeFactor(i)}
                    class="mono text-[12px] text-[#9fb6e6]"
                    style={{
                      background: "none",
                      border: "1px solid #2f4170",
                      borderRadius: "8px",
                      padding: "0 12px",
                      cursor: "pointer",
                    }}
                    title="Remove factor"
                  >
                    ✕
                  </button>
                </div>
                {manual
                  ? (
                    <div class="mt-2" style={{ maxWidth: "240px" }}>
                      <label class={LABEL}>Scale</label>
                      <select
                        class={FIELD}
                        value={f.scale}
                        onChange={(e) =>
                          setF(
                            i,
                            "scale",
                            (e.target as HTMLSelectElement).value,
                          )}
                      >
                        {MANUAL_SCALES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )
                  : (
                    <>
                      <div
                        class="mt-2 grid gap-2"
                        style={{ gridTemplateColumns: "1.2fr 1fr 2fr" }}
                      >
                        <div>
                          <label class={LABEL}>Formula</label>
                          <select
                            class={FIELD}
                            value={f.formula_type}
                            onChange={(e) =>
                              setF(
                                i,
                                "formula_type",
                                (e.target as HTMLSelectElement).value,
                              )}
                          >
                            {FORMULAS.map((ft) => (
                              <option key={ft.id} value={ft.id}>{ft.id}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label class={LABEL}>Better when</label>
                          <select
                            class={FIELD}
                            value={f.direction}
                            onChange={(e) =>
                              setF(
                                i,
                                "direction",
                                (e.target as HTMLSelectElement).value,
                              )}
                          >
                            <option value="higher">higher</option>
                            <option value="lower">lower</option>
                          </select>
                        </div>
                        <div>
                          <label class={LABEL}>
                            Inputs{(() => {
                              const n = FORMULA_BY_ID.get(f.formula_type)
                                ?.inputs;
                              return n == null ? " (1+)" : ` (${n})`;
                            })()}
                          </label>
                          <input
                            class={FIELD}
                            value={f.inputs}
                            placeholder="concept codes, space-separated"
                            onInput={(e) =>
                              setF(
                                i,
                                "inputs",
                                (e.target as HTMLInputElement).value,
                              )}
                          />
                        </div>
                      </div>
                      <div
                        class="mt-2 grid gap-2"
                        style={{ gridTemplateColumns: "1fr 1fr 2fr" }}
                      >
                        <div>
                          <label class={LABEL}>Benchmark low</label>
                          <input
                            class={FIELD}
                            type="number"
                            step="any"
                            value={f.benchmark_lo}
                            placeholder="0"
                            onInput={(e) =>
                              setF(
                                i,
                                "benchmark_lo",
                                (e.target as HTMLInputElement).value,
                              )}
                          />
                        </div>
                        <div>
                          <label class={LABEL}>Benchmark high</label>
                          <input
                            class={FIELD}
                            type="number"
                            step="any"
                            value={f.benchmark_hi}
                            placeholder="1"
                            onInput={(e) =>
                              setF(
                                i,
                                "benchmark_hi",
                                (e.target as HTMLInputElement).value,
                              )}
                          />
                        </div>
                        <div />
                      </div>
                    </>
                  )}
              </div>
            ))}
            <button
              type="button"
              onClick={addFactor}
              class="mono text-[12px] font-semibold text-[#cdd9f0]"
              style={{
                background: "none",
                border: "1px dashed #3a4f82",
                borderRadius: "9px",
                padding: "7px 14px",
                cursor: "pointer",
              }}
            >
              + Add factor
            </button>

            {/* live preview of the exact JSON that will be submitted */}
            <details class="mt-5">
              <summary class={LABEL} style={{ cursor: "pointer" }}>
                Preview definition JSON
              </summary>
              <pre
                class="mono mt-2 overflow-auto rounded-[10px] p-3 text-[12px]"
                style={{
                  background: "#0f1d3d",
                  color: "#dbe4f7",
                  border: "1px solid #2f4170",
                  maxHeight: "260px",
                }}
              >{built}</pre>
            </details>
          </>
        )}

      {editing && (
        <p class="mt-4 text-[12px] text-[#c98a2b]">
          Editing version{" "}
          {props.editing}. Saving replaces its factors — existing scores were
          computed under the old definition, so re-run{" "}
          <code class="mono">openreturn score --version {props.editing}</code>
          {" "}
          (or the next ingest) to apply the change.
        </p>
      )}
      <div class="mt-4 flex flex-wrap items-center gap-5">
        <label class="flex items-center gap-2 text-[13px] text-[#cdd9f0]">
          <input type="checkbox" name="dry_run" value="1" />
          Validate only (dry run)
        </label>
        {!editing && (
          <label class="flex items-center gap-2 text-[13px] text-[#cdd9f0]">
            <input type="checkbox" name="skip_existing" value="1" />
            Skip if exists
          </label>
        )}
        <div class="ml-auto flex gap-2">
          <button
            type="submit"
            class="font-semibold"
            style={{
              background: "#fff",
              color: "#192A54",
              borderRadius: "9px",
              padding: "9px 18px",
              fontSize: "13.5px",
              border: "none",
              cursor: "pointer",
            }}
          >
            {editing ? "Save changes" : "Submit"}
          </button>
          <a
            href="/models"
            class="font-semibold no-underline"
            style={{
              color: "#cdd9f0",
              border: "1px solid #3a4f82",
              borderRadius: "9px",
              padding: "9px 18px",
              fontSize: "13.5px",
            }}
          >
            Reset
          </a>
        </div>
      </div>
    </form>
  );
}
