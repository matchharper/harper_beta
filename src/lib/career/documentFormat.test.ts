import assert from "node:assert/strict";
import test from "node:test";
import { getCareerDocumentFormat } from "./documentFormat";

test("uses the final file extension case-insensitively", () => {
  assert.equal(getCareerDocumentFormat("portfolio.final.PDF"), "pdf");
  assert.equal(getCareerDocumentFormat("presentation.v3.PpTx"), "presentation");
});

test("groups supported document formats into representative icon types", () => {
  assert.equal(getCareerDocumentFormat("resume.docx"), "document");
  assert.equal(getCareerDocumentFormat("notes.md"), "document");
  assert.equal(getCareerDocumentFormat("analysis.xlsx"), "spreadsheet");
  assert.equal(getCareerDocumentFormat("profile.jpeg"), "image");
});

test("falls back for missing, trailing, hidden, or unsupported extensions", () => {
  assert.equal(getCareerDocumentFormat("README"), "unknown");
  assert.equal(getCareerDocumentFormat("document."), "unknown");
  assert.equal(getCareerDocumentFormat(".pdf"), "unknown");
  assert.equal(getCareerDocumentFormat("archive.zip"), "unknown");
});
