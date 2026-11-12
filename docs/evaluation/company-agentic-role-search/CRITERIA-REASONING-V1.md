# 동일 후보 criteria 작성 reasoning 비교 v1

- 목적: 사용자가 요청한 `gpt-6-luna` low/medium/high를 각 한 번 실제 호출하고, 생성 원문·비용·병렬 경과 시간을 비교한다. 기본 모델 설정이나 운영 동작은 변경하지 않는다.
- 평가 단위: Vooy Designer와 Moss FDE의 기존 frozen 입력에서 동일 점수 Top 10씩, 후보 20명 × reasoning 3종 = 기본 60회 호출. 한 호출은 해당 후보의 criteria 5개와 TL;DR·Harper Note·추천 이유를 함께 작성한다. criteria만의 비용으로 오해하지 않게 이 범위를 보고한다.
- 입력·gold: `read-only-roles-v1-vooy-v61`, `read-only-roles-v1-moss-v61` capture/evaluation/selection-input을 재사용한다. [selection-gold-v1.json](selection-gold-v1.json)의 원문 보존·동일 선정·기준 coverage·점수/라벨 보존 기대값은 유지한다. 후보 적합성이나 문장 품질의 인간 gold는 없다. frozen 원본은 수정하지 않는다.
- Prompt/input 계약: 현재 production `write_presentation`과 공통 입력 formatter를 직접 재사용한다. 모든 비교에 동일 공개 Profile·Hiring Brief·criteria·Search Brief·기존 점수/라벨·한국어 출력을 적용한다. Memory·추가 조회·1·2차·reranking은 실행하지 않는다. 세 조건의 실제 system/input을 hash로 비교한다. 모델 입력의 날짜는 기존 공통 formatter를 통과하며 raw snapshot/manifest 날짜는 저장 원본으로 보존한다.
- Canonical runner: `harper_worker/llm_evals/company_agentic_role_search/replay_selection.py --model gpt-6-luna --reasoning <low|medium|high> --count 10 --concurrency 64 --locale ko`. 역할 두 개를 동시에 실행하고 reasoning 그룹은 low → medium → high 순으로 실행한다. 역할별 실제 요청 10개, 그룹 최대 20개 병렬이다.
- 실행 설정: 모델·입력·temperature·출력 예산은 동일하고 reasoning만 바꾼다. temperature 설정 0.3은 공통 adapter가 실제 provider 지원 여부에 따라 처리한다. maxTokens 128000으로 기존 작은 기본 제한을 피한다. 구조 오류 교정/일시 재시도가 발생하면 숨기지 않고 호출·usage·시간에 포함한다. 더 좋은 결과를 고르기 위한 재실행은 하지 않는다.
- 지표: 성공/실패, 실제 모델·reasoning, 호출 수·attempt, 입력·출력·추론·캐시 토큰, 기준 coverage, 점수·라벨 보존, 그룹 및 역할별 병렬 wall time, 실제 usage 기반 추정 USD. 원문은 후보/기준별로 세 결과를 나란히 제공한다. 평균 개별 지연과 병렬 wall time은 구별한다.
- 비용: `pricing.py`의 versioned Standard/global 요율과 실제 usage. OpenAI 공식 모델/가격 페이지를 다시 확인한다. 캐시 write TTL이 미보고면 범위로 표시한다. 실제 청구 내역·할인·우선 처리 요율이라고 주장하지 않는다. 조회·scoring·다른 과거 run 비용은 포함하지 않는다.
- 출처·개인정보: 이전 승인된 실제 역할·후보 frozen capture. DB connection 없이 기존 승인된 provider로만 호출하며 운영 저장·연락·배포 0. 원문·출력·이름·개별 평가·비공개 비교 뷰는 ignored `runs/criteria-reasoning-v1/` 아래 owner-only 파일에 보존한다. 공개 문서는 비식별 집계만 담는다.
- 판정/한계: 구조 검증을 통과해야 유효한 비교로 본다. 각 조건 1회, 같은 후보 20명으로 품질 우열·일반 지연을 확정할 수 없다. 실행 순서·공유 provider 부하·캐시 상태가 비용/시간에 영향을 준다. 문장은 직접 검토하되 자동 정성 점수·시나리오 분기·점수 보정은 만들지 않는다. 이 비교는 운영 설정 자동 채택 gate가 아니다.

재현에 필요한 role별 원본 파일 hash와 선정 ID는 실행 전 private baseline manifest에 저장한다. 각 run의 source/manifest/trace와 원문 비교 보고를 함께 보존하며, 실패한 run을 덮어쓰지 않는다.
