import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

// Backend stubs for a populated financials page (ein=000000001).
const FACTS = {
  "/financials": () =>
    jsonResponse({
      ein: "000000001",
      facts: [{
        fiscal_year: 2023,
        concept_code: "prog",
        chosen_by: "auto",
        diverges: false,
        conflict: false,
        resolved: false,
        canonical_value: 1000,
        observations: [{
          observation_id: 1,
          source_code: "irs_990_xml",
          value: 1000,
          confidence: 1,
          is_canonical: true,
        }],
      }],
    }),
  "/financials/conflicts": () =>
    jsonResponse({
      ein: "000000001",
      conflicts: [{
        fiscal_year: 2023,
        concept_code: "total_exp",
        chosen_by: null,
        diverges: true,
        conflict: true,
        resolved: false,
        canonical_value: null,
        observations: [
          {
            observation_id: 2,
            source_code: "irs_990_xml",
            value: 5000,
            confidence: 1,
            is_canonical: false,
          },
          {
            observation_id: 3,
            source_code: "audited_statement",
            value: 5200,
            confidence: 0.9,
            is_canonical: false,
          },
        ],
      }],
    }),
  "/financials/sources": () =>
    jsonResponse({
      sources: [{ code: "irs_990_xml", name: "IRS 990", rank: 100 }],
    }),
  "/financials/concepts": () =>
    jsonResponse({
      concepts: [
        { code: "total_exp", name: "Total Expenses" },
        { code: "total_rev", name: "Total Revenue" },
      ],
    }),
  "/organizations/detail": () =>
    jsonResponse({ ein: "000000001", name: "Acme" }),
};

Deno.test("GET /financials with no ein shows the lookup form + empty prompt", async () => {
  const res = await appRequest("/financials", { cookie: sessionCookie(ADMIN) });
  assertEquals(res.status, 200);
  // The lookup form: EIN field + Load button.
  assertStringIncludes(res.body, "Financial data");
  assertStringIncludes(res.body, 'name="ein"');
  assertStringIncludes(res.body, "Load");
  // The empty-state prompt before any EIN is entered.
  assertStringIncludes(res.body, "Enter an EIN to begin");
});

Deno.test("GET /financials?ein=… renders facts, conflicts, and a Set canonical control", async () => {
  const res = await appRequest("/financials?ein=000000001&year=2023", {
    cookie: sessionCookie(ADMIN),
    backend: FACTS,
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Financial data");
  // Org name from /organizations/detail.
  assertStringIncludes(res.body, "Acme");
  // Conflicts section header + the conflicting concept (titleCase of total_exp).
  assertStringIncludes(res.body, "Conflicts");
  assertStringIncludes(res.body, "Total Exp");
  // The admin canonical-selection control.
  assertStringIncludes(res.body, "Set canonical");
});

Deno.test("GET /financials?ein=… renders the Add financial data form for a data:write user", async () => {
  const res = await appRequest("/financials?ein=000000001&year=2023", {
    cookie: sessionCookie(ADMIN),
    backend: FACTS,
  });
  assertEquals(res.status, 200);
  // The record form, its source select, and a value input per concept.
  assertStringIncludes(res.body, "Add financial data");
  assertStringIncludes(res.body, 'value="record"');
  assertStringIncludes(res.body, 'name="source"');
  assertStringIncludes(res.body, 'name="value_total_exp"');
  assertStringIncludes(res.body, 'name="value_total_rev"');
  // The fiscal year is pre-filled from the loaded year.
  assertStringIncludes(res.body, "2023");
});

Deno.test("POST /financials record posts observations and redirects with a msg", async () => {
  let recorded: Record<string, unknown> | null = null;
  const res = await appRequest("/financials", {
    cookie: sessionCookie(ADMIN),
    form: {
      action: "record",
      ein: "000000001",
      fiscal_year: "2023",
      source: "audited_statement",
      value_total_exp: "5200",
      value_total_rev: "",
      note: "From the FY23 audit",
    },
    backend: {
      "POST /financials/observations": (req: Request) => {
        return req.json().then((body) => {
          recorded = body;
          return jsonResponse({ ok: true });
        });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location?.startsWith("/financials?ein=000000001"));
  assertStringIncludes(res.location ?? "", "msg=");
  assert(recorded, "the observations endpoint was called");
  const body = recorded as {
    ein: string;
    fiscal_year: number;
    source: string;
    values: Record<string, number>;
    note?: string;
  };
  assertEquals(body.source, "audited_statement");
  assertEquals(body.fiscal_year, 2023);
  // Blank value fields are skipped; only the filled concept is sent.
  assertEquals(body.values, { total_exp: 5200 });
  assertEquals(body.note, "From the FY23 audit");
});

Deno.test("POST /financials record with no values redirects with an error", async () => {
  let called = false;
  const res = await appRequest("/financials", {
    cookie: sessionCookie(ADMIN),
    form: {
      action: "record",
      ein: "000000001",
      fiscal_year: "2023",
      source: "audited_statement",
      value_total_exp: "",
    },
    backend: {
      "POST /financials/observations": () => {
        called = true;
        return jsonResponse({ ok: true });
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assertStringIncludes(res.location ?? "", "err=");
  assert(!called, "no observation is recorded when every value is blank");
});

Deno.test("GET /financials?ein=… surfaces low-confidence facts in Needs review", async () => {
  const res = await appRequest("/financials?ein=000000001&year=2024", {
    cookie: sessionCookie(ADMIN),
    backend: {
      ...FACTS,
      // A sole low-confidence OCR reading that auto-became canonical.
      "/financials": () =>
        jsonResponse({
          ein: "000000001",
          facts: [{
            fiscal_year: 2024,
            concept_code: "cy_exp",
            chosen_by: "auto",
            diverges: false,
            conflict: false,
            resolved: false,
            review: true,
            canonical_value: 500,
            canonical_source: "ocr_990_pdf",
            canonical_confidence: 0.55,
            observations: [{
              observation_id: 9,
              source_code: "ocr_990_pdf",
              value: 500,
              confidence: 0.55,
              is_canonical: true,
            }],
          }],
        }),
      "/financials/sources": () =>
        jsonResponse({
          sources: [{ code: "ocr_990_pdf", name: "OCR (990 PDF)", rank: 10 }],
        }),
    },
  });
  assertEquals(res.status, 200);
  // The review section, the source label, the confidence, and the confirm action.
  assertStringIncludes(res.body, "Needs review");
  assertStringIncludes(res.body, "Confirm value");
  assertStringIncludes(res.body, "OCR (990 PDF)");
  assertStringIncludes(res.body, "55%");
});

Deno.test("POST /financials canonical redirects back to /financials with a msg", async () => {
  let canonicalSet = false;
  const res = await appRequest("/financials", {
    cookie: sessionCookie(ADMIN),
    form: {
      action: "canonical",
      ein: "000000001",
      fiscal_year: "2023",
      concept: "total_exp",
      observation_id: "3",
    },
    backend: {
      "POST /financials/canonical": () => {
        canonicalSet = true;
        return jsonResponse({});
      },
    },
  });
  assert(res.status === 302 || res.status === 303);
  assert(res.location?.startsWith("/financials?ein=000000001"));
  assertStringIncludes(res.location ?? "", "msg=");
  assert(canonicalSet, "backend canonical endpoint was called");
});
