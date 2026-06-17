import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { ADMIN, appRequest, sessionCookie, VIEWER } from "./app.ts";
import { jsonResponse } from "./helpers.ts";

Deno.test("GET /upload denies a viewer without upload:write", async () => {
  const res = await appRequest("/upload", {
    cookie: sessionCookie(VIEWER),
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Upload access required");
  assertStringIncludes(res.body, "upload:write");
  // The ZIP/PDF forms must NOT be rendered for a denied viewer.
  assert(
    !res.body.includes("Upload a ZIP"),
    "ZIP form should be hidden for a viewer",
  );
  assert(
    !res.body.includes("OCR a 990 PDF"),
    "PDF form should be hidden for a viewer",
  );
});

Deno.test("GET /upload shows both forms for an admin", async () => {
  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Upload a ZIP");
  assertStringIncludes(res.body, "OCR a 990 PDF");
  // The file inputs for both forms.
  assertStringIncludes(res.body, 'name="zipfile"');
  assertStringIncludes(res.body, 'name="pdffile"');
});

Deno.test("POST /upload (zip) ingests and renders the result", async () => {
  let hit = false;
  const fd = new FormData();
  fd.append("action", "zip");
  fd.append("zipfile", new Blob(["PK"], { type: "application/zip" }), "a.zip");

  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    formData: fd,
    backend: {
      "POST /upload": () => {
        hit = true;
        return jsonResponse({ stored: 1, skipped: 0, errors: 0 });
      },
    },
  });

  assertEquals(res.status, 200);
  assert(hit, "backend POST /upload was called");
  assertStringIncludes(res.body, "Ingest result");
  assertStringIncludes(res.body, "Upload processed.");
  assertStringIncludes(res.body, "stored");
  assertStringIncludes(res.body, "1");
});

Deno.test("POST /upload (pdf) OCRs and renders the result", async () => {
  let hit = false;
  const fd = new FormData();
  fd.append("action", "pdf");
  fd.append("ein", "000000001");
  fd.append("year", "2024");
  fd.append(
    "pdffile",
    new Blob(["%PDF"], { type: "application/pdf" }),
    "a.pdf",
  );

  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    formData: fd,
    backend: {
      "POST /upload/pdf": () => {
        hit = true;
        return jsonResponse({ observations: 3 });
      },
    },
  });

  assertEquals(res.status, 200);
  assert(hit, "backend POST /upload/pdf was called");
  assertStringIncludes(res.body, "OCR result");
  assertStringIncludes(res.body, "PDF processed.");
  assertStringIncludes(res.body, "observations");
  assertStringIncludes(res.body, "3");
});
