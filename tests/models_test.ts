import { assert, assertEquals, assertRejects } from "jsr:@std/assert@^1";
import { listModelOptions } from "../src/lib/models.ts";
import { ApiError } from "../src/lib/api/mod.ts";
import { createApi } from "../src/lib/api/mod.ts";
import { captureFetch, jsonResponse, stubFetch } from "./helpers.ts";

const MODELS = {
  "/admin/models": () =>
    jsonResponse({
      models: [
        {
          version: "30",
          model_kind: "super_composite",
          model_type: "financial",
          description: "Overall",
        },
        {
          version: "10",
          model_kind: "model",
          model_type: "financial",
          description: "Operating",
        },
      ],
    }),
  "/templates": () =>
    jsonResponse({
      templates: [
        {
          code: "10-op",
          name: "Operating",
          kind: "model",
          type: "financial",
          version: "10",
          factor_count: 7,
        },
      ],
    }),
};

Deno.test("admin caller lists registered models, sorted by version", async () => {
  const { calls, restore } = captureFetch(MODELS);
  try {
    const opts = await listModelOptions(createApi("tok"), { admin: true });
    assertEquals(opts.map((o) => o.version), ["10", "30"]);
    assertEquals(calls[0].pathname, "/admin/models");
  } finally {
    restore();
  }
});

Deno.test("non-admin falls back to the template catalog", async () => {
  const { calls, restore } = captureFetch(MODELS);
  try {
    const opts = await listModelOptions(createApi("tok"), { admin: false });
    assertEquals(opts.length, 1);
    assertEquals(opts[0].version, "10");
    assertEquals(calls[0].pathname, "/templates");
  } finally {
    restore();
  }
});

Deno.test("a 401 from /admin/models bubbles (so middleware can redirect)", async () => {
  const restore = stubFetch((req) => {
    if (new URL(req.url).pathname === "/admin/models") {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    return jsonResponse({ templates: [] });
  });
  try {
    await assertRejects(
      () => listModelOptions(createApi("tok"), { admin: true }),
      ApiError,
    );
  } finally {
    restore();
  }
});

Deno.test("missing catalog degrades to an empty list", async () => {
  const restore = stubFetch(() => jsonResponse({ error: "boom" }, 500));
  try {
    const opts = await listModelOptions(createApi(null), { admin: false });
    assert(Array.isArray(opts) && opts.length === 0);
  } finally {
    restore();
  }
});
