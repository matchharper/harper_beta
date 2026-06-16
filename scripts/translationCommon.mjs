import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const PROJECT_ROOT = path.resolve(
  new URL("..", import.meta.url).pathname
);

export const LANG_DIR = path.join(PROJECT_ROOT, "src", "lang");
export const SUPPORTED_LOCALES = ["ko", "en"];

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

export function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function formatStringLiteral(value) {
  return JSON.stringify(value);
}

export function formatFlatObject(values, indent = "  ") {
  const lines = ["{"];
  for (const key of Object.keys(values).sort()) {
    const value = values[key] ?? "";
    lines.push(
      `${indent}${formatStringLiteral(key)}: ${formatStringLiteral(value)},`
    );
  }
  lines.push("}");
  return lines.join("\n");
}

function findTopLevelExportedObject(source, exportName, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let target = null;

  function unwrapObjectExpression(node) {
    if (!node) return null;
    if (ts.isObjectLiteralExpression(node)) return node;
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) {
      return unwrapObjectExpression(node.expression);
    }
    return null;
  }

  function visit(node) {
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      )
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === exportName &&
          declaration.initializer
        ) {
          const objectExpression = unwrapObjectExpression(
            declaration.initializer
          );
          if (objectExpression) {
            target = objectExpression;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!target) {
    throw new Error(
      `Could not find exported object ${exportName} in ${fileName}`
    );
  }

  return target;
}

function findObjectProperty(objectNode, propertyName) {
  for (const property of objectNode.properties) {
    if (!ts.isPropertyAssignment(property)) continue;

    const name = property.name;
    const matches =
      (ts.isIdentifier(name) && name.text === propertyName) ||
      (ts.isStringLiteral(name) && name.text === propertyName);

    if (matches) return property;
  }

  return null;
}

export function readTopLevelStringObjectProperty({
  exportName,
  filePath,
  propertyName,
}) {
  const source = readText(filePath);
  const rootObject = findTopLevelExportedObject(source, exportName, filePath);
  const property = findObjectProperty(rootObject, propertyName);
  const values = {};

  if (!property || !ts.isObjectLiteralExpression(property.initializer)) {
    return values;
  }

  for (const entry of property.initializer.properties) {
    if (!ts.isPropertyAssignment(entry)) continue;
    const name = entry.name;
    if (!ts.isStringLiteral(name)) continue;
    if (!ts.isStringLiteral(entry.initializer)) continue;
    values[name.text] = entry.initializer.text;
  }

  return values;
}

export function replaceTopLevelObjectProperty({
  exportName,
  filePath,
  propertyName,
  propertyObjectLiteral,
}) {
  const source = readText(filePath);
  const objectNode = findTopLevelExportedObject(source, exportName, filePath);
  const property = findObjectProperty(objectNode, propertyName);
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const propertyText = `  ${propertyName}: ${propertyObjectLiteral.replace(/\n/g, "\n  ")},`;

  let nextSource;

  if (property) {
    const start = property.getFullStart();
    let end = property.getEnd();
    while (end < source.length) {
      const whitespaceStart = end;
      while (end < source.length && /\s/.test(source[end])) end += 1;
      if (source[end] === ",") {
        end += 1;
        continue;
      }
      end = whitespaceStart;
      break;
    }
    nextSource =
      source.slice(0, start) + "\n" + propertyText + source.slice(end);
  } else {
    const insertAt = objectNode.getEnd() - 1;
    const before = source.slice(0, insertAt).replace(/\s*$/, "");
    const after = source.slice(insertAt);
    const needsComma = !before.endsWith("{") && !before.endsWith(",");
    nextSource = `${before}${needsComma ? "," : ""}\n${propertyText}\n${after}`;
  }

  writeText(filePath, nextSource);
}

export async function loadTsModule(filePath) {
  const { pathToFileURL } = await import("node:url");
  return import(pathToFileURL(filePath).href);
}

export function flattenCareerMessages(dictionary) {
  const career = dictionary?.career;
  if (!career || typeof career !== "object") return {};

  const result = {};
  for (const [key, value] of Object.entries(career)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
