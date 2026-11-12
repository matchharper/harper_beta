# 알림 설정 동의의 원본 LLM 판단

- 로컬 변경, 미배포. 운영 DB 쓰기·외부 발송 없음.
- `setRoleCreationNotification`의 발화 정규식·대상 이름 매칭과 기본값 우회 분기를 제거했다. 같은 executor를 사용하는 Role 작성 및 일반 대화 활성화 경로가 모두 적용된다.
- 원본 company-side LLM이 전체 대화의 대상 선택·동의·정정·철회를 판단한다. 도구 설명에 해당 전제를 명시했다. 별도 classifier/LLM/중간 판단 schema를 추가하지 않았다.
- 서버의 조직/Role 접근 권한, 채널·담당자 ID 검증, 최종 등록 상태 계약은 유지했다.

## 검증

- frozen `notification-consent-v1`, run `20261013-notification-consent-r1`: 6/6 대상 선택·무효과 확인, 전체 답변 직접 검토 6/6. 문맥상 승인 2건과 정정 1건은 각각 한 번 저장했고, 거절·다른 설정 승인·보류 3건은 저장하지 않았다. 미승인 Role 활성화 없음.
- 실제 기본 Gemini 3.8 Flash/OpenRouter, medium, temperature 0.5. production prompt/input builder·tool schema·completion validation을 재사용했다. 모델 raw response, tool arguments, source hash와 manifest는 ignored owner-only run 폴더에 있다. Gold는 호출 전에 동결하고 모델에 제공하지 않았다.
- 전용 도구·등록 계약 테스트 12/12 통과. `tsc --noEmit` 통과, diff whitespace 검사 통과.
- 함께 실행한 기존 prompt 테스트는 10개 중 9개 통과, 한 개는 기존 `prompt.length < 17000` 조건에서 실패했다. 이번 수정은 그 system prompt와 길이를 변경하지 않았으며, 기준을 완화하거나 제품 문구를 변경하지 않았다.

## 한계

- 합성 in-memory 도구 효과를 사용한 의미 검증이다. 실제 DB 저장·Slack 렌더링·전달·전체 Role 등록 E2E·독립 팀원 검토를 증명하지 않는다.
- 기존 Role v3 전체 재실행에 필요한 `company-talent-contacts/private/fixture.json`과 로컬 DB(55437)가 없어 해당 격리 E2E는 실행하지 못했다. frozen 입력은 보존했다.
- 신규 6건은 희귀 실패 유형에 대한 작은 challenge set이며 운영 평균 품질을 추정하지 않는다.
