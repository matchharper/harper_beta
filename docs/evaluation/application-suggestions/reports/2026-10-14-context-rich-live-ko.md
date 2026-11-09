# 서로 다른 유저 맥락의 Apply with Harper 준비 평가

문서 기준: 2026-10-14. 로컬 작업 트리의 실제 제품 모델·prompt·준비/문서 도구를 실행했다. 배포와 회사 연락, 지원서 입력·파일 업로드·최종 제출은 하지 않았다. 가상 유저의 저장은 owner/revision 검사형 로컬 adapter에 격리했다. 화면·인증·운영 DB 저장까지 포함하는 전체 웹 E2E 결과는 아니다.

## 결과

최종 채택 run은 `context-rich-live-v1-2026-10-14T03-18-31-806Z`다. 초기 writer에는 실제 `server.ts`와 같은 Profile snapshot + 연락처 + Brief/Memory를 한 번씩 제공했다. 대화에는 실제 `buildTalentProfileContext`를 사용했고 한국어 locale을 설정했다. Sonnet 5.5로 세 준비를 실행했으며, 이미 실제 read-only 조사한 지원서 snapshot을 후속 단계에 재사용했다.

| 유저 맥락 | 실제 역할 | 초기 수정 / 질문 | 핵심 사실 반영 | 준비 결과 |
| --- | --- | --- | --- | --- |
| Harper 편집용 JSON이 없는 업로드 PDF 엔지니어 | [Microsoft · Backend Software Engineer](https://apply.careers.microsoft.com/careers/job/1970393556984600) | 6 / 2 | 관련 사실 5/5를 제안과 저장본에 반영; 장애 보고서 경험도 추가 | 승인 문구 사본 저장, 원본 PDF bytes 보존, 종료 |
| 이력서 없는 프로덕트 디자이너 | [H Company · Product Designer - London](https://jobs.ashbyhq.com/hcompany/c27805ef-a751-403c-9589-dee0904c1a66) | 2 / 3 | 관련 사실 5/5를 **최초 생성본에 이미 반영** | 생성 허락 → 이력서 생성 → 수정 사본 저장 → 종료 |
| 최신 메모가 빠진 기존 Harper 이력서의 데이터 엔지니어 | [inforcer · Data Engineer](https://inforcer.teamtailor.com/jobs/8361149-data-engineer) | 5 / 2 | 관련 사실 5/5를 제안과 저장본에 반영 | 승인 수정 저장, 원본 보존, 종료 |

수정 수에는 질문·추가 작성물을 포함하지 않았다. 4~5개를 요구하는 prompt를 추가하지 않았으며, 최종 초기 수정은 6/2/5개였다. 빈약한 기존 이력서의 두 사례는 각각 6개와 5개로 여러 독립적인 결손을 보완했다. 이력서가 없는 디자이너는 처음부터 정보를 활용하므로 수정 4~5개를 추가로 만드는 것이 성공 기준은 아니다. 이번 3개 challenge는 전체 production 평균이나 모든 유저 맥락의 성공률을 의미하지 않는다.

## Memory와 프로필 메모를 어떻게 썼는가

엔지니어의 Profile 메모에 있던 이벤트 기반 API·멱등키·재시도와 일 8만 건 처리, PostgreSQL p95 480→170ms, pytest 회귀 6→2건이 일반적인 이력서 문구를 구체적인 경험으로 바꿨다. Memory의 Azure 장애 복구 42→18분, 영어 ADR와 주니어 2명 멘토링도 질문으로 다시 확인하지 않고 제안했다. 승인한 수치와 고용주 연결을 저장본에서 확인했다.

디자이너의 메모·Memory에 있던 사용자 인터뷰 14건, 사용성 테스트 8회와 완료율 61→84%, Figma 컴포넌트 32개·접근성, AI 승인/undo를 설계한 **고객 파일럿**, React 프로토타입·고객 피드백 기반 로드맵이 최초 생성본에 들어갔다. 고객 파일럿을 정식 운영 출시로 바꾸지 않았고 개인적인 돌봄 사유는 이력서에 들어가지 않았다.

데이터 엔지니어는 6개 SaaS API→ADF/ADLS, PostgreSQL CDC·Kafka 중복 처리, dbt 45개 모델 검증, Airflow 실패 로드 월 9→3건, 보존·마스킹·재무 분석가 협업을 다섯 제안으로 반영했다. 최신 Memory의 “Snowflake migration은 제안만 했고 구현하지 않았다”를 따라 Snowflake 경험은 저장하지 않았다. 모르는 Git·REST API 구현 세부 답변은 건너뛰었고 확인되지 않은 내용으로 채우지 않았다.

## 개선이 필요한 부분

- **디자이너의 추가 수정은 가치가 약하다.** 이미 있는 승인/undo 설계 문장을 풀어 쓰고 같은 경험을 Skills에 다시 넣는 두 제안이 나왔다. 새 사실을 추가하는 두 개선으로 평가하지 않았다. 정보 활용 5/5와 추가 제안 품질은 별도다.
- **디자이너 생성본에는 알려진 이메일이 빠졌다.** 공통 profile prompt가 이메일을 넣지 않고, 초기 준비 writer에 연락처를 제공한 뒤에도 이력서 헤더 보완으로 이어지지 않았다. 지원서의 별도 이메일 필드로 제출할 수는 있지만 연락처 완전성을 확인한 이력서는 아니다.
- **데이터 엔지니어의 두 제안이 같은 원문 위치를 대상으로 했다.** dbt 추가와 거버넌스/문서화 제안이 동일한 기존 문서화 불릿을 인용했다. 저장 단계는 둘을 모두 보존했지만 사용자가 부분 승인·수정할 때의 혼동 가능성은 별도 검증이 필요하다.
- **표현 범위의 작은 흔들림이 있었다.** 엔지니어의 확인된 단일 장애 보고서를 제안에서 복수 reports로 썼다. 주요 경력·수치는 확인된 사실을 활용했지만 모든 정성 문장의 범위 보존까지 완벽하다고 판정하지 않았다.
- 디자이너와 데이터 엔지니어의 모델은 skip 질문을 정리하기 전에 `ready_for_role`을 먼저 호출해 경계 오류를 받았고, 같은 턴에서 질문을 정리한 뒤 재호출하여 저장했다. 오류를 성공으로 숨기지 않았으며 사용자 응답에는 최종 저장 결과가 반영됐다.

위 이유로 **Memory 활용과 저장 흐름은 확인했지만, 전체 품질을 무조건 통과로 판정하지 않는다.** 이번 요청에서는 제품 코드·prompt를 변경하지 않고 결과를 기록했다.

## PDF-only의 정확한 경계

정상 업로드 PDF는 원본 파일을 유지하면서 읽기용 `extracted_text`를 만들고, Harper 편집용 `structured_content`는 없는 상태다. 첫 journey는 실제 PDF bytes를 제품 parser로 읽은 이 상태를 테스트했다. 원본 PDF를 고치지 않고 승인한 내용으로 Harper 형식의 사본을 만들었다.

반면 **PDF 파일만 있고 추출 텍스트도 없는 상태에서는 현재 준비를 시작하지 못한다.** 별도 `--case pdf-engineer --binary-only` 실행으로 실제 `executeApplicationSimulation`에 이 상태를 넣었고, “selected document has no readable extracted text”라는 `ok=false` 결과와 후속 분석·쓰기·provider 호출 0건을 확인했다. 채택 근거는 `runs/context-rich-live-v1-2026-10-14T03-16-23-797Z/outputs.json`이다. 따라서 첫 journey의 성공을 텍스트 추출이 실패한 PDF에도 적용해서 말하면 안 된다.

## 외부 사이트와 검증 범위

실제 사이트 조사 run `context-rich-live-v1-2026-10-14T03-11-33-755Z`에서 Microsoft는 지원 시작 전에 로그인/계정 생성을 요구했다. H Company는 공개 form의 일부 항목을 읽었으나 숨김/조건부 항목은 미확인이다. inforcer는 공개 modal의 실제 지원 항목을 읽었다. 세 곳 모두 지원서 입력·이력서 업로드·개인정보 동의·제출은 실행하지 않았다. 알려지지 않은 근로 자격·notice period·연봉 등의 필수 답변이 남아 있으므로 “모든 지원 입력이 끝나 제출 버튼만 남았다”는 의미도 아니다.

Memory는 preparation의 4000-token 예산보다 작은 complete snapshot으로 제공했다. **저장된 사실을 활용하는 능력을 평가했으며, 운영 Memory 검색의 recall과 DB persistence는 평가하지 않았다.** source는 원본별로 보존됐고 디자이너의 최초 생성본도 초기 writer에 넘긴 text와 최종 저장 목록을 대조하여 그대로 남았음을 확인했다.

외부 browser 결과 전달에만 run별 private Storage 경로를 썼다. 후보자 운영 DB 쓰기는 없었다. 실제 조사에서 생성한 provider session/environment 6개는 모두 404 삭제를 확인했고, 해당 `_evaluation/<run>/` 경로의 잔여 파일도 0개였다. 마지막 재검증은 이 실제 조사 결과를 재사용하여 추가 원격 browser 자원을 만들지 않았다.

초기 하네스의 중복 profile context, locale 누락, 합성 원본 생성 ID 계약, PDF 생성/모듈 초기화 문제와 Storage 차단을 수정한 뒤 최종 재검증했다. 이전 raw run을 보존하고 마지막 결과와 구분했다. 입력·gold를 모델 출력에 맞춰 바꾸지 않았다. 평가 runner·adapter의 변경 파일 lint는 통과했다.

재현 입력·gold와 hash는 `context-rich-live-v1.json`, `context-rich-live-gold-v1.json`, `manifest-context-rich-live-v1.json`; 실제 역할 snapshot·원본 PDF·capture는 ignored `private/context-rich-live-v1/`, 대화·문서·manifest는 ignored `runs/`에 owner-only로 보관한다. Canonical runner는 `scripts/evalApplicationContextJourney.ts`이며, `--inspection-source <기존 실제 조사 run 경로>`는 새 browser를 열지 않고 검증된 form snapshot을 재사용한다. gold는 assistant-authored이며 수동 review는 비맹검이다.
