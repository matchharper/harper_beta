export function splitRoleCreationCompletionSentences(content: string) {
  const chunks: string[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (!".!?".includes(content[index])) continue;
    const next = content[index + 1];
    if (next && !/\s/.test(next)) continue;

    let end = index + 1;
    while (end < content.length && /\s/.test(content[end])) end += 1;
    chunks.push(content.slice(start, end));
    start = end;
    index = end - 1;
  }

  if (start < content.length) chunks.push(content.slice(start));
  return chunks.filter(Boolean);
}
