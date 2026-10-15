import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { createBrowserResultStore } from "./applicationBrowserResultStore";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

test("results stay private, use one-object upload grants, and authenticate encrypted bytes", async () => {
  let body: Blob | null = null,
    error: unknown = null,
    isPublic = false;
  const removed: string[][] = [];
  const client = {
    storage: {
      getBucket: async () => ({ data: { public: isPublic }, error: null }),
      from: () => ({
        createSignedUploadUrl: async (_path: string, options: unknown) => {
          assert.deepEqual(options, { upsert: false });
          return {
            data: { signedUrl: "https://storage.invalid/single-object-grant" },
            error: null,
          };
        },
        download: async () => ({ data: body, error }),
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
  } as unknown as TalentAdminClient;
  const store = createBrowserResultStore(() => client);
  await store.check();
  isPublic = true;
  await assert.rejects(store.check(), /private/);
  isPublic = false;
  const target = await store.target(
    "_application-browser/550e8400-e29b-41d4-a716-446655440000"
  );
  assert.equal(Buffer.from(target.key, "base64").length, 32);
  const nonce = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(target.key, "base64"),
      nonce
    );
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({
        commandId: "fixture",
        result: { snapshot: { text: "SYNTHETIC private form" } },
      })
    ),
    cipher.final(),
  ]);
  body = new Blob([
    JSON.stringify({
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: ciphertext.toString("base64"),
    }),
  ]);
  assert.ok(!(await body.text()).includes("SYNTHETIC private form"));
  assert.deepEqual(await store.read(target), {
    commandId: "fixture",
    result: { snapshot: { text: "SYNTHETIC private form" } },
  });
  await assert.rejects(
    store.read({ ...target, key: randomBytes(32).toString("base64") })
  );
  await store.remove(target.path);
  assert.deepEqual(removed, [[target.path]]);
  body = null;
  error = {
    originalError: {
      status: 400,
      json: async () => ({ code: "NoSuchKey", statusCode: "404" }),
    },
  };
  assert.equal(await store.read(target), null);
  error = {
    originalError: {
      status: 403,
      json: async () => ({ code: "AccessDenied" }),
    },
  };
  await assert.rejects(store.read(target), /could not be read/);
});
