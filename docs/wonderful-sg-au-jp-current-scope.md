# Wonderful SG/JP/AU Current Scope

작성일: 2026-06-27

## 최종 범위

Singapore, Japan, Australia 유저에게 남기는 제품 차이는 두 가지뿐이다.

1. onboarding insight checklist가 일부 달라진다.
2. worker internal fit 계산 대상 role이 국가별 Wonderful role로 제한된다.

별도 product mode, 별도 prompt, 별도 tool policy, 별도 UI copy는 사용하지 않는다.

## Default User Invariant

한국 유저를 포함한 SG/JP/AU 외 유저에게는 제품상 전달되거나 체감되는 변화가 없어야 한다.

- 기존 career prompt source를 그대로 사용한다.
- `prompts_sg_au_jp.ts`는 삭제되어야 하며 import되어서는 안 된다.
- 답변 언어를 English로 강제하지 않는다.
- chat, voice, email tool set을 SG/JP/AU 때문에 줄이지 않는다.
- Home Panel과 mobile Home 버튼/문구를 바꾸지 않는다.
- external/public job posting recommendation을 막지 않는다.
- default onboarding checklist에 SG/JP/AU 전용 질문을 섞지 않는다.
- 한국/default 유저는 SG/JP/AU Wonderful FDE/Field CTO role과 fit 계산하지 않는다.
- 한국/default 유저의 기존 internal role pool은 유지한다.

## Checklist Behavior

구현 위치:

- `src/lib/talentOnboarding/insightChecklist.ts`

대상 판별:

- `location`의 normalized token을 먼저 보고, 값이 없을 때만 `current_location`/`currentLocation`을 fallback으로 본다.
- `singapore`, `japan`, `australia`만 target으로 본다.
- `sg`, `jp`, `au` 같은 code-only token은 target으로 보지 않는다.
- substring match를 하지 않는다.

SG/JP/AU checklist에서 기존 default checklist 대비 빠지는 항목:

- `deal_breakers`
- `team_style_fit`
- `additional_question_two`

SG/JP/AU checklist에서 유지되는 주요 항목:

- `search_intensity`
- `location`
- `language`
- `next_scope`
- `compensation`
- `must_haves`
- `additional_question_one`
- `final_priority_confirmation`

SG/JP/AU checklist에 추가되는 항목:

- `current_or_recent_work_detail`

Singapore/Australia checklist에만 추가되는 항목:

- `permanent_residency`

Japan checklist에는 `permanent_residency`가 없다.

Required country-specific question:

- Singapore/Australia: `permanent_residency`
- Japan: none

## Worker Internal Fit Scope

구현 위치:

- `harper_worker/opp/utils/internal_fit.py`
- `harper_worker/opp/new_harper_agent.py`
- `harper_worker/opp/agentic/current_state.py`

국가별 fit 계산 대상:

| User current location | Fit 계산 대상 |
| --- | --- |
| Singapore | Singapore Wonderful FDE, Singapore Wonderful Field CTO |
| Japan | Japan Wonderful FDE, Japan Wonderful Field CTO |
| Australia | Australia Wonderful FDE, Australia Wonderful Field CTO |
| 그 외 국가 | 위 6개 country-scoped Wonderful role 제외, 기존 internal role pool 유지 |

Country-scoped Wonderful role ids:

| Country | Forward Deployed Engineer | Field CTO |
| --- | --- | --- |
| SG | `55b555be-c8d6-4ada-a0c3-b093939a1239` | `72d7d9be-952e-4efa-a77c-8c86c722d664` |
| JP | `eefc766c-d55a-4c6e-835c-3822b4b5ff56` | `f9c79377-53a3-4128-93d2-981f7115a368` |
| AU | `0844b56e-ed3d-4051-ae0d-22abbf1c9ed2` | `6e6cd791-c7a1-450e-b974-cf4a07ee6da7` |

Worker scope가 적용되는 fetch:

- `fetch_unevaluated_internal_role_cards`
- `fetch_answered_hold_fit_rows`
- `fetch_recommendable_internal_fit_cards`
- `fetch_internal_fit_information_requests`

## Removed Scope

아래는 의도적으로 구현하지 않는다.

- `wonderful_fde_intake` product mode
- SG/JP/AU 전용 career prompt
- SG/JP/AU 전용 English-only locale override
- SG/JP/AU 전용 tool allowlist/blocklist
- Home Panel의 open-position recommendation button 숨김
- external recommendation 안내/실행 차단
- SG/JP/AU 전용 UI copy

삭제/정리된 코드:

- `src/lib/career/prompts_sg_au_jp.ts`
- legacy SG/AU code-only `permanent_residency` checklist branch
- previous FDE-specific checklist keys:
  - `fde_current_base_and_authorization`
  - `fde_prior_process_history`
  - `fde_customer_technical_delivery`

## Verification

확인해야 하는 조건:

- code paths에서 deleted SG/JP/AU product-mode/prompt/table names가 검색되지 않는다.
- Singapore/Australia/Japan만 country-scoped checklist를 받는다.
- Korea/US/code-only `SG`, `JP`, `AU`는 default checklist를 받는다.
- Singapore/Australia checklist에는 `permanent_residency`가 있고 required key로 잡힌다.
- Japan checklist에는 `permanent_residency`가 없다.
- SG/JP/AU checklist에는 `deal_breakers`, `team_style_fit`, `additional_question_two`가 없다.
- worker `tests.test_internal_fit`가 통과한다.
- TypeScript compile이 통과한다.
