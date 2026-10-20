import TurndownService from "turndown";

const converter = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});
converter.remove(["script", "style", "noscript", "template"]);
converter.addRule("plainEmphasis", {
  filter: ["strong", "b", "em", "i"],
  replacement: content => content,
});
converter.addRule("tableCell", {
  filter: ["th", "td"],
  replacement: content => ` ${content.trim()} |`,
});
converter.addRule("tableRow", {
  filter: "tr",
  replacement: content => `\n|${content}\n`,
});
converter.addRule("deletedText", {
  filter: node => ["DEL", "S", "STRIKE"].includes(node.nodeName),
  replacement: content => `~~${content}~~`,
});

// Parse markup, not prose. Leave existing plain text/Markdown (including line
// breaks, comparisons and generic type names) alone. No source-text truncation.
export function descriptionText(value: string): string {
  return /<\/?(?:p|div|span|br|h[1-6]|ul|ol|li|table|tr|td|th|a|strong|b|em|i|pre|code|section|article|blockquote|hr|img|script|style|del|s|strike)(?:\s[^>]*|\/?)>/i.test(value)
    ? converter.turndown(value)
    : value;
}
