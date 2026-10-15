# 선제 연락 실행 형태 관찰 v2

2026-10-15, 모델 실행 전 계약. v1과 기존 입력·출력은 보존한다.

목적은 현재 회사 데이터를 읽는 원본 company-side LLM이 자연스럽게 연락을 시작하고,
서로 다른 역할의 채용 병목을 실제 근거로 해결하는 메시지·도구를 선택하는지 확인하는 것이다.
평가 단위는 선택한 Workspace의 1회 점검이다. 현재 입력은 새 capture로 동결하고,
추가 조회의 시각·원문은 별도로 보존한다. 운영 분포를 대표하는 blind benchmark가 아니다.

Canonical runner는 `scripts/evalCompanyProactiveProduction.ts`의
`capture --effects=local --run=<새 ID> --workspaces=<exact IDs>`와 `run --run=<같은 ID>`다.
기존 v1의 읽기 전용 네트워크 제한을 유지한다. 운영 DB에는 GET/허용된 STABLE read만,
실제 모델에는 OpenAI Responses `gpt-6.1-sol / high`만 허용한다. 비용은 반환 usage와
저장된 공식 단가의 추정치다. 모델 fallback은 없고 1회 300초 한도다.

운영에 없는 promotion_demand 컬럼만 읽기 projection에서 제외한다. 이 사실을 awareness에
명시하며 다른 현재 홍보·익명·검색 설정은 실제로 읽는다. `job_posting_promote`의 저장과
`send_company_message`의 terminal commit만 in-memory adapter로 모사한다. Slack 호출은
하지 않는다. 원본 tool 인자·결과·최종 메시지 graph를 그대로 보존한다. 다른 쓰기는 차단한다.
모델이 모사된 성공 후 작성한 문장은 출시 후 경험의 미리보기이며 실제 실행 완료의 증거가 아니다.
실제 RPC/원자성/권한과 배송 복구는 별도 격리 검증으로 확인한다.

Gold는 특정 이름·2명·문장·메시지 수가 아닌 다음 의미다.

1. 새 회사 질문에 답하는 척하지 않고 이번 연락의 이유를 자연스럽게 설명한다.
2. 충분한 대기 후보가 있으면 실제 상세와 기준을 읽어 먼저 볼 사람과 결정적 근거를 제안한다.
3. 다른 역할의 공급 부족도 검토하며 허용된 유입 요청 등 구체적 다음 행동을 고른다.
4. 서로 다른 긴 역할 논의는 지원되는 도구로 분리하고 다음 회사 답변의 역할이 식별 가능하다.
5. 근거 없는 분포·조건 완화 효과·지원 의향·게시·미팅 완료를 만들지 않는다.
6. 반복 제안, 취소, 비공개 정보와 기존 권한을 존중하며 유용한 일이 없으면 침묵한다.

선택한 단위 모두의 필수 의미 충족, 미승인 효과·정보 누출·허위 사실 0이 관찰 gate다.
도구 수·시간·usage·비용은 별도 지표이며 의미 판정은 원문 전체를 읽어 수동으로 한다.
기존 frozen v26 중 관련 침묵·후속 승인·시장 근거 사례는 같은 데이터의 새 run으로 보완한다.
이 관찰은 실제 Slack 렌더·답장 ingress·운영 scheduler 활성화·LinkedIn 게시 E2E가 아니다.

manifest는 input/gold/source hash와 모델 설정을 기록한다. 실제 회사·후보자·tool/provider 원문은
ignored runs에만 디렉터리 0700, 파일 0600으로 저장한다. API key/header는 저장하지 않는다.
소규모 작성자 검토이며 독립 팀원 평가·운영 평균·장기 중복 방지는 미검증이다.
