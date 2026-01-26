export function encodeCursor(offset: number) {
  return `offset:${offset}`;
}

export function decodeCursor(cursor: string | null) {
  if (!cursor) return 0;
  if (!cursor.startsWith("offset:")) return 0;
  return Number(cursor.replace("offset:", "")) || 0;
}
