import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import {
  csvResponse,
  pdfResponse,
  tablePdf,
  toCsv,
} from "../src/lib/export.ts";

Deno.test("toCsv joins rows and quotes special chars", () => {
  const csv = toCsv(["Rank", "Org", "Score"], [
    [1, "Acme, Inc.", "0.5"],
    [2, 'Quote "Co"', "0.4"],
    [3, "Line\nBreak", "0.3"],
  ]);
  const lines = csv.trimEnd().split("\r\n");
  assertEquals(lines[0], "Rank,Org,Score");
  assertStringIncludes(lines[1], '"Acme, Inc."');
  assertStringIncludes(lines[2], '"Quote ""Co"""');
  // a newline-containing cell stays quoted (so the row count is not 4)
  assert(csv.includes('"Line\nBreak"'));
});

Deno.test("tablePdf returns a valid PDF byte stream", async () => {
  const bytes = await tablePdf({
    title: "Leaderboard",
    subtitle: "test",
    meta: ["Model: v30", "Generated 2026-06-17"],
    columns: [
      { header: "Rank", width: 1, align: "right" },
      { header: "Org", width: 4 },
      { header: "Score", width: 1, align: "right" },
    ],
    rows: Array.from(
      { length: 80 },
      (_, i) => [`#${i + 1}`, `Org ${i + 1}`, "68.9%"],
    ),
  });
  assert(bytes.length > 1000);
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
});

Deno.test("csvResponse / pdfResponse set download headers", async () => {
  const csv = csvResponse("x.csv", "a,b\r\n");
  assertEquals(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assertStringIncludes(
    csv.headers.get("content-disposition")!,
    'filename="x.csv"',
  );
  assertEquals(await csv.text(), "a,b\r\n");

  const pdf = pdfResponse("y.pdf", new Uint8Array([1, 2, 3]));
  assertEquals(pdf.headers.get("content-type"), "application/pdf");
  assertStringIncludes(
    pdf.headers.get("content-disposition")!,
    'filename="y.pdf"',
  );
});
