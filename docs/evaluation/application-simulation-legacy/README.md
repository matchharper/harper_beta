# Application simulation legacy exploratory evaluations

PR #155에 포함된 세 합성 runner의 등록 기록이다. 이번 로컬 통합에서는 실행하지 않았다. 현재 capability loading/Memory/모드 전환 gate는 `../career-capability-loading/README.md`의 canonical runner를 사용한다.

## 목적·평가 단위·입력과 gold

- `scripts/evals/simulationSession.ts`: 시작 안내와 두 지원 준비 요청의 대화·session 변경을 확인한다.
- `scripts/evals/simulationActionCoverage.ts`: 고정된 requirement 3개와 진단을 입력한 한 단계 분석을 검토한다.
- `scripts/evals/simulationCompletionBudget.ts`: 동일한 합성 work area 18개로 completion budget 6500/18000을 비교한다.

Canonical 실행 코드는 위 repository 경로에만 있다. 합성 입력은 PR revision `ab50b1410f60be9aa74bd391667fbeb4f9aaa65a`의 runner에 inline으로 동결되어 있고, `manifest-v1.json`이 source hash를 고정한다. `gold-v1.json`은 기대 의미와 구조 계약이다. 실제 사용자·회사 원문은 없다. 입력·label을 바꾸면 새 version을 만든다.

## Prompt/output·모델·측정 계약

Production simulation prompt/schema/session mutation/provider adapter를 각 runner가 import한다. 모델은 source의 `GPT_6_LUNA_MODEL`; session main loop는 reasoning none, 시작 안내의 reasoning은 provider 기본값이다. completion budget 비교는 runner의 두 한도와 metadata를 기록한다. JSON schema/identifier/action coverage/truncation은 구조 검사이며 표현 품질은 원문을 gold와 대조하는 검토로 판단한다. 단어/정규식으로 의미를 평가하지 않는다. 이 작은 exploratory 실행은 production 비용·자유 대화 품질 또는 deployment gate를 대표하지 않는다. 정식 release gate는 현재 task의 등록 challenge와 별도 실제 tool/browser/database tests다.

## 개인정보·실행 제한과 알려진 한계

기존 runner는 `/tmp` 고정 경로로 raw 출력하며 request capture 및 완전한 외부-effect 차단을 갖추지 않았다. 최신 공통 tool과 UI/start-card 계약 전체를 재현하지도 않는다. **재사용 전에** raw 산출물을 이 task의 gitignored owner-only `runs/`로 옮기고, 실행별 manifest/request/usage를 저장하며, provider 이외 네트워크·DB·연락 전송을 차단하는 현재 registry 실행 경계로 runner를 보완해야 한다. 현재 파일을 production 환경변수로 그대로 실행하지 않는다. 이 제한은 이번 통합의 검증 결과에 해당 runner를 포함하지 않은 이유다. raw/private 데이터는 절대 커밋하지 않는다.
