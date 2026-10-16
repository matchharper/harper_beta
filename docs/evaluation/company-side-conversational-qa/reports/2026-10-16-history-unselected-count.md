# 검색 실행 이력 미선정 인원 표시

로컬 변경이며 미배포다. 기본 context와 추가 이력 조회의 공통 formatter에
`전체 검토: N명, 추천 가능하지만 이번에 추천하지 않음: M명`을 제공한다.
M은 저장된 `counts.rerankPool - counts.selected`다. 방향별 선정 합계는
동일 후보를 중복 계산할 수 있어 사용하지 않는다. 피연산자 누락·역전은
기록 없음으로 표시하고 0으로 대체하지 않는다. DB·Worker 저장 경로는 바꾸지 않았다.
기존 pool 집계가 일반/우선 검토 중복을 포함할 수 있다는 한계는 유지된다.

## 검증

- `history.test.ts` 18/18 통과: 공통 reader/formatter, 두 방향 중복 선정,
  실제 0과 누락·역전, 페이지 조회 및 비공개 데이터 제외를 확인했다.
- frozen v14를 변경 없이 `20261016-history-unselected-r1`로 재실행했다.
  Gemini 3.8 Flash의 합성 5대화 실행은 완료했고 답변 전체를 검토했다.
  원문·소스 fingerprint·모델 설정은 ignored owner-only runs에 보존한다.
- 전체 의미 gate 통과는 아니다. 과거 입력의 `company_user_workspace` 테이블
  부재로 older_and_memory 조회가 실패했다. latest는 기존 formatter의 등록 시각을
  사용해 gold의 시작 시각을 제공하지 못했고, queued_and_legacy는 이전 전체 선정
  수를 생략했다. empty는 기록 부재의 원인을 추정했다. 이 범위 밖 문제는 수정하지 않았다.
- v14에는 새 rerank 수치가 없어 새 계산의 LLM 해석 품질은 검증하지 못했다.
  새 산술·누락 경계는 위 코드 테스트로 확인했다. 운영 DB·메시지 발송·배포는 없다.
