# 연결 전 후보자 이메일 입력 제외 — 로컬 검증

문서 기준: 2026-10-21. 운영 배포·DB 변경·실제 연락은 하지 않았다.

## 변경

- `candidateEmailPrivacy.ts`: 단계가 확인된 목록·상세·일괄 조회·연결 준비 결과에서 후보자 주소를 형식화 전에 제외한다. 이름의 이메일 fallback과 같은 결과 안의 본문·프로필에 복제된 주소도 함께 제외한다.
- 공통 completion은 조직 범위의 현재 등록 주소와 기존 단계 계산을 이용해 과거 대화·연락 본문·도구 진단 등의 주소를 전송 직전에 제외한다. 일반 웹/Slack/회사 이메일 답장, 최종 도구 없는 응답, 회사 사건 작성과 회사 연결 안내 이메일에 조직 범위를 전달한다.
- `pending_connection`, `company_intro`, `intro_requested`가 대상이다. 여러 Role에 걸친 경우 더 제한적인 위치를 우선한다. 연결된 후보자만 있는 경우와 회사 팀원 주소는 유지한다. 프로필 열람과 주소 공개를 분리한다.
- DB 조회 실패 또는 단계 의존 데이터의 불완전함은 모델 호출을 중단한다. 주소 조회는 읽기 전용이며 발송 executor, 원본 이메일과 회사 대화를 변경하지 않는다.

## 구조·전송 경계 검증

신규 9개와 기존 결과 직렬화·회사 연결 이메일 검사를 합쳐 80개 통과했다.

```sh
NEXT_PUBLIC_SUPABASE_URL=https://privacy-test.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=test-only OPENAI_API_KEY=test-only TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx --test --test-reporter=dot src/lib/org/agent/candidateEmailPrivacy.test.ts src/lib/org/agent/candidateEmailPrivacy.server.test.ts src/lib/org/agent/promptFormat.test.ts src/lib/email/companyConnectionDelivery.test.ts
```

실제 공통 completion 및 Supabase client를 실행하고 HTTP transport만 합성 데이터로 대체했다.
모델 요청의 후보자 주소 제외(한국어 조사·key=value 인접 표기 포함), 회사/연결된 후보자 주소 보존, 원본 불변, 조회 실패 시 provider 호출 0건,
조직 분리·Intro 응답 대기·현재 tag 기반 단계 판정을 확인했다. 실제 운영 DB/메일/Slack E2E는 아니다.
최종 `tsc --noEmit --pretty false --incremental false` 통과.

함께 확인한 기존 검사에는 별도 변경의 불일치 3건이 있었다. `contactsPrivacy.test.ts`의 mock에
`company_workspace` 조회가 없으며, `tools.test.ts`의 기대 schema에는 이미 추가된
`candidateConsentRelayId`와 `openProfile`이 없다. 이 검사는 수정하지 않았으며 전체 suite 통과로 주장하지 않는다.

## 고정 대화 선택 재실행

- frozen v11의 `CSCQ1113-accept_web`, `CSCQ1113-intro_slack`만 재실행했다. 입력/gold/manifest는 변경하지 않았다.
- canonical runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v11 --case=CSCQ1113-accept_web,CSCQ1113-intro_slack --run=20261021-candidate-email-privacy-v11-r2`.
- 기존 실제 model loop·formatter와 Gemini 3.8 Flash/OpenRouter 기본 설정을 사용했다. DB/상태 변경은 기존 합성 adapter이며, 개인정보 조회도 frozen 후보자의 단계/주소를 사용한다. 실제 설정과 source fingerprint는 run manifest에 보존했다.
- 2대화·4발화 완료. 전체 응답과 효과를 직접 읽어 연결 수락의 확인→연결됨, 회사 Intro의 확인→응답 대기를 확인했다. 회사 수신자를 유지하고 후보자의 주소를 재입력하도록 요구하지 않았다. 선택한 두 대화의 기대 의미는 2/2이다.
- 최초 r1도 같은 두 대화를 완료했고 보존했다. r2의 마지막 provider 응답 한 건은 약 63초 걸렸으나 timeout 없이 완료했다. 이후 key=value 인접 주소 보완은 구조 검사로 재확인했다.
- 원문·provider 응답·trace·source snapshot은 ignored `runs/20261021-candidate-email-privacy-v11-r2/`에 owner-only로 보존한다. 운영 개인정보는 사용하지 않았다.

고정 대화는 일반 연결/Intro 행동의 회귀 확인이며 이메일 노출 공격 세트가 아니다. 주소 제외의 근거는
별도 구조·HTTP 전송 경계 검사다. 현재 등록된 후보자 주소에 대한 텍스트 입력 경계이며,
이미지 픽셀의 주소·등록되지 않은 다른 주소를 의미적으로 탐지하는 기능은 추가하지 않았다.
과거에 모델로 전송된 데이터의 회수, 전체 대화 품질, 실제 배포본 및 운영 전달 검증은 범위 밖이다.
