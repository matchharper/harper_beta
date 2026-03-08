# Harper 후보자 대화형 온보딩 설계안 (Voice-first, Low-Churn)

작성일: 2026-03-08  
범위: `harper_beta`의 `/talent`, `/career`, `src/app/api/talent/*`  
목표: 이력서/링크 외의 비정형 정보를 대화로 수집하고, 이탈률을 낮추며, 재방문 업데이트를 습관화

---

## 1) 문제 정의

현재 흐름은 `이력서 업로드 + 링크 입력 + 채팅`으로 시작되며, 오른쪽 패널은 진행률/이력서 중심입니다.  
하지만 실제 매칭 품질에 중요한 정보(이직 의향 강도, 선호 회사/문화, 연봉 기대치, 비선호 조건, 취미/동기 등)는 대화 중에 드러나고, 시간이 지나며 자주 바뀝니다.

핵심 과제:

1. 첫 온보딩에서 피로감 없이 핵심 정보를 빠르게 확보
2. 대화 중 알아낸 정보를 실시간 구조화(오른쪽 프로필 자동 갱신)
3. 나중에 돌아와 “변경사항만” 1~3분 내 업데이트 가능
4. 향후 회사-후보 매칭 피드백(`좋아요/몰라요/싫어요`)을 학습 데이터로 누적

---

## 2) 제품 원칙

1. Voice-first, text-always: 기본은 보이스, 언제든 텍스트 전환 가능
2. Progressive profiling: 한 번에 다 묻지 않고 가치가 큰 정보부터 순차 수집
3. Explainable memory: “왜 이 필드가 이렇게 채워졌는지” 출처(대화 턴) 표시
4. User control: inferred(추론) 정보는 확인/수정/삭제를 쉽게
5. Save-anytime: 중간 종료를 실패가 아닌 정상 흐름으로 설계

---

## 3) 목표 UX (ChatGPT형 메인 + 실시간 프로필 우측)

## 3.1 메인 레이아웃

- 좌/중앙(메인): ChatGPT형 타임라인 + 입력창(보이스/텍스트 토글)
- 우측(고정 패널): “프로필 라이브 카드”
- 모바일: 채팅 우선, 프로필 카드는 하단 시트/탭으로 전환

## 3.2 오른쪽 “프로필 라이브 카드” 구성

1. 기본: 이름, 핵심 직무, 경력 연차, 현재 상태(재직/구직), 업데이트 시각
2. 커리어 의도: 이직 의향 강도(0~100), 희망 시기, 동기
3. 선호 조건: 역할/레벨/산업/회사스테이지/근무형태/지역
4. 보상: 현재 범위, 희망 범위, 최소 수용치(민감정보 동의 후)
5. 제약/리스크: 비자, relocation, 인터뷰 가능 시간대, 금지 조건
6. 개인 맥락: 취미, 사이드프로젝트, 관심 기술(대화 친화 정보)
7. 신뢰도 배지: `확정` / `추론` / `충돌` / `오래됨`

## 3.3 실시간 갱신 방식

- 대화 턴이 저장될 때마다 `profileDelta`를 생성
- 우측 카드에 300~600ms 내 반영
- 신뢰도 낮은 항목은 “확인 필요” 칩 표시
- 충돌 시 “최근 답변 우선”이 아니라 사용자 확인 모달 제공

---

## 4) 온보딩 대화 플로우 (이탈 최소화)

## 4.1 단계형 플로우

1. Stage A (1분): 시작 가치 제시 + 최소 정보 3개
2. Stage B (2~4분): 희망 역할/레벨/회사 타입
3. Stage C (2~4분): 보상/근무형태/지역/제약
4. Stage D (1~3분): 동기/강점/차별점/취미(문화 핏 보조)
5. Stage E (1분): 요약 확인 + “지금 종료/계속” 선택

## 4.2 질문 정책

- 한 턴에 질문 1개 원칙
- 자유서술 + 빠른 선택칩 혼합
- 민감 질문은 신뢰 형성 이후로 지연
- 현재 정보가 충분하면 질문 대신 “요약/확인”으로 전환

질문 우선순위 스코어(간단 버전):

`priority = impact_on_matching * uncertainty / user_effort`

---

## 5) 이탈률을 낮추는 장치 (아이디어 뱅크)

1. `90초 가치 체감`: 시작 1분 내 “현재 프로필로 가능한 포지션 예시 2개” 즉시 제시
2. `2분 모드`: “짧게 끝내기” 버튼으로 핵심 필드만
3. `중간 저장 자동화`: 턴마다 autosave + 복귀 시 “이어서 하기”
4. `리리프 넛지`: 이미 구현된 “여기까지 해도 됩니다”를 동적 조건으로 확장
5. `무응답 처리`: 7~10초 무음 시 재질문 대신 선택지 칩 제시
6. `스킵 허용`: 답하기 불편한 질문은 스킵, 후순위 큐로 이동
7. `진행률 의미화`: 퍼센트가 아니라 “매칭 가능성 점수” 변화로 표현
8. `다음 행동 최소화`: 종료 직전 “30초만 더 하면 완료” CTA
9. `복귀 트리거`: 2주/4주 주기로 “프로필 최신화” 리마인드
10. `변경사항 전용 모드`: 재방문 시 전체가 아니라 “바뀐 것만 알려주세요”
11. `링크 자동 요약`: 새 링크 붙여넣으면 즉시 핵심 추출 후 확인 질문
12. `음성 피로 완화`: 보이스 중간에 텍스트 칩 입력 병행
13. `개인화 톤`: 후보자 직군별(연구/엔지니어/PM) 질문 톤 조정
14. `즉시 보상`: 완료 시 “현재 시장 포지션 브리프” 제공
15. `시간 존중`: 시작 전 예상 소요시간 명시(예: 5~8분)

---

## 6) 실시간 프로필 추출 엔진 설계 (핵심)

## 6.1 파이프라인

1. 사용자 메시지 저장 (`talent_messages`)
2. Extractor LLM 호출: 구조화 JSON 생성
3. Validator: 타입/범위/금칙 검증
4. Conflict resolver: 기존값과 충돌 여부 계산
5. DB upsert + `profileDelta` 반환
6. Supabase Realtime 또는 API 응답으로 UI 갱신

## 6.2 추출 JSON 예시

```json
{
  "facts": [
    {
      "key": "job_search_intent_level",
      "value": 78,
      "confidence": 0.86,
      "evidenceMessageId": 12345,
      "status": "inferred"
    },
    {
      "key": "preferred_company_stage",
      "value": ["series_b", "public"],
      "confidence": 0.91,
      "evidenceMessageId": 12345,
      "status": "confirmed"
    }
  ],
  "conflicts": [
    {
      "key": "salary_expectation_krw",
      "previous": "9000-11000",
      "proposed": "12000-14000"
    }
  ],
  "followUpQuestion": "연봉은 기본급 기준인지 총보상(TC) 기준인지 알려주실 수 있을까요?"
}
```

## 6.3 상태 모델

- `confirmed`: 사용자 명시 확인
- `inferred`: 모델 추론, 사용자 확인 전
- `conflict`: 기존값과 상충
- `stale`: 마지막 업데이트 이후 오래됨

---

## 7) 데이터 모델 제안 (현재 스키마 확장)

현재 테이블:

- `talent_users`
- `talent_conversations`
- `talent_messages`

추가 제안:

1. `talent_profile_facts`
  - `id`, `user_id`, `fact_key`, `fact_value_json`, `confidence`, `status`, `source_message_id`, `updated_at`
2. `talent_profile_snapshots`
  - 주기적 스냅샷(요약/이력 비교)
3. `talent_profile_change_events`
  - 변경 이력, 알림/분석용
4. `talent_match_feedback` (후속 매칭용)
  - `candidate_id`, `company_id`, `label(like/unknown/dislike)`, `reason`, `created_at`

추천 인덱스:

- `talent_profile_facts(user_id, fact_key)`
- `talent_match_feedback(candidate_id, created_at desc)`

---

## 8) API 설계 (현 코드 기준)

기존 라우트 재사용 + 최소 확장:

1. `POST /api/talent/chat`
  - 기존 응답에 `profileDelta`, `nextBestQuestion`, `confidenceAlerts` 추가
2. `GET /api/talent/session`
  - `profileSummary`, `profileCompleteness`, `staleFields` 추가
3. `POST /api/talent/profile/facts/confirm`
  - inferred/conflict 항목 확정
4. `POST /api/talent/profile/facts/update`
  - 우측 패널 직접 수정
5. `POST /api/talent/onboarding/refresh`
  - 재방문 “변경사항 모드” 시작

---

## 9) 프론트엔드 적용 포인트 (`harper_beta`)

## 9.1 컴포넌트

1. `[CareerProgressSidebar.tsx]`를 “진행 현황 / 내 이력서 / 라이브 프로필” 3탭으로 확장
2. `CareerProfileLiveCard.tsx` 신규
3. `ProfileFactRow.tsx` 신규 (`확정/추론/충돌` 배지 포함)
4. `ProfileChangeToast.tsx` 신규 (실시간 반영 피드백)

## 9.2 훅

1. `useCareerProfileFacts` 신규: facts 캐시/patch/apply
2. `useCareerChat`에서 `profileDelta` 반영
3. `useCareerOnboardingVoice`에 “무응답 fallback(선택칩)” 추가

## 9.3 상태

- `CareerFlowProvider` 컨텍스트에 `profileFacts`, `profileCompleteness`, `conflicts` 추가

---

## 10) Voice-first 구현 전략

## 10.1 단계별

1. Phase 1 (빠른 적용): 현재 브라우저 기반 음성 흐름 고도화
2. Phase 2 (권장): Realtime API + WebRTC로 저지연 음성 대화
3. Phase 3 (확장): SIP/전화 진입(선택)

## 10.2 필수 기능

1. 바지인(barge-in): AI 발화 중 사용자 발화로 끊기
2. 노이즈/무음 처리: no-speech timeout + 재질문 전략
3. 연결 품질 fallback: 음성 실패 시 즉시 텍스트 전환
4. 민감 정보 구간: 음성 입력 전 확인 한 번 더

---

## 11) 재방문 업데이트 UX (핵심)

재방문 시 첫 화면:

- “지난 방문 이후 바뀐 점만 알려주세요 (1~2분)” CTA
- 빠른 칩:
  - 회사/직무 변경
  - 이직 의향 변화
  - 연봉 기대 변화
  - 근무지/리모트 선호 변화
  - 인터뷰 가능 시기 변화

결과:

- 업데이트 diff를 우측 카드에 즉시 반영
- “현재 매칭 준비도” 재계산

---

## 12) 향후 매칭 로직 설계 (나중 구현용)

요청하신 정책 반영:

1. 회사가 원하는 인재 조건 입력
2. Harper가 후보 랭킹 산출
3. 회사/후보 양쪽에 제안
4. 후보 피드백: `좋아요 / 몰라요 / 싫어요`
5. 좋아요면 회사 측에 긍정 신호 전달 가능
6. 단, “최초 제안 여부/연결 여부 최종 결정은 회사”

추천 구현 순서:

1. 규칙 기반 점수(초기): 스킬/경력/조건 충족도
2. 피드백 누적: `talent_match_feedback`
3. 랭킹 고도화: pairwise ranking(BPR) + contextual bandit 탐색

---

## 13) 측정 지표 (온보딩 + 매칭 준비도)

온보딩 KPI:

1. `Start -> 첫 답변` 전환율
2. `Start -> Match-ready(핵심 필드 충족)` 완료율
3. 단계별 이탈률(Stage A~E)
4. 보이스 세션 지속시간/전환률(voice->text)
5. 재방문율(7일/30일), 업데이트 수행률

데이터 품질 KPI:

1. 프로필 완성도(필수 필드 충족률)
2. 충돌 필드 비율
3. inferred 대비 confirmed 전환률
4. 최신성(stale 필드 비중)

---

## 14) 롤아웃 계획

1. Week 1
  - `profileDelta` 스키마/응답 추가
  - 우측 라이브 카드 UI 추가(읽기 전용)
2. Week 2
  - 추론/확정/충돌 상태 반영
  - 재방문 “변경사항 모드” 추가
3. Week 3
  - 보이스 무응답 fallback, 빠른 선택칩
  - 지표 대시보드(이탈/완성도)
4. Week 4+
  - 매칭 피드백 수집 테이블 선반영
  - 추천 랭킹 실험 베이스라인 구축

---

## 15) 리스크와 가드레일

1. 민감정보 과수집: 질문 최소화 + 명시 동의 + 삭제 가능
2. 추론 오판: low-confidence는 자동 확정 금지
3. 음성 인식 오류: 중요 수치(연봉/날짜)는 재확인 질문 강제
4. 실시간 부하: Postgres Changes 남용 시 Broadcast 패턴 고려
5. 법/정책 리스크: AI임을 명확히 고지, 연령/민감정보 처리정책 분리

---

## 16) 실행 우선순위 (실무용 TL;DR)

1. `chat 응답에 profileDelta 포함`부터 시작
2. `우측 라이브 프로필 카드`로 즉시 가치 체감 제공
3. `변경사항 모드`로 재방문 비용 최소화
4. `like/unknown/dislike` 피드백 저장 스키마를 지금 깔아두기

---

## 17) 참고 레퍼런스

1. OpenAI Realtime API: https://developers.openai.com/api/docs/guides/realtime  
2. OpenAI Realtime API with WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc  
3. Supabase Realtime Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes  
4. MDN `getUserMedia` permissions/security: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia  
5. Google Cloud Voice Agent Design Best Practices: https://docs.cloud.google.com/dialogflow/cx/docs/concept/voice-agent-design  
6. Google Cloud Agent Design Best Practices: https://docs.cloud.google.com/dialogflow/cx/docs/concept/agent-design  
7. BPR (implicit feedback ranking): https://arxiv.org/abs/1205.2618  
8. Contextual Bandit for recommendation: https://arxiv.org/abs/1003.0146  
9. HEART framework overview (Kerry Rodden): https://kerryrodden.com/heart/  
10. FTC AI Companion 6(b) order (risk/data governance 참고): https://www.ftc.gov/system/files/ftc_gov/pdf/AICompanionChatbot6%28b%29Order.pdf

