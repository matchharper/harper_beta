# 수동 조사 → Brief 저장 → Slack 설명 → 탐색 연결

2026-10-16 로컬 구현·미배포. 운영 DB 적용, 실제 회사 Brief 변경, Slack 발송, 후보 검색 실행은 하지 않았다.

## 전달 결정

한 요청에서 조사 → Brief 저장·재조회 → 새 Slack 부모/설명 답글 전달 → 기존 후보 탐색 접수 → 기존 결과 안내로 이어간다. 회사의 추가 답변을 기다리지 않는다. 조사와 후보 탐색은 기존 비동기 작업 경계로 나눈다. 후보 카드는 기존 소개 경로에 남기고, 인재상 논의는 새 스레드에서 이어간다. 결과 작성에 동일 run/Role의 실제 전달 설명을 제공한다.

채용 시작 handler·정기 cron은 이 진입점을 호출하지 않는다. 기존 활성화·정기·실행 중 검색의 순서를 바꾸는 전역 gate도 없다. 특히 Brief 변경의 기존 activation trigger는 그대로다. 이번 순서 보장은 수동 요청이 추가하는 명시적 검색에 한정한다.

## 변경 경계

- 인증된 수동 API → `enqueueCompanyUpdate` → 기존 회사 작업 큐. 쓰기는 대상 Brief와 승인된 회사 채널의 메시지 확정만 허용한다.
- 연구·기준 작성·회사 설명은 같은 company-side LLM, Sol medium/40,000토큰이다. 별도 writer·출력 의미 validator는 없다.
- 확정 batch를 재사용해 부분 전송을 복구한다. 신규 SQL 함수는 실제 전달을 확인하고 검색 접수 영수증을 기존 job JSON에 원자적으로 남긴다. 새 테이블·enum·정성 상태는 없다.
- 신규 migration `20261016000326_role_research_search_handoff.sql`은 파일만 작성했으며 미적용이다.

## 격리 검증

관련 테스트 19개 통과:

- 읽기 전용 preview의 쓰기·발송 차단 유지, 대상 Brief 외 수정·다른 Role·기존 스레드 지정 차단.
- 전달 세션의 모델/도구 범위, 확정 batch가 있으면 연구·Brief 변경을 재실행하지 않는 복구.
- Slack 부모 전달 후 실패 시 부모를 중복 발송하지 않고 답글 재개; 권한 회수 시 중단.
- PGlite에서 미전달/부분 전달 시 검색 차단, 전부 전달 뒤 한 번 접수, 완료 이후 재시도에도 중복 접수 없음, service-role만 RPC 호출 가능.
- 일반 결과 작성기에 정확한 run/Role의 실제 전달 설명만 제공.
- 설명 확정 전 같은 Role 대화에 새 회사 발화가 오면 오래된 조사 요청을 중단해 최신 지시가 우선하도록 한다.
- 공통 검색 접수 결과·실패 경계 기존 테스트 유지.

전체 저장소 TypeScript 검사는 기존 생성된 Next 타입의 삭제된 billing route 참조와 별도 career 테스트 오류로 실패했다. 이 작업의 변경 파일·관련 imports를 포함하는 별도 TypeScript 검사는 통과했다. 범위 밖 파일은 수정하지 않았다.

## 실제 모델 시뮬레이션

사전 동결 `research-delivery-v1` gold, 변경하지 않은 `research-preview-v3`의 RSR04 합성 자료를 사용했다. canonical runner의 `--simulate-delivery`로 실제 production loop·prompt·schema·scope guard를 실행하고 내부 변경과 메시지는 메모리에만 남겼다. 모델은 OpenAI Responses gpt-6.1-sol/medium, store:false, temperature 생략, 최대40,000토큰이다. DB/Slack/queue 네트워크는 차단했다.

- r1: 약42.9초, completion7회/tool11회. Brief 보완·재조회·메시지 확정은 수행했으나 Slack이 인물별 경력 보고서처럼 길어 문체를 보완했다.
- r2: 약44.3초, completion7회/tool11회. 수준·가산·대체 경로는 유지했으나 처리 절차·기존 자격 반복이 남아 첫 브리핑의 목적을 더 분명히 했다.
- r3: 약41.7초, completion6회/tool11회. 기존 조건을 보존하고 전문 경력은 강한 가산, 관련 연구 훈련은 보조 가산으로 작성했다. 특정 회사·팀 이름을 수준의 예시로 쓰고 인접 분야의 비교 가능한 책임·구현 경험에도 같은 강도를 적용했다. 저장본 재조회 후 부모160자/답글968자를 확정했다.

r3 순서: 현재 Role → 회사 자료 → 이전 대화 조회 시도 → 공개 검색·URL 조회 → Brief 수정 → Role 재조회 → 회사 메시지 확정. 미캡처 대화/홈페이지 조회 실패는 공개 팀 소개와 연결된 프로필 근거 확보로 보완했으며 읽지 않은 과거 기록을 읽었다고 주장하지 않았다.

선택 RSR04의 필수 의미 기준은 작성자 검토로 통과했다. 새 필수조건·특정 출신 whitelist·전체 팀원 출신 분포를 만들지 않았고, 아직 실행하지 않은 후보 탐색을 완료로 쓰지 않았다. 마무리에 향후 기준 조정의 근거·방향을 알리겠다는 취지가 있었다. 전체 v3 gate나 운영 품질 통과를 뜻하지 않는다. 합성 자료 한계 설명 때문에 실제 회사 안내보다 길어질 수 있으며 실제 Slack 렌더링·DB 권한·Worker 통합은 이번 모델 실행으로 검증하지 않았다.

원문·source snapshot·설정·도구 결과·semantic review는 ignored owner-only `runs/20261016-research-delivery-v1-r1`, `r2`, `r3`에 각각 보존했다. 각 run의 `RSR04-delivery-preview.md`에 메시지와 저장 Brief를 그대로 모았다. 정성 품질을 키워드 검사하거나 문구를 deterministic하게 고치지 않았다.
