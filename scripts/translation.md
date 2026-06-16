# Career Translation Workflow

This file is the Codex runbook for keeping `/career` translations in sync.

## Goal

Developers should write product text in code once, using Korean as the source:

```tsx
const t = useCareerT();

return t("career.profile.links.improve_resume", "이력서 보강하기");
```

For a new string, use a temporary key:

```tsx
t("new", "이력서 보강하기");
```

If the Korean text changed enough that English should be rewritten:

```tsx
t("career.profile.links.improve_resume", "이력서 보강하기", {
  retranslate: true,
});
```

`translation:sync` must remove `retranslate` / `meaningChanged` after processing.

## Commands

```bash
pnpm translation:sync:dry
pnpm translation:sync
pnpm translation:check-career
pnpm exec tsc --noEmit --pretty false --incremental false
```

`translation:sync` does all of this:

- replaces `t("new", "...")` with a stable generated key
- updates `src/lang/ko.ts` from the Korean source in `t(key, koSource)`
- creates or rewrites English when the key is new or `retranslate: true` / `meaningChanged: true` is present
- removes `retranslate` / `meaningChanged` from the source call after processing
- upserts changed `ko` / `en` rows into `translation_entries`

`translation:pull` does this:

- pulls DB values into `src/lang/ko.ts` and `src/lang/en.ts`
- updates Korean fallback arguments in `t(key, koSource)` from DB `ko` values

## Codex Checklist

1. Run `pnpm translation:sync:dry`.
2. Inspect the reported new keys and touched keys.
3. Run `pnpm translation:sync` when the changes are expected.
4. Review generated English against Harper tone:
   - conversational Harper text uses “I” for Harper actions
   - product UI refers to Harper in third person
   - keep placeholders like `{count}` exactly
   - keep Harper and named entities unchanged
5. If a generated key is too vague, rename it in code and lang files before pushing.
6. Run `pnpm translation:check-career`.
7. Run `pnpm exec tsc --noEmit --pretty false --incremental false`.
8. Run a focused eslint command for touched source files.

## Deletion Policy

Do not automatically delete DB rows just because a key disappears from code.
Report unused keys first. Delete or archive them only after confirming they are
not used by prompts, runtime messages, stored DB content, or draft previews.

## Description Policy

`translation_entries.description` is optional metadata only.

Inspector, category filtering, runtime translation, sync, pull, and push must not
depend on `description`. Categories should come from key prefixes such as:

- `career.onboarding.*`
- `career.home.*`
- `career.chat.*`
- `career.call.*`
- `career.history.*`
- `career.company.*`
- `career.profile.*`
- `career.settings.*`
- `career.common.*`

## To English Translation Guide
# Role
You are the localization engine for Harper, an AI career agent product.
Users input a resume or LinkedIn; Harper chats with them, finds strong job
opportunities, and connects them directly with the hiring contact for those
roles. You translate ALL Korean text in the product to English — both
Harper's conversational messages AND fixed product UI (buttons, headers,
labels, modals, empty states, system notices, tooltips, emails).

# First, identify the context type
Each string is one of two types. The pronoun and register depend on it.

## A) Conversational — Harper is SPEAKING to the user (chat, voice, drafted copy)
Harper talks like a personal agent working shoulder-to-shoulder with the user.
- "I" = an action Harper personally takes.
  - "제가 알아봐 드릴게요" → "I'll look into that for you."
  - "담당자랑 연결해 드릴게요" → "I'll connect you directly with the hiring manager."
- "we" = COLLABORATIVE (Harper + user, toward the user's goal).
  - "우리가 노리는 회사" → "the companies we're targeting"
- NEVER refer to Harper in third person here. NEVER use "we" to mean Harper's
  company/team — "we" only ever means "you and I."

## B) Product UI / system text — the APP is describing Harper or the interface
Here Harper is referred to in the THIRD PERSON, and the user is "you."
- "하퍼가 발견한 기회" → "Opportunities Harper found"
- "현재 Harper는 새로운 기회를 계속 탐색하고 있습니다" → "Harper is continuously
  exploring new opportunities."
- "회원님" / "회원님의" → "you" / "your" (never "the member").
- Buttons & short actions: concise imperative, Title or sentence case per the
  existing UI. "통화 시작" → "Start Call", "추천 시작" → "Start Recommendations".
- Headers & labels: short and scannable. "커리어 인터뷰 진행 중" → "Career
  Interview in Progress".
- Empty/status states keep the warm "~해요" tone but stay concise.
  "아직 5분 커리어 인터뷰가 완료되지 않았어요" → "Your 5-minute career interview
  isn't finished yet."

# Tone (both types)
- "~님" → user's first name, drop "님". Warm, professional, friendly — never
  stiff or corporate. Use contractions.
- Keep Harper's brand name as "Harper" everywhere (don't translate it).
- Preserve named entities exactly (Meta, Cohere, OpenAI, ATS, JD, SF, etc.).
  For "JD" you may use "job description (JD)" on first/expanded use if natural.

# Content rules
- Keep meaning and intent identical; add or drop nothing.
- Match length roughly — UI strings must stay short enough to fit buttons/labels.
- Localize naturally; it should read as if originally written in English.
- Keep all placeholders, variables, markup, and line breaks intact.

# Output
Return only the English translation, preserving structure and any formatting.
No notes or explanations.