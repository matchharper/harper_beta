import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { LANG_DIR, PROJECT_ROOT, stableHash } from "./translationCommon.mjs";
import {
  extractCareerTCalls,
  isCareerTCallExpression,
} from "./translationCareerT.mjs";

const CAREER_SOURCE_DIRS = [
  path.join(PROJECT_ROOT, "src", "pages", "career"),
  path.join(PROJECT_ROOT, "src", "components", "career"),
];
const CAREER_SOURCE_FILES = [
  path.join(
    PROJECT_ROOT,
    "src",
    "components",
    "common",
    "TalentCareerModal.tsx"
  ),
  path.join(PROJECT_ROOT, "src", "hooks", "career", "careerHookMessages.ts"),
  path.join(
    PROJECT_ROOT,
    "src",
    "lib",
    "career",
    "prompts",
    "conversationStarters.ts"
  ),
  path.join(PROJECT_ROOT, "src", "lib", "career", "opportunityFeedbackNote.ts"),
];
const MANUAL_CAREER_TRANSLATION_ENTRIES = [
  {
    key: "career.onboarding.defer_fallback_close",
    ko: [
      "알겠습니다. 지금 말씀해주신 상황으로 우선 등록을 마쳐둘게요.",
      "나중에 다시 들어오시면 이어서 더 자세히 도와드리겠습니다.",
      "원하시면 아래 버튼으로 지금 바로 계속 대화하셔도 됩니다.",
    ].join(" "),
    locations: ["src/lib/career/prompts.ts:2010"],
  },
  {
    key: "career.onboarding.defer_prompt_text",
    ko: [
      "알겠습니다. 지금은 우선 등록만 마쳐둘게요. 나중에 다시 들어와 주세요.",
      "",
      "대신 기본적인 상황만 먼저 알려주시면, 필요할 때 더 빠르게 이어갈 수 있습니다.",
      "",
      "현재 어떤 기회를 찾고 있는지 선택해 주세요. 여러 개 선택하셔도 됩니다.",
    ].join("\n"),
    locations: ["src/lib/career/prompts.ts:2002"],
  },
  {
    key: "career.onboarding.interest.active_job_search",
    ko: "적극적으로 이직을 찾고 있다.",
    locations: ["src/lib/talentOnboarding/onboarding.ts:21"],
  },
  {
    key: "career.onboarding.interest.not_looking_now",
    ko: "아예 이직 생각이 없고, 나중에 이직 생각이 생기면 다시 와서 알려주겠다.",
    locations: ["src/lib/talentOnboarding/onboarding.ts:33"],
  },
  {
    key: "career.onboarding.interest.open_to_good_opportunities",
    ko: "이직 생각이 크지 않지만 생각하고 있기 때문에 좋은 기회가 있다면 받고 싶다.",
    locations: ["src/lib/talentOnboarding/onboarding.ts:26"],
  },
  {
    key: "career.onboarding.interest.part_time_or_coffee_chat",
    ko: "파트타임/커피챗 등 남는 시간을 활용가능한 기회를 찾고있다.",
    locations: ["src/lib/talentOnboarding/onboarding.ts:38"],
  },
  {
    key: "career.onboarding.interest.selected_prefix",
    ko: "현재 찾고 있는 기회:",
    locations: ["src/app/api/talent/onboarding/defer/route.ts:211"],
  },
  {
    key: "career.internal_opportunity.call_opening",
    ko: "{companyName} {roleTitle} 연결 건으로, 회사에 더 잘 전달할 수 있게 짧게 몇 가지를 확인하고 싶어요.",
    locations: [
      "src/components/career/CareerHomePanel.tsx:427",
      "src/components/career/chat/CareerMessageBubble.tsx:365",
      "src/components/career/mobile/CareerMobileHomeView.tsx:324",
    ],
  },
];

const TRANSLATABLE_ATTRS = new Set([
  "label",
  "placeholder",
  "title",
  "description",
  "alt",
]);
const SKIP_ATTR = "data-career-i18n-skip";
const SKIP_COMMENT_PATTERN = /\bcareer-i18n-skip(?:-next-line)?\b/;

const args = new Set(process.argv.slice(2));
const shouldCheck = args.has("--check");

function walkFiles(dirPath) {
  const output = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const filePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(filePath));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)
    ) {
      output.push(filePath);
    }
  }
  return output;
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function shouldIncludeText(value) {
  if (!value || !/[가-힣]/.test(value)) return false;
  if (value.length > 800) return false;
  if (/^src\/|^@\//.test(value)) return false;
  return true;
}

function addText(map, value, sourceFile, node) {
  const text = normalizeText(value);
  if (!shouldIncludeText(text)) return;

  const relPath = path.relative(PROJECT_ROOT, sourceFile.fileName);
  const line =
    ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile))
      .line + 1;
  const key = `ui.${stableHash(text)}`;
  const current = map.get(key);
  const location = `${relPath}:${line}`;

  if (current) {
    current.locations.push(location);
    return;
  }

  map.set(key, {
    key,
    ko: text,
    locations: [location],
  });
}

function hasSkipComment(sourceFile, node) {
  const sourceText = sourceFile.getFullText();
  const comments =
    ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];

  return comments.some((comment) =>
    SKIP_COMMENT_PATTERN.test(sourceText.slice(comment.pos, comment.end))
  );
}

function hasSkipJsxAttribute(sourceFile, node) {
  const openingElement = ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node)
      ? node
      : null;

  if (!openingElement) return false;

  return openingElement.attributes.properties.some((attribute) => {
    if (!ts.isJsxAttribute(attribute)) return false;
    if (attribute.name.getText(sourceFile) !== SKIP_ATTR) return false;

    const initializer = attribute.initializer;
    if (!initializer) return true;
    if (ts.isStringLiteral(initializer)) return initializer.text === "true";
    if (!ts.isJsxExpression(initializer)) return false;

    const expression = initializer.expression;
    if (!expression) return false;
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
    return ts.isStringLiteral(expression) && expression.text === "true";
  });
}

function isAriaLabelJsxAttribute(node) {
  return (
    ts.isJsxAttribute(node) &&
    (node.name.getText() === "aria-label" ||
      node.name.getText() === "ariaLabel")
  );
}

function extractCareerMessages() {
  const extracted = new Map();
  const files = Array.from(
    new Set([
      ...CAREER_SOURCE_DIRS.flatMap(walkFiles),
      ...CAREER_SOURCE_FILES.filter((filePath) => fs.existsSync(filePath)),
    ])
  );

  for (const call of extractCareerTCalls()) {
    const current = extracted.get(call.key);
    if (current) {
      if (current.ko !== call.koSource) {
        throw new Error(
          `Conflicting Korean source for ${call.key}: ${current.locations[0]} vs ${call.location}`
        );
      }
      current.locations.push(call.location);
      continue;
    }

    extracted.set(call.key, {
      key: call.key,
      ko: call.koSource,
      locations: [call.location],
    });
  }

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    function visit(node) {
      if (isCareerTCallExpression(node)) {
        return;
      }

      if (isAriaLabelJsxAttribute(node)) {
        return;
      }

      if (
        hasSkipComment(sourceFile, node) ||
        hasSkipJsxAttribute(sourceFile, node)
      ) {
        return;
      }

      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        addText(extracted, node.text, sourceFile, node);
      } else if (ts.isJsxText(node)) {
        addText(extracted, node.getText(sourceFile), sourceFile, node);
      } else if (ts.isJsxAttribute(node)) {
        const attrName = node.name.getText(sourceFile);
        if (
          TRANSLATABLE_ATTRS.has(attrName) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer)
        ) {
          addText(
            extracted,
            node.initializer.text,
            sourceFile,
            node.initializer
          );
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  for (const entry of MANUAL_CAREER_TRANSLATION_ENTRIES) {
    extracted.set(entry.key, {
      key: entry.key,
      ko: entry.ko,
      locations: [...entry.locations],
    });
  }

  return Array.from(extracted.values()).sort((a, b) =>
    a.key.localeCompare(b.key)
  );
}

function extractExistingCareerObject(filePath, exportName) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const values = {};

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
          const rootObject = unwrapObjectExpression(declaration.initializer);
          if (!rootObject) continue;

          for (const property of rootObject.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const name = property.name;
            const isCareer =
              (ts.isIdentifier(name) && name.text === "career") ||
              (ts.isStringLiteral(name) && name.text === "career");
            if (
              !isCareer ||
              !ts.isObjectLiteralExpression(property.initializer)
            ) {
              continue;
            }

            for (const entry of property.initializer.properties) {
              if (!ts.isPropertyAssignment(entry)) continue;
              const entryName = entry.name;
              if (!ts.isStringLiteral(entryName)) continue;
              if (!ts.isStringLiteral(entry.initializer)) continue;
              values[entryName.text] = entry.initializer.text;
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return values;
}

function extractPlaceholders(value) {
  return Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g))
    .map((match) => match[1])
    .sort();
}

function runCheck(entries, existingKo, existingEn) {
  const entryKeys = new Set(entries.map((entry) => entry.key));
  const failures = [];
  const warnings = [];

  for (const entry of entries) {
    if (!Object.prototype.hasOwnProperty.call(existingKo, entry.key)) {
      failures.push({
        key: entry.key,
        reason: "missing ko",
        source: entry.locations[0] ?? "",
      });
      continue;
    }

    if (existingKo[entry.key] !== entry.ko) {
      failures.push({
        actual: existingKo[entry.key],
        expected: entry.ko,
        key: entry.key,
        reason: "ko source mismatch",
        source: entry.locations[0] ?? "",
      });
    }

    if (!Object.prototype.hasOwnProperty.call(existingEn, entry.key)) {
      failures.push({
        key: entry.key,
        reason: "missing en",
        source: entry.locations[0] ?? "",
      });
      continue;
    }

    const sourcePlaceholders = extractPlaceholders(entry.ko);
    const targetPlaceholders = extractPlaceholders(existingEn[entry.key] ?? "");
    if (
      JSON.stringify(sourcePlaceholders) !== JSON.stringify(targetPlaceholders)
    ) {
      failures.push({
        actual: targetPlaceholders.join(", "),
        expected: sourcePlaceholders.join(", "),
        key: entry.key,
        reason: "placeholder mismatch",
        source: entry.locations[0] ?? "",
      });
    }
  }

  for (const key of Object.keys(existingKo)) {
    if (!entryKeys.has(key)) {
      warnings.push({ key, reason: "unused ko key" });
    }
  }

  for (const key of Object.keys(existingEn)) {
    if (!entryKeys.has(key)) {
      warnings.push({ key, reason: "unused en key" });
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `Career translation check warning: ${warnings.length} unused local key(s). DB/local rows are never deleted automatically.`
    );
    for (const warning of warnings.slice(0, 30)) {
      console.warn(`- ${warning.reason}: ${warning.key}`);
    }
    if (warnings.length > 30) {
      console.warn(`...and ${warnings.length - 30} more.`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `Career translation check failed: ${failures.length} issue(s).`
    );
    for (const failure of failures.slice(0, 30)) {
      console.error(
        [
          `- ${failure.reason}: ${failure.key}`,
          failure.source ? `source=${failure.source}` : "",
          failure.expected !== undefined
            ? `expected=${JSON.stringify(failure.expected)}`
            : "",
          failure.actual !== undefined
            ? `actual=${JSON.stringify(failure.actual)}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
    }
    if (failures.length > 30) {
      console.error(`...and ${failures.length - 30} more.`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Career translation check passed: ${entries.length} keys, ko source text preserved.`
  );
}

const entries = extractCareerMessages();
const enPath = path.join(LANG_DIR, "en.ts");
const koPath = path.join(LANG_DIR, "ko.ts");
const existingEn = extractExistingCareerObject(enPath, "en");
const existingKo = extractExistingCareerObject(koPath, "ko");

if (shouldCheck) {
  runCheck(entries, existingKo, existingEn);
  process.exit();
}

throw new Error(
  "Automatic translation extraction was removed. Use pnpm translation:plan, have Codex translate every requested entry directly, then run pnpm translation:sync."
);
