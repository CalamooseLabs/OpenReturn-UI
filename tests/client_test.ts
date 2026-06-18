import { assert, assertEquals, assertRejects } from "jsr:@std/assert@^1";
import {
  apiBase,
  ApiError,
  request,
  softError,
} from "../src/lib/api/client.ts";
import { captureFetch, jsonResponse, stubFetch } from "./helpers.ts";

Deno.test("request builds URL, drops empty query params, injects token", async () => {
  const { calls, restore } = captureFetch();
  try {
    await request("/x", {
      token: "tok",
      query: { a: "1", b: "", c: null, d: undefined, e: 2 },
    });
  } finally {
    restore();
  }
  assertEquals(calls.length, 1);
  assertEquals(calls[0].pathname, "/x");
  assertEquals(calls[0].query.get("a"), "1");
  assertEquals(calls[0].query.get("e"), "2");
  assert(!calls[0].query.has("b"), "empty string dropped");
  assert(!calls[0].query.has("c"), "null dropped");
  assert(!calls[0].query.has("d"), "undefined dropped");
  assertEquals(calls[0].headers.get("authorization"), "Bearer tok");
});

Deno.test("request serializes a JSON body", async () => {
  const { calls, restore } = captureFetch();
  try {
    await request("/y", { method: "POST", body: { hello: "world" } });
  } finally {
    restore();
  }
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].headers.get("content-type"), "application/json");
  assertEquals(calls[0].bodyText, JSON.stringify({ hello: "world" }));
});

Deno.test("request throws ApiError on non-2xx with the {error} message", async () => {
  const restore = stubFetch(() => jsonResponse({ error: "nope" }, 403));
  try {
    const err = await assertRejects(() => request("/z"), ApiError);
    assertEquals((err as ApiError).status, 403);
    assertEquals((err as ApiError).message, "nope");
  } finally {
    restore();
  }
});

Deno.test("request maps a network failure to ApiError status 0", async () => {
  const restore = stubFetch(() => {
    throw new TypeError("connection refused");
  });
  try {
    const err = await assertRejects(() => request("/z"), ApiError);
    assertEquals((err as ApiError).status, 0);
  } finally {
    restore();
  }
});

Deno.test("softError extracts a 2xx soft error", () => {
  assertEquals(softError({ error: "bad" }), "bad");
  assertEquals(softError({ ok: true }), null);
  assertEquals(softError("text"), null);
});

Deno.test("apiBase strips a trailing slash", () => {
  assert(!apiBase().endsWith("/"));
});
