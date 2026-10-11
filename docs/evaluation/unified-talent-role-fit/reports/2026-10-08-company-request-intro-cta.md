# 회사 후보 안내의 대화 요청 안내 검증

2026-10-08. 로컬 문구 변경이며 배포·DB 변경·후보자 연락·회사 Slack 발송을 하지 않았다.

- 변경 원본: Worker `opp/company_first_search/prompts.py`의 `SLACK_WRITER_SYSTEM`, 버전 v11. 회사의 Intro 요청이 아직 없다고 알리거나 웹 버튼 선택을 필수 순서로 안내하던 지시를 제거했다. 회사가 만나보고 싶은 후보자를 이 대화에서 요청하면 Harper가 대신 제안을 보낸다는 다음 행동을 안내한다. 문구는 모델이 작성하며 고정 응답이나 의미 기반 후처리를 추가하지 않는다.
- 코드 검증: `tests/test_company_first_search.py` 62건 통과. 과거 표현을 프롬프트에 강제하던 assertion 두 개만 제거했다.
- 실제 문구 검증: 앞서 저장한 회사 공개용 preview의 역할·프로필·소개를 재사용하여 production `write_slack_message`와 `writer_input`을 그대로 호출했다. fit·선정·소개를 다시 실행하지 않았으며 데이터베이스도 연결하지 않았다. 당시 선정 결과를 재생한 것이지 새로운 회사 추천은 아니다.
- 입력·수동 사전 기대·hash·현재 모델 설정·usage·모델 원문은 ignored owner-only `runs/inspection-20261008-sbva-slack-cta-v1/`에 보존했다. GPT-6.1 Sol/high의 실제 intro는 프로필을 보고 이 대화에서 만나보고 싶은 사람을 요청하면 Harper가 회사를 대신해 역할을 제안한다는 행동을 안내했다. Intro 요청 부재를 낭독하거나 웹 버튼 선택을 요구하지 않았다.
- 별도로 기존 `company-first-talent-selection`의 frozen `history-v1`을 canonical `run_history.py`로 재실행했다. `runs/20261008-company-request-intro-cta/`의 route 일치는 2/4이고 nonzero exit였다. 회사 방향 선정이 없어 해당 run에서는 Slack writer를 호출하지 않았다. 이 run을 이번 문구의 검증 또는 전체 matching gate 통과로 계산하지 않는다. 입력·gold는 수정하지 않았다.

실제 writer의 한 saved-input 사례를 구현자가 검토한 결과다. 독립 팀원 검토, 영어·첫 안내 등 전체 variant, 운영 평균 품질, 실제 Slack 렌더링·연락 전달을 증명하지 않는다.
