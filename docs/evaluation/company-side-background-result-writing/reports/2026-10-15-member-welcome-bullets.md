# 팀원 환영 기능 소개 보완

- 로컬 변경·미배포. 사용자 요청에 따라 `/org/onboarding`의 guideItems 세 가지를 환영 목적에 반영하고 짧은 bullet point로 한 번 소개하도록 했다.
- 원본: `src/lib/org/onboardingSlack.server.ts`. 기존 company-side 모델·공통 system prompt·1회 도구 없는 completion을 유지한다.
- 기존 frozen `member-welcome-v1` 입력·gold는 변경하지 않았다. canonical runner `scripts/evalOrgOnboardingSlackWelcome.ts`로 새 run `welcome-bullets-20261015-1`, `welcome-bullets-20261015-2`를 실행했다.
- 첫 run은 4/4 생성했지만 제한된 역할 목록을 조직 전체 채용 현황으로 확대하는 영어 사례가 있어 의미 검토에서 실패했다. 목록이 부분 조회이며 기존 후보자 진행 여부를 나타내지 않는다는 사실 범위를 보완했다.
- 두 번째 run은 4/4 생성. 전체 원문을 읽어 세 기능의 짧은 bullet 소개, Calendar 신규 연결/저장 상태 구분, 제공 링크, 권한 밖 역할 미노출, 미실행 작업 완료 주장 부재를 확인했다. 이전 조직 전체 현황 단정은 재현되지 않았다.
- 일부 안내는 일반적인 후속 제안이나 인사로 끝난다. 표본 4건의 작성자 검토이며 독립 평가나 대표 품질 검증이 아니다. 실제 Slack 발송·가입·브라우저 이동·배포는 실행하지 않았다.
- Harper workspace read-only 미리보기도 첫 prompt 변경 후 실행했다. 실제 정보와 원문은 ignored runs에만 보존했다. 최종 범위 보완은 위 합성 4건으로 검증했다.
