"use client";

import { Globe2 } from "lucide-react";
import Image from "next/image";
import React, {
  Fragment,
  isValidElement,
  useState,
  type ReactNode,
} from "react";
import { compactUrlLabel, isHarperOwnedUrl, isUrlText } from "@/lib/urlDisplay";
import { cn } from "@/lib/utils";

// All message-link design lives here, including internal links and plain URLs.
// `default` preserves ordinary RichText styling outside Career chat.
// The label supplies the inline-flex baseline; center only the decorative icon.
const LINK_STYLES = {
  user: "text-accent-500 underline decoration-dotted underline-offset-2 hover:text-accent-500/90",
  assistant:
    "inline-flex max-w-full cursor-pointer items-baseline gap-1 align-baseline font-normal leading-[inherit] text-left text-action no-underline wrap-break-word transition-colors hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
  default:
    "wrap-break-word underline decoration-dotted underline-offset-2 text-neutral-primary transition-colors hover:text-neutral-muted",
};

export function ReferenceLink({
  href,
  children,
  variant = "assistant",
  onHarperLinkClick,
  renderEmailLinksAsText = false,
}: {
  href: string;
  children?: ReactNode;
  variant?: keyof typeof LINK_STYLES;
  onHarperLinkClick?: (href: string) => void;
  renderEmailLinksAsText?: boolean;
}) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const text = getLinkText(children);
  const isBareUrl = !text.trim() || isUrlText(text) || text.trim() === href;
  const content = isBareUrl ? compactUrlLabel(text || href) : children;
  const className = LINK_STYLES[variant];

  if (renderEmailLinksAsText && isMailtoHref(href)) {
    return (
      <span className="wrap-break-word text-inherit">
        {text.trim() ? children : getMailtoLabel(href)}
      </span>
    );
  }

  if (isHarperOwnedUrl(href)) {
    return onHarperLinkClick ? (
      <button
        type="button"
        onClick={() => onHarperLinkClick(href)}
        title={href}
        className={cn(
          "cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit]",
          className,
          variant === "default" &&
            isBareUrl &&
            "max-w-full px-1 py-0.5 text-[13px] font-medium leading-5"
        )}
      >
        {content}
      </button>
    ) : (
      <span className="wrap-break-word text-inherit" title={href}>
        {content}
      </span>
    );
  }

  if (variant === "assistant" && /^https?:\/\//i.test(href)) {
    let hostname: string;
    try {
      hostname = new URL(href).hostname;
    } catch {
      return <span>{children}</span>;
    }
    const label = isBareUrl ? hostname : text.trim();
    // Only the hostname is sent to the favicon service, never the path or query.
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label} · ${hostname}\n${href}`}
        aria-label={`${label} (${hostname})`}
        data-rich-text-reference="true"
        className={className}
      >
        {failedIcon === faviconUrl ? (
          <Globe2 className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden="true" />
        ) : (
          <Image
            src={faviconUrl}
            alt=""
            aria-hidden="true"
            width={14}
            height={14}
            unoptimized
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-3.5 w-3.5 shrink-0 self-center object-contain"
            onError={() => setFailedIcon(faviconUrl)}
          />
        )}
        <span className="min-w-0 truncate">{label}</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      aria-label={variant === "default" ? href : undefined}
      className={cn(
        className,
        variant === "default" &&
          isBareUrl &&
          "inline-flex max-w-full items-center px-1 py-0.5 text-[13px] font-medium leading-5"
      )}
    >
      {content}
    </a>
  );
}

/** Linkify user text without interpreting its Markdown or changing whitespace. */
export function renderUserTextWithLinks(
  content: string,
  keyPrefix: string,
  onHarperLinkClick: (href: string) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(/(https?:\/\/[^\s]+)/g)) {
    const matchIndex = match.index;
    const href = match[0];
    if (lastIndex < matchIndex)
      nodes.push(content.slice(lastIndex, matchIndex));
    nodes.push(
      <ReferenceLink
        key={`${keyPrefix}-link-${matchIndex}`}
        href={href}
        variant="user"
        onHarperLinkClick={onHarperLinkClick}
      />
    );
    lastIndex = matchIndex + href.length;
  }
  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes.length > 0 ? nodes : [content];
}

export function getLinkText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getLinkText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getLinkText(node.props.children);
  }

  return "";
}

function isMailtoHref(value: string) {
  return value.trim().toLowerCase().startsWith("mailto:");
}

function getMailtoLabel(value: string) {
  const raw = value.trim();
  if (!isMailtoHref(raw)) return raw;
  const withoutScheme = raw.slice("mailto:".length);
  return withoutScheme.split("?")[0] || withoutScheme;
}

function isBareUrlLinkNode(node: ReactNode, renderEmailLinksAsText = false) {
  if (!isValidElement<{ href?: string; children?: ReactNode }>(node)) {
    return false;
  }

  const href = node.props.href?.trim() ?? "";
  if (!href) return false;
  if (renderEmailLinksAsText && isMailtoHref(href)) return false;

  const childText = getLinkText(node.props.children).trim();
  return isUrlText(childText) || childText === href;
}

function isSourceLabelText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "출처:" ||
    normalized === "출처" ||
    normalized === "sources:" ||
    normalized === "sources" ||
    normalized === "source:" ||
    normalized === "source"
  );
}

export function renderUrlLinkParagraph(
  children: ReactNode,
  renderEmailLinksAsText = false
): ReactNode | null {
  const childNodes = React.Children.toArray(children);
  let linkCount = 0;
  let hasOtherText = false;
  const labelParts: string[] = [];

  for (const child of childNodes) {
    if (isBareUrlLinkNode(child, renderEmailLinksAsText)) {
      linkCount += 1;
      continue;
    }

    const plainText = getLinkText(child);
    if (!isSourceLabelText(plainText)) {
      hasOtherText = true;
      break;
    }

    const normalizedLabel = plainText.replace(/\s+/g, " ").trim();
    if (normalizedLabel) {
      labelParts.push(normalizedLabel);
    }
  }

  if (linkCount === 0 || hasOtherText) return null;

  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm leading-6 text-neutral-muted first:mt-0">
      {labelParts.length > 0 && (
        <span className="mr-1 text-neutral-muted">{labelParts.join(" ")}</span>
      )}
      {childNodes
        .filter((child) => isBareUrlLinkNode(child, renderEmailLinksAsText))
        .map((child, index) => (
          <Fragment key={`url-link-${index}`}>{child}</Fragment>
        ))}
    </p>
  );
}
