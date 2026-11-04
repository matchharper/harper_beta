/** Explicit assistant UI markers; code and quoted source text remain literal. */
export function replaceAssistantUiMarkers(content: string, replace: (part: string) => string) {
  let fence: { character: string; length: number } | null = null;
  const lines = content.split(/\r?\n/).map((line) => {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (match) {
      if (!fence) fence = { character: match[1][0], length: match[1].length };
      else if (
        fence.character === match[1][0] &&
        match[1].length >= fence.length
      )
        fence = null;
      return line;
    }
    if (fence || /^(?: {4}|\t|\s{0,3}>)/.test(line)) return line;
    return line
      .split(/(`+[^`]*`+)/g)
      .map((part) => {
        if (part.startsWith("`")) return part;
        return replace(part);
      })
      .join("");
  });
  return lines.join("\n").trim();
}

export function extractGmailIntegrationMarker(content: string) {
  let found = false;
  const text = replaceAssistantUiMarkers(content, (part) => part.replace(/(?<!\\)\[\[integration:gmail\]\]/g, () => {
    found = true;
    return "";
  }));
  return { content: text, showGmailIntegration: found };
}
