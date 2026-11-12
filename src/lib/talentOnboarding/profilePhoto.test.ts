import assert from "node:assert/strict";
import test from "node:test";
import { storeTalentProfilePhoto, resolveTalentProfilePhoto } from "./profilePhoto";
import type { TalentAdminClient } from "./admin";

const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://zzojrniuppueizhnmqfd.supabase.co";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
const stored = `${base}/storage/v1/object/public/company_logo/career-profile/photo/user/existing.jpg`;

test("external photos are uploaded before a durable URL is returned; repeats use the same content path", async () => {
  const original = globalThis.fetch;
  const uploaded: string[] = [];
  const admin = { storage: { from: (bucket: string) => {
    assert.equal(bucket, "company_logo");
    return {
      upload: async (path: string, bytes: Buffer, options: { contentType: string }) => {
        assert.deepEqual(bytes, jpeg);
        assert.equal(options.contentType, "image/jpeg");
        uploaded.push(path);
        return { error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `${base}/storage/v1/object/public/company_logo/${path}` } }),
    };
  } } } as unknown as TalentAdminClient;
  globalThis.fetch = async () => new Response(jpeg);
  try {
    const args = { admin, userId: "user", url: "https://media.licdn.com/photo.jpg?e=1" };
    const first = await storeTalentProfilePhoto(args);
    assert.match(first!, /\/career-profile\/photo\/user\/[a-f0-9]+\.jpg$/);
    assert.equal(await storeTalentProfilePhoto(args), first);
    assert.equal(uploaded[0], uploaded[1]);
    assert.equal(await storeTalentProfilePhoto({ ...args, url: stored }), stored);
    assert.equal(uploaded.length, 2, "already stored photos do not download/upload again");
  } finally { globalThis.fetch = original; }
});

test("failed downloads and uploads never return the source URL and preserve an existing stored photo", async () => {
  const original = globalThis.fetch;
  const admin = { storage: { from: () => ({ upload: async () => ({ error: { name: "StorageError" } }) }) } } as unknown as TalentAdminClient;
  const args = { admin, userId: "user", url: "https://lh3.googleusercontent.com/avatar" };
  try {
    globalThis.fetch = async () => new Response("gone", { status: 404 });
    await assert.rejects(storeTalentProfilePhoto(args), /photo_http_404/);
    assert.equal(await resolveTalentProfilePhoto({ ...args, fallbackUrl: stored }), stored);
    assert.equal(await resolveTalentProfilePhoto({ ...args, fallbackUrl: args.url }), null);
    globalThis.fetch = async () => new Response(jpeg);
    await assert.rejects(storeTalentProfilePhoto(args), /photo_storage_upload_failed/);
  } finally { globalThis.fetch = original; }
});

test("photo ingestion rejects private destinations, redirect escapes, and non-image payloads", async () => {
  const original = globalThis.fetch;
  const args = { admin: {} as TalentAdminClient, userId: "user", url: "https://media.licdn.com/image" };
  try {
    for (const url of ["http://127.0.0.1/photo", "https://media.licdn.com.evil.test/photo", "https://user:secret@media.licdn.com/photo"]) {
      await assert.rejects(storeTalentProfilePhoto({ ...args, url }), /unsupported_photo_source/);
    }
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    await assert.rejects(storeTalentProfilePhoto(args), /unsupported_photo_source/);
    globalThis.fetch = async () => new Response("<html>Access denied</html>");
    await assert.rejects(storeTalentProfilePhoto(args), /invalid_photo_image/);
  } finally { globalThis.fetch = original; }
});
