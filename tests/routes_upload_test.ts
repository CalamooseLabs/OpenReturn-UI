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

const INGESTED = () =>
  jsonResponse({
    grabbed: [{
      source: "https://x/01A.zip",
      url: "https://x/01A.zip",
      filename: "2024_01A.zip",
      filings_stored: 42,
      content_length: 1048576,
      ingested_at: "2026-06-17T10:00:00",
    }],
    grabbed_count: 1,
    archives: [{
      zip_filename: "2024_01A.zip",
      filings: 42,
      first_year: 2024,
      last_year: 2024,
      first_ingested: "2026-06-17",
      last_ingested: "2026-06-17",
    }],
    ingest_running: false,
    ingest: null,
    default_source:
      "https://www.irs.gov/charities-non-profits/form-990-series-downloads",
  });

Deno.test("GET /upload shows the IRS-grab workflow + ingested ledger", async () => {
  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    backend: { "GET /upload/ingested": INGESTED },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "Grab from the IRS website");
  assertStringIncludes(res.body, "What's been ingested");
  assertStringIncludes(res.body, "2024_01A.zip");
  assertStringIncludes(res.body, "42");
});

Deno.test("POST /upload (discover) previews archives at a URL", async () => {
  let hit = false;
  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    form: { action: "discover", url: "https://x/index.html" },
    backend: {
      "POST /upload/discover": () => {
        hit = true;
        return jsonResponse({
          source: "https://x/index.html",
          count: 2,
          new: 1,
          archives: [
            { url: "https://x/01A.zip", filename: "01A.zip", ingested: true },
            { url: "https://x/02A.zip", filename: "02A.zip", ingested: false },
          ],
        });
      },
      "GET /upload/ingested": INGESTED,
    },
  });
  assertEquals(res.status, 200);
  assert(hit, "backend POST /upload/discover was called");
  assertStringIncludes(res.body, "01A.zip");
  assertStringIncludes(res.body, "02A.zip");
  assertStringIncludes(res.body, "ingested"); // the per-archive status flag
});

Deno.test("POST /upload (grab) starts a background ingest", async () => {
  let hit = false;
  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    form: { action: "grab", url: "https://x/01A.zip" },
    backend: {
      "POST /upload/grab": () => {
        hit = true;
        return jsonResponse({
          status: "started",
          source: "https://x/01A.zip",
          note: "The API server will briefly restart to load this archive.",
        });
      },
      "GET /upload/ingested": INGESTED,
    },
  });
  assertEquals(res.status, 200);
  assert(hit, "backend POST /upload/grab was called");
  assertStringIncludes(res.body, "Ingest started");
});

Deno.test("GET /upload renders the When schedule picker (default 1 AM)", async () => {
  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    backend: { "GET /upload/ingested": INGESTED },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, 'name="schedule_when"');
  assertStringIncludes(res.body, "Tonight 1:00 AM");
  // The 1 AM option is the default selection.
  assertStringIncludes(res.body, 'value="01:00" selected');
});

Deno.test("POST /upload (grab) forwards the chosen schedule to the API", async () => {
  let grabbed = false;
  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    form: {
      action: "grab",
      url: "https://x/01A.zip",
      schedule_when: "custom",
      schedule_time: "02:30",
    },
    backend: {
      "POST /upload/grab": () => {
        grabbed = true;
        return jsonResponse({ status: "started", source: "https://x/01A.zip" });
      },
      "GET /upload/ingested": INGESTED,
    },
  });
  assertEquals(res.status, 200);
  assert(grabbed, "backend POST /upload/grab was called");
  assertStringIncludes(res.body, "Ingest started");
  // (The schedule field-mapping itself is asserted in resources_test.ts.)
});

Deno.test("POST /upload (grab) surfaces a soft backend error", async () => {
  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    form: { action: "grab", url: "https://x/01A.zip" },
    backend: {
      "POST /upload/grab": () =>
        jsonResponse({ error: "A background ingest is already running." }),
      "GET /upload/ingested": INGESTED,
    },
  });
  assertEquals(res.status, 200);
  assertStringIncludes(res.body, "already running");
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

Deno.test("POST /upload (pdf) renders the OCR concept table + review flag", async () => {
  const fd = new FormData();
  fd.append("action", "pdf");
  fd.append("ein", "000000001");
  fd.append("year", "2024");
  fd.append(
    "pdffile",
    new Blob(["%PDF"], { type: "application/pdf" }),
    "aj.pdf",
  );

  const res = await appRequest("/upload", {
    cookie: sessionCookie(ADMIN),
    formData: fd,
    backend: {
      "POST /upload/pdf": () =>
        jsonResponse({
          status: "complete",
          ein: "000000001",
          year: 2024,
          pages: 41,
          form: "990",
          recorded: 2,
          concepts: {
            cy_rev: { value: 1213263, confidence: 0.89, review: false },
            // A low-confidence reading → flagged for review.
            contrib: { value: 1073030, confidence: 0.55, review: true },
          },
        }),
    },
  });

  assertEquals(res.status, 200);
  // The detected form surfaces as a summary row.
  assertStringIncludes(res.body, "990");
  // The concept table renders codes + the review badge + banner.
  assertStringIncludes(res.body, "cy_rev");
  assertStringIncludes(res.body, "contrib");
  assertStringIncludes(res.body, "Review");
  assertStringIncludes(res.body, "below 80% confidence");
});
