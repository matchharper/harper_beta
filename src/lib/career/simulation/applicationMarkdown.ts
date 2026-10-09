/** Application document prose is rendered Markdown, not a literal source listing. */
export function renderableApplicationMarkdown(text: string): string {
  const prose = text
    .replace(/\[\[CAREER_CHOICE_BUTTONS\]\][\s\S]*?\[\[\/CAREER_CHOICE_BUTTONS\]\]/g, "")
    .replace(/\[\[CAREER_CHOICE_BUTTONS[^]*$/, "");
  return prose.replace(
    /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n([\s\S]*?)^ {0,3}\1[ \t]*(?=\r?$)/gm,
    (block, _fence: string, language: string, body: string) =>
      /^(?:markdown|md|text|plaintext)?$/i.test(language.trim())
        ? body.replace(/\r?\n$/, "")
        : block
  );
}
