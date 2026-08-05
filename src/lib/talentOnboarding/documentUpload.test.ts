import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES,
  resolveTalentDocumentUpload,
  TALENT_DOCUMENT_STORAGE_ALLOWED_MIME_TYPES,
} from "./documentUpload";

const GENERAL_DOCUMENT_CASES = {
  "case-study.pdf": "application/pdf",
  "notes.md": "text/markdown",
  "photo.jpeg": "image/jpeg",
  "photo.jpg": "image/jpeg",
  "portfolio.png": "image/png",
  "presentation.ppt": "application/vnd.ms-powerpoint",
  "presentation.pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "resume.doc": "application/msword",
  "resume.docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "sheet.xls": "application/vnd.ms-excel",
  "sheet.xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "summary.txt": "text/plain",
} as const;

test("accepts every general-document extension with a canonical MIME type", () => {
  for (const [fileName, contentType] of Object.entries(
    GENERAL_DOCUMENT_CASES
  )) {
    assert.equal(
      resolveTalentDocumentUpload({ fileName, kind: "document" })?.contentType,
      contentType
    );
  }
});

test("keeps resume uploads limited to resume formats", () => {
  for (const fileName of [
    "resume.pdf",
    "resume.docx",
    "resume.txt",
    "resume.md",
  ]) {
    assert.ok(resolveTalentDocumentUpload({ fileName, kind: "resume" }));
  }

  for (const fileName of ["resume.doc", "portfolio.png", "slides.pptx"]) {
    assert.equal(
      resolveTalentDocumentUpload({ fileName, kind: "resume" }),
      null
    );
  }
});

test("rejects missing and unsupported extensions", () => {
  for (const fileName of ["README", ".env", "archive.zip", "script.exe"]) {
    assert.equal(
      resolveTalentDocumentUpload({ fileName, kind: "document" }),
      null
    );
  }
});

test("storage MIME configuration covers every resolved document type", () => {
  const allowedMimeTypes = new Set(TALENT_DOCUMENT_STORAGE_ALLOWED_MIME_TYPES);

  for (const fileName of Object.keys(GENERAL_DOCUMENT_CASES)) {
    const resolved = resolveTalentDocumentUpload({
      fileName,
      kind: "document",
    });
    assert.ok(resolved);
    assert.ok(allowedMimeTypes.has(resolved.contentType));
  }
  assert.equal(MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES, 20 * 1024 * 1024);
});
