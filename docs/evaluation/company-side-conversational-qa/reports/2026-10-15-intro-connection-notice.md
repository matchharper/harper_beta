# Intro 수락·연결 안내 수정 — 2026-10-15

로컬 구현·검증이며 운영 DB 적용, 배포, Slack/메일 발송은 하지 않았다.

## 변경

- 기존 회사가 직접 수락한 시스템 안내는 후보자가 회사 Intro를 수락해 연결되는 경로에서 제외한다(앞선 요청의 로컬 변경).
- 후보자의 수락 이력과 내부 수락 알림은 수락 시점에 유지한다. 회사용 company_update는 연결 완료 전이에서 생성한다.
- 새 migration `20261015125604_company_intro_connection_update.sql`은 기존 trigger 함수만 교체한다. 기존 enqueue의 권한·멱등성과 호환 runtime 보류를 유지하고 새로운 제약/테이블을 만들지 않는다.
- 이전 요청/제안 발송 시점, 후보자 결정, 연결 완료 시각, 해당 추천·역할·회사에 기록된 소개 이메일 영수증의 존재를 전달한다. 메일 발송은 상태값으로 추론하지 않는다.
- 사건 목적의 미팅·채용 면책을 없애고 이전 Intro의 대상·역할·시점과 완료 결과를 설명하도록 했다. 공통 event prompt에서도 알림 미전달 여부를 답변 주제로 유도하던 문장을 제거했다. 고정 성공 문구나 출력 교정은 추가하지 않았다.
- 기존 로컬 링크 수정(`markdownToSlackMrkdwn`의 native HTTP 링크 보존)을 그대로 사용했다. 이번 작업에서 해당 수정의 소유권을 주장하거나 덮어쓰지 않았다.

## 검증

- `node scripts/testIntroConnectionCompanyUpdate.mjs`: 실제 trigger와 enqueue RPC를 PGlite 최소 schema에서 실행했다. 수락 이력 즉시 기록, 연결 완료 전 회사 알림 0건, 완료 후 1건, 재시도 중복 방지, 정확한 대상/시각/메일 영수증, 영수증 없는 상태의 비추론, 거절 경로 보존, authenticated 직접 실행 차단을 확인했다. 최초 시간 문자열 비교는 로컬 PostgreSQL timezone 차이로 실패했고 동일 instant를 비교하도록 테스트를 수정했다.
- companyUpdate, slackTalentLinks, slackTalentReviewView, slackTextChunks의 관련 테스트 32/32 통과.
- `intro-connected-v32-r1`: 합성 2건 모두 실행했으나 이전 제안 날짜가 빠져 요청된 맥락 기준은 미통과. 이전 입력/결과 보존.
- `intro-connected-v33-r1`: 새 동결 목적/동일 사실로 실제 Gemini 3.8 Flash/OpenRouter, medium, temperature 0.5. 두 건 모두 각 completion 1회, 19.4초/12.5초. 2/2 원문 의미·사실·자연스러움 검토 통과. 이전 제안 날짜, 정확한 역할·후보자, 수락과 완료된 소개를 안내했고 미승인 효과 0건. 모델 기본값 변경 없음.
- 두 최종 원문을 실제 `markdownToSlackMrkdwn` → `renderSlackOrgLinks`에 통과시켰다. 각 2개 링크의 대상 UUID/query, Slack angle-link 유지, escaped-link/raw marker 잔존 없음을 확인했다. 렌더 결과는 owner-only run에 저장했다.

## 한계와 적용

작은 합성 작성 예시이며 운영 채널 전송·클라이언트 화면 E2E나 독립 팀원 검토는 아니다. 모델 원문/provider 캡처·source snapshot·렌더 결과는 ignored runs 0700/0600에 있다. 웹 변경과 새 DB 함수는 함께 반영해야 한다. 이미 생성된 과거 사건은 이 migration이 재작성/재발송하지 않는다. 운영 적용 때 기존 보류 사건은 실제 전달 증거를 확인해 별도로 판단한다.

## 가벼운 문체 조정

사용자 후속 요청으로 공통 문체 원본 `uxWritingPrompt.ts`에 소개·연결은 사람 중심의 결과로 설명하고 전달 수단의 구조는 필요할 때만 설명한다는 한 줄을 추가했다. 고정 성공 문장을 강제하지 않았다. 같은 frozen v33의 backend 1건을 `intro-connected-v33-r2-tone`으로 재실행했다. 실제 Gemini completion 1회(22.2초)에서 이전 제안 날짜·역할·후보자와 두 사람을 서로 소개하고 연결한 결과가 자연스럽게 나왔고 도구 효과는 없었다. 선택 1건의 문체 확인이며 전체 재평가/배포는 아니다.
