# Role start discovery

목적: 온보딩 최초 Brief·질문 후보가 회사 사실과 내부 선호를 활용하고 새 판단축을 발견하는지 확인한다. 단위는 합성 Role별 최초 draft 한 번이다. 입력·gold는 cases-v1.json / gold-v1.md이며 실제 출력 전에 동결했다. 운영 자료·개인정보는 없다.

정본 runner: scripts/evalRoleStartDiscovery.ts. 실제 buildDraftSystemPrompt, DRAFT_SCHEMA, formatPromptText, callRoleStartJson을 재사용한다. 모델 gpt-6.1-sol, reasoning medium, 기존 최초 작성 출력 상한 6000. 데이터 provenance는 이번 작업에서 만든 합성 2건. provider 외 네트워크 차단, DB/메시지/저장 도구 없음. 원문 출력과 manifest는 ignored runs/의 0600 파일이다.

지표/gate: 2건 모두 구조 성공 + gold별 수동 의미 검토 통과, 허위 회사 사실·새 필수조건·차별적 기준 0. 모델 변경은 같은 frozen v1에 새 run을 만든다. manifest에 input/gold/prompt/source hash, model/provider, reasoning, 시각과 usage를 기록한다.

한계: 작성자 의미 검토의 작은 challenge set. 실제 UI 질문 선택 순서, 후속 자유 답변, 회사 DB 조회와 운영 지연은 검증하지 않는다. 질문 후보 중 무엇을 보여줄지는 별도 overlap 선택 로직에 의존한다.
