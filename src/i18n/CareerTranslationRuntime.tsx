"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import { useMessages } from "@/i18n/useMessage";
import {
  useCareerTranslationInspectRuntime,
  type CareerTranslationMatch,
  type CareerTranslationMatchConfidence,
  type CareerTranslationMatchRect,
} from "@/i18n/CareerTranslationInspectProvider";

const TRANSLATABLE_ATTRS = ["alt", "placeholder", "title"];
const MATCH_SCROLL_TARGET_ATTR = "data-career-i18n-scroll-id";
const TRANSLATION_KEY_ATTR = "data-career-i18n-key";
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"]);
const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;
const PARTIAL_TRANSLATION_SOURCES = new Set([
  "더 이야기하고 더 좋은 연결 받기",
  "연결됨",
  "선호 조건 업데이트하기",
  "저장함",
  "통화 시작",
]);

type TemplateRule = {
  key: string;
  names: string[];
  pattern: RegExp;
  sourceKo: string;
  target: string;
};

type LookupCandidate = {
  candidateKeys?: string[];
  confidence: CareerTranslationMatchConfidence;
  key: string;
  source: string;
  sourceKo: string;
  target: string;
};

type PartialRule = {
  key: string;
  source: string;
  sourceKo: string;
  target: string;
};

type TranslationResult = {
  match: LookupCandidate | null;
  value: string;
};

type TranslationLookup = {
  exact: Map<string, LookupCandidate[]>;
  partials: PartialRule[];
  templates: TemplateRule[];
  byKey: Map<string, LookupCandidate>;
};

function preserveOuterWhitespace(original: string, translated: string) {
  const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return translated;
  return `${match[1]}${translated}${match[3]}`;
}

function normalizeLookupValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileTemplateRule({
  key,
  patternSource,
  sourceKo,
  target,
}: {
  key: string;
  patternSource: string;
  sourceKo: string;
  target: string;
}) {
  const names: string[] = [];
  const normalizedSource = normalizeLookupValue(patternSource);
  let literalLength = 0;
  let pattern = "^";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = PLACEHOLDER_PATTERN.exec(normalizedSource))) {
    names.push(match[1]);
    const literal = normalizedSource.slice(lastIndex, match.index);
    literalLength += literal.replace(/\s+/g, "").length;
    pattern += escapeRegex(literal);
    pattern += "(.+?)";
    lastIndex = match.index + match[0].length;
  }

  if (names.length === 0) return null;

  const tailLiteral = normalizedSource.slice(lastIndex);
  literalLength += tailLiteral.replace(/\s+/g, "").length;
  if (literalLength < 2) return null;

  pattern += escapeRegex(tailLiteral);
  pattern += "$";

  return {
    key,
    names,
    pattern: new RegExp(pattern),
    sourceKo,
    target,
  } satisfies TemplateRule;
}

function applyTemplateRule(rule: TemplateRule, match: RegExpMatchArray) {
  const values = new Map<string, string>();
  rule.names.forEach((name, index) => {
    values.set(name, match[index + 1] ?? "");
  });

  return rule.target.replace(
    PLACEHOLDER_PATTERN,
    (placeholder, name) => values.get(name) ?? placeholder
  );
}

function shouldSkipElement(element: Element | null) {
  if (!element) return true;
  if (SKIP_TAGS.has(element.tagName)) return true;
  if (element.closest("[data-career-i18n-skip='true']")) return true;
  return false;
}

function toPlainRect(rect: DOMRect): CareerTranslationMatchRect | null {
  if (rect.width <= 1 || rect.height <= 1) return null;

  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function getTranslationKeyElement(element: Element | null) {
  return element?.closest(`[${TRANSLATION_KEY_ATTR}]`) ?? null;
}

export default function CareerTranslationRuntime({
  children,
}: {
  children: ReactNode;
}) {
  const { m } = useMessages();
  const { inspectEnabled, registerMatches } =
    useCareerTranslationInspectRuntime();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const originalTextByNode = useRef<WeakMap<Text, string>>(new WeakMap());
  const appliedTextByNode = useRef<WeakMap<Text, string>>(new WeakMap());
  const matchByTextNode = useRef<WeakMap<Text, LookupCandidate>>(new WeakMap());
  const textIdByNode = useRef<WeakMap<Text, string>>(new WeakMap());
  const originalAttrsByElement = useRef<WeakMap<Element, Map<string, string>>>(
    new WeakMap()
  );
  const appliedAttrsByElement = useRef<WeakMap<Element, Map<string, string>>>(
    new WeakMap()
  );
  const matchAttrsByElement = useRef<
    WeakMap<Element, Map<string, LookupCandidate>>
  >(new WeakMap());
  const elementIdByElement = useRef<WeakMap<Element, string>>(new WeakMap());
  const nextMatchId = useRef(0);

  const lookup = useMemo(() => {
    const source = (ko.career ?? {}) as Record<string, string>;
    const baseEn = (en.career ?? {}) as Record<string, string>;
    const target = m.career ?? {};
    const exact = new Map<string, LookupCandidate[]>();
    const templates: TemplateRule[] = [];
    const partials: PartialRule[] = [];
    const byKey = new Map<string, LookupCandidate>();

    const addExact = (value: string, candidate: LookupCandidate) => {
      const normalized = normalizeLookupValue(value);
      if (!normalized) return;

      const existing = exact.get(normalized) ?? [];
      if (!existing.some((item) => item.key === candidate.key)) {
        exact.set(normalized, [...existing, candidate]);
      }
    };

    for (const [key, koValue] of Object.entries(source)) {
      if (typeof koValue !== "string") continue;
      const targetValue =
        typeof target[key] === "string" ? target[key] : koValue;
      const sourceValues = uniqueValues([koValue, baseEn[key], targetValue]);
      const candidate = {
        confidence: "exact",
        key,
        source: koValue,
        sourceKo: koValue,
        target: targetValue,
      } satisfies LookupCandidate;
      byKey.set(key, candidate);

      sourceValues.forEach((sourceValue) => {
        addExact(sourceValue, { ...candidate, source: sourceValue });

        const templateRule = compileTemplateRule({
          key,
          patternSource: sourceValue,
          sourceKo: koValue,
          target: targetValue,
        });
        if (templateRule) templates.push(templateRule);
      });

      if (PARTIAL_TRANSLATION_SOURCES.has(koValue) && targetValue !== koValue) {
        uniqueValues([koValue, baseEn[key]]).forEach((sourceValue) => {
          if (sourceValue === targetValue) return;
          partials.push({
            key,
            source: sourceValue,
            sourceKo: koValue,
            target: targetValue,
          });
        });
      }
    }

    partials.sort((left, right) => right.source.length - left.source.length);
    return { byKey, exact, partials, templates } satisfies TranslationLookup;
  }, [m]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observedRoot = document.body ?? root;

    const translateValue = (value: string): TranslationResult => {
      const normalized = normalizeLookupValue(value);
      const exactMatches = lookup.exact.get(normalized);
      if (exactMatches?.length) {
        const firstMatch = exactMatches[0];
        return {
          match: {
            ...firstMatch,
            candidateKeys: exactMatches.map((candidate) => candidate.key),
            confidence: "exact",
          },
          value: preserveOuterWhitespace(value, firstMatch.target),
        };
      }

      for (const rule of lookup.templates) {
        const match = normalized.match(rule.pattern);
        if (match) {
          const translated = applyTemplateRule(rule, match);
          return {
            match: {
              candidateKeys: [rule.key],
              confidence: "template",
              key: rule.key,
              source: rule.sourceKo,
              sourceKo: rule.sourceKo,
              target: translated,
            },
            value: preserveOuterWhitespace(value, translated),
          };
        }
      }

      let partialTranslated = normalized;
      let partialMatch: LookupCandidate | null = null;
      for (const partial of lookup.partials) {
        if (!partialTranslated.includes(partial.source)) continue;

        partialTranslated = partialTranslated
          .split(partial.source)
          .join(partial.target);
        partialMatch ??= {
          candidateKeys: [partial.key],
          confidence: "partial",
          key: partial.key,
          source: partial.source,
          sourceKo: partial.sourceKo,
          target: partial.target,
        };
      }

      if (partialTranslated !== normalized) {
        return {
          match: partialMatch,
          value: preserveOuterWhitespace(value, partialTranslated),
        };
      }

      return { match: null, value };
    };

    const translateValueByKey = (
      key: string | null | undefined,
      value: string
    ): TranslationResult => {
      if (!key) return translateValue(value);

      const candidate = lookup.byKey.get(key);
      if (!candidate) return translateValue(value);

      return {
        match: {
          ...candidate,
          candidateKeys: [key],
          confidence: "exact",
        },
        value: preserveOuterWhitespace(value, candidate.target),
      };
    };

    const getTextId = (node: Text) => {
      const current = textIdByNode.current.get(node);
      if (current) return current;

      const next = `text-${nextMatchId.current++}`;
      textIdByNode.current.set(node, next);
      return next;
    };

    const getElementId = (element: Element) => {
      const current = elementIdByElement.current.get(element);
      if (current) return current;

      const next = `element-${nextMatchId.current++}`;
      elementIdByElement.current.set(element, next);
      return next;
    };

    const markScrollTarget = (element: Element | null) => {
      if (!element) return undefined;
      const scrollTargetId = getElementId(element);
      if (element.getAttribute(MATCH_SCROLL_TARGET_ATTR) !== scrollTargetId) {
        element.setAttribute(MATCH_SCROLL_TARGET_ATTR, scrollTargetId);
      }
      return scrollTargetId;
    };

    const collectTextMatch = (node: Text): CareerTranslationMatch | null => {
      const match = matchByTextNode.current.get(node);
      if (!match || shouldSkipElement(node.parentElement)) return null;

      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects())
        .map(toPlainRect)
        .filter((rect): rect is CareerTranslationMatchRect => rect !== null);
      range.detach();

      if (rects.length === 0) return null;

      return {
        candidateKeys: match.candidateKeys,
        confidence: match.confidence,
        currentText: node.nodeValue ?? "",
        id: getTextId(node),
        key: match.key,
        kind: "text",
        rects,
        scrollTargetId: markScrollTarget(node.parentElement),
        sourceKo: match.sourceKo,
      };
    };

    const collectAttrMatches = (element: Element): CareerTranslationMatch[] => {
      if (shouldSkipElement(element)) return [];

      const attrMatches = matchAttrsByElement.current.get(element);
      if (!attrMatches) return [];

      const rect = toPlainRect(element.getBoundingClientRect());
      if (!rect) return [];
      const scrollTargetId = markScrollTarget(element);

      return Array.from(attrMatches.entries()).map(([attr, match]) => ({
        attr,
        candidateKeys: match.candidateKeys,
        confidence: match.confidence,
        currentText: element.getAttribute(attr) ?? "",
        id: `${getElementId(element)}:${attr}`,
        key: match.key,
        kind: "attribute",
        rects: [rect],
        scrollTargetId,
        sourceKo: match.sourceKo,
      }));
    };

    const collectMatches = () => {
      const nextMatches: CareerTranslationMatch[] = [];
      const walker = document.createTreeWalker(
        observedRoot,
        NodeFilter.SHOW_TEXT
      );
      let current = walker.nextNode();
      while (current) {
        const match = collectTextMatch(current as Text);
        if (match) nextMatches.push(match);
        current = walker.nextNode();
      }

      nextMatches.push(...collectAttrMatches(observedRoot));
      observedRoot.querySelectorAll("*").forEach((element) => {
        nextMatches.push(...collectAttrMatches(element));
      });

      return nextMatches;
    };

    let frameId = 0;
    const scheduleMatchPublish = () => {
      if (!inspectEnabled) return;
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        registerMatches(collectMatches());
      });
    };

    const applyToTextNode = (node: Text) => {
      const parent = node.parentElement;
      if (shouldSkipElement(parent)) {
        matchByTextNode.current.delete(node);
        return;
      }

      const currentValue = node.nodeValue ?? "";
      const lastApplied = appliedTextByNode.current.get(node);
      const shouldRefreshOriginal =
        !originalTextByNode.current.has(node) ||
        (lastApplied !== undefined && currentValue !== lastApplied);

      if (shouldRefreshOriginal) {
        originalTextByNode.current.set(node, currentValue);
      }

      const original = originalTextByNode.current.get(node) ?? currentValue;
      const keyElement = getTranslationKeyElement(parent);
      const translated = translateValueByKey(
        keyElement?.getAttribute(TRANSLATION_KEY_ATTR),
        original
      );
      const nextValue = translated.value;
      if (currentValue !== nextValue) {
        node.nodeValue = nextValue;
      }

      if (translated.match) {
        matchByTextNode.current.set(node, translated.match);
      } else {
        matchByTextNode.current.delete(node);
      }
      appliedTextByNode.current.set(node, nextValue);
    };

    const applyToElementAttrs = (element: Element) => {
      if (shouldSkipElement(element)) {
        matchAttrsByElement.current.delete(element);
        return;
      }

      let originals = originalAttrsByElement.current.get(element);
      if (!originals) {
        originals = new Map();
        originalAttrsByElement.current.set(element, originals);
      }
      let applied = appliedAttrsByElement.current.get(element);
      if (!applied) {
        applied = new Map();
        appliedAttrsByElement.current.set(element, applied);
      }
      let attrMatches = matchAttrsByElement.current.get(element);
      if (!attrMatches) {
        attrMatches = new Map();
        matchAttrsByElement.current.set(element, attrMatches);
      }

      for (const attr of TRANSLATABLE_ATTRS) {
        const currentValue = element.getAttribute(attr);
        if (!currentValue) {
          attrMatches.delete(attr);
          continue;
        }

        const lastApplied = applied.get(attr);
        if (
          !originals.has(attr) ||
          (lastApplied !== undefined && currentValue !== lastApplied)
        ) {
          originals.set(attr, currentValue);
        }

        const original = originals.get(attr) ?? currentValue;
        const translated = translateValue(original);
        const nextValue = translated.value;
        if (currentValue !== nextValue) {
          element.setAttribute(attr, nextValue);
        }
        if (translated.match) {
          attrMatches.set(attr, translated.match);
        } else {
          attrMatches.delete(attr);
        }
        applied.set(attr, nextValue);
      }

      if (attrMatches.size === 0) {
        matchAttrsByElement.current.delete(element);
      }
    };

    const applyTextNodesInside = (element: Element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        applyToTextNode(current as Text);
        current = walker.nextNode();
      }
    };

    const applyAll = () => {
      applyTextNodesInside(observedRoot);
      applyToElementAttrs(observedRoot);
      observedRoot.querySelectorAll("*").forEach(applyToElementAttrs);
      scheduleMatchPublish();
    };

    if (!inspectEnabled) {
      registerMatches([]);
    }

    applyAll();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            applyToTextNode(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            applyToElementAttrs(element);
            element.querySelectorAll("*").forEach(applyToElementAttrs);
            applyTextNodesInside(element);
          }
        });

        if (
          mutation.type === "characterData" &&
          mutation.target.nodeType === Node.TEXT_NODE
        ) {
          applyToTextNode(mutation.target as Text);
        }

        if (
          mutation.type === "attributes" &&
          mutation.target.nodeType === Node.ELEMENT_NODE
        ) {
          applyToElementAttrs(mutation.target as Element);
        }
      }
      scheduleMatchPublish();
    });

    observer.observe(observedRoot, {
      attributeFilter: TRANSLATABLE_ATTRS,
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", scheduleMatchPublish);
    window.addEventListener("scroll", scheduleMatchPublish, true);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleMatchPublish);
      window.removeEventListener("scroll", scheduleMatchPublish, true);
    };
  }, [inspectEnabled, lookup, registerMatches]);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
