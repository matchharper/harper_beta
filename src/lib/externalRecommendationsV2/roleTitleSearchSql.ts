import { SEARCH_TITLE_NEIGHBOR_LIMIT } from "./searchTitles";

// Search vectors owned by crawled roles. Title expansion can still reuse a
// neighbor's distance, without depending on the retired title dictionary.
export function roleTitleNeighborsSql(vectorSql: string) {
  const distance = `(cr.title_embedding::public.halfvec(1536)) OPERATOR(public.<=>) ${vectorSql}::public.halfvec(1536)`;
  return `SELECT md5(name) AS title_key,name AS title,min(distance) AS distance FROM (
    SELECT cr.name,${distance} AS distance FROM public.company_roles cr
    WHERE cr.source_type='external' AND coalesce(cr.is_expired,false)=false
      AND cr.status NOT IN ('ended','expired','closed','inactive','archived')
      AND coalesce(cr.source_provider,'')<>'user_submitted'
      AND lower(coalesce(cr.information->>'testOnly','false'))<>'true'
      AND (cr.expires_at IS NULL OR cr.expires_at>now())
      AND cr.title_embedding IS NOT NULL AND cr.title_embedding_text=cr.name
    ORDER BY ${distance} LIMIT ${SEARCH_TITLE_NEIGHBOR_LIMIT}
  ) roles GROUP BY name`;
}
