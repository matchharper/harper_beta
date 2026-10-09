# 검색 이력·선추천 정보의 회사 LLM 전달 검증

2026-10-07. 로컬 수정 검증이며 배포·DB 변경·메시지 발송은 하지 않았다.

## 수정한 연결 문제

- 검색 이력 reader의 결과를 일반 get_more_data serializer에 넘길 때 requestedKinds가 없어 발생하던 예외를 수정했다.
- 기본 최근 5개와 추가 페이지가 같은 텍스트 formatter를 쓴다. 회사 메모·회사 정보 등 다른 kind와 함께 조회할 수 있다.
- 역할명, 등록/시작/종료 시각, 평가/재사용/선정 수, 회사 자료 기반 planner 이유·방향을 제공한다. 미기록과 0, 선정과 발송을 구분한다.
- scheduled/requested 역할을 함께 보존한다. 비공개 fit·rerank 이유, 후보자 ID·SQL·오류 원문은 이력 projection에서 제외한다.
- 결합된 도구 결과의 길이를 배분할 때 완독 여부도 함께 갱신한다. 팀원 ID 길이도 포함해, 실제 LLM이 받지 못한 텍스트를 읽었다고 표시하지 않게 한다.
- 회사 제안 후보 조회의 Harper 선추천 카드/이메일 사실과 안내가 serializer에서 사라지던 문제를 수정했다.
- 간략 조회에서 읽지 않은 연락·일정·공유 정보는 null로 반환하고 미조회로 표시한다. 빈 목록으로 바꾸지 않는다. 회사 연락 목록의 공개 범위도 명시한다.
- 선택/관심/응답의 미확인을 부정으로 설명하지 않도록 원본 context와 서비스·근거 계약을 보완했다. 출력 키워드 검사·문구 덮어쓰기는 추가하지 않았다.
- 부가적인 전달 사실 조회 RPC가 실패해도 회사 후보자 목록 전체를 실패시키지 않는다. 오류 코드는 기록하고 전달 사실은 미확인으로 남긴다.

## 검증 결과

| 계층 | 결과 | 범위·해석 |
|---|---|---|
| 실제 executor → serializer 코드 회귀 | 131/131 | 이력 페이지, workspace 범위, 혼합 조회, 길이/완독, 입력 검증, 후보자 projection, 부분 정보 실패 및 기존 회사 대화 회귀 |
| v14 검색 이력, 최종 r4 | 5/5 기능·사실 의미 통과 | 기본 이력, 이전 페이지+회사 메모, 빈 기록, 대기/미기록 수치, 조회 실패. 추가 조회 및 효과 없음까지 원문 확인 |
| v15 선추천 정보, 최종 r6 | 3/3 핵심 사실·불확실성 의미 통과 | 실제 read_talent 호출, 카드/이메일 시각 구분, 관심·열람 미확인, 공개 범위. 쓰기·발송 효과 0 |
| 기존 v10 회귀 | 2대화·3발화 의미 통과 | 이전 추천 가능성, 기존 수락 후 연결 대기, 중복 Intro 불필요 |
| 운영 read-only 이력 조회 | 성공 | 한 workspace의 실제 2개 실행을 현재 reader와 serializer로 읽음. 이전 페이지 경계는 합성 11개 테스트로 검증 |
| 운영 전달 사실 RPC | 최초 PGRST202, 마지막 재조회 성공 | 처음에는 함수 조회 실패. 이후 동일 빈 대상 SELECT 호출은 성공. 별도 코드 reader도 정상 종료. 이 작업에서 DB 변경은 하지 않았으므로 상태 변화 원인은 확인하지 않았다 |
| 전체 TypeScript 검사 | 미통과 | 마지막 검사 22개 진단: 기존 generated validator·ignored 과거 평가 파일·다른 제품 파일. 이번 변경 파일의 타입 진단은 없음. 전체 build 통과로 주장하지 않음 |

모델은 현재 production 설정 google/gemini-3.8-flash / OpenRouter / medium / temperature 0.5를 사용했다.
각 run의 정확한 source fingerprint와 provider/config는 ignored manifest에 있다.
실제 DB/메일/Slack은 모델 평가에서 차단했다. 이력은 read-only 합성 table adapter 위의 production
reader/executor를, 선추천은 합성 board 사실 위의 production projection/serializer를 사용했다.
원문·tool trace·provider 응답은 runs에만 owner-only로 보존한다. 위 표는 코드 검증, 모델 의미 검토,
운영 SELECT를 합산한 하나의 성공률이 아니다.

## 중간 실패 보존

- v14 r1: 4/5 실행. 조회 실패 설명 중 provider timeout 1건. 실패 원문을 보존했다.
- v14 r2: 5/5 실행했으나 복합 요청에서 회사 메모 조회/답변을 빠뜨린 1건이 있었다. 도구 설명에서 각 데이터 원본과 복합 조회 계약을 정리했다.
- v14 r3/r4: 복합 요청 및 실패 설명까지 확인했다. 최종 r4를 위 표의 기준으로 사용한다.
- v15 r1–r5: 모두 실행됐지만 미확인을 무관심/미열람/무응답/접촉 없음으로 확대하는 실패가 반복됐다.
  단순 지시 추가만으로 해결됐다고 판단하지 않았다. 확인된 전달 사실 누락, 미조회 데이터를 빈 배열로
  표현하던 문제, 공개 연락 이력의 범위, null 표기 및 원본 근거 계약을 수정했다. 기존 입력/gold는 바꾸지 않았다.
- v15 r6: 세 대화의 전체 원문을 직접 읽어 핵심 사실·불확실성 통과로 판정했다. 이전 실패를 분모에서 지워 최초부터 성공했다고 주장하지 않는다.

## 남은 한계

- 같은 소규모 challenge를 보며 개선한 결과다. 독립 holdout이나 팀원의 blind review, 운영 평균 정확도가 아니다.
- 모델 답변에는 불필요한 설명/제안과 일부 내부 상태명 노출이 남는다. v15의 한 답변에는 수락 전 이력서 검토를 제안하는 부정확한 부가 안내도 있었다. 실제 비공개 이력서 접근/발송은 발생하지 않았지만, 전반적인 답변 품질을 완벽하다고 판정하지 않는다.
- 이력 pagination은 offset 방식이다. 읽는 도중 새 실행이 삽입될 때 snapshot cursor처럼 중복/누락 없는 연속성을 보장하지 않는다.
- 기본 이력은 최근 5개와 각 reason/strategy 길이를 제한하지만 고정 700-token 상한은 구현하지 않았다.
- 개별 run의 비공개 선정 이유나 후보자별 상세 기록은 회사 LLM에 제공하지 않는다.
- 운영 UI/Slack 렌더링·메시지 전달·전체 DB 권한 E2E·배포 검증은 하지 않았다.

## 재현

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v14 --run=<new>
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v15 --run=<new>
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v10 --run=<new>
```

최종 원문 run: `2026-10-07-matching-history-r4`, `2026-10-07-candidate-delivery-r6`,
`2026-10-07-history-regression-v10`. 입력/정답/재현 manifest는 각 v14/v15 파일에 고정되어 있다.
