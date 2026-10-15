# 일반 회사 대화의 Role 설정 — 로컬 구현

문서 기준: 2026-10-15. 배포·운영 DB 변경·실제 Slack 전송 없음.

## 변경

- 일반 company-side LLM에도 기존 `set_role_notification` 저장 능력을 제공한다. 설정 저장은 채용 상태를 바꾸지 않고, 승인된 활성화는 기존 `change_role_status` 완료 검사로 진행한다.
- `read_role(include=[notification])`는 실제 설정, 접근 가능한 담당자 후보, 회사의 활성 Slack 채널, 현재 팀원/채널 표시와 draft의 명시적 선택을 읽는다. 읽기 자체는 작성 대화를 만들거나 설정을 쓰지 않는다.
- 작성 전용 대화도 실제 현재 Slack 채널을 받는다. 최초 작성 스레드의 위치를 현재 대화 위치로 추측하지 않는다.
- 팀원 온보딩 첫인사는 채널과 팀원 모두에게 공개 가능한 draft의 확인된 설정만 받는다. LLM이 유용한 설정·채용 시작 제안을 판단하며, 가입 사건 자체는 쓰기 승인이 아니다. 두 Role 같은 고정 개수·정규식 승인 판단·별도 상태 머신은 없다.

## 검증

- 관련 비모델 검사 35개 통과: capability 연결, 도구 schema, 기존 선택/실패 복구, 현재 채널 입력/결과 serialization, 첫인사 공개 범위와 복수 draft 사실 전달.
- TypeScript 검사 통과. 변경 파일 whitespace 검사 통과.
- v27 `20261015-general-role-setup-r2`: 실제 기본 Gemini/OpenRouter + 일반 production loop에서 전체 승인, 설정만 승인, 일부 Role 승인 3개 slice의 답변·도구·최종 상태를 Codex가 검토했다. 정확한 현재 채널/팀원, 승인 범위와 상태 유지 통과.
- 첫 r1의 합성 adapter는 기존 결합 활성화 인자를 지원하지 않아 가짜 오류를 냈다. production 변경 없이 adapter를 바로잡아 r2로 재실행했다. 초기 결과는 보존한다.
- v27 정보 누락 사례는 저장된 지역과 합성 완료 검사 응답이 모순됐다. 기존 입력/gold는 보존하고 해당 지역을 null로 정정한 v28의 해당 slice만 `20261015-general-role-setup-v28-r1`로 재실행했다. 두 Role 설정 저장, 준비된 Role만 활성화, 다른 Role은 draft 유지 및 누락 지역 질문을 답변·최종 상태에서 확인해 통과했다. 다른 세 입력·gold 의미는 동일하다. 전체 v28 실행으로 표현하지 않는다.
- 첫인사 `member-welcome-v2 / 20261015-role-setup-welcome-r1`: 실제 writer가 두 draft와 현재 채널·팀원을 근거로 설정 및 채용 시작을 제안했고 완료됐다고 주장하지 않았다. 작성 계층 의미 검토 통과.
- 기존 `member-welcome-v1 / 20261015-role-setup-welcome-regression-r1`: 4건 생성, 3건 기존 환영·Calendar·공개 범위 의미 통과. draft 사례는 구 fixture에 새 설정 조회 자료가 없어 adapter가 빈 목록을 제공했는데도 현재 대상을 제안했다. 이 결과는 대상 적격성 검증 통과로 계산하지 않는다. 실제 옵션을 동결한 v2가 이번 기능의 대상 선택 근거다.

## 한계

모델의 전체 답변과 합성 효과는 확인했지만 실제 운영 Slack ingress부터 DB 저장·알림까지의 E2E는 하지 않았다. 기존 서버 권한/소속 검증과 저장 후 재조회를 재사용한다. 작은 작성자 challenge이며 독립 팀원 검토나 운영 평균 품질을 증명하지 않는다. Raw 대화·provider 응답·usage·review는 각 ignored owner-only run 폴더에 보관한다. Notion은 배포 문서이므로 변경하지 않았다.
