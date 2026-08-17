# career/chat recommend_job_postings

This is the implementation contract for `career/chat`'s
`recommend_job_postings` tool.

Scope:

- Recommend external public job postings only.
- `kind=instant` is the default and uses the original synchronous Career search
  implementation with the explicit `legacy` strategy. It returns up to 5 roles
  in the current chat turn.
- `kind=bulk` is allowed only after the user explicitly requests or accepts a
  deeper search. It queues the dedicated worker pipeline, defaults to 15 roles,
  supports up to 20, and sends the completion result by email when email is
  available.
- The user's latest `request` is the primary retrieval target.
- User profile, history, and feedback are context for interpreting the request,
  not a separate long-term recommendation strategy.
- No Harper/private opportunity matching, intro follow-up, send/reuse decision, or
  planner decision metadata belongs in this path.

## Tool I/O

Input from `/api/talent/chat`:

```json
{
  "request": "서울 기반 LLM infra engineer 포지션 찾아줘. Series B 이상이면 좋고 대기업은 빼줘.",
  "kind": "instant",
  "max_results": 5
}
```

`kind` defaults to `instant`. Ordinary recommendation requests always use this
mode. `bulk` may be selected only when the user explicitly asks for roughly
10–20 results or a deeper/high-accuracy search, or explicitly accepts an offer
to run it. Before enqueueing bulk, Harper explains that it takes longer because
it searches and evaluates more postings and that completion is sent by email.
If no bulk count is given, `max_results` defaults to 15; the server caps it at
20. A bulk scheduling failure never silently falls back to instant.

Instant output returned by `runCareerJobPostingRecommendations`:

```json
{
  "answerDraft": "요청 조건을 기준으로 현재 external 채용공고 37개를 검토한 뒤...",
  "candidateCount": 37,
  "recommendationCount": 5,
  "searchPlan": {
    "sourceType": "external",
    "searchIntentSummary": "서울 기반 LLM 인프라 역할을 찾는다.",
    "ftsKeywords": [
      { "terms": ["LLM infrastructure", "AI infra", "inference platform"], "weight": 4 },
      { "terms": ["ML platform engineer", "platform engineer"], "weight": 2.5 }
    ],
    "role_titles": ["Engineer", "Developer", "엔지니어", "개발자"],
    "include_contract": false,
    "include_parttime": false,
    "include_intern": false,
    "is_prefer_entry": 0,
    "locations": ["Seoul"],
    "includeRemote": true,
    "remoteOnly": false
  }
}
```

## LLM flow

1. `query_plan`: turn the current request and compact user context into one
   external search plan.
2. DB retrieval: search external rows from `company_roles`.
3. `shortlist`: narrow external candidates using compact search-result cards.
4. `final_selection`: inspect shortlisted external detail cards and save final
   external JD recommendations.

## query_plan

Input:

```json
{
  "request": "서울 기반 LLM infra engineer 포지션 찾아줘. Series B 이상이면 좋고 대기업은 빼줘.",
  "user_profile": "{compact llm_user_profile JSON}",
  "previousDeliveryTexts": ["[previous external role] 관련 이전 메시지..."],
  "recentDeliveryMeta": ["roles:5 | cta:view_positions"],
  "config": {
    "externalSearchLimit": 200,
    "sourceType": "external_only"
  }
}
```

Output schema:

```json
{
  "searchIntentSummary": "현재 요청을 요약한 한국어 한 문장",
  "ftsKeywords": [
    { "terms": ["synonym", "group"], "weight": 1.0 }
  ],
  "role_titles": ["role title fragment"],
  "include_contract": false,
  "include_parttime": false,
  "include_intern": false,
  "is_prefer_entry": 0,
  "locations": [],
  "includeRemote": true,
  "remoteOnly": false
}
```

Concrete output example:

```json
{
  "searchIntentSummary": "서울 기반 LLM 인프라/ML 플랫폼 역할을 찾는다.",
  "ftsKeywords": [
    { "terms": ["LLM infrastructure", "AI infrastructure", "inference platform"], "weight": 4 },
    { "terms": ["ML platform engineer", "Machine Learning Platform Engineer"], "weight": 3 },
    { "terms": ["model serving", "LLM serving"], "weight": 3.5 }
  ],
  "role_titles": ["Engineer", "Developer", "엔지니어", "개발자"],
  "include_contract": false,
  "include_parttime": false,
  "include_intern": false,
  "is_prefer_entry": 0,
  "locations": ["Seoul"],
  "includeRemote": true,
  "remoteOnly": false
}
```

Normalization:

- `ftsKeywords`: max 8 groups, max 8 terms per group.
- `weight`: clamped to `0.5..5.0`.
- `role_titles`: max 12 title fragments, used as a hard `cr.name ILIKE`
  gate. The planner should keep these broad enough for recall and avoid
  redundant narrower fragments already covered by a broader one. Normalization
  drops values that do not look like role/title fragments.
- `include_contract`, `include_parttime`, `include_intern`: default false.
  False excludes rows whose `company_roles.type` array contains `contract`,
  `part_time`, or `internship` respectively, plus obvious legacy aliases such
  as `contractor`, `intern`, `인턴`, and `part-time`.
- `is_prefer_entry`: `1` for entry/junior preference, `-1` for non-entry/mid+
  preference, `0` for unknown/neutral. This is a soft rank/LLM signal, not a
  hard filter.
- `locations`: max 8. Geographic filters only.
- `includeRemote`: true allows remote rows if they otherwise match the query;
  false excludes rows whose `work_mode` is `remote`. It does not add a
  `remote OR location` expansion.
- `remoteOnly`: true requires `work_mode = remote`.
- Counts are not trusted from the LLM.

## User Context Sent To LLM

The LLM receives `llm_user_profile` JSON, not raw DB rows or the legacy
career-chat brief string.

### Tables And Columns

| Table | Columns read | LLM-visible value |
| --- | --- | --- |
| `talent_users` | `user_id, email, name, profile_picture, headline, bio, location, last_logined_at, resume_file_name, resume_links, created_at, updated_at` | `profile.name`, `profile.headline`, `profile.bio` max 800 chars, `profile.location`; `resume.hasResume`, `resume.fileName`, `resume.hasLinkedIn`, `resume.profileLinks`. `resume_text` is not read. `email`, ids, raw links metadata, and login time are not sent. |
| `talent_setting` | `user_id, blocked_companies, engagement_types` | `settings.blockedCompanies` max 20, `settings.engagementTypes` max 8. `blockedCompanies` also becomes a hard DB exclusion. |
| `talent_insights` | `id, talent_id, content, created_at, last_updated_at` | `insights` from `content`: string values max 800 chars, list values max 12 items, each max 180 chars, object values passed as compact JSON. Timestamps are not sent. |
| `talent_experiences` | `id, talent_id, role, description, employment_type, start_date, end_date, months, company_id, company_link, company_name, company_location, company_logo, memo, created_at` | `experiences` max 12 with `companyName`, `role`, `description` max 5000, `memo` max 600, and derived `period`. Dates are compressed into `period`; ids and company metadata are not sent. |
| `talent_educations` | `id, talent_id, school, degree, description, field, start_date, end_date, url, memo, created_at` | `educations` max 8 with `school`, `degree`, `field`, `description` max 900, `memo` max 600, and derived `period`. Dates are compressed into `period`; ids and url are not sent. |
| `talent_extras` | `talent_id, content` | `extra.talentExtras` max 12 from parsed content: `title` max 160, `description` max 500, `memo` max 300, compacted `date` max 80. |
| `talent_activity_events` | `created_at, summary` | `activityEvents` max 10 one-line strings: `{createdAt compacted} | {summary max 360}`. Hidden setting summaries are filtered upstream. |
| `talent_conversation_summaries` | `created_at, segment_summary, summary_text, to_message_id` | `conversation` max 3 one-line strings: `{createdAt compacted} | {segment_summary or summary_text}`. Raw `talent_messages` are not sent. |
| `talent_opportunity_recommendation` joined with `company_roles` and `company_workspace` | filtered to `opportunity_type = external_jd`; selected `id, role_id, opportunity_type, feedback, feedback_reason, created_at, viewed_at, clicked_at, saved_stage, fit_summary, fit_reasons, tradeoffs, score, company_roles.name, company_roles.source_type, company_roles.location_text, company_roles.work_mode, company_workspace.company_name` | `recentRecommendations` and `feedbackSignals`, redacted so previous external role/company names are not repeated. These are signal-only and never create follow-up actions. |
| `talent_opportunity_recommendation` for exclusion history | filtered to `opportunity_type = external_jd`; selected `role_id`, joined `company_roles.name`, `company_roles.source_type`, `company_workspace.company_name` | Used to redact previous external roles and filter already recommended external rows by `roleId` and `companyName + roleName` fingerprint. Not directly sent except counts/policy. |
| `opportunity_discovery_run` | `query_plan` from latest completed/partial runs | `previousDeliveryTexts` max 6, redacted and max 1600 chars each; `recentDeliveryMeta` max 6 compact strings. Planner metadata from previous runs is intentionally ignored. |

### Preprocessing

- Remove empty `null`, `""`, `{}`, and `[]`; preserve `false` and `0`.
- Parse JSON-ish strings when possible.
- Compact any key that is date-like or ends with `At`, `_at`, `Date`, `_date`.
- Timestamp compaction converts to KST and drops minutes/seconds:

```txt
2026-05-15T06:09:09.571000+00:00 -> 2026-05-15 15시 KST
```

- Date-only values stay date-only:

```txt
2020-02-28 -> 2020-02-28
```

- Experience/education dates become `period`:

```json
{
  "companyName": "ExampleAI",
  "role": "ML Platform Engineer",
  "description": "LLM inference platform and evaluation pipeline.",
  "memo": "latency-sensitive serving work 선호.",
  "period": "2022-01-01 - 현재"
}
```

- Previous external role/company names are redacted in conversation summaries,
  recent recommendation strings, feedback signals, and previous delivery text:

```txt
Synthesia - Staff Research Engineer -> [previous external role]
```

### Example `llm_user_profile`

```json
{
  "profile": {
    "name": "김하퍼",
    "headline": "ML Platform Engineer",
    "bio": "LLM serving과 ML platform 운영 경험이 있습니다.",
    "location": "Seoul"
  },
  "settings": {
    "blockedCompanies": ["Samsung", "Google"],
    "engagementTypes": ["full-time"]
  },
  "insights": {
    "next_scope": "LLM infra/platform 역할을 우선적으로 보고 싶어합니다.",
    "location": ["서울", "리모트"]
  },
  "experiences": [
    {
      "companyName": "ExampleAI",
      "role": "ML Platform Engineer",
      "description": "LLM inference platform and evaluation pipeline.",
      "memo": "latency-sensitive serving work 선호.",
      "period": "2022-01-01 - 현재"
    }
  ],
  "conversation": [
    "2026-05-15 15시 KST | 최근 대화에서는 대기업 제외와 LLM infra 역할 선호를 말했다."
  ],
  "activityEvents": [
    "2026-05-15 15시 KST | 사용자가 대기업 제외를 강한 선호로 저장했습니다."
  ],
  "recentRecommendations": [
    "external: [previous external role] | 2026-05-14 10시 KST | liked, saved, viewed | Seoul | prev external; signal only; do not repeat"
  ]
}
```

## DB Retrieval

### Counts

```txt
MAX_SEARCH_RESULTS = 150
SEARCH_COMPANY_WORKSPACE_ROLE_CAP = 3
SHORTLIST_COMPANY_ROLE_CAP = 4
SHORTLIST_LIMIT_MIN = 4
SHORTLIST_LIMIT_MAX = 20
SHORTLIST_LIMIT_MULTIPLIER = 2
FINAL_RECOMMENDATION_COUNT = 5
```

Count derivation:

- The final target is always `5`.
- `talent_setting.recommendation_batch_size` is not read or used by this tool.
- `selectionLimit = clamp(targetRecommendationCount * 2, 4, 20)`.
- DB retrieval fetches up to `200` external rows through RPC
  `limit_num = 200`; the generated SQL string does not include its own
  `LIMIT` clause because the RPC wrapper appends one.
- DB retrieval keeps at most 5 ranked roles per `company_workspace_id` before
  applying the global 200-row limit.
- Relaxed fallback search is server-only and runs only when strict DB retrieval
  returns fewer than 5 rows. It is not part of the LLM search-plan schema or
  tool output.
- After DB retrieval, candidates are capped to at most 4 roles per company for
  shortlist.

Examples:

```txt
request: "3개만 찾아줘" -> targetRecommendationCount = 5, selectionLimit = 10
no explicit count -> targetRecommendationCount = 5, selectionLimit = 10
request: "20개 찾아줘" -> targetRecommendationCount = 5, selectionLimit = 10
```

### SQL Tables And Columns

| Table | Columns used |
| --- | --- |
| `company_roles cr` | selected: `role_id, company_workspace_id, name, description, external_jd_url, location_text, work_mode, type, posted_at, seniority_level`; filtering/ranking: `opportunity_search_tsv, is_expired, status, source_type, role_id, name, description, location_text, work_mode, posted_at, updated_at`. |
| `company_workspace cw` | `company_workspace_id, company_name, company_description, test_score, company_db_id`. |
| `company_db cd` | `name, description, short_description, location, founded_year, employee_count_range`. |
| `talent_opportunity_recommendation tor` | `talent_id, opportunity_type, role_id` for already-recommended external role exclusion. |

### Base Filters

Required filters:

```sql
COALESCE(cr.is_expired, false) = false
cr.status NOT IN ('expired', 'closed', 'inactive', 'archived')
cr.source_type = 'external'
```

Additional filters:

- Exclude external role IDs already recommended to this talent using
  `tor.talent_id = '<user_id>'::uuid`.
- Exclude `talent_setting.blocked_companies` by matching `cw.company_name` and
  `cd.name`.
- Require at least one `role_titles` fragment to match `cr.name` via `ILIKE`.
- If `include_contract`, `include_parttime`, or `include_intern` is false,
  exclude rows whose `cr.type` contains `contract`, `part_time`, or
  `internship`, plus obvious legacy aliases.
- If `locations` are present, hard-filter only on `cr.location_text`.
- Build `title_candidates AS MATERIALIZED` from active/type/location/title
  filters first.
- Apply FTS only inside that materialized title candidate pool with
  `tc.opportunity_search_tsv @@ fts.query`.
- `tc.opportunity_search_tsv` is used directly; it is not wrapped in `COALESCE`.

`company_roles.opportunity_search_tsv` is generated by
`set_company_roles_opportunity_search_tsv()` from:

```txt
A: company_roles.name
B: company_roles.description
C: company_internal_roles.request
D: company_roles.location_text, work_mode, type[]
```

`description_summary` is intentionally excluded from this search vector.

Explicit non-goals:

- No quality-label join.
- No quality-label exclusion.
- No quality-label boost.

### Ranking And `test_score`

`test_score` is `company_workspace.test_score`. It is a company quality/priority
signal from `0..20`, not role-fit confidence.

```txt
search_rank =
  weighted_fts_rank
  + COALESCE(cw.test_score, 0) / 5.0
  + entry_preference_rank_adjustment
```

`entry_preference_rank_adjustment` is only used when `is_prefer_entry` is `1`
or `-1`. It nudges entry/junior or senior-ish postings up/down without filtering
the candidate pool.

Examples:

```txt
test_score = 20 -> +4.0 search_rank
test_score = 15 -> +3.0 search_rank
test_score = 5  -> +1.0 search_rank
```

Ordering:

```sql
ROW_NUMBER() OVER (
  PARTITION BY company_workspace_id
  ORDER BY
    search_rank DESC,
    company_test_score DESC NULLS LAST,
    posted_at DESC NULLS LAST,
    role_updated_at DESC NULLS LAST
) AS company_workspace_role_rank

WHERE company_workspace_role_rank <= 5

ORDER BY
  search_rank DESC,
  company_test_score DESC NULLS LAST,
  posted_at DESC NULLS LAST,
  role_updated_at DESC NULLS LAST
```

`test_score` is exposed to the shortlist LLM only as `company_score` inside the
company string. It is not exposed to the final selection LLM and is not added
again as a final rerank bonus.

## Candidate Cards Sent To LLM

### In-Memory `role_card`

Raw SQL rows are converted to this in-memory object before LLM formatting:

```json
{
  "roleId": "role-uuid",
  "sourceType": "external",
  "companyWorkspaceId": "workspace-uuid",
  "companyName": "Example AI",
  "score": 17.5,
  "searchRank": 4.2,
  "roleName": "ML Engineer",
  "roleDescription": "JD text, max 4000 chars",
  "location": "San Francisco",
  "workMode": "hybrid",
  "employmentType": "full-time",
  "seniorityLevel": "senior",
  "postedAt": "2026-05-19T00:00:00Z",
  "company": {
    "description": "company description, max 900 chars",
    "shortDescription": "Builds AI products",
    "location": "San Francisco",
    "foundedYear": 2023,
    "employeeCountRange": { "start": 11, "end": 50 }
  }
}
```

Notes:

- `score` here is normalized `company_workspace.test_score`, clamped to `0..20`.
- `searchRank` is retrieval-only rank.
- `external_jd_url` is kept only on the raw row for saved/display output. It is
  not part of the role card and is not sent to the final selection LLM.

### Shortlist Input

```json
{
  "request": "서울/리모트 가능한 LLM infra engineer 포지션 찾아줘.",
  "user_profile": "{same compact llm_user_profile}",
  "searchPlan": "{normalized external search plan}",
  "selectionLimit": 10,
  "externalCandidates": [
    {
      "id": 0,
      "role": "external : ML Engineer at Example AI | work at San Francisco | hybrid | full-time | senior | posted 2026-05-19",
      "company": "Example AI : Builds AI products | 11-50 employees | HQ San Francisco | founded 2023 | company_score 17.5"
    }
  ]
}
```

Rules:

- UUID `roleId` is hidden from shortlist; the LLM returns numeric
  `selectedCandidateIds`.
- If candidate count is already `<= selectionLimit`, shortlist LLM is skipped.
- If the LLM selects nothing, fallback uses first available unique-company
  candidates.

### Final Selection Input

```json
{
  "request": "서울/리모트 가능한 LLM infra engineer 포지션 찾아줘.",
  "user_profile": "{same compact llm_user_profile}",
  "searchPlan": "{normalized external search plan}",
  "targetRecommendationCount": 5,
  "previousDeliveryTexts": ["..."],
  "recentDeliveryMeta": ["..."],
  "detailedExternalCandidates": [
    {
      "roleId": "role-uuid",
      "role": "external : ML Engineer at Example AI | work at San Francisco | hybrid | full-time | senior | posted 2026-05-19",
      "company": "Example AI : Builds AI products | 11-50 employees | HQ San Francisco | founded 2023",
      "jd": "JD text, max 4000 chars"
    }
  ]
}
```

The final selection LLM does not receive `company_score`, `searchRank`,
`test_score`, or `externalUrl`.

### Final Selection Output

```json
{
  "selectedRecommendations": [
    {
      "rank": 1,
      "roleId": "role-uuid",
      "score": 0.9,
      "fitSummary": "회사와 역할에 대한 중립 요약",
      "fitReasons": ["LLM serving과 ML platform 업무가 현재 요청과 직접 맞습니다."],
      "tradeoffs": [],
      "preferenceFit": {
        "next_scope": {
          "status": "Satisfied",
          "note": "LLM infra/platform 방향과 맞습니다."
        },
        "location": {
          "status": "Neutral",
          "note": "리모트 가능성은 공고 상세 확인이 필요합니다."
        }
      }
    },
    {
      "roleId": "near-miss-role-uuid",
      "score": 0.52
    }
  ]
}
```

The final selection LLM scores every detailed candidate. Candidates that fit the
current request receive `fitSummary`, `fitReasons`, and `preferenceFit`.
Near-miss candidates return only `roleId` and `score`; the code uses the highest
scored near-misses only when direct-fit recommendations are fewer than 5.

`score` here is final recommendation confidence from `0..1`. It is converted to
`0..10` for the chat response, and to `0..1` again for DB persistence.

## Persistence

Saved rows in `talent_opportunity_recommendation` use
`opportunity_type = external_jd`. The saved row includes `role_id`, `rank`,
`score`, `fit_summary`, `fit_reasons`, `tradeoffs`, `preference_fit`, and
compact evidence from role, company, and search-intent text. `tradeoffs` is
always persisted as an empty array for this tool.
