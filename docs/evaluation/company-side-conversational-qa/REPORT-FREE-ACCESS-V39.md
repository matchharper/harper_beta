# Free 기능·공용 3 Intro 평가 v39

2026-10-27 로컬 구현 확인이며 운영 배포 결과가 아니다.

- 동결 입력/기준: `cases-v39.json`, `gold-v39.md`, `manifest-v39.json`.
- 실행: `scripts/evalCompanyAgentCapabilities.ts --dataset=v39 --run=2026-10-27-free-access-v39-r1`.
- 모델: 실제 회사 agent의 Gemini 3.8 Flash, medium. 3대화/3턴, 실제 completion 3회. 합성 workspace와 도구 adapter를 사용했고 운영 DB와 외부 발송은 차단했다.
- 실제 provider에 전달된 시스템 안내에서 Free의 후보자 선추천·연결 대기, 공용 3 Intro, 유료 슬롯 50 Intro와 차감 순서를 직접 확인했다.

| 사례 | 전체 답변의 의미 검토 |
| --- | --- |
| free_ko | 통과. 슬롯 없는 추천·연결 대기 가능, 공용 잔액으로 연결 수락 1 Intro, 결제 필수 아님, 기본 월 3개를 안내했다. |
| slots_en | 통과. Free 1개 + 유료 1개로 활성 2개, 공용 3개 유지 + 슬롯 50개, 해당 슬롯→공용 차감과 미배정 Role 접근을 설명했다. |
| zero_ko | 통과. 잔액 0이어도 조회·검색·추천이 잠기지 않고, 새 요청·연결 수락에만 잔액이 필요하다고 답했다. 실제 계정 잔액을 조회했다고 주장하지 않았다. |

판정: 3/3, 유료 전용 오안내·허위 실행·미승인 효과 0. 답변에 다소 반복적인 설명은 있으나 기능·차감 정책의 오류는 없다. 이 판정은 합성 3사례에 한하며 운영 DB·메시지 전달 E2E를 증명하지 않는다. 원문, provider 요청, prompt fingerprint와 모델 설정은 ignored owner-only `runs/2026-10-27-free-access-v39-r1/`에 보존한다. 기존 v37·v38 입력과 기대값은 변경하지 않았다.

## 후속 정책 점검 재실행

`2026-10-27-free-access-v39-audit-r2`에서 같은 동결 입력으로 현재 회사 LLM을 다시 실행했다. 3대화·3 completion이 완료됐으며 전체 답변을 직접 검토했다. Free 접근·3개 제공·활성 Free 1개, 유료 슬롯과의 공존·차감 순서, 잔액 0에서 조회·추천 유지와 실제 요청·수락 차감이라는 각 사례의 핵심 의미가 모두 맞았다. 허위 실행·미승인 효과 0, 의미 판정 3/3이다. 잔액 0 사례의 활성화 설명은 Intro 소진에 따른 제한이 없다는 문맥이며 별도 활성 Role 한도를 없애는 정책 변경이 아니다. 답변의 반복·맺음말은 남아 있으며 작은 합성 세트의 한계는 동일하다.

별도로 실제 회사 loop의 `prepareToolDeliveryParts` → `formatOrgAgentToolResult` → `formatCompanyRoleSearch`를 사용해 합성 조회 결과를 렌더링했다. 유료 자격 대신 활성 상태·접근 권한과 신규 추천 완료의 구분을 제공한다. 원본 result를 변경하거나 모델 답변을 규칙으로 교체하지 않았다. 모델 실행 원문은 ignored owner-only `runs/2026-10-27-free-access-v39-audit-r2/`에 보존한다.
