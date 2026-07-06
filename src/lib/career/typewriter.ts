const DEFAULT_MIN_CHUNK_CHAR_COUNT = 5;
const WORD_OR_WHITESPACE_PATTERN = /\s+|\S+/g;

function visibleCharacterCount(value: string) {
  return Array.from(value.replace(/\s+/g, "")).length;
}

export function buildCareerTypewriterChunks(
  content: string,
  minChunkCharCount = DEFAULT_MIN_CHUNK_CHAR_COUNT
) {
  const tokens = content.match(WORD_OR_WHITESPACE_PATTERN) ?? [];
  const chunks: string[] = [];
  let current = "";
  let currentVisibleCount = 0;

  for (const token of tokens) {
    current += token;

    if (/^\s+$/.test(token)) {
      continue;
    }

    currentVisibleCount += visibleCharacterCount(token);
    if (currentVisibleCount > minChunkCharCount) {
      chunks.push(current);
      current = "";
      currentVisibleCount = 0;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
