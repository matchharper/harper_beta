import assert from "node:assert/strict";
import test from "node:test";
import {
  appendOrgIntroCaptureDisclosure,
  ORG_INTRO_CAPTURE_DISCLOSURE,
} from "./introEmailDisclosure";

test("does not append an empty organization introduction capture disclosure", () => {
  const first = appendOrgIntroCaptureDisclosure("Best regards,\nHarper");
  const second = appendOrgIntroCaptureDisclosure(first);

  assert.equal(ORG_INTRO_CAPTURE_DISCLOSURE, "");
  assert.equal(first, "Best regards,\nHarper");
  assert.equal(second, first);
});
