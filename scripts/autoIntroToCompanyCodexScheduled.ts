import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import type { CodexAuthoredWorkspaceMessage } from "@/lib/ops/autoIntroToCompanyNotifications";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function filters(parseLimit: (value: string | null | undefined) => number) {
  return {
    limit: parseLimit(flag("--limit")),
    roleId: flag("--role-id"),
    workspaceId: flag("--workspace-id"),
  };
}

async function main() {
  const {
    fetchAutoIntroToCompanyCandidateDossiers,
    parseAutoIntroToCompanyLimit,
    sendCodexAuthoredAutoIntroToCompanyNotifications,
  } = await import("@/lib/ops/autoIntroToCompanyNotifications");
  const command = process.argv[2];
  if (command === "list") {
    const result = await fetchAutoIntroToCompanyCandidateDossiers(
      filters(parseAutoIntroToCompanyLimit)
    );
    process.stdout.write(
      `${JSON.stringify({ ok: true, ...result }, null, 2)}\n`
    );
    return;
  }

  if (command === "send") {
    const inputPath = flag("--input");
    if (!inputPath) {
      throw new Error("send requires --input <authored-message-json-path>");
    }
    const payload = JSON.parse(
      fs.readFileSync(path.resolve(inputPath), "utf8")
    ) as { groups?: CodexAuthoredWorkspaceMessage[] };
    if (!Array.isArray(payload.groups)) {
      throw new Error("Input JSON must contain a groups array");
    }
    const result = await sendCodexAuthoredAutoIntroToCompanyNotifications({
      ...filters(parseAutoIntroToCompanyLimit),
      groups: payload.groups,
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, ...result }, null, 2)}\n`
    );
    return;
  }

  throw new Error("Usage: list | send --input <json-path>");
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
