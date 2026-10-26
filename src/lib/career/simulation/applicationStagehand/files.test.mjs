import test from "node:test";
import assert from "node:assert/strict";
import { provisionFiles } from "./files.mjs";
import { hash } from "./gate.mjs";
const file = (size, name = "resume.pdf") => {
  const bytes = Buffer.alloc(size, 1);
  return {
    path: `/workspace/attachments/resume/hash/${name}`,
    data: bytes.toString("base64"),
    contentHash: hash(bytes),
    documentId: "resume",
    name,
  };
};
test("small files retain exact bytes and metadata in initial provisioning; larger files stay chunked", () => {
  const small = file(675),
    large = file(1024 * 1024 + 1, "large.pdf");
  const result = provisionFiles([small, large]);
  assert.equal(result.inline[0].data, small.data);
  assert.equal(result.metadata[0].contentHash, small.contentHash);
  assert.equal(result.metadata[0].data, undefined);
  assert.deepEqual(result.deferred, [large]);
});
test("initial provisioning preserves read-only, size, path and hash boundaries before paid compute", () => {
  const f = file(10);
  assert.throws(() => provisionFiles([f], true));
  assert.throws(() =>
    provisionFiles([{ ...f, path: "/workspace/harper-browser/server.cjs" }])
  );
  assert.throws(() => provisionFiles([{ ...f, contentHash: "changed" }]));
  assert.throws(() => provisionFiles([f, f]));
  assert.throws(() => provisionFiles([file(5 * 1024 * 1024 + 1)]));
});
