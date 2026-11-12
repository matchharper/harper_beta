/** Completeness of this named scope, not of other filters or datasets. */
export function listCoverage(shown: number, more: boolean | null = false) {
  return more === null ? `${shown} shown; rest unknown` : more ? `${shown} shown; more` : `all ${shown}`;
}
