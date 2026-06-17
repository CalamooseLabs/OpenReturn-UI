import { ApiResource } from "./client.ts";

/** /upload* — bulk ZIP of 990 XML and single-PDF OCR (multipart). */
export class UploadApi extends ApiResource {
  /** Upload a ZIP of 990 XML filings. `form` must contain the .zip file part. */
  zip(form: FormData) {
    return this.postRaw<Record<string, unknown>>("/upload", form);
  }
  /** OCR a single 990 PDF into observations for the given org-year. */
  pdf(ein: string, year: string | number, form: FormData) {
    return this.postRaw<Record<string, unknown>>("/upload/pdf", form, {
      ein,
      year,
    });
  }
}
