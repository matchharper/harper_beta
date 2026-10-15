import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/admin";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import { createDecipheriv, randomBytes, randomUUID } from "node:crypto";

/** A single-object upload capability, never a provider or Storage admin key. */
export type BrowserResultTarget = { path: string; url: string; key: string };
export interface BrowserResultStore {
  check(): Promise<void>;
  target(prefix: string): Promise<BrowserResultTarget>;
  read(target: BrowserResultTarget): Promise<unknown | null>;
  remove(path: string): Promise<void>;
  clear(prefix: string): Promise<void>;
}

export function createBrowserResultStore(
  admin: () => TalentAdminClient = getTalentSupabaseAdmin
): BrowserResultStore {
  return {
    async check() {
      const { data, error } =
        await admin().storage.getBucket(TALENT_RESUME_BUCKET);
      if (error || !data || data.public)
        throw new Error(
          "Application browser results require the existing private document bucket"
        );
    },
    async target(prefix) {
      const path = `${prefix}/${randomUUID()}.txt`;
      const { data, error } = await admin()
        .storage.from(TALENT_RESUME_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });
      if (error || !data)
        throw new Error("Application browser result transport unavailable");
      return {
        path,
        url: data.signedUrl,
        key: randomBytes(32).toString("base64"),
      };
    },
    async read(target) {
      const { data, error } = await admin()
        .storage.from(TALENT_RESUME_BUCKET)
        .download(target.path);
      if (error) {
        // Storage uses a numeric HTTP status and a string statusCode for errors.
        const value = error as typeof error & {
          status?: number;
          statusCode?: string;
          originalError?: {
            status?: number;
            json?: () => Promise<{ code?: string; statusCode?: string }>;
          };
        };
        if (value.status === 404 || value.statusCode === "404") return null;
        // download() sets noResolveJson; storage-js wraps a missing object's
        // HTTP response in StorageUnknownError. Check machine codes, not prose.
        if (value.originalError?.status === 404) return null;
        if (value.originalError?.status === 400 && value.originalError.json) {
          const detail = await value.originalError.json().catch(() => null);
          if (detail?.code === "NoSuchKey" || detail?.statusCode === "404")
            return null;
        }
        throw new Error("Application browser result could not be read");
      }
      if (!data || data.size > 768 * 1024)
        throw new Error("Application browser result is missing or too large");
      const encrypted = JSON.parse(await data.text()) as {
        nonce: string;
        tag: string;
        data: string;
      };
      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(target.key, "base64"),
        Buffer.from(encrypted.nonce, "base64")
      );
      decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.data, "base64")),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString("utf8")) as unknown;
    },
    async remove(path) {
      const { error } = await admin()
        .storage.from(TALENT_RESUME_BUCKET)
        .remove([path]);
      if (error) throw new Error("Application browser result cleanup failed");
    },
    async clear(prefix) {
      const bucket = admin().storage.from(TALENT_RESUME_BUCKET);
      for (let page = 0; page < 20; page++) {
        const { data, error } = await bucket.list(prefix, { limit: 100 });
        if (error) throw new Error("Application browser result cleanup failed");
        if (!data?.length) return;
        const removed = await bucket.remove(
          data.map((file) => `${prefix}/${file.name}`)
        );
        if (removed.error)
          throw new Error("Application browser result cleanup failed");
      }
      throw new Error("Application browser result cleanup exceeded its limit");
    },
  };
}
export const browserResultStore = createBrowserResultStore();
