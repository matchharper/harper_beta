import path from "node:path";
import { hash } from "./gate.mjs";

// Small, already-authorized documents ride the existing environment creation
// request instead of waiting for separate upload/install/status round trips.
// Large files retain the existing chunked transfer path.
export function provisionFiles(input, readOnly = false) {
  if (readOnly && input.length)
    throw Error("Read-only browser cannot receive attachments");
  const inline = [],
    metadata = [],
    deferred = [];
  let total = 0;
  const paths = new Set();
  for (const file of input) {
    const bytes = Buffer.from(file.data, "base64");
    if (
      !file.path.startsWith("/workspace/attachments/") ||
      path.resolve(file.path) !== file.path ||
      paths.has(file.path)
    )
      throw Error("Invalid application attachment path");
    paths.add(file.path);
    total += bytes.length;
    if (
      !bytes.length ||
      bytes.length > 5 * 1024 * 1024 ||
      total > 10 * 1024 * 1024
    )
      throw Error("Application attachment transfer limit exceeded");
    if (file.contentHash && file.contentHash !== hash(bytes))
      throw Error("Attachment bytes differ");
    if (bytes.length > 1024 * 1024) {
      deferred.push(file);
      continue;
    }
    inline.push({ type: "inline", path: file.path, data: file.data });
    const { data, ...rest } = file;
    metadata.push({
      ...rest,
      documentId: file.documentId ?? file.path.split("/").at(-3),
      name: file.name ?? path.basename(file.path),
    });
  }
  return { inline, metadata, deferred };
}
