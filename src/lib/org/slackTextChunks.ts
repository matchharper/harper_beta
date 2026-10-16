/** Split rendered mrkdwn into bounded blocks without cutting native Slack links in half. */
export function splitSlackMrkdwn(value: string, maxLength: number) {
  const chunks: string[] = [];
  let remaining = value.trim();
  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const paragraphBreak = candidate.lastIndexOf("\n\n");
    const lineBreak = candidate.lastIndexOf("\n");
    let splitAt = paragraphBreak > maxLength / 2 ? paragraphBreak
      : lineBreak > maxLength / 2 ? lineBreak : maxLength;
    const open = remaining.lastIndexOf("<", splitAt - 1);
    const close = remaining.indexOf(">", open);
    if (open >= 0 && close >= splitAt && !remaining.slice(open, close).includes("\n")) {
      if (open > 0) splitAt = open;
      else {
        // One link cannot fit in a block. Retain its visible label as text instead of invalid mrkdwn.
        const token = remaining.slice(1, close);
        const pipe = token.indexOf("|");
        remaining = (pipe >= 0 ? token.slice(pipe + 1) : token) + remaining.slice(close + 1);
        continue;
      }
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
