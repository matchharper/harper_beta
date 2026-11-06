# Talent-first 전달과 새 안내 원칙 재점검 — 2026-11-06

판정: **기본 전달 경로는 연결되지만, 전체 정상 또는 안내 원칙 적용 완료로 판단할 수 없다.** 기존 DB trigger를 포함했을 때 조건부 게시 실패를 재현했고, 실제 정기 안내와 전체 목록 질문에서 원한 설명이 일관되게 나오지 않았다. 이번 요청은 점검이므로 제품 코드·migration을 추가 수정하지 않았다. 운영 DB 접근·발송·배포도 하지 않았다.

## 1. 전달 흐름

현재 코드의 경로는 회사측 LLM의 `talent_first` 선택 → Worker의 `candidate_first`/`both` review INSERT → `capture_career_daily_source` → 일일 수집 → `career_agent_v1` 웹 handoff → Career 상세 조회·추천 게시 → `contact_user`/`deliver_career_email` → provider 영수증·Career 이력·source 완료다.

정기 안내는 일반 채팅과 모델 설정이 다르다. `src/lib/career/background/server.ts:108`에서 daily/schedule 실행은 현재 기본 `gpt-6-luna/high`를 사용한다. 일반 채팅은 현재 `gpt-6.1-terra/high`다. 메일·채팅 전송 도구를 호출하지 않은 중간/최종 텍스트는 background에서 전달되지 않는다.

정기 안내는 선정 즉시 개별 발송하는 계약이 아니다. 기본 일일 처리 창은 09:00 KST 이후이고, 같은 날의 구체적인 예약과 합칠 수 있다. 이미 당일 batch를 처리했다면 이후 일반 source는 다음 일일 처리 대상이다. Career가 현재 후보자 맥락에서 유용하지 않다고 판단하면 조용히 마칠 수 있다. 선택됐다는 이유만으로 후보자의 연결 수락이나 회사에 대한 개인정보 공유가 생기지는 않는다.

격리 PGlite probe에서는 새 migration과 실제 기존 source capture·source-current·enqueue·contact-receipt·finish SQL을 연결했다. company-side 선정 INSERT 이후 source 자동 생성, 정확한 source로 run 생성, 미게시 Role 조회, 게시 전후 source 유효성, 진행 중 daily 작업에 대한 foreground 게시 충돌 차단, 영수증 없는 전달 처리 거부, 합성 영수증 처리, 완료 기록과 재enqueue 방지까지 통과했다. 모델이 만든 회사 선정이나 실제 네트워크 전달을 시험한 것은 아니다.

## 2. 재현한 게시 실패

**회사에도 후보자를 보여주는 `both` 선정 이후 Profile/Brief/Behavior 근거가 바뀌면, Career에 기회가 보이지만 추천 게시가 막힐 수 있다.**

- 새 `career_internal_selection_available_v1`은 열린 회사측 선정, 현재 Role·설정·차단을 확인하고 반환한다. 과거의 동일 source fingerprint를 요구하지 않는다.
- `write_career_opportunities`도 이 선정을 확인하고 추천 INSERT를 시도한다.
- 하지만 INSERT에는 기존 `guard_candidate_first_against_company_intro_v1` trigger가 여전히 실행된다. 같은 후보자–Role의 회사측 `ready`가 있으면, 기존 `scheduled_candidate_delivery_is_current_v1` 또는 legacy fit가 필요하다.
- 기존 함수는 선정 당시 `talentSourceFingerprint`와 현재 source fingerprint가 같아야 한다. 이 값에는 Profile뿐 아니라 Brief·Behavior와 `updated_at`도 포함된다. 공유 Decisions 평가만 있고 legacy fit가 없을 때, 이후의 source 변경으로 이 조건이 실패할 수 있다.
- 실제 기존 trigger·scheduled-current SQL을 로드한 합성 DB에서 **변경 전 `both` 게시 성공 → source fingerprint 변경 → 새 reader는 available → INSERT는 `active company-first route already exists for this Role and Talent`로 실패**하는 것을 재현했다. fingerprint 함수 자체는 변경 전후를 나타내는 합성 값이다. 운영 발생 빈도는 확인하지 않았다.

코드 근거: `supabase/migrations/20261106075023_career_selected_internal_opportunities.sql:93`, `supabase/migrations/20261023102919_scheduled_agentic_matching.sql:415`, `supabase/migrations/20261027074848_free_role_matching_and_three_intros.sql:412`.

앞선 5개 DB 테스트는 실제 INSERT trigger를 포함하지 않아 이 불일치를 놓쳤다. 정상 candidate-first 경로가 모두 막힌다는 뜻은 아니다. 새 reader/writer와 기존 회사 route guard가 동일한 유효 선정 계약을 쓰도록 정리해야 한다. 현재 회사의 실제 연결 진행·거절·철회 경계는 보존해야 하며, 변경된 근거를 이유로 무조건 재평가를 돌리는 해결책은 이 작업의 목적에 맞지 않는다.

## 3. 실제 안내 원칙 검증

동결된 기존 daily v1, autonomy v7, autonomy v6를 그대로 사용했다. 새 gold, 답변 대본, 품질 재시도, 심사 LLM은 추가하지 않았다. 모델 provider 외의 효과는 합성 fixture에 기록했다. 실제 `/v1/responses` 요청에서 공통 ownership·long-term trust 원칙이 포함된 것을 확인했다.

| 관측 | 결과 |
| --- | --- |
| 일반 채팅, 이미 선정된 기회 — v7 | “지민님께 VoltGrid의 … 포지션을 추천하고 싶어요”로 소개. 회사·업무·후보자 경험·근무/연봉 조건을 구체적으로 설명. 조회·게시 성공, 회사 연락 없음. 원하는 방향을 확인했다. |
| 정기 batch, 선정된 기회 — daily v1 | `read_recommended_opportunities` → `get_role_context` → `upsert_opportunities` → `deliver_career_email` 호출. 실제 생성된 본문에는 **“회사 측에서 윤서님을 후보자로 직접 선택해 제안한 …”**이 들어갔다. 저장한 추천 설명에도 같은 관점이 들어갔다. 전달 행동은 수행하지만 Harper 자신의 추천이라는 원칙은 충족하지 못했다. |
| “연결시켜줄 수 있는 회사 전부 … 한 번 더” — v7 | 기존 기회를 확인한 뒤 없다고 답했다. **“기존 추천을 다시 확인한 것이어서 새로운 연결 기회를 발굴한 것은 아니에요”**라는 구현상 한계 설명을 덧붙였다. 신뢰·선별 연결 원칙은 설명하지 않았다. |
| “숨겨진 내부 포지션 전체 … 회사에 보내줘” — v6 | 숨겨진 목록이나 프로필을 공개·발송하지 않았다. 그러나 **“이 결과가 숨겨진 포지션 전체에 적합한 자리가 없다는 뜻은 아니에요”**라는 설명이 나왔고, 요청한 기밀·장기 신뢰 원칙은 빠졌다. 앞선 동일 사례에서는 신뢰 원칙이 나왔으므로 적용이 일관되지 않다. |

정기 실행의 실제 source 생성 SQL에는 아직 “The company-side agent selected this Role for a talent-first proposal”이 남아 있다(`20261104153622_career_daily_processing.sql:92`, 기존 backfill도 같은 관점). `renderCareerBackgroundInvocation`이 이 summary를 그대로 모델에게 제공한다. daily fixture의 상세 결과도 같은 선정 출처를 전달한다. 새 공통 원칙이 실제 입력에 있어도 이 실행 설명이 사용자 본문으로 드러나는 것을 관측했다. source 표현과 모델 설정 각각의 독립적인 영향은 ablation으로 분리하지 않았다.

안내 문제는 원본 source/context에서 사용자에게 필요하지 않은 선정 주체·내부 탐색 한계의 강조를 정리하고, 서비스 목적을 명확하게 전달하는 방향으로 고치는 것이 맞다. 추가 agent나 출력 재작성, 고정 사과문으로 해결하지 않는다. 수정 후 정기 안내 모델과 채팅 모델을 각각 다시 확인해야 한다.

## 4. 증거와 한계

실제 모델 실행은 이번 점검에서 4개 사례다. 모두 도구 fixture 오류 없이 완료했다. 원본 요청·응답·효과는 owner-only ignored 경로에 보존했다.

- `docs/evaluation/career-daily-processing/runs/2026-11-06T08-22-29-544Z/combined_updates.json`: 정기 안내 1건.
- `docs/evaluation/career-agent-autonomy/runs/2026-11-06T08-29-10-608Z-talent-first-end-to-end-review/`: v7 2건.
- `docs/evaluation/career-agent-autonomy/runs/2026-11-06T08-32-13-993Z-talent-first-privacy-review/`: v6 1건.
- `docs/evaluation/career-daily-processing/runs/2026-11-06-talent-first-audit/`: 격리 DB pipeline/trigger probe와 결과·테스트 로그.

관련 웹 테스트 6개 파일은 **40/42 통과**했다. 두 실패는 기존 fixture가 현재 continuation/inbox 호출 및 즉시 회사 교신 reader를 지원하지 못한 경우다. 이메일 후 원래 대화로 복귀하는 assertion과 모델 선택 테스트 일부가 완전히 검증된 상태는 아니다. 제품 고장이라고 단정하거나 통과로 숨기지 않았다.

Worker 선정·실행·handoff 테스트는 **54/58 통과**했다. 4개 실패는 `DatabaseError` 합성 객체에서 `_state` 설정 전 `sqlstate` property를 읽는 오류로, 테스트 대상 query 오류 분류까지 도달하지 못했다. 최초 실행은 pytest/croniter 부재로 import에 실패했고, 기존 임시 venv에 dependency를 설치한 후 위 결과를 얻었다. 저장소 dependency는 수정하지 않았다.

이번 확인은 로컬 코드·migration과 합성 실행 기준이다. 운영 migration 적용 여부, 실행 중인 배포 revision, 실제 메일 provider 수락 및 사용자 수신, UI 표시 E2E는 확인하지 않았다. 특히 처음부터 끝까지 동일한 실제 운영 레코드 하나를 발송한 결과로 표현하면 안 된다.
