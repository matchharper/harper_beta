# 서비스 답변 예시 검색 캐시

2026-09-28 로컬 구현 기준. 배포 완료를 뜻하지 않는다.

- `serviceAnswerExamples.ts`는 질문을 임베딩하고 예시의 코사인 유사도를 서버 메모리에서 계산한다. 기존 임계값 0.35, 기본 상위 3개와 Ops 디버거의 개수 설정을 유지한다. 전체 예시를 LLM에 전달하지 않는다.
- 캐시에는 공통 예시 본문·벡터만 보관한다. 사용자 질문, 대화별 검색 결과, 회사별 비공개 정보는 보관하지 않는다.
- 기본 캐시는 Supabase URL·임베딩 모델별로 만들고 audience를 분리한다. 별도로 전달한 DB client는 client별 캐시로 격리한다.
- 웹과 Slack은 같은 조회 구현을 사용한다. 각 서버 인스턴스가 독립적인 사본을 가지며, 세션이나 Slack 스레드를 특정 인스턴스에 고정하지 않는다. 인스턴스가 종료되면 메모리도 사라진다.
- 유효기간은 DB 조회 시작부터 30초다. 조회 시작 시 유효한 사본이 있으면 재사용하며 사용 횟수로 만료를 연장하지 않는다. 주기적인 타이머는 없다.
- 캐시가 없거나 만료되면 다음 요청이 활성 예시를 전체 조회한다. 로딩은 질문 임베딩과 병렬로 실행하며, 같은 인스턴스·audience의 동시 요청은 하나의 로딩 작업을 공유한다. 전체 읽기에 성공해야 사본을 교체한다.
- 수정·추가·삭제·비활성화는 다음 전체 조회에 반영된다. Ops 저장이나 직접 DB 수정이 다른 서버의 메모리를 즉시 무효화하지는 않는다. 변경 전 사본은 조회 시작 기준 최대 약 30초간 사용될 수 있으며, 이미 진행 중인 조회는 시작할 때 얻은 사본을 사용한다.
- 만료 후 갱신 실패 시 이전 사본을 다시 사용하지 않는다. 해당 조회는 예시 없이 기존 prompt와 대화로 진행하고, 다음 요청에서 다시 읽는다. 빈 목록은 정상 사본으로 캐시한다.
- 전체 조회의 기존 2.5초 제한을 유지하고 질문 임베딩의 자동 재시도를 끈다. 제한 초과나 실패 시 해당 질문의 임베딩을 취소한다. 공유 DB 로딩은 별도 2.5초 제한을 두어 한 호출자의 종료가 다른 대기자의 로딩을 취소하지 않게 한다.
- 완료 로그에는 audience, cacheStatus, snapshotMs, embeddingMs, totalMs, matches만 남긴다. 타임아웃·실패에는 완료된 단계의 시간을 남기며 질문·예시 본문·벡터는 기록하지 않는다.

검증: `node --import tsx --test src/lib/serviceAnswerExampleCache.test.ts src/lib/serviceAnswerExamples.test.ts src/lib/ops/companyAnswerExampleDebuggerServer.test.ts`

기존 연락 QA의 `CONTACT_QA_SERVICE_EXAMPLES=empty`는 RPC와 새 snapshot GET 모두 빈 목록으로 고정한다. Preflight도 두 경로를 확인한다. 새 캐시 모듈을 평가 source fingerprint에 포함하며 frozen 입력과 gold는 변경하지 않는다.

2026-09-28 읽기 전용 smoke: 합성 질문 7개(company 5개, career 2개)에 대해 같은 query embedding을 사용한 기존 RPC와 예시 ID·순서가 모두 일치했다. score 차이는 최대 약 0.00000032였다. Snapshot DB 읽기는 audience별 1회씩 총 2회였다. 캐시 적중 5회의 전체 조회는 140~158ms 4회와 552ms 1회, 최초 로딩은 company 1,170ms·career 505ms였다. 로컬에서 현재 API를 호출한 작은 표본이며 운영 지연 분포나 실제 웹·Slack E2E 검증은 아니다.
