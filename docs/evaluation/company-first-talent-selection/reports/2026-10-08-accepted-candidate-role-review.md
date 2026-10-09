# 일반 역할 수락 후보 재검토 · 로컬 검증

동결 입력은 `accepted-v1`, 확장 입력은 `accepted-v2`이며, 이후 모델 출력에 맞춰 입력이나 gold를 변경하지 않았다. 모두 합성 자료이며 운영 DB 조회·변경은 없다. 아래 추가 점검에서만 marked local DB와 실제 Harper `#qa`를 사용했다. 원문과 source/prompt/model/usage manifest는 ignored owner-only `runs/`에 있다.

| Run | 결정 gold 일치 | 결과와 한계 |
| --- | --- | --- |
| `20261008-accepted-v1-r1` | 8/8 | 정기·직접 검색 각 4쌍의 connect/reject/defer/일반 no_action. 당시 rerank 계약 검증 |
| `20261008-accepted-v2-r1` | 완료 안 됨 | 첫 rerank 후 평가 runner의 dataclass 속성 참조 오류. 실행 실패를 보존 |
| `20261008-accepted-v2-r2` | 7/8 | 직접 검색에서 높은 보상 희망을 후보자가 명시하지 않은 비협상 조건으로 취급. 빈 선정에도 writer를 호출한 평가 runner 오류 함께 수정 |
| `20261008-accepted-v2-r3` | 8/8 | 선호와 필수 조건의 강도를 보존하는 일반 prompt 보완. 실제 connect에만 동일 presentation + 별도 Slack 작성 |
| `20261008-accepted-v2-r4` | 8/8 | 최종 로컬 prompt. presentation 2건·Slack 2건의 구조와 company-safe 원문 검토 완료 |
| `20261008-accepted-v2-r5` | 8/8 | 실제 모델 출력과 후속 소개 생성 재검증 |
| `20261008-accepted-v2-r6` | 8/8 | 로컬 저장·실제 QA Slack 전송과 상세 화면 검증 |
| `20261008-accepted-v2-r7` | 8/8 | 한국어 notice/ownership 표현에 직역이 남아 작성 지침 추가 보완 |
| `20261008-accepted-v2-r8` | 8/8 | 최종 공개 작성 계약·2개 presentation/Slack 전체 원문 검토. 실제 로컬 저장·QA 재전송 |

최종 모델 설정은 rerank GPT-5.6 Terra xhigh / 0.25 / 65536, presentation GPT-6 Luna high / 0.3 / 16384, Slack GPT-6.1 Sol high / 1.0 / 16384이다. r4 추정 API token 비용은 $0.0405994다. transport 캐시·실제 response model과 usage는 private manifest를 기준으로 재현한다.

Codex가 최종 8개 결정의 내부 이유와 2개 공개 presentation/Slack 원문을 모두 검토했다. 새 수락이나 회사 수락·소개 메일 발송을 만들어내지 않았으며, 금액·통화·비율·다른 회사·민감 맥락은 공개 출력에 없었다. 역할 범위보다 높은 희망은 비수치 설명만 사용했다. Note는 현재 Brief의 전문적인 선호·실무 조건만 전달했다. 한국어의 일부 표현은 더 자연스럽게 다듬을 여지가 있으며, 독립 팀원의 품질 평가를 대체하지 않는다.

별도 로컬 계약 검증은 connect만 기존 추천을 연결대기로 옮기는 원자적 저장, reject/defer의 기존 수락 보존, outbox 실패 시 롤백, 수락 철회 직전 guard, 오전 9시 소개 중복 방지, 별도 스레드 및 부분 발송 재시도, 카드 상세의 공개 필드 경계를 다룬다. 100명 단일 Role의 카드 전송도 후보를 잃지 않고 전송 크기에 맞게 나눈다. 모든 DB Role fixture는 삽입 전 testOnly·stable fixture·전용 testTalentIds를 갖고 fit 행은 만들지 않는다.

최종 관련 Python 검증은 267 passed / 6 skipped, 격리 PostgreSQL 검증은 35 passed, 앱의 Slack·공개 report·중복 방지 검증은 50 passed다. 작업 중 별도 변경된 semantic ordering 기본값과 이전 테스트 기대가 일시적으로 충돌했으나, 최종 검증에서는 현재 기본값 계약을 포함해 통과했다. Accepted runner fixture는 별도 의미 정렬 실험을 끄고 해당 흐름만 검증한다. 전체 앱 타입 검사는 기존 생성 파일·private 평가 파일의 참조 및 별도 source 타입 오류로 통과하지 못했지만 이번 추가 파일/필드의 새 오류는 관측되지 않았다. 실제 Slack 화면·운영 발송은 검증하지 않았다.

표본은 4쌍뿐인 개발용 challenge다. 앞선 모델 평가 자체는 운영 정확도·후보 응답률·실제 Slack 표시나 발송을 검증하지 않았다. 실제 QA 점검은 아래 별도로 기록한다. 앱/Worker 및 새 마이그레이션은 미배포·미적용이며 독립 gold 검토와 대표 분포 평가는 미완료다.

## 실제 Harper QA 추가 점검

최종 r8의 API token 추정 비용은 $0.04380638이다. 같은 동결 데이터에 최신 prompt만 바꿨고, 내부 rerank 이유를 회사 공개 Note로 재사용하지 않는다. 공개 소개는 명시적인 Brief·프로필·현재 역할로 독립 작성한다.

Canonical local replay가 실제 Worker commit을 실행했다. 네 결정이 저장됐고 connect 1명만 기존 추천의 pending_connection으로 이동했다. reject/defer의 기존 수락은 보존됐고 testOnly 역할의 fit 행은 0개였다. 로컬 fixture를 위한 정확한 allowlist adapter만 사용하며 운영 matching/testOnly guard를 완화하지 않았다. 오래된 로컬 스키마의 누락 컬럼과 testOnly fixture의 fit 부재는 로컬 전용 adapter에서 처리했다.

실제 클릭 검증에서 오류를 발견했다. Accepted artifact는 중복 소개 재시도를 막기 위해 closed/route_replaced로 저장되는데, Slack 상세·새로고침이 이를 종료된 제안으로 취급해 네 필드가 가려졌다. 이 정확한 artifact만 기존 회사 권한·공개 범위 reader로 통과시키도록 고쳤다. 일반 종료 제안과 접근 거부 보호는 유지한다. 상세 entrypoint·새로고침·접근 거부 회귀 3건과 실제 발송 receipt 보존 5건을 추가 검증했다.

Harper Local 앱으로 우리 비공유 비공개 `#qa`만 전송했다. 설치된 앱에는 links:read/links:write가 없어 정상 sender는 기존 텍스트 경로를 사용했다. 이 guard를 바꾸거나 권한을 확대하지 않고, 같은 QA 스레드의 별도 visual probe에서 실제 production entity builder를 사용했다. 브라우저 Slack에서 카드의 `🟠 수락시 바로 연결 in Harper`와 실시간 상세의 TL;DR·Harper Note·finalFit·criteria 근거를 확인했다. 동일 sender 재실행은 원래 receipt를 사용했다. 해당 토큰의 private history 권한도 없어 API로 스레드를 읽는 검증은 missing_scope였으며 실제 화면으로 검토했다.

주황색 image 파일은 로컬에 있으나 미배포 공개 주소는 404라 사진 표시의 최종 검증은 남았다. 주황색 표식과 상태 문구는 실제 카드에서 보였다. 카드 없는 fallback도 accepted 결과의 message source를 유지하도록 정리했다. Production 배포·새 accepted-review migration 적용·후보자 또는 외부 회사 연락은 실행하지 않았다.

현재 대상 검증: Worker 328 passed/6 skipped, disposable PostgreSQL 35 passed, 앱 52 passed. 더 넓은 기존 테스트에서는 오래된 함수·scorer·scheduler fixture·source pattern 기대가 현 코드와 맞지 않아 Python 10건(서브테스트 포함), TS 3건이 실패했다. 전체 앱 typecheck도 기존 generated/private 파일과 별도 source 오류로 실패하며, 이번 변경 파일의 새 타입 오류는 수정했다. 따라서 전체 저장소가 green이라는 주장은 하지 않는다. 운영 retrieval·scoring부터의 전체 production E2E 및 독립 gold 검토도 이 replay의 범위 밖이다.

## 채널 본문 카드 표시 수정

앞선 QA는 카드를 안내 메시지의 스레드 안에 표시했다. 사용자의 표시 위치 요청에 맞춰 sender의 threadReplies 옵션과 thread_ts 전달을 제거했다. 수락 후보와 회사 선추천은 서로 다른 안내·메시지 묶음을 유지하고, 각 후보 카드는 채널 본문의 독립 메시지로 표시한다. 후보별 receipt와 재시도 중복 방지는 유지한다.

같은 r8 합성 후보를 실제 Harper 비공유 비공개 `#qa` 본문에 다시 표시했다. 브라우저에서 스레드를 열지 않고 카드와 주황색 수락 문구가 보이는 것을 확인했으며, 상세의 TL;DR·Harper Note·적합도·criteria 근거도 유지됐다. owner-only `local-slack-channel-probe.json`, `local-slack-channel-ui-review.json`, `local-slack-channel-ui.png`가 현재 위치 확인 자료다. 이전 스레드 probe는 당시 결과로 보존한다. 로컬 앱의 선택적 링크 권한이 없는 상황은 앞선 점검과 같으며, 실제 native 카드 probe와 정상 sender의 권한 계약 검증을 구분한다. 주황색 사진 공개 주소는 미배포이므로 최종 사진 표시는 여전히 미검증이다.

현재 관련 앱 검증은 46 passed/1 failed다. 채널 본문·부분 발송 재시도 검증은 통과했고, 실패는 별도로 변경 중인 소개 크레딧 billing 안내 테스트 한 건이다. 수락 카드·상세 5건과 발송 receipt 5건을 별도 재실행해 10건 모두 통과했다. 이번 위치 수정은 LLM 계약을 바꾸지 않아 모델 평가를 다시 실행하지 않았다. 운영 배포와 외부 Slack 전송은 실행하지 않았다.
