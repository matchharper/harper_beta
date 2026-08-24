import path from "node:path";
import dotenv from "dotenv";
import {
  LANG_DIR,
  PROJECT_ROOT,
  formatFlatObject,
  readTopLevelStringObjectProperty,
  replaceTopLevelObjectProperty,
} from "./translationCommon.mjs";
import {
  fetchTranslationRows,
  getTranslationSupabaseAdmin,
} from "./translationDb.mjs";
import { mergeDbValuesIntoLocal } from "./translationSyncCore.mjs";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

function readCareerValues(exportName) {
  return readTopLevelStringObjectProperty({
    exportName,
    filePath: path.join(LANG_DIR, `${exportName}.ts`),
    propertyName: "career",
  });
}

const supabase = getTranslationSupabaseAdmin();
const dbRows = await fetchTranslationRows(supabase);
if (dbRows.length === 0) {
  throw new Error("No career translation rows found in DB.");
}

const localKo = readCareerValues("ko");
const localEn = readCareerValues("en");
const { nextEn, nextKo, pulledKeys } = mergeDbValuesIntoLocal({
  dbRows,
  localEn,
  localKo,
});

replaceTopLevelObjectProperty({
  exportName: "ko",
  filePath: path.join(LANG_DIR, "ko.ts"),
  propertyName: "career",
  propertyObjectLiteral: formatFlatObject(nextKo),
});
replaceTopLevelObjectProperty({
  exportName: "en",
  filePath: path.join(LANG_DIR, "en.ts"),
  propertyName: "career",
  propertyObjectLiteral: formatFlatObject(nextEn),
});

console.log(
  JSON.stringify(
    {
      pulledDbValueCount: pulledKeys.length,
      pulledKeys,
      retainedLocalOnlyKeys: {
        en: Object.keys(localEn).filter(
          (key) => !dbRows.some((row) => row.locale === "en" && row.key === key)
        ).length,
        ko: Object.keys(localKo).filter(
          (key) => !dbRows.some((row) => row.locale === "ko" && row.key === key)
        ).length,
      },
    },
    null,
    2
  )
);
