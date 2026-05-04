# Manual smoke verification — talent_*.memo /career chat auto-write

> Source plan: `.omc/plans/ralplan-talent-row-memo-autowrite.md`
> Source spec: `.omc/specs/deep-interview-talent-row-memo-autowrite.md`
> Project: `harper_beta` (Next.js 13.5 hybrid router; pnpm 10)

There is no test runner configured in `package.json` (see `harper_beta/CLAUDE.md`). Verification is **manual against `pnpm dev`** with Supabase Studio for post-condition checks.

## Setup

1. `cd harper_beta && pnpm dev` — Next dev server.
2. Sign in as a talent test user via the app subdomain (or rewrite the host header per `src/middleware.ts`).
3. Seed the user's `talent_experiences`, `talent_educations`, `talent_extras` rows via the existing `/career` profile UI (`CareerTalentProfilePanel`) before running scenarios that rely on specific rows.
4. Open `/career` (the talent chat page).
5. Have Supabase Studio open at the same project; the relevant tables are `talent_experiences`, `talent_educations`, `talent_extras`.

For each AC below, paste the **Prompt** into the chat, observe Harper's reply (it must NOT mention memo updates), then run the **Verify SQL** in Supabase Studio.

---

## AC1. Single-match write (talent_experiences)

**Setup:** user has exactly one experience row with `company_name = "Samsung"` and current `memo` empty.

**Prompt (user → Harper):** `삼성에서 일할 때 ML 모델 학습 파이프라인 만들었어요.`

**Expected:**
- Harper replies naturally (no "메모에 추가했어요" mention).
- `talent_experiences.memo` for the Samsung row is now non-null and contains a short Korean sentence about ML 모델 / 학습 파이프라인.
- All other experience rows for this user are unchanged.

**Verify SQL:**
```sql
select id, company_name, memo
from talent_experiences
where talent_id = '<USER_ID>'
order by start_date desc;
```

---

## AC2. No-match skip

**Setup:** user has no experience row whose `company_name` resembles "Acme Corp".

**Prompt:** `Acme Corp에서 잠깐 컨설팅한 적도 있어요.`

**Expected:**
- No `talent_experiences` row's memo changes.
- (insights side may absorb the info — that's fine; this AC only checks memo isolation.)

**Verify SQL:** same as AC1; compare before/after — no diff in memo column.

---

## AC3. Ambiguous-match skip (experiences)

**Setup:** user has TWO experience rows with `company_name` `"Samsung Electronics"` and `"Samsung SDS"`. Pre-record both rows' current memo state.

**Prompt:** `삼성에서 일할 때 정말 큰 조직이라 적응이 어려웠어요.`

**Expected:**
- Neither Samsung-* row's memo changes.

**Verify SQL:**
```sql
select id, company_name, memo
from talent_experiences
where talent_id = '<USER_ID>' and company_name ilike '%samsung%';
```

---

## AC4. Read-merge-write preservation

**Setup:** user's Samsung experience row already has `memo = 'ML 모델 구축 경험'`.

**Prompt:** `삼성에서는 데이터 파이프라인도 직접 설계했어요.`

**Expected:**
- Updated memo contains BOTH "ML 모델 구축" and "데이터 파이프라인" content. Original info is preserved.
- Server-side append uses `existing + "\n" + newInfo` then `clampPromptText(_, 2000)`.

**Verify SQL:** same as AC1; confirm the updated memo includes both pieces of information.

---

## AC5. Educations + Extras

### Educations
**Setup:** user has `talent_educations` row with `school = "Stanford"`, `degree = "PhD"`, `field = "CS"`.

**Prompt:** `Stanford CS 박사 시절에 GPU 클러스터를 직접 구축했어요.`

**Verify SQL:**
```sql
select id, school, degree, memo
from talent_educations
where talent_id = '<USER_ID>';
```

### Extras
**Setup:** `talent_extras.content` has an item with `title = "Open Source Maintainer"`.

**Prompt:** `Open Source Maintainer 활동 중에 React 코어 PR을 머지했어요.`

**Verify SQL:**
```sql
select content
from talent_extras
where talent_id = '<USER_ID>';
```
The Open Source Maintainer item's `memo` should be updated; other items unchanged.

---

## AC6. Memo-only mutation

**Setup:** snapshot the row before the chat (record `company_name`, `role`, `start_date`, `end_date`, `description`, `id`).

**Prompt:** any AC1-style declarative.

**Verify SQL:**
```sql
select id, company_name, role, start_date, end_date, description, memo
from talent_experiences
where id = '<ROW_ID>';
```
Confirm only `memo` differs from the snapshot.

---

## AC7. Silent policy

For every AC above, scan Harper's reply text for forbidden phrases:
- "메모에 추가" / "메모 업데이트"
- "프로필에 반영" / "프로필에 저장"
- "I noted" / "I've added"

The reply MUST NOT contain any of these or equivalent phrasings.

---

## AC8. Dual-write (memo + insights)

**Setup:** user has Samsung experience row; current `talent_insights.content.signature_story` is empty.

**Prompt:** `삼성에서 Python 으로 5개 팀이 쓰는 내부 라이브러리를 만들었어요.`

**Expected:**
- Samsung experience `memo` updated with a context-rich Korean sentence.
- `talent_insights.content` (likely `signature_story`) updated with a generic-skill or signature-experience phrasing.

**Verify SQL:**
```sql
select content from talent_insights where talent_id = '<USER_ID>';
select id, company_name, memo from talent_experiences where talent_id = '<USER_ID>' and company_name ilike '%samsung%';
```

---

## AC9. Negative — questions / hypotheticals

For each prompt below, NO row's memo should change.

- `삼성에서 보통 어떤 ML 프레임워크를 쓰나요?`  ← question
- `만약 삼성에 다시 들어간다면 ML 팀 갈 거 같아요.`  ← hypothetical
- `삼성에 ML 팀이 있을까요?`  ← speculation

**Verify SQL:** snapshot before, no diff after.

---

## AC10. 2000-char cap (head-preserving)

**Setup:** insert an existing memo of ~1990 chars on a target row (manually via Supabase Studio).

**Prompt:** a declarative that should add ~50 chars of `newInfo` to that row.

**Expected:**
- Resulting memo is exactly 2000 chars OR less.
- The HEAD of the original 1990-char memo is preserved verbatim.
- The TAIL of the appended `newInfo` may be clipped (head-preserving slice via `clampPromptText`).

**Verify SQL:**
```sql
select length(memo) as memo_len, memo from talent_experiences where id = '<ROW_ID>';
```

---

## AC11. Side-effect isolation

After any AC above, verify `createOpportunityDiscoveryRun` (or any opportunity-discovery jobs) was NOT triggered as a side effect of memo writes:

**Verify SQL:**
```sql
select run_id, status, created_at
from talent_opportunity_discovery_runs
where talent_id = '<USER_ID>'
order by created_at desc
limit 5;
```
No new run should appear within seconds of the memo update.

---

## AC12. Persistence into next turn's prompt context

**Sequence:**
1. Send AC1's prompt; verify memo updated.
2. Send a follow-up turn: `방금 그 ML 파이프라인 다시 설명해 주세요.`
3. Harper's reply should reference the just-added memo content (showing the new memo is in the next turn's `[Structured Talent Profile]` block).

This is a behavioral check, not a SQL check — observe the reply.

---

## AC13. RowId hallucination defense

**Setup:** find another talent user's row id (a UUID NOT belonging to the test user) — e.g., from a different `talent_id`'s row in `talent_experiences`.

**Manual injection (development only):** in the chat route logs, inject or simulate a tool call with `rowMemos.experiences = [{ rowId: '<OTHER_USERS_UUID>', newInfo: 'test' }]`. (Or use a curl + dev auth token to invoke the tool execute path directly.)

**Expected:**
- The other user's `talent_experiences` row is **NOT** updated. The `appendExperienceMemo` helper's `talent_id === userId` predicate filters it out and returns `{ ok: false, reason: "row_not_found" }`.

**Verify SQL:**
```sql
select id, talent_id, memo from talent_experiences where id = '<OTHER_USERS_UUID>';
```
The other user's memo column is unchanged.

---

## Extras-ambiguity case (Critic-flagged)

**Setup:** seed `talent_extras.content` with TWO items having identical `title = "Open Source Maintainer"` (this is a degenerate but possible state if the user duplicated entries).

**Prompt:** `Open Source Maintainer 일하면서 React PR 머지했어요.`

**Expected:**
- Neither item's memo changes (`appendExtraMemo` returns `ambiguous_title`).

**Verify SQL:**
```sql
select content from talent_extras where talent_id = '<USER_ID>';
```

---

## Cap-at-2000 head-preservation extra

Same as AC10, more aggressive: insert a 1995-char existing memo and add a 200-char newInfo. Verify `length(memo) = 2000` and the original 1995-char prefix is intact.

---

## Failure-mode log inspection (telemetry)

After running the suite, scan the dev server stdout for the structured log lines emitted by `executeTalentTool` when memos are updated. Confirm:
- `updatedRowMemos.experiences/educations/extras` arrays are populated only for AC1, AC4, AC5, AC8.
- `skippedRowMemos` includes `row_not_found` for AC2, no entries for AC3 (LLM should OMIT, not call the tool with bad rowIds).

If `skippedRowMemos` is heavily populated with `row_not_found` outside expected scenarios, the LLM is hallucinating rowIds and the prompt's RowID guidance needs strengthening.
