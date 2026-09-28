# 정기 후보 검색 설정 검증 — 2026-09-28

## 후속 운영 DB 적용

사용자의 별도 요청으로 2026-09-28 운영 DB에 migration
`20260928024416_company_first_search_setting_without_intro_side_effects`를 적용했다.
기존 제안 종료 trigger와 함수가 제거됐고 수정한 함수 6개의 전체 정의가 사전 계산한 결과와
일치한다. service-only 실행 권한과 search_path가 유지됐으며 boolean true/false 허용과
잘못된 타입 거절을 실제 DB에서 검증했다. 기존 Role·제안·추천 데이터는 수정하지 않았다.
앱 코드 배포는 수행하지 않았으므로 채팅 도구 확장과 웹 카드 조회 변경은 아직 배포 전이다.
아래 내용은 migration 적용 전의 코드·격리 DB·모델 검증 기록이다.

## 변경 계약

웹 채팅과 Slack의 company-side LLM이 기존 `update_data`에서
`role_is_company_first_search`를 boolean으로 변경하고 `read_role`로 조회한다.
명시적인 설정 변경은 추가 승인 없이 반영하며, Role 상태나 `is_auto`를 바꾸거나
즉시 검색을 시작하지 않는다. 별도로 요청한 일회성 검색은 기존 도구를 유지한다.

검색을 끌 때 기존 제안을 종료하던 trigger와 기존 카드·제안 요청·후보자 수락·Slack
outbox의 검색 설정 조건을 제거한다. Role 종료·만료, workspace 권한, 후보자 privacy,
test-only 격리 조건은 유지한다. 운영 DB migration 적용과 배포는 수행하지 않았다.

## 모델 행동 평가

입력은 실행 전 동결한 [v9](../cases-v9.json), [gold](../gold-v9.md),
[manifest](../manifest-v9.json)다. 기존 v8 입력과 판정은 보존했다.
실제 production tool loop와 `google/gemini-3.8-flash` / OpenRouter /
temperature 0.5 / reasoning medium을 사용하고, 도구 효과만 합성 adapter로 실행했다.
원문과 source snapshot은 ignored `runs/<run-id>/`에 owner-only로 보존한다.

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts \
  --dataset=v9 --case=CSCQ911,CSCQ910-new_search --copy=real --run=<new-run-id>
```

| Run | 실행 결과 | 판정 |
| --- | --- | --- |
| `20260928-periodic-search-setting-r1` | 3변형 / 7발화 완료 | 양쪽 surface에서 끄기·조회·켜기와 별도 검색 도구 선택 확인. 합성 reader가 Role 상태의 내부 enum을 반환하는 harness 차이를 발견했다. |
| `20260928-periodic-search-setting-r2` | 2변형 완료, Slack 2/3발화 완료 | 합성 reader를 실제 reader와 동일한 humanized 값으로 교정. 웹 3발화·별도 검색 1발화 통과. Slack의 켜기 도구는 성공했지만 마지막 답변이 turn timeout으로 미완료다. |
| `20260928-periodic-search-setting-r3` | Slack 1변형 / 3발화 완료 | 같은 frozen Slack 입력을 한 번 재시험했다. 끄기·조회·켜기 모두 의미·권한 통과, critical 0. |

r2 원문을 전체 대화로 검토했다. 정기 검색을 꺼도 기존 후보와 채용 상태가 유지된다고
설명하고 조회는 현재의 꺼짐 상태를 답한다. 켜기는 해당 flag만 변경하며 불필요한 승인,
Role 상태 변경, 후보자 연락, 즉시 검색 호출은 없었다. 별도 검색 요청은 기존
`request_matching_search`를 사용했다. r2 Slack timeout을 성공으로 집계하지 않는다.
r3의 전체 사용자 발화·답변·도구 효과도 검토했다. `false`→조회→`true`만 수행하고
기존 후보 유지와 정기 검색 재개를 자연어로 설명했다. r2 웹/일회성 검색과 r3 Slack을
합쳐 선택 3변형·7발화의 기능 계약을 확인했으며 최초 실행 100% 성공률을 주장하지 않는다.
재시험 명령은 위 명령에서 `--case=CSCQ911-slack`과 새 run ID를 사용했다.

## 코드와 DB 검증

- 관련 단위 회귀 112/112 통과: boolean false 보존, 문자열·숫자·null 거절, Role scope,
  동일 값 no-op, 현재값 snapshot, 조회 표현, 카드 availability와 기존 lifecycle/fixture 경계.
- `scripts/testCompanyFirstSearchSetting.mjs`: 읽기 전용으로 캡처한 함수 정의를 격리
  PGlite PostgreSQL에 복원하고 실제 새 migration을 적용했다. 기존 종료 버그를 재현한 뒤
  rollback하고, 수정 후 모든 intro 상태와 기존 recommendation 행의 불변을 검증했다.
- chat/slack 공통 RPC의 true/false 변경, 권한·타입·누락 행·중복 거절, mixed-batch conflict와
  원자성, 직접 Ops UPDATE의 기존 행 보존을 검증했다. 설정을 꺼둔 기존 ready의 제안 요청과
  전달된 요청의 후보자 수락을 실제 RPC body로 검증했고 privacy와 종료 Role 거절도 유지됐다.
- 기존 함수의 service-only 권한을 유지하고 설정 변경만으로 검색 run을 enqueue하지 않는다.
  outbox 함수에서 flag 조건 제거를 확인했으며 실제 Slack 발송은 수행하지 않았다.
- `git diff --check`, 새 DB 검증 script의 syntax check, frozen 입력 hash 검증 통과.
- 전체 `tsc --noEmit`은 기존 `.next`의 없는 network 페이지 참조, private 검증 script의
  Supabase RPC 타입, `growthTalentGtmReport.test.ts` 오류로 실패한다. 이번 변경 파일의
  타입 오류는 남지 않았다.

격리 DB 검증 명령:

```sh
PGLITE_MODULE_PATH=<installed-pglite-module> node scripts/testCompanyFirstSearchSetting.mjs \
  docs/evaluation/company-talent-contacts/private/schema-and-identities-v2.json \
  .local/company-first-setting/live-functions.json
```

schema capture 중 schema만 복원하며 실제 identity/data는 사용하지 않는다. 모든 fixture Role은
삽입 시 `testOnly=true`, 고정 `testFixture`, 해당 합성 계정만 포함한 `testTalentIds`를 갖는다.

| 검증 입력 | SHA-256 |
| --- | --- |
| DB schema capture | `99fc51bb30878e035aa7718b3f50d5c64b463d7a91e0aff6ac7ecefe2944bfdc` |
| DB function capture | `c727a0a6763c0faef15f5c865b935724feda7e1510918a57440016ced0fead33` |
| 새 migration | `b5ac691cd69827fc14a8b5629bb5746b08da87569f2ffff2bb8bd59635bdb9ca` |

## 한계

선택 3변형은 전체 v9 통과나 운영 평균 성공률의 증거가 아니다. 원문 검토는 Codex 자체
판정이며 팀원의 독립 blind review가 아니다. 응답에 반복되는 추가 도움 제안은 장황함으로
기록하되 기능 판정과 구분한다. 합성 adapter와 격리 schema subset은 실제 브라우저·Slack
transport, production trigger 전체, Worker 실행·전송, 동시 세션 경합을 대체하지 않는다.
timeout 실패 원문은 재시험 결과와 별도로 보존한다.
