import { assertEquals } from "jsr:@std/assert@^1";
import { createApi } from "../src/lib/api/mod.ts";
import { captureFetch } from "./helpers.ts";

// Exhaustively exercise every resource method, asserting it maps to the right
// HTTP method + path. This both tests the full API surface and gives the
// resource classes real source coverage (route tests hit them via the bundle).
Deno.test("every API resource method maps to the right method + path", async () => {
  const api = createApi("tok");
  const fd = new FormData();
  fd.append("f", new Blob(["x"]), "x.bin");

  const cases: [string, string, () => Promise<unknown>][] = [
    // auth
    ["POST", "/auth/login", () => api.auth.login("u", "p")],
    ["GET", "/auth/me", () => api.auth.me()],
    ["POST", "/auth/logout", () => api.auth.logout()],
    // orgs
    ["GET", "/organizations", () => api.orgs.list({ limit: 1 })],
    ["GET", "/organizations/search", () => api.orgs.search({ q: "x" })],
    ["GET", "/organizations/full", () => api.orgs.full("1")],
    ["GET", "/organizations/detail", () => api.orgs.detail("1")],
    ["GET", "/organizations/sectors", () => api.orgs.sectors()],
    ["GET", "/organizations/states", () => api.orgs.states()],
    ["GET", "/organizations/cities", () => api.orgs.cities("IL")],
    ["GET", "/organizations/counties", () => api.orgs.counties("IL")],
    ["GET", "/organizations/grants", () => api.orgs.grants("1", "made")],
    ["POST", "/organizations", () => api.orgs.create({ ein: "1" })],
    ["POST", "/organizations/edit", () => api.orgs.edit({ ein: "1" })],
    ["POST", "/organizations/favorite", () => api.orgs.favorite({ ein: "1" })],
    // scores
    ["GET", "/scores", () => api.scores.list("1")],
    ["GET", "/scores/history", () => api.scores.history("1", "1")],
    ["GET", "/scores/compare", () => api.scores.compare("1", 2023)],
    [
      "GET",
      "/scores/leaderboard",
      () => api.scores.leaderboard({ model: "1" }),
    ],
    ["GET", "/scores/ranking", () => api.scores.ranking("1", "1")],
    ["GET", "/scores/factors", () => api.scores.factors("1")],
    ["GET", "/scores/kinds", () => api.scores.kinds()],
    ["GET", "/scores/types", () => api.scores.types()],
    // people
    ["GET", "/people", () => api.people.list({})],
    ["GET", "/people/detail", () => api.people.detail(1)],
    ["POST", "/people", () => api.people.create({ full_name: "n" })],
    ["POST", "/people/edit", () => api.people.edit({ person_id: 1 })],
    ["POST", "/people/delete", () => api.people.remove(1)],
    [
      "POST",
      "/people/membership",
      () => api.people.addMembership({ person_id: 1, ein: "1" }),
    ],
    [
      "POST",
      "/people/membership/remove",
      () => api.people.removeMembership(1, "1"),
    ],
    // tags
    ["GET", "/tags", () => api.tags.list()],
    ["GET", "/tags", () => api.tags.forOrg("1")],
    ["GET", "/tags/organizations", () => api.tags.organizations("t")],
    ["POST", "/tags", () => api.tags.apply("1", "t")],
    ["POST", "/tags/remove", () => api.tags.remove("1", "t")],
    // lists
    ["GET", "/lists", () => api.lists.list()],
    ["GET", "/lists/detail", () => api.lists.detail(1)],
    ["POST", "/lists", () => api.lists.create({ name: "n" })],
    ["POST", "/lists/edit", () => api.lists.edit({ list_id: 1 })],
    ["POST", "/lists/delete", () => api.lists.remove(1)],
    ["POST", "/lists/members/add", () => api.lists.addMember(1, "1")],
    ["POST", "/lists/members/remove", () => api.lists.removeMember(1, "1")],
    // financials
    ["GET", "/financials", () => api.financials.facts("1", 2023)],
    ["GET", "/financials/conflicts", () => api.financials.conflicts("1")],
    ["GET", "/financials/sources", () => api.financials.sources()],
    ["GET", "/financials/concepts", () => api.financials.concepts()],
    [
      "POST",
      "/financials/canonical",
      () =>
        api.financials.setCanonical({
          ein: "1",
          fiscal_year: 2023,
          concept: "c",
          observation_id: 1,
        }),
    ],
    [
      "POST",
      "/financials/observations",
      () => api.financials.recordObservations({ ein: "1" }),
    ],
    // follows
    ["GET", "/follows", () => api.follows.list("foundation")],
    ["POST", "/follows/follow", () => api.follows.follow("1")],
    ["POST", "/follows/unfollow", () => api.follows.unfollow("1")],
    // templates
    ["GET", "/templates", () => api.templates.list()],
    ["GET", "/templates/detail", () => api.templates.detail("c")],
    // admin
    ["GET", "/admin/models", () => api.admin.listModels()],
    ["POST", "/admin/models", () => api.admin.createModel({ definition: {} })],
    ["GET", "/admin/users", () => api.admin.listUsers()],
    ["POST", "/admin/users", () => api.admin.createUser({ username: "u" })],
    ["POST", "/admin/users/activate", () => api.admin.activateUser("u")],
    ["POST", "/admin/users/deactivate", () => api.admin.deactivateUser("u")],
    ["POST", "/admin/users/assign-role", () => api.admin.assignRole("u", "r")],
    ["POST", "/admin/users/revoke-role", () => api.admin.revokeRole("u", "r")],
    ["POST", "/admin/users/reset-password", () => api.admin.resetPassword("u")],
    ["GET", "/admin/roles", () => api.admin.listRoles()],
    [
      "POST",
      "/admin/roles",
      () => api.admin.createRole({ code: "c", name: "n" }),
    ],
    ["POST", "/admin/roles/delete", () => api.admin.deleteRole("c")],
    ["POST", "/admin/roles/grant", () => api.admin.grant("r", "p")],
    ["POST", "/admin/roles/revoke", () => api.admin.revoke("r", "p")],
    ["GET", "/admin/permissions", () => api.admin.listPermissions()],
    [
      "POST",
      "/admin/permissions",
      () => api.admin.createPermission({ code: "c" }),
    ],
    // upload
    ["POST", "/upload", () => api.upload.zip(fd)],
    ["POST", "/upload/pdf", () => api.upload.pdf("1", 2023, fd)],
  ];

  const { calls, restore } = captureFetch();
  try {
    for (const [, , fn] of cases) await fn();
  } finally {
    restore();
  }

  assertEquals(calls.length, cases.length);
  cases.forEach(([method, path], i) => {
    assertEquals(calls[i].method, method, `case ${i} method`);
    assertEquals(calls[i].pathname, path, `case ${i} path`);
    assertEquals(calls[i].headers.get("authorization"), "Bearer tok");
  });
});
