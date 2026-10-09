# Company onboarding Pitch

온보딩의 회사 소개 입력이 기존 company-side LLM과 공통 수정 도구를 통해 실제 Pitch에 저장되는지,
기존 사실 보존·정정·언어와 처리 시간을 확인한다. 별도 extractor나 평가 전용 production 분기는 없다.

## 현재 계약 v2 — 회사의 매력

사용자 정정에 따라 Pitch를 후보자에게 회사를 어필할 강점과 근거로 평가한다. 사실 보존뿐 아니라 어떤 회사이고 왜 합류할 만한지 이해할 수 있는지, 구체적인 성과·환경·혜택의 조건을 정확히 유지하는지, 직무 설명이나 경력 요건으로 바뀌지 않는지를 전체 저장본과 답변에서 자체 검토한다. 특정 광고 문구나 양식을 강제하지 않는다.

- Frozen: `cases-v2.json`, `gold-v2.md`, `manifest-v2.json`. v1의 세 입력을 유지하고 성장 성과·조건부 비자 지원·잘못 들어간 직무 설명을 고치는 합성 사례 세 개를 추가한다. 기존 v1은 변경하지 않는다.
- Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyOnboardingPitch.ts --dataset=v2 --run=<new-id>`. 생략 시 기존 v1을 사용한다. 실행 중 runtime source가 바뀌면 새 run을 요구한다.
- Gate: 6/6 실제 저장, 회사 매력과 필수 의미·혜택 조건 보존, 미승인 효과·허위 완료 0. 답변의 장황함과 군더더기는 별도 사용성 판정이다. 모델 종료나 문자열 일치로 의미 pass를 만들지 않는다.
- 모델·input contract·로컬 실행·개인정보 경계는 아래 v1과 같다. 입력과 gold를 수정하는 실험은 새 dataset version, prompt 수정은 같은 v2의 새 run으로 보존한다.
- 알려진 한계: v1 원문을 본 뒤 만든 자체 평가이며 독립 검증이나 운영 대표 표본이 아니다. 새로운 세 사례도 합성 gold이고 팀원의 독립 검토는 아직 없다.

[2026-10-09 회사 매력 재검증](reports/2026-10-09-pitch-appeal.md): 최종 여섯 사례의 실제 저장·회사 강점·혜택 조건 자체 검토 통과, Pitch 수정만 요청, 관련 없는 추가 입력 질문 0. 6.949~11.066초, 각 두 번 호출. 중간 답변 의미 실패와 최종 반복 안내 한 건을 별도로 보존한다. 미배포 상태다.

## 기존 계약 v1 — 저장 정확성과 시간

- 평가 단위: 새 합성 회사의 한 발화, 최종 사용자 답변, 실제 저장본과 호출 trace.
- 동결 입력/정답: `cases-v1.json`, `gold-v1.md`, SHA-256 `manifest-v1.json`. 모델/설정 변경은 같은 입력의 새 run이며 기존 run을 덮어쓰지 않는다.
- 입력 계약: 이름, 기존 Pitch, 사용자 입력, `ko|en`. 실제 온보딩 prompt와 route의 공통 모델/capability 옵션을 import한다.
- Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyOnboardingPitch.ts --run=<new-id>`.
- 실행 조건: 기존 `.local/full-stack` 격리 DB가 실행 중이어야 한다. loopback URL과 `local_e2e.environment=harper-local-e2e`를 확인한다. 운영 DB·메일·Slack·Worker는 사용하지 않는다. Role은 만들지 않는다.
- 설정: 기본은 route와 같은 Haiku 5.5 / OpenRouter / high. 모델·입력/source hash, provider request/response, 실제 저장본과 latency는 owner-only ignored `runs/`에 기록한다.
- Metrics: 실제 저장 완료, 호출 수, 전체 latency, 답변과 저장본의 의미·언어·기존 정보 보존, 잘못된 효과.
- Gate: 3/3 저장 및 gold의 필수 의미 자체 검토, 미승인 효과·허위 완료 0. 속도 목표는 각 30초 이내이며 실패를 숨기지 않는다. 문자열/말투 규칙으로 LLM 품질을 판정하지 않는다.
- 출처/개인정보: 모든 자료는 합성. 첫 사례는 2026-10-08 기존 지연 확인 입력을 고정한 재현 사례이고, 나머지는 정정·한국어 범위를 확장한다. 실제 후보자/회사 데이터는 없다. 생성 계정·회사는 exact ID로 즉시 정리한다.
- 한계: 소수의 개발 환경 표본이며 운영 평균, provider 안정성, 독립 팀원 검토 또는 브라우저/API transport 검증이 아니다. 과거 186초 측정과의 비교는 다른 시점의 관측값이다.

실행 전에 gold를 동결한다. 원문은 `runs/`에만, 공개 결과와 남은 한계는 `reports/`에 기록한다.

[2026-10-09 Haiku high 검증](reports/2026-10-09-haiku-high.md): 최종 3/3 실제 저장, 6.728~9.678초·2회 호출. 완료 안내의 군더더기와 일반 이벤트 QA 실패는 별도 한계로 보존한다. 미배포 상태다.
