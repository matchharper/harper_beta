# 역할 진행 공개 범위 변경 후 v10 재실행

- 고정 입력·gold: `v10`, `CSCQ1012-prior_exposure`와 `CSCQ1012-accepted_prior`.
- 첫 실행: `--dataset=v10 --case=CSCQ1012 --run=role-progress-visibility-20260930`. 최종 코드 재실행: 같은 고정 입력으로 `--run=role-progress-visibility-final-20260930`. 합성 read adapter만 사용했으며 운영 DB 조회·연락 발송은 하지 않았다. 원문·tool trace는 각 ignored `runs/<run>/`에 있다.
- 실행 자체는 두 대화·세 답변 모두 완료했다. `accepted_prior`의 두 답변은 기존 추천 수락, 연결 대기, 별도 Intro 요청 불필요를 올바르게 설명했다.
- `prior_exposure` 답변은 이전 거절/미응답 추천도 후보 목록에 있을 수 있다는 점을 설명했지만, 회사의 선제 제안을 후보자가 수락하면 “바로 연결”된다고 단정했다. 후보자 수락 뒤 Harper의 최종 확인이 필요한 현행 흐름과 맞지 않아 의미 gate는 **미통과**로 기록한다. 이번 공개 범위 변경의 효과라고 단정할 근거는 없다.
- 최종 코드 재실행의 두 대화·세 답변은 핵심 상태와 다음 행동을 올바르게 설명했다. `prior_exposure`에서는 바로 연결된다는 주장이 반복되지 않았다. `accepted_prior`에서는 수락과 연결 대기 사이의 Harper 최종 확인을 명시하지 않았으므로, 그 전환을 자동으로 단정하지 않도록 표현 검토가 남는다. 이 작은 합성 사례를 전체 company-side LLM 품질 통과로 확대하지 않는다.
- 이 합성 평가는 `open_to_company` 필터나 실제 progress 이관을 실행하지 않는다. 그 경계는 별도 코드·DB 검증 대상으로 남는다.
- 공통 `text` reader 수정 후 `--run=role-progress-single-text-20260930`으로 같은 frozen 사례를 재실행했다. 두 대화·세 답변은 완료했지만, `prior_exposure`에서 후보자 수락 뒤 추가 확인 없이 곧바로 연결된다고 다시 단정했다. 현행 Harper 최종 확인 절차와 충돌해 의미 gate는 **미통과**다. `accepted_prior`도 최종 확인을 명시하지 않았다. 합성 adapter는 이번 DB 칼럼 제거·공개 필터를 검증하지 않는다.
