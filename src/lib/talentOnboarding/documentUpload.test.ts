import assert from "node:assert/strict";
import test from "node:test";
import {
  extractTalentDocumentTextContent,
  extractResumeTextContentBestEffort,
  inferTalentDocumentKindFromFileName,
  isTalentDocumentTextExtractable,
  MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES,
  resolveTalentDocumentUpload,
  TALENT_DOCUMENT_STORAGE_ALLOWED_MIME_TYPES,
  validateTalentDocumentFileContent,
  validateResumeFileContent,
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
  assert.equal(MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES, 4 * 1024 * 1024);
});

test("chat upload kind starts from resume terms in the file name", () => {
  for (const fileName of [
    "gildong-resume.pdf",
    "CV_2026.docx",
    "홍길동이력서.pdf",
    "경력기술서_최종.md",
  ]) {
    assert.equal(inferTalentDocumentKindFromFileName(fileName), "resume");
  }
  for (const fileName of ["portfolio.pptx", "job-description.pdf"]) {
    assert.equal(inferTalentDocumentKindFromFileName(fileName), "document");
  }
});

test("only PDF, DOCX, TXT, and Markdown are text-extractable", () => {
  for (const fileName of ["a.pdf", "a.docx", "a.txt", "a.md"]) {
    assert.equal(isTalentDocumentTextExtractable(fileName), true);
  }
  for (const fileName of ["a.doc", "a.ppt", "a.pptx", "a.png", "a.xlsx"]) {
    assert.equal(isTalentDocumentTextExtractable(fileName), false);
  }
});

test("resume content validation checks MIME and magic bytes", () => {
  assert.equal(
    validateResumeFileContent({
      bytes: Buffer.from("%PDF-1.7\n"),
      fileName: "resume.pdf",
      suppliedContentType: "application/pdf",
    }),
    true
  );
  assert.equal(
    validateResumeFileContent({
      bytes: Buffer.from("not a pdf"),
      fileName: "resume.pdf",
      suppliedContentType: "application/pdf",
    }),
    false
  );
  assert.equal(
    validateResumeFileContent({
      bytes: Buffer.from("plain text"),
      fileName: "resume.txt",
      suppliedContentType: "application/pdf",
    }),
    false
  );
});

test("general document validation checks binary magic bytes", () => {
  assert.equal(
    validateTalentDocumentFileContent({
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]),
      fileName: "portfolio.png",
      suppliedContentType: "image/png",
    }),
    true
  );
  assert.equal(
    validateTalentDocumentFileContent({
      bytes: Buffer.from("not a png"),
      fileName: "portfolio.png",
      suppliedContentType: "image/png",
    }),
    false
  );
});

test("extracts text files without applying extraction to presentation files", async () => {
  assert.equal(
    await extractTalentDocumentTextContent({
      bytes: Buffer.from("hello document"),
      fileName: "notes.md",
    }),
    "hello document"
  );
  assert.equal(
    await extractTalentDocumentTextContent({
      bytes: Buffer.from("presentation bytes"),
      fileName: "portfolio.ppt",
    }),
    null
  );
});

test("resume text extraction failure does not reject a valid upload", async () => {
  const errors: unknown[] = [];
  const extracted = await extractResumeTextContentBestEffort({
    bytes: Buffer.from("%PDF-1.7\nnot a parseable PDF body"),
    fileName: "resume.pdf",
    onError: (error) => errors.push(error),
  });

  assert.equal(extracted, null);
  assert.equal(errors.length, 1);
});
