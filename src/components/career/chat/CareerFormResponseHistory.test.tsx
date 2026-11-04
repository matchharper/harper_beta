import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import type { CareerFormResponse } from "@/lib/career/forms/schema";
import { CareerFormResponseHistory } from "./CareerFormResponseHistory";

test("response history preserves the exact choice and values behind a compact summary", () => {
  const response: CareerFormResponse = {
    formId: 1, revision: 2, requestId: "response", actionId: "submit",
    values: { resume: "chosen-file-id", consent: false, motivation: "My edited text", location: "remote-id" },
    selectedFiles: [{ itemId: "resume", documentId: "chosen-file-id", revision: 3, snapshotId: "snapshot-id", fileName: "Chosen resume.pdf" }],
    formSnapshot: { formId: 1, revision: 2, kind: "form", title: "Company review",
      positive: { id: "submit", label: "Approve submission", message: "Submit the reviewed details." },
      items: [
        { id: "resume", label: "Resume", type: "document", content: { documentId: "old-file-id", fileName: "Old resume.pdf" } },
        { id: "consent", label: "Consent", type: "checkbox", content: { value: true } },
        { id: "motivation", label: "Motivation", type: "textarea", content: { value: "Old text" } },
        { id: "location", label: "Location", type: "select", content: { options: [{ id: "remote-id", label: "Remote" }] } },
      ] },
  };
  const original = structuredClone(response);
  const dom = new JSDOM(renderToStaticMarkup(<MessagesProvider locale="en"><CareerFormResponseHistory response={response} /></MessagesProvider>));
  try {
    const details = dom.window.document.querySelector("details")!;
    assert.equal(details.open, false);
    assert.equal(details.querySelector("summary")?.textContent, "Company reviewApprove submission");
    assert.deepEqual([...details.querySelectorAll("dd")].map(node => node.textContent), ["Chosen resume.pdf", "Not selected", "My edited text", "Remote"]);
    assert.doesNotMatch(details.textContent!, /chosen-file-id|snapshot-id|old-file-id|Old text/);
    assert.deepEqual(response, original, "display formatting never changes the response consumed by the agent");
  } finally { dom.window.close(); }
});
