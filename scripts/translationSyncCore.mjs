import { createHash } from "node:crypto";
import path from "node:path";
import { PROJECT_ROOT, SUPPORTED_LOCALES } from "./translationCommon.mjs";
import { generateCareerTranslationKey } from "./translationCareerT.mjs";
import { TRANSLATION_NAMESPACE } from "./translationDb.mjs";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function getCallIdentity(call) {
  return `${call.filePath}:${call.nodeStart}`;
}

function hashRequest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function rowsToLocaleValues(rows, locales = SUPPORTED_LOCALES) {
  const values = Object.fromEntries(locales.map((locale) => [locale, {}]));
  for (const row of rows) {
    if (!locales.includes(row.locale) || typeof row.key !== "string") continue;
    values[row.locale][row.key] =
      typeof row.value === "string" ? row.value : "";
  }
  return values;
}

export function mergeDbValuesIntoLocal({ dbRows, localEn, localKo }) {
  const db = rowsToLocaleValues(dbRows);
  const nextKo = { ...localKo, ...db.ko };
  const nextEn = { ...localEn, ...db.en };
  const pulledKeys = [];

  for (const locale of SUPPORTED_LOCALES) {
    const local = locale === "ko" ? localKo : localEn;
    const next = locale === "ko" ? nextKo : nextEn;
    for (const key of Object.keys(db[locale])) {
      if (local[key] !== next[key]) pulledKeys.push(`${locale}:${key}`);
    }
  }

  return { nextEn, nextKo, pulledKeys: pulledKeys.sort() };
}

export function collectCareerSourceEntries({ calls, existingKeys }) {
  const entries = new Map();
  const keyRewrites = new Map();
  const claimedKeys = new Set(existingKeys);
  const conflicts = [];

  for (const call of calls) {
    const generated = call.key === "new";
    let key = call.key;
    if (generated) {
      key = generateCareerTranslationKey({
        existingKeys: claimedKeys,
        koSource: call.koSource,
        relPath: path.relative(PROJECT_ROOT, call.filePath),
      });
      keyRewrites.set(getCallIdentity(call), key);
      claimedKeys.add(key);
    }

    const current = entries.get(key);
    if (current && current.ko !== call.koSource) {
      conflicts.push({ current, key, next: call });
      continue;
    }

    if (!current) {
      entries.set(key, {
        generated,
        key,
        ko: call.koSource,
        locations: [call.location],
      });
      continue;
    }

    current.generated ||= generated;
    current.locations.push(call.location);
  }

  if (conflicts.length > 0) {
    const details = conflicts
      .slice(0, 10)
      .map(
        ({ current, key, next }) =>
          `- ${key}: ${current.locations[0]}=${JSON.stringify(
            current.ko
          )}, ${next.location}=${JSON.stringify(next.koSource)}`
      )
      .join("\n");
    throw new Error(`Conflicting t() Korean sources:\n${details}`);
  }

  return { entries: Array.from(entries.values()), keyRewrites };
}

export function buildCareerSyncPlan({ calls, dbRows, localEn, localKo }) {
  const db = rowsToLocaleValues(dbRows);
  const existingKeys = new Set([
    ...Object.keys(localKo),
    ...Object.keys(localEn),
    ...Object.keys(db.ko),
    ...Object.keys(db.en),
    ...calls.filter((call) => call.key !== "new").map((call) => call.key),
  ]);
  const { entries, keyRewrites } = collectCareerSourceEntries({
    calls,
    existingKeys,
  });

  const codeChanges = entries
    .filter(
      (entry) =>
        entry.generated ||
        !hasOwn(localKo, entry.key) ||
        localKo[entry.key] !== entry.ko
    )
    .map((entry) => ({
      ...entry,
      reason: entry.generated
        ? "new_key"
        : hasOwn(localKo, entry.key)
          ? "korean_source_changed"
          : "missing_local_key",
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  const requestHash = hashRequest(
    codeChanges.map(({ key, ko, locations, reason }) => ({
      key,
      ko,
      locations,
      reason,
    }))
  );
  const { pulledKeys } = mergeDbValuesIntoLocal({ dbRows, localEn, localKo });

  return {
    codeChanges,
    keyRewrites,
    pulledKeys,
    requestHash,
  };
}

export function createManualTranslationRequest(plan) {
  return {
    version: 1,
    namespace: TRANSLATION_NAMESPACE,
    requestHash: plan.requestHash,
    translationMethod:
      "replace_with_codex_direct_after_translating_every_entry",
    instructions:
      "Codex must read every Korean source in context and write every English value directly. Never use Gemini, another model, or an automatic translation API.",
    translations: Object.fromEntries(
      plan.codeChanges.map(({ key, ko, locations, reason }) => [
        key,
        { en: "", ko, locations, reason },
      ])
    ),
  };
}

export function extractPlaceholders(value) {
  return Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g))
    .map((match) => match[1])
    .sort();
}

function assertSamePlaceholders(key, ko, en) {
  const source = extractPlaceholders(ko);
  const target = extractPlaceholders(en);
  if (JSON.stringify(source) !== JSON.stringify(target)) {
    throw new Error(
      `Placeholder mismatch for ${key}: ko=${source.join(",")} en=${target.join(",")}`
    );
  }
}

export function validateManualTranslationRequest(plan, request) {
  if (!request || typeof request !== "object") {
    throw new Error("Missing manual translation request file.");
  }
  if (request.version !== 1 || request.namespace !== TRANSLATION_NAMESPACE) {
    throw new Error("Unsupported manual translation request format.");
  }
  if (request.requestHash !== plan.requestHash) {
    throw new Error(
      "The manual translation request is stale. Run pnpm translation:plan again."
    );
  }
  if (request.translationMethod !== "codex_direct") {
    throw new Error(
      'Set translationMethod to "codex_direct" only after Codex directly translates every requested entry.'
    );
  }

  const translations = request.translations;
  if (!translations || typeof translations !== "object") {
    throw new Error("Manual translation request has no translations object.");
  }

  const expectedKeys = plan.codeChanges.map((entry) => entry.key).sort();
  const actualKeys = Object.keys(translations).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
    throw new Error(
      `Manual translation keys do not match the current plan: expected=${expectedKeys.join(",")} actual=${actualKeys.join(",")}`
    );
  }

  const englishByKey = {};
  for (const change of plan.codeChanges) {
    const item = translations[change.key];
    if (!item || item.ko !== change.ko) {
      throw new Error(
        `Korean source changed for ${change.key}. Recreate the plan.`
      );
    }
    if (typeof item.en !== "string" || !item.en.trim()) {
      throw new Error(
        `Codex direct English translation is missing for ${change.key}.`
      );
    }
    if (/[가-힣]/.test(change.ko) && item.en.trim() === change.ko.trim()) {
      throw new Error(
        `English translation still equals the Korean source for ${change.key}.`
      );
    }
    assertSamePlaceholders(change.key, change.ko, item.en);
    englishByKey[change.key] = item.en;
  }

  return englishByKey;
}

export function applyCareerSyncPlan({
  dbRows,
  localEn,
  localKo,
  plan,
  request,
}) {
  const englishByKey =
    plan.codeChanges.length > 0
      ? validateManualTranslationRequest(plan, request)
      : {};
  const merged = mergeDbValuesIntoLocal({ dbRows, localEn, localKo });
  const nextKo = { ...merged.nextKo };
  const nextEn = { ...merged.nextEn };

  for (const change of plan.codeChanges) {
    nextKo[change.key] = change.ko;
    nextEn[change.key] = englishByKey[change.key];
  }

  const dbUpserts = plan.codeChanges.flatMap((change) => [
    {
      key: change.key,
      locale: "ko",
      namespace: TRANSLATION_NAMESPACE,
      status: "reviewed",
      updated_by: "translation:sync:codex-direct",
      value: change.ko,
    },
    {
      key: change.key,
      locale: "en",
      namespace: TRANSLATION_NAMESPACE,
      status: "draft",
      updated_by: "translation:sync:codex-direct",
      value: englishByKey[change.key],
    },
  ]);

  const changedLocalKeys = [];
  for (const locale of SUPPORTED_LOCALES) {
    const before = locale === "ko" ? localKo : localEn;
    const after = locale === "ko" ? nextKo : nextEn;
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (before[key] !== after[key]) changedLocalKeys.push(`${locale}:${key}`);
    }
  }

  return {
    changedLocalKeys: changedLocalKeys.sort(),
    dbUpserts,
    nextEn,
    nextKo,
    pulledKeys: merged.pulledKeys,
  };
}
