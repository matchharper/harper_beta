# External Fit Lab (Jev)

## 목적과 평가 단위

Ops `/ops/debugging/external-fit`에서 후보자 1명 × 직접 고른 외부 역할 1–10개를 탐색적으로 평가한다. 후보자가 해당 회사·역할을 검토할 관심 가능성과 회사가 첫 스크리닝을 진행할 관심 가능성, 상호 적합도, 직무 수행 적합도, 필수조건 무충돌 가능성, 근거 충분성을 분리한다. 이 수치는 실제 지원·면접·채용 확률로 검증되지 않았다. 운영 추천이나 Worker 교체의 release gate가 아니다.

## 입력과 원본

역할 검색어가 비어 있으면 선택한 후보자의 `talent_external_fit`을 최근 계산순(`created_at` 내림차순)으로 보여 준다. 역할별 기존 점수·계산 시각을 표시하며 동일한 다중 선택을 지원한다. 후보자 미선택/계산 기록 없음은 빈 목록이고, 검색어 입력 시 전체 외부 역할 검색으로 전환한다. 실행 시 기존 Fit을 서버에서 다시 읽어 결과 비교표와 다운로드에 보존하며 Jev state에는 넣지 않는다. 기존 점수와 Jev는 입력 시점·모델·평가 척도가 다를 수 있어 동일-input benchmark로 해석하지 않는다.

웹은 기존 공통 structured Profile reader, 전체 활성 Search Brief reader, 저장된 Behavior Context의 같은 snapshot을 모든 선택 역할에 재사용한다. 이름·이메일·전화번호·프로필 사진은 모델 입력에서 제외한다. 경력·학력·extras와 그 안에 사용자가 쓴 원문은 포함한다. Behavior의 version, updated time, 미반영 변경 수를 표시한다. 없거나 오래된 cache는 표시만 하고 생성·갱신하지 않는다. Memory와 과거 대화 원문은 주입하지 않는다.

역할은 `source_type=external`, `testOnly` 제외를 서버에서 재확인한다. JD 본문·요약·근무 조건·연봉·회사 설명을 읽는다. 수동 실험이므로 마감 역할도 상태와 함께 선택할 수 있다. Worker의 retrieval·liveness 확인·과거 추천 제외·회사 enrichment·회사 보너스·rerank·배달 경로는 실행하지 않는다. Worker의 Profile + Brief + Behavior 설계와 동일한 근거 계층을 쓰지만 **byte-for-byte Worker 입력 재현은 아니다**. 현재 요청/검색 계획/회사 quality enrichment는 추가하지 않는다.

## Canonical runner와 계약

- 웹 runner: `src/lib/ops/externalFitPlaygroundServer.ts::runExternalFitPlayground`.
- prompt·provider adapter·구조 검증: `src/lib/ops/externalFitPlayground.ts`.
- API: `src/app/api/internal/debug/external-fit/route.ts`, GET/POST 모두 기존 내부 계정 인증 필수, private/no-store.
- synthetic live smoke: `scripts/evalExternalFitPlayground.ts`; 기본은 frozen `cases-v1.json` smoke, 인자 `v2`는 frozen `cases-v2.json` 8쌍 challenge를 실행한다. 모든 실행은 현재 실제 prompt/provider adapter를 재사용한다.
- `typesafe/jev-1.13`, OpenRouter `https://openrouter.ai/api/alpha/decisions`, TypeSafe. `data_collection=deny`, fallback 없음. reasoning/temperature/text explanation은 Jev 계약에 없다.
- 역할마다 1회, 동시 최대 4회, 각 요청 75초 timeout. 자동 재시도·semantic rewrite 없음. 성공·실패를 역할별 보존한다.
- prompt version `external-fit-jev-web-v4`. Noul은 원본 [0,1]을 %로, Score는 원본 [0,4]를 ×25로 표시한다. 곱셈으로 상호확률을 만들거나 다른 축의 평균을 내지 않는다.
- 비용은 실제 `usage.cost`만 합산한다. 누락·timeout 비용은 미확인으로 표시하고 0원으로 채우지 않는다. 전체 시간은 조회와 병렬 실행을 포함한다.

## 후보자 만족 판단 계약 (prompt v4)

후보자 → 회사는 선호 일치뿐 아니라 회사 자체의 수준이 후보자가 기대하는 수준을 충족할지 평가한다. 회사의 기술·전문성, 팀과 리더십의 역량, 제품·사업 경쟁력, 실행·재무 지속 가능성, 만족할 보상을 제공할 여력을 제공된 근거로 종합한다. 회사 규모·단계·인지도 자체를 회사 수준의 대체 지표로 쓰거나 특정 회사 유형 선호만으로 만족을 추정하지 않는다.

후보자의 기대 수준은 제공된 pedigree(이력, 경험한 회사·환경, 책임 범위, 성과, 학력)와 직접 언급, 현재 Brief, 제공된 Memory 관련 근거를 함께 읽어 추정한다. 직접적인 현재 언급·Brief가 pedigree에서 추측한 기대보다 우선하며, 잠정 추측을 필수조건으로 만들지 않는다. 웹의 입력 계약은 그대로 Profile + 전체 Brief + 저장된 Behavior Context다. Memory 행·대화 원문은 직접 제공하지 않으므로 Memory 관련 근거는 실제 Behavior에 반영돼 제공된 범위만 활용한다. 부족한 회사·보상 정보는 확인된 열위로 간주하지 않고 불확실성으로 남긴다. 상호 적합도도 후보자의 회사 수준 만족을 고려한다.

## Frozen 데이터·gold·재현

`cases-v1.json`은 DB에 삽입하지 않는 가상 프로필/역할 1쌍이다. `gold-v1.json`은 실행 전 작성한 human-review rubric이며 실제 관심확률 gold는 없다. `manifest-v1.json`에 provenance와 파일 hash를 기록한다. 기존 [external-fit-qualitative](../external-fit-qualitative/README.md) frozen pilot는 수정하지 않는다. 웹 선택 입력은 실행 시점의 live snapshot이며 고정 benchmark로 취급하지 않는다. 다운로드에는 실제 state, 질문, prompt version, 응답과 usage가 들어가므로 후속 비교는 해당 snapshot을 동결하고 새 run으로 기록해야 한다.

v2는 회사 수준·보상·규모·현재 명시적 타협·직무 능력·필수조건 충돌을 구별하는 합성 8쌍 challenge다. `gold-v2.json`의 8개 순서 비교와 정성 검토 항목은 실행 전에 작성했으며 실제 관심확률 정답은 없다. `manifest-v2.json`에 새 입력과 gold hash를 기록한다. v1은 그대로 보존했다. 실제 prompt v2/v3/v4를 동일한 v2 입력에 각각 한 번 실행했으며, [검토 결과](reports/2026-10-13-prompt-v4.md)에 변경과 한계를 기록한다.

prompt v4는 각 질문을 다른 질문의 출력에 의존하지 않고 원래 입력에서 독립 판단하게 한다. 회사 → 후보자와 직무 적합도는 후보자 만족도를 대신 평가하지 않는다. 후보자 → 회사는 회사에 대한 호감만이 아니라 실제 기회를 진지하게 검토할 의향을 평가하며 명시적 필수조건 충돌도 고려한다. 근거 충분성에는 회사 자체의 수준·후보자의 기대·관련 보상 근거를 포함한다.

## Metrics와 gate

구조: 6개 답변 coverage, score/probability 범위, 역할 수, 실패 격리, 누락 비용 구분, 인증 차단, secret 미노출. 구조 오류는 점수로 표시하지 않고 원본과 비용을 보존한다. 모델 품질은 후보자 의향과 직무역량 혼동, 회사 비공개 선호 추정, unknown과 mismatch 혼동, 명시적 필수조건 위반을 사람이 검토한다. 작은 synthetic smoke의 성공을 품질·확률 calibration 근거로 쓰지 않는다. 운영 변경 전에는 독립 gold와 더 넓은 고정 표본 검토가 필요하다.

## Privacy와 한계

이 페이지 생성과 Jev 연결은 사용자의 명시적 요청이다. 실제 선택 후보의 matching 근거와 공개 역할 정보는 내부 사용자가 실행할 때 OpenRouter/TypeSafe로 전송된다. DB 접근은 SELECT만 사용하며 cache/fit/추천/연락/설정 변경이나 새로운 테이블은 없다. 웹 결과는 브라우저 메모리에만 유지한다. 다운로드 파일에는 개인정보가 포함될 수 있다. 재사용하는 로컬 capture와 raw output은 이 태스크의 ignored `private/` 또는 `runs/` 아래에만 보관하고 파일 0600/폴더 0700을 사용한다. 서버 로그에 원문을 쓰지 않는다.

한계: 수동 표본 선택, 정보 누락/오래된 Behavior, 회사 비공개 선호·경쟁률 부재, Worker와 입력 projection 차이, 모델 무설명 출력, 측정되지 않은 확률 calibration. 화면을 새로고침하면 결과를 복구하지 못한다. 응답 유실/timeout은 provider 과금 여부를 확정하지 못한다.
