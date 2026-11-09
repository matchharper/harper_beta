# Terra 호출 설정을 Sol로 전환 (로컬·미배포)

사용자 요청으로 환경변수를 제외한 Terra 모델 선택을 `gpt-6.1-sol`로 변경했다.
Career 공통 fallback, 미팅 초대 fallback, 자동 회사 소개, Slack 이미지 입력,
Role calibration, 회사 모델 선택 UI와 Worker 회사별 reranker가 포함된다.
Career 일반 텍스트 채팅의 Sonnet 5.5 기본값은 유지한다.

저장된 회사 채팅 Terra 선택은 Sol로 해석한다. 환경변수 파일·Vercel 설정은 수정하지
않았으며, 명시적인 Terra 환경변수 override의 기존 동작도 보존한다. 과거 비용 계산,
실행 결과, frozen dataset/gold/manifest는 변경하지 않는다. 기존 평가 runner의 Terra
호출 설정도 Sol로 바꾸었지만, 역사적인 runner 파일명·fixture 식별자는 유지한다.

## 검증

- 회사 모델 설정, Career recovery/provider loop/tool budget: 최초 13개 통과.
  환경변수 예외 검사를 추가한 회사 모델 설정 파일은 최종 10개 통과.
- Worker `CompanyFirstModelConfigTest`: 3개 통과. reranker는 Sol/xhigh이며
  기존 token/temperature와 환경변수 override 계약을 유지한다.
- 변경한 runtime/runner 13개 TypeScript 파일의 구문 확인.
- 실제 모델: 기존 frozen v6의 `CSCQ501-web` 한 건을 canonical
  `scripts/evalCompanyAgentCapabilities.ts`로 실행했다. 명령 인자는
  `--dataset=v6 --case=CSCQ501-web --model=gpt-6.1-sol --run=20261015-terra-to-sol`.
  입력/gold는 그대로이며 원문·provider 요청/응답·source snapshot·manifest는
  ignored `runs/20261015-terra-to-sol/`에 owner-only로 보존한다.
- Sol completion 2회, 사용자 턴 1회, 오류 0, 약 11초. 전체 답변과 도구 결과를
  v6 gold에 대조했다. 알려진 직무·근무 조건을 보존하며 New role 진입을 안내했고,
  실제 역할을 등록했다는 허위 완료 주장은 없었다. 합성 write 효과는 0건이다.

이는 좁은 호출·대화 smoke이며 전체 회사 대화 품질 gate를 대체하지 않는다.
변경한 모든 업무의 실모델 품질, 실제 Slack 이미지 입력, Worker 선정 품질 및 운영
발송은 검증하지 않았다. 기존 전체 평가의 NO-GO 상태를 변경하지 않는다.
환경변수 변경, DB 변경, 발송, push와 배포는 하지 않았다.
