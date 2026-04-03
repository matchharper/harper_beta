import type { ReactNode } from "react";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { formatDateTime } from "@/components/ats/utils";
import type { AtsOutreachRecord } from "@/lib/ats/shared";

type AtsEmailDiscoveryActivityProps = {
  clearPending: boolean;
  isSearching: boolean;
  onClear: () => void;
  outreach: AtsOutreachRecord | null;
};

const LINK_CLASS_NAME =
  "inline-flex items-center gap-1 text-sky-400 underline decoration-sky-400/60 underline-offset-2 transition hover:text-sky-300";
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const PLAIN_LINK_PATTERN =
  /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>"']*)?/g;

function getStatusTone(outreach: AtsOutreachRecord | null, isSearching: boolean) {
  if (isSearching || outreach?.emailDiscoveryStatus === "searching") {
    return {
      badgeClassName: "border-sky-400/30 bg-sky-400/10 text-sky-100",
      label: "탐색 중",
    };
  }

  if (
    outreach?.emailDiscoveryStatus === "found" ||
    outreach?.emailDiscoveryStatus === "manual"
  ) {
    return {
      badgeClassName: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
      label: "이메일 확보",
    };
  }

  if (outreach?.emailDiscoveryStatus === "error") {
    return {
      badgeClassName: "border-rose-400/30 bg-rose-400/10 text-rose-100",
      label: "에러",
    };
  }

  if (outreach?.emailDiscoveryStatus === "not_found") {
    return {
      badgeClassName: "border-amber-400/30 bg-amber-400/10 text-amber-100",
      label: "미발견",
    };
  }

  return {
    badgeClassName: "border-white/10 bg-white/5 text-white/70",
    label: "대기",
  };
}

function trimTrailingLinkPunctuation(value: string) {
  let normalized = value;
  let trailing = "";

  while (/[),.;:]$/.test(normalized)) {
    trailing = normalized.slice(-1) + trailing;
    normalized = normalized.slice(0, -1);
  }

  return {
    trailing,
    value: normalized,
  };
}

function normalizeLinkHref(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function isValidLinkBoundary(text: string, startIndex: number) {
  if (startIndex <= 0) return true;
  const previous = text[startIndex - 1] ?? "";
  return !/[A-Za-z0-9@]/.test(previous);
}

function createLinkNode(label: string, href: string, key: string) {
  return (
    <a
      key={key}
      href={normalizeLinkHref(href)}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLASS_NAME}
    >
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

function renderPlainLinkedText(content: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(PLAIN_LINK_PATTERN);

  for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
    const rawUrl = match[0];
    const startIndex = match.index ?? 0;
    if (!isValidLinkBoundary(content, startIndex)) continue;

    const { trailing, value: normalizedUrl } = trimTrailingLinkPunctuation(rawUrl);

    if (startIndex > lastIndex) {
      nodes.push(content.slice(lastIndex, startIndex));
    }

    nodes.push(createLinkNode(normalizedUrl, normalizedUrl, `${keyPrefix}-${startIndex}`));

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = startIndex + rawUrl.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : content;
}

function renderLinkedText(content: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(MARKDOWN_LINK_PATTERN);

  for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
    const startIndex = match.index ?? 0;
    const label = match[1] ?? "";
    const rawHref = match[2] ?? "";
    const { trailing, value: normalizedHref } = trimTrailingLinkPunctuation(rawHref);

    if (startIndex > lastIndex) {
      nodes.push(
        renderPlainLinkedText(
          content.slice(lastIndex, startIndex),
          `${keyPrefix}-plain-${startIndex}`
        )
      );
    }

    nodes.push(
      createLinkNode(
        label || normalizedHref,
        normalizedHref,
        `${keyPrefix}-markdown-${startIndex}`
      )
    );

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = startIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    nodes.push(
      renderPlainLinkedText(
        content.slice(lastIndex),
        `${keyPrefix}-tail-${lastIndex}`
      )
    );
  }

  return nodes.length > 0 ? nodes : renderPlainLinkedText(content, `${keyPrefix}-plain`);
}

function renderTraceMeta(meta: Record<string, unknown> | null | undefined, key: string) {
  if (!meta || Object.keys(meta).length === 0) return null;

  const serialized = JSON.stringify(meta, null, 2);
  if (!serialized) return null;

  return (
    <pre className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs leading-5 text-white/45">
      {renderLinkedText(serialized, `${key}-meta`)}
    </pre>
  );
}

export default function AtsEmailDiscoveryActivity({
  clearPending,
  isSearching,
  onClear,
  outreach,
}: AtsEmailDiscoveryActivityProps) {
  const trace = outreach?.emailDiscoveryTrace ?? [];
  const lastTrace = trace[trace.length - 1] ?? null;
  const summary =
    lastTrace?.content ??
    outreach?.emailDiscoverySummary ??
    (isSearching
      ? "공개 이메일을 탐색하는 중입니다."
      : "아직 저장된 탐색 로그가 없습니다.");

  if (!outreach && !isSearching) {
    return null;
  }

  const statusTone = getStatusTone(outreach, isSearching);

  return (
    <div className="rounded-md border border-white/10 bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${statusTone.badgeClassName}`}
            >
              {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {statusTone.label}
            </div>
            <div className="text-xs text-white/40">
              로그 {trace.length}개
              {lastTrace ? ` · 마지막 업데이트 ${formatDateTime(lastTrace.at)}` : ""}
            </div>
          </div>
          <div className="mt-3 text-sm leading-6 text-white/75">
            {renderLinkedText(summary, "summary")}
          </div>
          {isSearching && (
            <div className="mt-2 text-xs text-sky-100/75">
              탐색 중에는 2초 단위로 상태와 로그가 자동 갱신됩니다.
            </div>
          )}
        </div>

        {trace.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={clearPending || isSearching}
            className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {clearPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            로그 삭제
          </button>
        )}
      </div>

      {trace.length > 0 && (
        <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
          {trace.map((item, index) => (
            <div
              key={`${item.at}-${index}`}
              className="rounded-md border border-white/10 bg-black/20 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-[0.18em] text-white/35">
                  {item.kind}
                </span>
                <span className="text-xs text-white/35">
                  {formatDateTime(item.at)}
                </span>
              </div>
              <div className="mt-2 text-sm leading-6 text-white/65">
                {renderLinkedText(item.content, `trace-${index}`)}
              </div>
              {renderTraceMeta(item.meta, `trace-${index}`)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
