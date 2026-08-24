import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import {
  LANG_DIR,
  PROJECT_ROOT,
  formatFlatObject,
  readTopLevelStringObjectProperty,
  replaceTopLevelObjectProperty,
  writeText,
} from "./translationCommon.mjs";
import {
  extractCareerTCalls,
  rewriteCareerTCalls,
} from "./translationCareerT.mjs";
import {
  fetchTranslationRows,
  getTranslationSupabaseAdmin,
  upsertTranslationRows,
} from "./translationDb.mjs";
import {
  applyCareerSyncPlan,
  buildCareerSyncPlan,
  createManualTranslationRequest,
} from "./translationSyncCore.mjs";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const args = new Set(process.argv.slice(2));
const shouldPlan = args.has("--plan") || args.has("--dry-run");
const shouldApply = args.has("--apply");
const shouldPushDb = args.has("--push-db");
const manualFileArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--manual-file="));
const manualFilePath = path.resolve(
  PROJECT_ROOT,
  manualFileArg?.slice("--manual-file=".length) ||
    "output/career-translations-manual.json"
);

if (args.has("--translate")) {
  throw new Error(
    "Automatic translation is forbidden. Codex must translate every requested entry directly."
  );
}
if (shouldPlan === shouldApply) {
  throw new Error("Choose exactly one of --plan or --apply.");
}
if (shouldApply && !shouldPushDb) {
  throw new Error(
    "Applying code-source translations requires --push-db so the same touched keys are synchronized to DB."
  );
}

function readCareerValues(exportName) {
  return readTopLevelStringObjectProperty({
    exportName,
    filePath: path.join(LANG_DIR, `${exportName}.ts`),
    propertyName: "career",
  });
}

function readManualRequest() {
  if (!fs.existsSync(manualFilePath)) {
    throw new Error(
      `Missing ${path.relative(PROJECT_ROOT, manualFilePath)}. Run pnpm translation:plan, then have Codex directly fill every English translation.`
    );
  }
  return JSON.parse(fs.readFileSync(manualFilePath, "utf8"));
}

const supabase = getTranslationSupabaseAdmin();
const dbRows = await fetchTranslationRows(supabase);
const calls = extractCareerTCalls();
const localKo = readCareerValues("ko");
const localEn = readCareerValues("en");
const plan = buildCareerSyncPlan({ calls, dbRows, localEn, localKo });

if (shouldPlan) {
  const request = createManualTranslationRequest(plan);
  writeText(manualFilePath, `${JSON.stringify(request, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        dbValuesToPull: plan.pulledKeys,
        directTranslationCount: plan.codeChanges.length,
        directTranslationKeys: plan.codeChanges.map((entry) => entry.key),
        generatedKeyCount: plan.keyRewrites.size,
        manualFile: path.relative(PROJECT_ROOT, manualFilePath),
        next:
          plan.codeChanges.length > 0
            ? 'Codex must directly write every translations.*.en value, then set translationMethod to "codex_direct" and run pnpm translation:sync.'
            : "No direct translations are needed. Run pnpm translation:sync to pull DB differences into local files.",
      },
      null,
      2
    )
  );
  process.exit(0);
}

const request = plan.codeChanges.length > 0 ? readManualRequest() : null;
const result = applyCareerSyncPlan({
  dbRows,
  localEn,
  localKo,
  plan,
  request,
});

replaceTopLevelObjectProperty({
  exportName: "ko",
  filePath: path.join(LANG_DIR, "ko.ts"),
  propertyName: "career",
  propertyObjectLiteral: formatFlatObject(result.nextKo),
});
replaceTopLevelObjectProperty({
  exportName: "en",
  filePath: path.join(LANG_DIR, "en.ts"),
  propertyName: "career",
  propertyObjectLiteral: formatFlatObject(result.nextEn),
});

const changedSourceFiles = rewriteCareerTCalls({
  keyRewrites: plan.keyRewrites,
});

await upsertTranslationRows(supabase, result.dbUpserts);

console.log(
  JSON.stringify(
    {
      changedLocalKeys: result.changedLocalKeys,
      changedSourceFiles: changedSourceFiles.map((filePath) =>
        path.relative(PROJECT_ROOT, filePath)
      ),
      directTranslationCount: plan.codeChanges.length,
      pushedDbRows: result.dbUpserts.length,
      pulledDbValueCount: result.pulledKeys.length,
    },
    null,
    2
  )
);
