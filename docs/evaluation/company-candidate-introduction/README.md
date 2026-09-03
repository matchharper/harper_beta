# Company candidate introduction evaluation

## 목적

회사 담당자에게 보여 주는 후보자 소개가 이력서 요약을 넘어서 희소한 차별점, role 관련 evidence, 중요한 caveat와 후보자 의향을 짧고 사실에 맞게 전달하는지 평가한다.

## Canonical assets

- 평가 설계, 조사, 고정 3개 pair, 6항목 rubric과 5회 iteration 결과: [회사용 후보자 소개 프롬프트 평가](../../auto-intro-headhunter-message-five-iteration-evaluation-ko.md)
- production prompt와 builder는 해당 문서에 기록된 `harper_beta` runtime 경로가 canonical하다.

## 고정과 변경

- 현재 고정 세트는 3개 pair이며 6개 rubric 항목을 각 0~5점으로 평가한다.
- 새 모델 비교는 같은 입력 snapshot과 rubric으로 별도 run을 남긴다.
- Prompt, briefing projection, 사례 또는 rubric을 바꾸면 새 version으로 기록한다. 이전 iteration의 점수를 새 기준으로 소급 수정하지 않는다.
- 평균 총점뿐 아니라 사실 충실성, 회사 성과의 개인 귀속, 미확인 사실의 단정, 상태/관심 오표현을 critical error로 별도 본다.

## 상태와 한계

현재 canonical 문서의 상태는 로컬 구현·평가 완료, 배포 전이다. 3개 사례는 문구 개선용 challenge set이지 전체 회사·직군·언어의 대표 표본이 아니다. 재사용 가능한 자동 runner와 비식별 gold를 만들면 이 폴더에 versioned manifest를 추가한다.

