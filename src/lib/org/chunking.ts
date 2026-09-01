export const ORG_BOARD_ID_FILTER_CHUNK_SIZE = 150;

export function chunkOrgBoardFilterValues<T>(
  values: T[],
  size = ORG_BOARD_ID_FILTER_CHUNK_SIZE
) {
  const normalizedSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += normalizedSize) {
    chunks.push(values.slice(index, index + normalizedSize));
  }
  return chunks;
}
