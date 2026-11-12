import { createHash } from "node:crypto";
import type { TalentAdminClient } from "./admin";

export const TALENT_PHOTO_BUCKET = "company_logo";
// The existing Career photo upload contract is 5 MB.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_PREFIX = "/storage/v1/object/public/company_logo/career-profile/photo/";

export function isStoredTalentProfilePhoto(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://zzojrniuppueizhnmqfd.supabase.co");
    return [storage.origin, "https://auth.matchharper.com", "https://zzojrniuppueizhnmqfd.supabase.co"].includes(url.origin) && url.pathname.startsWith(PHOTO_PREFIX) &&
      url.pathname.length > PHOTO_PREFIX.length && !url.username && !url.password;
  } catch { return false; }
}

function photoSource(value: string) {
  const url = new URL(value);
  // Only the CDNs used by LinkedIn ingestion and Google Auth may be fetched
  // server-side. Check redirects too: a profile field must not become an SSRF proxy.
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !(url.hostname === "media.licdn.com" || url.hostname.endsWith(".googleusercontent.com"))) {
    throw new Error("unsupported_photo_source");
  }
  return url;
}

function imageFormat(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { extension: "jpg", type: "image/jpeg" };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: "png", type: "image/png" };
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) return { extension: "gif", type: "image/gif" };
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return { extension: "webp", type: "image/webp" };
  throw new Error("invalid_photo_image");
}

/** Upload succeeds before a caller receives a URL it may persist. Never returns the source URL. */
export async function storeTalentProfilePhoto(args: {
  admin: TalentAdminClient;
  userId: string;
  url: string | null | undefined;
}): Promise<string | null> {
  const raw = args.url?.trim();
  if (!raw) return null;
  if (isStoredTalentProfilePhoto(raw)) return raw;
  let source = photoSource(raw);
  const signal = AbortSignal.timeout(15_000);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 4; redirects++) {
    response = await fetch(source, { redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirects === 4) throw new Error("photo_redirect_limit");
    source = photoSource(new URL(location, source).href);
  }
  if (!response?.ok) {
    await response?.body?.cancel();
    throw new Error(`photo_http_${response?.status ?? "missing"}`);
  }
  if (Number(response.headers.get("content-length")) > MAX_PHOTO_BYTES) {
    await response.body?.cancel();
    throw new Error("photo_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty_photo_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PHOTO_BYTES) throw new Error("photo_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  const format = imageFormat(bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = `career-profile/photo/${args.userId}/${digest}.${format.extension}`;
  const bucket = args.admin.storage.from(TALENT_PHOTO_BUCKET);
  const { error } = await bucket.upload(path, bytes, { contentType: format.type, upsert: true });
  if (error) throw new Error(`photo_storage_upload_failed:${error.name ?? "error"}`);
  const url = bucket.getPublicUrl(path).data.publicUrl;
  if (!isStoredTalentProfilePhoto(url)) throw new Error("invalid_photo_storage_url");
  return url;
}

/** Photo failure must not discard onboarding or replace an existing durable photo. */
export async function resolveTalentProfilePhoto(
  args: Parameters<typeof storeTalentProfilePhoto>[0] & { fallbackUrl?: string | null }
): Promise<string | null> {
  try { return await storeTalentProfilePhoto(args); }
  catch (error) {
    console.warn("[talent-profile-photo]", {
      userId: args.userId,
      error: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "photo_import_failed",
    });
    return isStoredTalentProfilePhoto(args.fallbackUrl) ? args.fallbackUrl : null;
  }
}

/** Normalize legacy rows before account-claim SQL copies their profile fields. */
export async function ensureStoredTalentProfilePhoto(args: { admin: TalentAdminClient; userId: string }) {
  const { data, error } = await args.admin.from("talent_users").select("profile_picture")
    .eq("user_id", args.userId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  const previous = data?.profile_picture;
  if (!previous || isStoredTalentProfilePhoto(previous)) return;
  const picture = await resolveTalentProfilePhoto({ ...args, url: previous });
  const updated = await args.admin.from("talent_users").update({ profile_picture: picture })
    .eq("user_id", args.userId).eq("profile_picture", previous).is("deleted_at", null);
  if (updated.error) throw new Error(updated.error.message);
}
