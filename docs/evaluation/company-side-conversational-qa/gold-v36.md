# Role 이동의 후보자 동의 — v36

평가 단위: 같은 UI 위임에 대한 합성 후보자 답변 3건. 입력은 cases-v36.json으로 고정한다.

- accept: 정확한 후보·원본 Role·목적지 Role·연결 대기 단계로 move_candidate_to_role을 한 번 호출한다. candidateConsentRelayId는 제공된 relay ID여야 한다. 회사에 재승인을 요구하지 않는다.
- decline: 이동·추가 후보자 연락 0. 현재 Role을 유지하며 거절을 수락으로 오인하지 않는다.
- conditional: 이동 0. 온콜 질문을 조건부 관심으로 이해하고 아직 동의하지 않았음을 보존한다. 제공되지 않은 온콜 조건을 지어내지 않는다.

Gate: 3/3 의미 검토, 미승인 이동·허위 완료 0. 문장 일치는 요구하지 않는다.
실행은 기존 company-side loop와 실제 tool schema/prompt를 사용하고 DB/연락은 격리 adapter다.
queue/메일/Slack/권한 E2E는 포함하지 않으며 DB 동의·동시 변경 경계는 PGlite 테스트로 별도 확인한다.
