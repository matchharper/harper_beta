# Browser Use Cloud 실험 — 2026-10-23

기존 Stagehand 3.7.3 + GPT-6-luna와 입력·파일·승인 코드를 재사용하여, Browser Use Cloud 브라우저로 합성 지원서 제출을 완료했다. 운영 기본값은 Browserbase이며 이번 변경은 명시적으로 선택하는 테스트 경로다. 배포하지 않았다.

| 확인 | 결과 | 시작부터 검증까지 | 모델·브라우저·트래픽 비용 |
| --- | --- | --- | --- |
| 지원 항목 읽기 | 새 탭/iframe의 초기 입력란 7개, 접근 가능 판별 | 132.746초, 10단계 | 약 $0.004269 |
| 합성 지원서 제출 | 필수 입력·도시 선택·파일 2개·추가 질문·동의·수신 영수증 통과 | 532.091초, 42단계 | 약 $0.051832 |

제출 비용 중 모델 추정액은 $0.049150, Browser Use 브라우저 계측액은 $0.002667, 트래픽은 $0.000015다. 모델 비용은 저장된 실제 usage와 저장소의 기존 요금표로 산출한 추정치이며 청구서 대조 결과는 아니다. **기존 원격 실행 서버와 Storage 비용은 별도이며 여기에는 포함되지 않는다.** 유료 프록시는 명시적으로 껐다. API의 `proxyCost`에는 proxyless 트래픽 비용도 보고되므로 이를 유료 프록시 사용 증거로 해석하지 않는다.

제출 실행에는 원격 실행 환경 준비 약 138초와 최초 승인 대기 재개 확인을 위한 10초가 포함된다. 브라우저 자체 수명은 조회 106.290초, 제출 433.369초였으며 명시적 종료를 확인했다. 승인 요청은 기존 로직대로 첨부 관련 6건과 최종 제출 1건, 총 7건이었다. 테스트 caller는 소유한 테스트 사이트로 향하는 요청만 승인했다. 100단계 한도는 유지했다.

## 실제 검증 범위

- unchanged synthetic-v1 / gold-v1과 기존 공개 테스트 사이트 사용. 실제 후보자·고용주 지원은 없음.
- 수신 서버 서명 검증, 모든 합성 입력값 일치, 필수 동의 true·뉴스레터 false 확인.
- 원본 이력서 PDF 675 bytes와 포트폴리오 TXT 100 bytes의 파일명·SHA-256 일치. 작은 파일이므로 대용량 첨부 성능 증거는 아님.
- 대기 상태에서 실행 참조를 다시 읽어 동일 요청·내용인지 확인. 승인 중복 호출과 기존 gate 테스트로 재전송 방지 확인.
- 기존 승인 UI를 사용하는 상태 처리 테스트 포함, 관련 로컬 검사 26개 통과. 타입 검사에는 변경 범위 밖 기존 오류 3건이 남음: `OpportunitySwipeRow.test.tsx`, `jobTitleSimilarityServer.test.ts`, `slackCandidateWorkObject.server.ts`. 이번 변경 경로의 타입 오류는 없었음.
- 로컬 caller가 기존 서버 runtime을 호출했고, 실제 Stagehand·파일 작업은 기존 원격 서버에서, Chromium은 Browser Use Cloud에서 실행. 로컬 브라우저 실행 없음. Next HTTP route부터 화면까지의 전체 E2E나 새 배포 검증은 아님.

## 연결 보완 및 실패 보존

최초 검사 실행 2건은 모델 실행 전에 실패했다. 첫 실행은 API가 HTTPS CDP discovery 주소를 반환한 반면 어댑터가 WSS만 허용했던 문제였다. 실제 WebSocket 주소를 조회하도록 보완했다. 두 번째 실행은 기존 원격 실행 환경의 WebSocket 연결 실패였으며 Stagehand의 WebSocket 요청에 실행 환경의 CONNECT proxy를 연결한 뒤 검사·제출이 통과했다. 브라우저 공급자의 유료 프록시와는 다른 설정이다.

실패 2건과 연결 주소 확인용 1건의 브라우저 비용은 합계 $0.001이었다. 성공 실행까지 포함한 이번 실험의 모델·브라우저·트래픽 합계는 약 $0.057101이며 실행 서버/Storage는 제외다. 생성한 5개 브라우저 모두 `stopped`를 확인했다. 기존 Browserbase와 동일 입력의 최종 구현을 나란히 실행한 비교가 아니므로 성공률·속도 우위는 주장하지 않는다.

재현 runner는 `scripts/evalStagehandApplication.ts inspect|submit browser-use`. 원시 결과·usage·승인·서명 영수증과 source hash는 접근 제한된 ignored `runs/product-stagehand-browser-use-*`에, 비용 집계는 `runs/browser-use-cloud-summary-2026-10-23.json`에 보존한다. 기존 공개 JD 평가 결과와 합산하지 않는다.
