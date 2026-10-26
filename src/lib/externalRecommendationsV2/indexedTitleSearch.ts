import { countryQuotas, type CountryWeight } from "./countries";

// Permanent index coverage, not allowed product values. Other countries use
// an exact search over their eligible rows until their indexes are provisioned.
export const indexedTitleCountries = [
  "AE",
  "AU",
  "CA",
  "GB",
  "HK",
  "JP",
  "KR",
  "SG",
  "US",
] as const;

export const titleIndexEligibility = `source_type = 'external'
 AND COALESCE(is_expired, false) = false
 AND status NOT IN ('ended', 'expired', 'closed', 'inactive', 'archived')
 AND COALESCE(source_provider, '') <> 'user_submitted'
 AND lower(coalesce(information->>'testOnly', 'false')) <> 'true'
 AND title_embedding IS NOT NULL
 AND title_embedding_text = name`;

export const titleIndexNoInternPredicate = `NOT public.external_role_has_type(type, ARRAY['internship','intern','인턴']::text[])`;

export function titleIndexName(country: string | null, excludeIntern: boolean) {
  if (country !== null && !/^[A-Z]{2}$/.test(country))
    throw new Error("Invalid country code");
  return `company_roles_searchable${country ? `_${country.toLowerCase()}` : ""}${excludeIntern ? "_no_intern" : ""}_title_hnsw_idx`;
}

export function titleIndexSql(
  country: string | null,
  excludeIntern: boolean,
  concurrently = false
) {
  const name = titleIndexName(country, excludeIntern);
  return `CREATE INDEX ${concurrently ? "CONCURRENTLY " : ""}${name}
 ON public.company_roles USING hnsw
 ((title_embedding::public.halfvec(1536)) public.halfvec_cosine_ops)
 WITH (m = 16, ef_construction = 64)
 WHERE ${titleIndexEligibility}${country ? ` AND country_code = '${country}'` : ""}${excludeIntern ? ` AND ${titleIndexNoInternPredicate}` : ""}`;
}

// Disjoint membership: internship=1, part-time=2, contract=4, remote=8.
// These are index routing bits, never restrictions on the stored role types.
export function titleBucketPredicate(bucket: number) {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket > 15)
    throw new Error("Invalid search bucket");
  const types = [
    "public.external_role_has_type(type, ARRAY['internship','intern','인턴']::text[])",
    "public.external_role_has_type(type, ARRAY['part_time','part-time','part time','파트타임']::text[])",
    "public.external_role_has_type(type, ARRAY['contract','contractor','계약','계약직']::text[])",
  ];
  return [
    ...types.map(
      (predicate, bit) => `${bucket & (1 << bit) ? "" : "NOT "}${predicate}`
    ),
    `${bucket & 8 ? "" : "NOT "}(lower(coalesce(work_mode,''))='remote')`,
  ].join(" AND ");
}
export function titleBucketIndexName(country: string | null, bucket: number) {
  if (country !== null && !/^[A-Z]{2}$/.test(country))
    throw new Error("Invalid country code");
  titleBucketPredicate(bucket);
  return `company_roles_search_${country?.toLowerCase() ?? "all"}_b${bucket}_hnsw_idx`;
}
// A non-inlined immutable identity expression isolates each graph from broader
// eligible indexes. Otherwise PostgreSQL may choose a global graph + post-filter
// when the dedicated graph is empty or has a low estimated cardinality.
export function titleBucketVectorSql(
  country: string | null,
  bucket: number,
  column = "title_embedding"
) {
  return `(public.external_role_index_vector(${column},'${titleBucketIndexName(country, bucket)}')::public.halfvec(1536))`;
}
export function titleBucketIndexSql(
  country: string | null,
  bucket: number,
  concurrently = false,
  legacy = false
) {
  return `CREATE INDEX ${concurrently ? "CONCURRENTLY " : ""}${titleBucketIndexName(country, bucket)}
 ON public.company_roles USING hnsw
 (${legacy ? "(title_embedding::public.halfvec(1536))" : titleBucketVectorSql(country, bucket)} public.halfvec_cosine_ops)
 WITH (m=16,ef_construction=64)
 WHERE ${titleIndexEligibility}${country ? ` AND country_code='${country}'` : ""} AND ${titleBucketPredicate(bucket)}`;
}
export type TitleRemoteMode = "any" | "only" | "exclude";

// Each country has a fixed candidate budget. Within it, merge only eligible
// disjoint graphs. Never refill a country's shortfall or trim across countries.
export function indexedTitleCandidatesSql(args: {
  countries: string[];
  countryWeights?: CountryWeight[];
  excludeIntern: boolean;
  excludeParttime?: boolean;
  excludeContract?: boolean;
  remoteMode?: TitleRemoteMode;
  remoteOnlyCountries?: string[];
  vector: number[];
  candidateLimit: number;
  template?: boolean;
}) {
  if (args.vector.length !== 1536 || !args.vector.every(Number.isFinite))
    throw new Error("Invalid vector");
  if (
    !Number.isInteger(args.candidateLimit) ||
    args.candidateLimit < 1 ||
    args.candidateLimit > 3000
  )
    throw new Error("Invalid candidate limit");
  if (!args.countries.every((code) => /^[A-Z]{2}$/.test(code)))
    throw new Error("Invalid country code");
  const vectorSql = args.template
    ? ":title_embedding_1"
    : `'${JSON.stringify(args.vector)}'`;
  const distance = `cr.title_embedding::public.halfvec(1536) OPERATOR(public.<=>) ${vectorSql}::public.halfvec(1536)`;
  const quotas = args.countryWeights
    ? countryQuotas(args.countryWeights, args.candidateLimit)
    : null;
  if (
    quotas &&
    (quotas.length !== args.countries.length ||
      quotas.some((c) => !args.countries.includes(c.countryCode)))
  )
    throw new Error("Country quota mismatch");
  const countries = args.countries.length
    ? [...new Set(args.countries)]
    : [null];
  const merge = (streams: string[], limit: number) =>
    streams.length === 1
      ? streams[0]
      : `SELECT role_id,distance FROM (${streams.map((sql) => `(${sql})`).join(" UNION ALL ")}) merged_candidates ORDER BY distance LIMIT ${limit}`;
  const streams = countries.flatMap((country) => {
    const limit =
      quotas?.find((c) => c.countryCode === country)?.quota ??
      args.candidateLimit;
    if (limit === 0) return [];
    const remote =
      country && args.remoteOnlyCountries?.includes(country)
        ? "only"
        : (args.remoteMode ?? "any");
    if (remote === "only" && args.remoteMode === "exclude")
      throw new Error("Conflicting remote conditions");
    const bucketSearch =
      country !== null ||
      !!args.excludeParttime ||
      !!args.excludeContract ||
      remote !== "any" ||
      (country === "JP" && args.excludeIntern);
    const indexed =
      country === null ||
      (indexedTitleCountries as readonly string[]).includes(country);
    const countryWhere = `${titleIndexEligibility}${country ? ` AND cr.country_code='${country}'` : ""}`;
    const select = (
      predicate: string,
      available: boolean,
      distanceSql = distance
    ) => `SELECT cr.role_id,${distanceSql} AS distance
 FROM public.company_roles cr WHERE ${countryWhere}${predicate ? ` AND ${predicate}` : ""}
 ORDER BY ${available ? distanceSql : `(${distanceSql}) + 0`} LIMIT ${limit}`;
    if (!bucketSearch)
      return [
        select(
          args.excludeIntern ? titleIndexNoInternPredicate : "",
          indexed && !(country === "JP" && args.excludeIntern)
        ),
      ];
    if (!indexed)
      return [
        select(
          [
            ...(args.excludeIntern ? [titleIndexNoInternPredicate] : []),
            ...(args.excludeParttime
              ? [
                  "NOT public.external_role_has_type(type, ARRAY['part_time','part-time','part time','파트타임']::text[])",
                ]
              : []),
            ...(args.excludeContract
              ? [
                  "NOT public.external_role_has_type(type, ARRAY['contract','contractor','계약','계약직']::text[])",
                ]
              : []),
            ...(remote === "any"
              ? []
              : [
                  `${remote === "exclude" ? "NOT " : ""}(lower(coalesce(work_mode,''))='remote')`,
                ]),
          ].join(" AND "),
          false
        ),
      ];
    const buckets = Array.from({ length: 16 }, (_, i) => i).filter(
      (bucket) =>
        !(args.excludeIntern && bucket & 1) &&
        !(args.excludeParttime && bucket & 2) &&
        !(args.excludeContract && bucket & 4) &&
        (remote === "any" ||
          (remote === "only" ? !!(bucket & 8) : !(bucket & 8)))
    );
    return [
      merge(
        buckets.map((bucket) =>
          select(
            titleBucketPredicate(bucket),
            indexed,
            `${titleBucketVectorSql(country, bucket, "cr.title_embedding")} OPERATOR(public.<=>) ${vectorSql}::public.halfvec(1536)`
          )
        ),
        limit
      ),
    ];
  });
  // Quotas already sum to N; no global distance cut can undo their allocation.
  return quotas
    ? streams.map((sql) => `(${sql})`).join(" UNION ALL ")
    : merge(streams, args.candidateLimit);
}
