const UNDERLINE_OPEN_TOKEN = "EMAIL_UNDERLINE_OPEN_TOKEN";
const UNDERLINE_CLOSE_TOKEN = "EMAIL_UNDERLINE_CLOSE_TOKEN";
const SAFE_SPAN_TOKEN_PREFIX = "EMAILSAFESPANTOKEN";

function normalizeSource(value: string) {
  return value.replace(/\r/g, "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function preserveUnderlineTags(value: string) {
  return value.replace(
    /<u>([\s\S]*?)<\/u>/gi,
    `${UNDERLINE_OPEN_TOKEN}$1${UNDERLINE_CLOSE_TOKEN}`
  );
}

function getSafeInlineSpanStyle(style: string) {
  let color: string | null = null;
  let fontSize: string | null = null;
  const declarations = style.split(";");

  for (const declaration of declarations) {
    const [rawName, ...rawValueParts] = declaration.split(":");
    const name = String(rawName ?? "").trim().toLowerCase();

    const value = rawValueParts.join(":").trim();
    if (!value) continue;

    if (name === "color") {
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
        color = value;
      }

      if (
        /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
          value
        )
      ) {
        color = value;
      }
    }

    if (name === "font-size" && /^(?:[8-9]|1[0-9]|2[0-4])px$/i.test(value)) {
      fontSize = value;
    }
  }

  const safeDeclarations = [];
  if (fontSize) safeDeclarations.push(`font-size: ${fontSize}`);
  if (color) safeDeclarations.push(`color: ${color}`);

  return safeDeclarations.length ? `${safeDeclarations.join("; ")};` : null;
}

function tokenizeSafeInlineSpans(value: string) {
  const spans: Array<{ content: string; style: string; token: string }> = [];
  const text = value.replace(
    /<span\b[^>]*style\s*=\s*(['"])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/span>/gi,
    (_, _quote, rawStyle, rawContent) => {
      const style = getSafeInlineSpanStyle(String(rawStyle ?? ""));
      const content = String(rawContent ?? "");

      if (!style) {
        return content;
      }

      const token = `${SAFE_SPAN_TOKEN_PREFIX}${spans.length}PLACEHOLDER`;
      spans.push({ content, style, token });
      return token;
    }
  );

  return {
    spans,
    text,
  };
}

function isSafeUrl(value: string) {
  const normalized = value.trim();
  return /^https?:\/\//i.test(normalized) || /^mailto:/i.test(normalized);
}

function tokenizeLinks(value: string) {
  const links: Array<{ label: string; token: string; url: string }> = [];
  const text = value.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_, label, url) => {
    const token = `EMAILLINKTOKEN${links.length}PLACEHOLDER`;
    links.push({
      label: String(label ?? ""),
      token,
      url: String(url ?? ""),
    });
    return token;
  });

  return {
    links,
    text,
  };
}

function formatStrong(value: string) {
  return value
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([\s\S]+?)__/g, "<strong>$1</strong>");
}

function formatEmphasis(value: string) {
  return value
    .replace(/(^|[^\*])\*([^\*\n][\s\S]*?[^\*\n]?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n][\s\S]*?[^_\n]?)_(?!_)/g, "$1<em>$2</em>");
}

function formatInlineWithoutLinks(value: string) {
  const withUnderlineTokens = preserveUnderlineTags(value);
  const { spans, text } = tokenizeSafeInlineSpans(withUnderlineTokens);
  let formatted = escapeHtml(text);
  formatted = formatStrong(formatted);
  formatted = formatEmphasis(formatted);
  formatted = formatted
    .replaceAll(UNDERLINE_OPEN_TOKEN, "<u>")
    .replaceAll(UNDERLINE_CLOSE_TOKEN, "</u>");

  for (const span of spans) {
    formatted = formatted.replaceAll(
      span.token,
      `<span style="${escapeAttribute(span.style)}">${formatInlineWithoutLinks(
        span.content
      )}</span>`
    );
  }

  return formatted;
}

function formatInline(value: string) {
  const { links, text } = tokenizeLinks(value);
  let formatted = formatInlineWithoutLinks(text);

  for (const link of links) {
    const normalizedUrl = link.url.trim();
    const labelHtml = formatInlineWithoutLinks(link.label.trim());
    const replacement = !labelHtml
      ? ""
      : isSafeUrl(normalizedUrl)
        ? `<a href="${escapeAttribute(
            normalizedUrl
          )}" target="_blank" rel="noreferrer" style="color: #2563eb; text-decoration: underline;">${labelHtml}</a>`
        : labelHtml;

    formatted = formatted.replaceAll(link.token, replacement);
  }

  return formatted;
}

function renderParagraph(lines: string[]) {
  return `<p style="margin: 0 0 16px;">${lines
    .map((line) => formatInline(line))
    .join("<br />")}</p>`;
}

function renderHeading(level: 1 | 2 | 3, content: string) {
  const fontSize = level === 1 ? 24 : level === 2 ? 20 : 18;
  return `<h${level} style="margin: 0 0 16px; font-size: ${fontSize}px; line-height: 1.4;">${formatInline(
    content
  )}</h${level}>`;
}

function renderList(type: "ol" | "ul", items: string[]) {
  const tag = type === "ol" ? "ol" : "ul";
  const listStyle = type === "ol" ? "decimal" : "disc";
  return `<${tag} style="margin: 0 0 16px; padding-left: 24px; list-style-type: ${listStyle};">${items
    .map((item) => `<li style="margin: 0 0 8px;">${formatInline(item)}</li>`)
    .join("")}</${tag}>`;
}

function renderBlockquote(lines: string[]) {
  return `<blockquote style="margin: 0 0 16px; padding-left: 16px; border-left: 3px solid #d4d4d8;">${lines
    .map((line) => renderParagraph([line]))
    .join("")}</blockquote>`;
}

export function renderEmailBodyHtml(value: string) {
  const normalized = normalizeSource(value);
  if (!normalized) {
    return "<div></div>";
  }

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        renderHeading(
          headingMatch[1].length as 1 | 2 | 3,
          headingMatch[2]
        )
      );
      index += 1;
      continue;
    }

    if (/^\s*>\s+/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s+/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s+/, ""));
        index += 1;
      }
      blocks.push(renderBlockquote(quoteLines));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(renderList("ul", items));
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(renderList("ol", items));
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index].trimEnd()) &&
      !/^\s*>\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trimEnd());
      index += 1;
    }
    blocks.push(renderParagraph(paragraphLines));
  }

  return `<div>${blocks.join("")}</div>`;
}

export function renderEmailBodyText(value: string) {
  const normalized = normalizeSource(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/<u>([\s\S]*?)<\/u>/gi, "$1")
    .replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1 ($2)")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/(^|[^\*])\*([^\*\n][\s\S]*?[^\*\n]?)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n][\s\S]*?[^_\n]?)_(?!_)/g, "$1$2");
}
