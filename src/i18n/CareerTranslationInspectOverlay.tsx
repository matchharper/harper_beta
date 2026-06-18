"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  Check,
  Loader2,
  MousePointer2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cx } from "@/components/ops/theme";
import {
  useCareerTranslationInspect,
  type CareerTranslationMatch,
} from "@/i18n/CareerTranslationInspectProvider";
import type { Locale } from "@/i18n/useMessage";

const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;
const EMPTY_MATCHES: CareerTranslationMatch[] = [];

function extractPlaceholders(value: string) {
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = PLACEHOLDER_PATTERN.exec(value))) {
    names.add(match[1]);
  }

  return Array.from(names);
}

function getUnsupportedPlaceholders(source: string, target: string) {
  const sourceNames = new Set(extractPlaceholders(source));
  const targetNames = extractPlaceholders(target);
  return targetNames.filter((name) => !sourceNames.has(name));
}

function confidenceLabel(match: CareerTranslationMatch) {
  if (match.confidence === "template") return "template";
  if (match.confidence === "partial") return "partial";
  return "exact";
}

function fieldLabel(locale: Locale) {
  return locale === "ko" ? "한글" : "영어";
}

function findMatchAtPoint(
  matches: CareerTranslationMatch[],
  clientX: number,
  clientY: number
) {
  let bestMatch: CareerTranslationMatch | null = null;
  let bestKindRank = Number.POSITIVE_INFINITY;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const match of matches) {
    for (const rect of match.rects) {
      const containsPoint =
        clientX >= rect.left &&
        clientX <= rect.left + rect.width &&
        clientY >= rect.top &&
        clientY <= rect.top + rect.height;

      if (!containsPoint) continue;

      const area = rect.width * rect.height;
      const kindRank = match.kind === "text" ? 0 : 1;
      if (
        kindRank < bestKindRank ||
        (kindRank === bestKindRank && area < bestArea)
      ) {
        bestKindRank = kindRank;
        bestArea = area;
        bestMatch = match;
      }
    }
  }

  return bestMatch;
}

function getSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function matchIncludesKey(match: CareerTranslationMatch, key: string) {
  return match.key === key || (match.candidateKeys ?? []).includes(key);
}

function resolveMatchKey(match: CareerTranslationMatch, key: string) {
  return match.key === key ? match : { ...match, key };
}

function scrollMatchIntoView(match: CareerTranslationMatch) {
  const target =
    match.scrollTargetId && typeof document !== "undefined"
      ? document.querySelector(
          `[data-career-i18n-scroll-id="${match.scrollTargetId}"]`
        )
      : null;

  if (target) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
    return;
  }

  const rect = match.rects[0];
  if (!rect || typeof window === "undefined") return;

  window.scrollBy({
    behavior: "smooth",
    left:
      rect.left < 24
        ? rect.left - 80
        : rect.left > window.innerWidth - 24
          ? rect.left - window.innerWidth / 2
          : 0,
    top: rect.top - window.innerHeight / 2 + rect.height / 2,
  });
}

function TextareaField({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-soft">
        {label}
      </div>
      <Textarea
        id={id}
        disabled={disabled}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[104px] resize-y bg-bg-floating text-base leading-6 md:text-sm md:leading-5"
      />
    </label>
  );
}

function EditorDrawer() {
  const inspect = useCareerTranslationInspect();
  const selectedMatch = inspect?.selectedMatch ?? null;
  const selectedKey = selectedMatch?.key ?? "";
  const entry = selectedKey ? inspect?.getEntry(selectedKey) : null;
  const loading = selectedKey ? inspect?.isEntryLoading(selectedKey) : false;
  const saving = selectedKey ? inspect?.isEntrySaving(selectedKey) : false;
  const dirty = selectedKey ? inspect?.isEntryDirty(selectedKey) : false;

  const unsupportedKoPlaceholders = useMemo(
    () =>
      selectedMatch && entry
        ? getUnsupportedPlaceholders(selectedMatch.sourceKo, entry.ko)
        : [],
    [entry, selectedMatch]
  );
  const unsupportedEnPlaceholders = useMemo(
    () =>
      selectedMatch && entry
        ? getUnsupportedPlaceholders(selectedMatch.sourceKo, entry.en)
        : [],
    [entry, selectedMatch]
  );
  const unsupportedPlaceholders = [
    ...unsupportedKoPlaceholders.map(
      (name) => `${fieldLabel("ko")} {${name}}`
    ),
    ...unsupportedEnPlaceholders.map(
      (name) => `${fieldLabel("en")} {${name}}`
    ),
  ];
  const canSave =
    Boolean(selectedKey && entry && dirty) &&
    !loading &&
    !saving &&
    unsupportedPlaceholders.length === 0;

  if (!inspect?.inspectEnabled || !selectedMatch || !entry) return null;

  return (
    <aside
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 top-[max(1rem,env(safe-area-inset-top))] z-[130] flex w-[min(430px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-neutral-1000-a10 bg-bg-floating shadow-[0_28px_90px_color-mix(in_srgb,var(--color-neutral-1000)_22%,transparent)]"
      data-career-i18n-skip="true"
    >
      <div className="flex items-start justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-neutral-soft">
            <MousePointer2 className="h-3.5 w-3.5" />
            Translation Inspect
          </div>
          <div className="mt-1 truncate text-sm font-medium text-neutral-primary">
            {selectedMatch.kind === "attribute"
              ? `${selectedMatch.attr} attribute`
              : "Visible text"}
          </div>
        </div>
        <IconButton
          type="button"
          size="lg"
          variant="secondary"
          onClick={inspect.clearSelectedMatch}
          icon={<X className="h-4 w-4" />}
          aria-label="Close translation editor"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="rounded-md border border-neutral-1000-a05 bg-bg-weak px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-soft">
            Current UI text
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm leading-5 text-neutral-primary">
            {selectedMatch.currentText || "-"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-bg-weak px-3 py-2">
            <div className="text-neutral-soft">Match</div>
            <div className="mt-1 font-medium text-neutral-primary">
              {confidenceLabel(selectedMatch)}
            </div>
          </div>
          <div className="rounded-md bg-bg-weak px-3 py-2">
            <div className="text-neutral-soft">Candidates</div>
            <div className="mt-1 font-medium text-neutral-primary">
              {selectedMatch.candidateKeys?.length ?? 1}
            </div>
          </div>
        </div>

        <TextareaField
          disabled={loading || saving}
          id="career-translation-ko-editor"
          label="한글"
          value={entry.ko}
          onChange={(value) => inspect.updateEntryValue(entry.key, "ko", value)}
        />
        <TextareaField
          disabled={loading || saving}
          id="career-translation-en-editor"
          label="영어"
          value={entry.en}
          onChange={(value) => inspect.updateEntryValue(entry.key, "en", value)}
        />

        {selectedMatch.candidateKeys &&
        selectedMatch.candidateKeys.length > 1 ? (
          <div className="rounded-md border border-info/20 bg-info-faded px-3 py-2 text-xs leading-5 text-info">
            <div className="font-medium">일치하는 key가 여러 개 있습니다.</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedMatch.candidateKeys.map((candidateKey) => (
                <button
                  key={candidateKey}
                  type="button"
                  onClick={() => {
                    inspect.selectMatch({
                      ...selectedMatch,
                      key: candidateKey,
                    });
                    void inspect.ensureEntries([candidateKey]);
                  }}
                  className={cx(
                    "rounded-md border px-2 py-1 font-mono text-[11px] transition",
                    candidateKey === selectedKey
                      ? "border-info bg-bg-floating text-neutral-primary"
                      : "border-transparent bg-bg-weak text-neutral-muted hover:text-neutral-primary"
                  )}
                >
                  {candidateKey}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {unsupportedPlaceholders.length > 0 ? (
          <div className="flex gap-2 rounded-md border border-critical/20 bg-critical-faded px-3 py-2 text-xs leading-5 text-critical">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              source에 없는 placeholder입니다:{" "}
              {unsupportedPlaceholders.join(", ")}
            </span>
          </div>
        ) : null}

        {inspect.error ? (
          <div className="rounded-md border border-critical/20 bg-critical-faded px-3 py-2 text-xs leading-5 text-critical">
            {inspect.error}
          </div>
        ) : null}
        {inspect.saveInfo ? (
          <div className="flex items-center gap-2 rounded-md border border-positive/20 bg-positive-faded px-3 py-2 text-xs leading-5 text-positive">
            <Check className="h-3.5 w-3.5" />
            {inspect.saveInfo}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-1000-a05 px-4 py-3">
        <Button asChild variant="secondary" size="lg" className="px-3 text-sm">
          <Link
            href={`/ops/translation?query=${encodeURIComponent(selectedKey)}`}
          >
            Open table
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={!dirty || loading || saving}
            onClick={() => inspect.revertEntry(selectedKey)}
          >
            <RotateCcw className="h-4 w-4" />
            되돌리기
          </Button>
          <Button
            type="button"
            variant="black"
            size="lg"
            disabled={!canSave}
            onClick={() => void inspect.saveEntry(selectedKey)}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            저장
          </Button>
        </div>
      </div>
    </aside>
  );
}

export default function CareerTranslationInspectOverlay() {
  const router = useRouter();
  const inspect = useCareerTranslationInspect();
  const matches = inspect?.matches ?? EMPTY_MATCHES;
  const selectedId = inspect?.selectedMatch?.id ?? "";
  const inspectEnabled = inspect?.inspectEnabled ?? false;
  const setInspectEnabled = inspect?.setInspectEnabled;
  const focusedKey =
    getSingleQueryParam(router.query.focusTranslationKey)?.trim() ?? "";
  const focusedMatches = useMemo(
    () =>
      focusedKey
        ? matches.filter((match) => matchIncludesKey(match, focusedKey))
        : [],
    [focusedKey, matches]
  );
  const focusedMatch = focusedMatches[0] ?? null;

  useEffect(() => {
    if (!inspect || !inspectEnabled || !focusedKey || !focusedMatch) return;
    if (
      inspect.selectedMatch &&
      matchIncludesKey(inspect.selectedMatch, focusedKey)
    ) {
      return;
    }

    const nextMatch = resolveMatchKey(focusedMatch, focusedKey);
    inspect.selectMatch(nextMatch);
    void inspect.ensureEntries([
      focusedKey,
      ...(nextMatch.candidateKeys ?? []),
    ]);
    scrollMatchIntoView(nextMatch);
  }, [focusedKey, focusedMatch, inspect, inspectEnabled]);

  useEffect(() => {
    if (!inspectEnabled || !setInspectEnabled || !inspect) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      setInspectEnabled(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-career-i18n-skip='true']")) return;

      const match = findMatchAtPoint(matches, event.clientX, event.clientY);
      if (!match) return;

      event.preventDefault();
      event.stopPropagation();
      const nextMatch =
        focusedKey && matchIncludesKey(match, focusedKey)
          ? resolveMatchKey(match, focusedKey)
          : match;
      inspect.selectMatch(nextMatch);
      void inspect.ensureEntries([
        nextMatch.key,
        ...(nextMatch.candidateKeys ?? []),
      ]);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [focusedKey, inspect, inspectEnabled, matches, setInspectEnabled]);

  if (!inspect || !inspectEnabled) return null;

  return (
    <div data-career-i18n-skip="true">
      <div className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] flex -translate-x-1/2 items-center gap-2 rounded-md border border-neutral-1000-a10 bg-bg-floating/95 px-3 py-2 text-xs font-medium text-neutral-primary shadow-[0_16px_48px_color-mix(in_srgb,var(--color-neutral-1000)_14%,transparent)] backdrop-blur">
        <MousePointer2 className="h-3.5 w-3.5" />
        {focusedKey ? "Inspect target" : "Inspect translations"}
        <span className="rounded bg-bg-weak px-1.5 py-0.5 text-neutral-soft">
          {focusedKey
            ? `${focusedMatches.length}/${matches.length}`
            : matches.length}
        </span>
      </div>

      {matches.flatMap((match) =>
        match.rects.map((rect, rectIndex) => {
          if (rect.width < 2 || rect.height < 2) return null;

          const active = selectedId === match.id;
          const focused = Boolean(
            focusedKey && matchIncludesKey(match, focusedKey)
          );
          return (
            <button
              key={`${match.id}:${rectIndex}`}
              type="button"
              aria-label={`Edit translation ${match.key}`}
              title={match.currentText}
              tabIndex={-1}
              onClick={() => {
                const nextMatch =
                  focusedKey && matchIncludesKey(match, focusedKey)
                    ? resolveMatchKey(match, focusedKey)
                    : match;
                inspect.selectMatch(nextMatch);
                void inspect.ensureEntries([
                  nextMatch.key,
                  ...(nextMatch.candidateKeys ?? []),
                ]);
              }}
              className={cx(
                "fixed z-[115] rounded-[3px] border transition focus-visible:ring-2 focus-visible:ring-primary/30",
                active
                  ? "border-primary bg-primary-faded/45"
                  : focused
                    ? "border-black bg-primary-faded/50 shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-neutral-1000)_12%,transparent)]"
                    : "border-primary/0 bg-primary-faded/0 hover:border-primary hover:bg-primary-faded/35"
              )}
              style={{
                height: Math.max(rect.height, 8),
                left: rect.left,
                top: rect.top,
                width: Math.max(rect.width, 8),
              }}
            />
          );
        })
      )}

      <EditorDrawer />
    </div>
  );
}
