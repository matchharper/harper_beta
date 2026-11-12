import { createClient } from "@supabase/supabase-js";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isStoredTalentProfilePhoto, storeTalentProfilePhoto } from "../src/lib/talentOnboarding/profilePhoto";
import type { TalentAdminClient } from "../src/lib/talentOnboarding/admin";

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] ?? Infinity);
  const skipReport = process.argv.find(arg => arg.startsWith("--skip-report="))?.slice("--skip-report=".length);
  const previouslyUnavailable = new Set<string>(skipReport
    ? readFileSync(skipReport, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
      .filter(row => ["photo_http_403", "photo_http_404"].includes(row.status))
      .map(row => `${row.userId}:${row.sourceHash}`)
    : []);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as TalentAdminClient;
  const rows: Array<{ user_id: string; profile_picture: string }> = [];
  let after = "";
  while (true) {
    let query = admin.from("talent_users").select("user_id,profile_picture")
      .is("deleted_at", null).not("profile_picture", "is", null).order("user_id").limit(500);
    if (after) query = query.gt("user_id", after);
    const { data, error } = await query;
    if (error) throw error;
    if (!data.length) break;
    for (const row of data) {
      if (row.profile_picture?.trim() && !isStoredTalentProfilePhoto(row.profile_picture)) {
        rows.push({ user_id: row.user_id, profile_picture: row.profile_picture });
      }
    }
    after = data.at(-1)!.user_id;
  }
  const work = rows.filter(row => !previouslyUnavailable.has(`${row.user_id}:${createHash("sha256").update(row.profile_picture).digest("hex")}`)).slice(0, limit);
  console.log(JSON.stringify({ apply, externalPhotos: rows.length, selected: work.length, previouslyUnavailable: rows.length - work.length }));
  if (!apply) return;
  const report = `/tmp/harper-profile-photo-migration-${Date.now()}.jsonl`;
  writeFileSync(report, "", { mode: 0o600 });
  console.log(JSON.stringify({ report }));
  const counts: Record<string, number> = {};
  let next = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < work.length) {
      const row = work[next++];
      let status = "migrated";
      let stored: string | null = null;
      try {
        stored = await storeTalentProfilePhoto({ admin, userId: row.user_id, url: row.profile_picture });
        if (!stored) throw new Error("empty_stored_photo");
        // A photo changed or account deleted while downloading must never be overwritten.
        const { data, error } = await admin.from("talent_users").update({ profile_picture: stored })
          .eq("user_id", row.user_id).eq("profile_picture", row.profile_picture)
          .is("deleted_at", null).select("user_id");
        if (error) throw new Error(`database_update_failed:${error.code}`);
        if (!data.length) status = "concurrent_change";
      } catch (error) {
        status = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "failed";
      }
      counts[status] = (counts[status] ?? 0) + 1;
      appendFileSync(report, JSON.stringify({ userId: row.user_id, status,
        sourceHash: createHash("sha256").update(row.profile_picture).digest("hex"),
        ...(status === "migrated" ? { previousUrl: row.profile_picture, storedUrl: stored } : {}),
      }) + "\n");
      completed++;
      if (completed % 100 === 0 || completed === work.length) console.log(JSON.stringify({ completed, total: work.length, counts }));
    }
  }));
  console.log(JSON.stringify({ done: true, report, counts }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : "migration_failed"); process.exitCode = 1; });
