import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie, VIEWER } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

const CONFLICT_ORGS = () =>
  jsonResponse({
    total: 2,
    limit: 25,
    offset: 0,
    organizations: [
      { ein: "000000001", name: "Acme Nonprofit", conflict_count: 3 },
      { ein: "000000002", name: "Beacon Foundation", conflict_count: 1 },
    ],
  });

const ORG_CONFLICTS = () =>
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
  });

Deno.test("GET /conflicts lists organizations with unresolved conflicts", async () => {
  const res = await appRequest("/conflicts", {
    cookie: sessionCookie(ADMIN),
    backend: { "/financials/conflict-orgs": CONFLICT_ORGS },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Conflicts");
  assertStringIncludes(res.body, "Acme Nonprofit");
  assertStringIncludes(res.body, "Beacon Foundation");
  // Each row links to the per-org detail view.
  assertStringIncludes(res.body, "/conflicts?ein=000000001");
  // The conflict count is shown.
  assertStringIncludes(res.body, "3");
});

Deno.test("GET /conflicts?ein= shows that org's diverging facts", async () => {
  const res = await appRequest("/conflicts?ein=000000001", {
    cookie: sessionCookie(ADMIN),
    backend: {
      "/financials/conflicts": ORG_CONFLICTS,
      "/organizations/detail": () =>
        jsonResponse({ ein: "000000001", name: "Acme Nonprofit" }),
    },
  });
  assertEquals(res.status, 200);
  // Org name + concept (titleCase of total_exp) + the two diverging sources.
  assertStringIncludes(res.body, "Acme Nonprofit");
  assertStringIncludes(res.body, "Total Exp");
  assertStringIncludes(res.body, "irs_990_xml");
  assertStringIncludes(res.body, "audited_statement");
  // The per-observation resolve control.
  assertStringIncludes(res.body, "Use this value");
});

Deno.test("POST /conflicts resolves a conflict via /financials/canonical", async () => {
  let canonicalSet = false;
  const res = await appRequest("/conflicts", {
    cookie: sessionCookie(ADMIN),
    form: {
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
  // The redirect-back lands on the detail view with a success flash.
  assert(res.status === 302 || res.status === 303);
  assert(res.location?.startsWith("/conflicts?ein=000000001"));
  assertStringIncludes(res.location ?? "", "msg=");
  assert(canonicalSet, "backend canonical endpoint was called");
});

Deno.test("GET /conflicts denies a viewer without data:read", async () => {
  const res = await appRequest("/conflicts", {
    cookie: sessionCookie(VIEWER),
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Access required");
  assertStringIncludes(res.body, "data:read");
});

Deno.test("Data nav exposes the Conflicts link", async () => {
  const res = await appRequest("/conflicts", {
    cookie: sessionCookie(ADMIN),
    backend: { "/financials/conflict-orgs": CONFLICT_ORGS },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, 'href="/conflicts"');
});
