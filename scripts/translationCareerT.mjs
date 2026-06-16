import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PROJECT_ROOT, stableHash } from "./translationCommon.mjs";

export const CAREER_T_SOURCE_DIRS = [
  path.join(PROJECT_ROOT, "src", "app", "api", "realtime"),
  path.join(PROJECT_ROOT, "src", "app", "api", "talent"),
  path.join(PROJECT_ROOT, "src", "hooks", "career"),
  path.join(PROJECT_ROOT, "src", "lib", "career"),
  path.join(PROJECT_ROOT, "src", "lib", "talentOnboarding"),
  path.join(PROJECT_ROOT, "src", "pages", "career"),
  path.join(PROJECT_ROOT, "src", "components", "career"),
];

export const CAREER_T_SOURCE_FILES = [
  path.join(
    PROJECT_ROOT,
    "src",
    "components",
    "common",
    "TalentCareerModal.tsx"
  ),
  path.join(PROJECT_ROOT, "src", "hooks", "career", "careerHookMessages.ts"),
  path.join(PROJECT_ROOT, "src", "lib", "career", "conversationStarters.ts"),
  path.join(PROJECT_ROOT, "src", "lib", "career", "opportunityFeedbackNote.ts"),
];

const SYNC_ONLY_OPTION_NAMES = new Set(["meaningChanged", "retranslate"]);

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const output = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const filePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(filePath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      output.push(filePath);
    }
  }
  return output;
}

export function getCareerTSourceFiles() {
  return Array.from(
    new Set([
      ...CAREER_T_SOURCE_DIRS.flatMap(walkFiles),
      ...CAREER_T_SOURCE_FILES.filter((filePath) => fs.existsSync(filePath)),
    ])
  ).sort();
}

function getStringLiteralValue(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function getExpressionName(node) {
  if (!node) return "";
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const left = getExpressionName(node.expression);
    return left ? `${left}.${node.name.text}` : "";
  }
  return "";
}

function getStaticStringArrayValue(node, staticStrings) {
  if (!ts.isArrayLiteralExpression(node)) return null;

  const values = [];
  for (const element of node.elements) {
    const value = getStaticStringValue(element, staticStrings);
    if (value === null) return null;
    values.push(value);
  }
  return values;
}

function getStaticStringValue(node, staticStrings = new Map()) {
  const literal = getStringLiteralValue(node);
  if (literal !== null) return literal;

  if (!node) return null;
  if (ts.isParenthesizedExpression(node)) {
    return getStaticStringValue(node.expression, staticStrings);
  }
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    return staticStrings.get(getExpressionName(node)) ?? null;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "join"
  ) {
    const delimiter = getStaticStringValue(node.arguments[0], staticStrings);
    if (delimiter === null) return null;
    const values = getStaticStringArrayValue(
      node.expression.expression,
      staticStrings
    );
    return values ? values.join(delimiter) : null;
  }

  return null;
}

function collectStaticStringBindings(sourceFile) {
  const bindings = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      const name = declaration.name.text;
      const value = getStaticStringValue(declaration.initializer, bindings);
      if (value !== null) {
        bindings.set(name, value);
      }

      if (ts.isObjectLiteralExpression(declaration.initializer)) {
        for (const property of declaration.initializer.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const propertyName = getPropertyName(property.name);
          if (!propertyName) continue;
          const propertyValue = getStaticStringValue(
            property.initializer,
            bindings
          );
          if (propertyValue !== null) {
            bindings.set(`${name}.${propertyName}`, propertyValue);
          }
        }
      }
    }
  }

  return bindings;
}

function getPropertyName(node) {
  if (!node) return "";
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return "";
}

function isBooleanTrue(node) {
  return node?.kind === ts.SyntaxKind.TrueKeyword;
}

function getSyncOnlyOptionNames(optionsArg) {
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return [];

  return optionsArg.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return [];
    const name = getPropertyName(property.name);
    if (!SYNC_ONLY_OPTION_NAMES.has(name)) return [];
    return isBooleanTrue(property.initializer) ? [name] : [];
  });
}

function inferCategoryFromRelativePath(relPath) {
  const normalized = relPath.replaceAll("\\", "/").toLowerCase();
  if (normalized.includes("/onboarding")) return "onboarding";
  if (normalized.includes("/chat/")) return "chat";
  if (normalized.includes("call")) return "call";
  if (normalized.includes("/history/") || normalized.includes("mobile/jobs")) {
    return "history";
  }
  if (normalized.includes("/watchlist/") || normalized.includes("company")) {
    return "company";
  }
  if (normalized.includes("/profile/") || normalized.includes("profile")) {
    return "profile";
  }
  if (normalized.includes("settings")) return "settings";
  if (normalized.includes("home")) return "home";
  if (normalized.includes("preview")) return "preview";
  return "common";
}

function toSnakeCase(value) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function generateCareerTranslationKey({
  existingKeys = new Set(),
  koSource,
  relPath,
}) {
  const category = inferCategoryFromRelativePath(relPath);
  const fileSlug = toSnakeCase(path.basename(relPath)) || "text";
  const hash = stableHash(koSource).slice(0, 7);
  const baseKey = `career.${category}.${fileSlug}.${hash}`;

  if (!existingKeys.has(baseKey)) return baseKey;

  let index = 2;
  while (existingKeys.has(`${baseKey}_${index}`)) index += 1;
  return `${baseKey}_${index}`;
}

export function isCareerTCallExpression(node) {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isIdentifier(node.expression)) {
    return false;
  }

  const keyArgIndex = node.expression.text === "careerT" ? 1 : 0;
  const sourceArgIndex = node.expression.text === "careerT" ? 2 : 1;
  if (node.expression.text !== "t" && node.expression.text !== "careerT") {
    return false;
  }

  const key = getStringLiteralValue(node.arguments[keyArgIndex]);
  if (!key || !node.arguments[sourceArgIndex]) return false;

  return key === "new" || key.startsWith("career.") || key.startsWith("ui.");
}

function parseCareerTCall(
  node,
  sourceFile,
  sourceText,
  filePath,
  staticStrings = new Map()
) {
  if (!isCareerTCallExpression(node)) return null;

  const keyArgIndex = node.expression.text === "careerT" ? 1 : 0;
  const sourceArgIndex = node.expression.text === "careerT" ? 2 : 1;
  const optionsArgIndex = node.expression.text === "careerT" ? 3 : 2;
  const keyArg = node.arguments[keyArgIndex];
  const sourceArg = node.arguments[sourceArgIndex];
  const optionsArg = node.arguments[optionsArgIndex];
  const key = getStringLiteralValue(keyArg);
  const koSource = getStaticStringValue(sourceArg, staticStrings);
  if (!key || koSource === null) return null;

  const relPath = path.relative(PROJECT_ROOT, filePath);
  const line =
    ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile))
      .line + 1;

  return {
    filePath,
    key,
    keyArgEnd: keyArg.getEnd(),
    keyArgStart: keyArg.getStart(sourceFile),
    koSource,
    location: `${relPath}:${line}`,
    nodeEnd: node.getEnd(),
    nodeStart: node.getStart(sourceFile),
    optionsArg:
      optionsArg && ts.isObjectLiteralExpression(optionsArg)
        ? optionsArg
        : null,
    retranslate: getSyncOnlyOptionNames(optionsArg).length > 0,
    sourceArgEnd: sourceArg.getEnd(),
    sourceArgStart: sourceArg.getStart(sourceFile),
    sourceText,
    syncOnlyOptionNames: getSyncOnlyOptionNames(optionsArg),
  };
}

export function extractCareerTCalls() {
  const calls = [];

  for (const filePath of getCareerTSourceFiles()) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const staticStrings = collectStaticStringBindings(sourceFile);

    function visit(node) {
      const parsed = parseCareerTCall(
        node,
        sourceFile,
        sourceText,
        filePath,
        staticStrings
      );
      if (parsed) {
        calls.push(parsed);
        return;
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return calls.sort((left, right) =>
    left.location === right.location
      ? left.nodeStart - right.nodeStart
      : left.location.localeCompare(right.location)
  );
}

function findCommaBefore(sourceText, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = sourceText[cursor];
    if (char === ",") return cursor;
    if (!/\s/.test(char)) continue;
  }
  return -1;
}

function buildOptionsReplacement(call) {
  const optionsArg = call.optionsArg;
  if (!optionsArg || call.syncOnlyOptionNames.length === 0) return null;

  const remainingProperties = optionsArg.properties.filter((property) => {
    if (!ts.isPropertyAssignment(property)) return true;
    return !SYNC_ONLY_OPTION_NAMES.has(getPropertyName(property.name));
  });

  if (remainingProperties.length === 0) {
    const commaStart = findCommaBefore(
      call.sourceText,
      optionsArg.getFullStart()
    );
    return {
      end: optionsArg.getEnd(),
      start: commaStart >= 0 ? commaStart : optionsArg.getFullStart(),
      text: "",
    };
  }

  return {
    end: optionsArg.getEnd(),
    start: optionsArg.getStart(),
    text: `{ ${remainingProperties
      .map((property) => property.getText())
      .join(", ")} }`,
  };
}

function applyReplacements(sourceText, replacements) {
  return replacements
    .slice()
    .sort((left, right) => right.start - left.start)
    .reduce(
      (nextSource, replacement) =>
        `${nextSource.slice(0, replacement.start)}${replacement.text}${nextSource.slice(
          replacement.end
        )}`,
      sourceText
    );
}

export function rewriteCareerTCalls({
  keyRewrites = new Map(),
  koSourceByKey = new Map(),
  removeSyncOnlyOptions = false,
} = {}) {
  const calls = extractCareerTCalls();
  const callsByFile = new Map();
  for (const call of calls) {
    const list = callsByFile.get(call.filePath) ?? [];
    list.push(call);
    callsByFile.set(call.filePath, list);
  }

  const changedFiles = [];
  for (const [filePath, fileCalls] of callsByFile.entries()) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    const replacements = [];

    for (const call of fileCalls) {
      const nextKey = keyRewrites.get(`${call.filePath}:${call.nodeStart}`);
      if (nextKey && nextKey !== call.key) {
        replacements.push({
          end: call.keyArgEnd,
          start: call.keyArgStart,
          text: JSON.stringify(nextKey),
        });
      }

      const canonicalKey = nextKey ?? call.key;
      const nextKoSource = koSourceByKey.get(canonicalKey);
      if (typeof nextKoSource === "string" && nextKoSource !== call.koSource) {
        replacements.push({
          end: call.sourceArgEnd,
          start: call.sourceArgStart,
          text: JSON.stringify(nextKoSource),
        });
      }

      if (removeSyncOnlyOptions) {
        const optionsReplacement = buildOptionsReplacement(call);
        if (optionsReplacement) replacements.push(optionsReplacement);
      }
    }

    if (replacements.length === 0) continue;

    const nextSource = applyReplacements(sourceText, replacements);
    if (nextSource !== sourceText) {
      fs.writeFileSync(filePath, nextSource);
      changedFiles.push(filePath);
    }
  }

  return changedFiles;
}
