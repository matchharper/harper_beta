// Next (webpack and Turbopack) loader: a prompt Markdown file becomes `export default "<text>"`.
// Plain Node runs use src/lib/llm/registerMarkdownText.ts instead.
module.exports = function markdownTextLoader(source) {
  return `export default ${JSON.stringify(source)};`;
};
