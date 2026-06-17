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
