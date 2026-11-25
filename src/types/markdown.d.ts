// Prompt Markdown files are imported as their raw text (see next.config.mjs).
declare module "*.md" {
  const text: string;
  export default text;
}
