# 추천 이력·과거 fit 평가 — 2026-09-28

승인된 제품 계약에서 만든 frozen `history-v1`에 production scorer/reranker/writer를 실제 호출했다. 회사/후보자에게 연락하거나 DB를 변경하지 않았다. 검토자는 구현을 담당한 Codex이며 독립 팀원 검토는 아직 하지 않았다.

| Run | 차이 | Frozen route 일치 | 추정 모델 비용 |
| --- | --- | --- | --- |
| `history-20260928T034905Z` | 초기 compact Role 입력 | 4/4 | 약 $0.0376 |
| `history-20260928T035110Z` | 과거 fit을 현재 조건과 비교하도록 Role 설명·근무 방식·보상 등 현재 입력 보강 | 3/4 | $0.02950 |

후자의 source hash/모델 설정/input은 `runs/history-20260928T035110Z/manifest.json`과 source snapshot으로 재현한다. 모델은 scorer GLM 5.3 Flash high, reranker GPT 5.6 Terra xhigh, writer GPT 5.6 Terra high다. 실행 전 설정 오류로 중단된 run도 삭제하지 않았으며 완료 run 수에 포함하지 않았다.

| 사례 | 마지막 run 판단 | 의미 검토 |
| --- | --- | --- |
| 역할 범위 오해로 거절했으나 현재 설명에 제품 ownership 근거 있음 | company_first | 이전 이해와 실제 책임 범위를 연결하고 회사가 구체적인 결정 권한을 설명할 수 있는지 확인하도록 했다. 이전 거절만으로 배제하지 않았다. |
| 과거 fit 96점이지만 현재 원격만 가능, 역할은 출근 필수 | no_action | 과거 점수를 맹종하지 않았고 현재 충돌을 반영했다. 회사 writer에 비공개 가족 사정을 전달하지 않았다. |
| 최근 Harper 추천 후 미응답, 현재 strong fit | no_action | 사전 gold는 company_first라 **불일치**다. 후보자 적합성은 인정했지만 별도 회사 검토의 추가 가치가 없다고 판단했다. 미응답을 수락/거절로 만들지 않았다. |
| 이력 없는 strong direct fit | candidate_first | 경력·조건 근거에 따라 기존 정상 경로를 유지했다. |

마지막 run의 frozen route 검사는 실패(exit 1)했으며 전체 gate 통과로 보고하지 않는다. 미응답 사례는 모델이 회사 제안 여부를 판단하도록 한 제품 계약상 가능한 재량이지만, 고정 gold와의 불일치는 그대로 남긴다. 이를 맞추기 위해 무응답 자동 선정 규칙이나 시나리오 분기를 추가하지 않았다. 향후 gold 범위를 바꾸려면 독립 검토와 새 version이 필요하다.

Scorer/rerank/writer 원문을 읽은 범위에서 관심·조건 변경 조작, 비공개 이유 노출, 약한 후보 수량 채우기 같은 critical 오류는 관찰하지 못했다. Writer가 과거 거절을 반드시 언급하지 않아도 회사가 확인할 책임 범위를 전달할 수 있음을 확인했다. 이 결과는 광범위한 품질 보장이나 운영 rollout 승인으로 간주하지 않는다.

DB 경합·history supersession·30일 자격·rerank 상한은 별도 executable 테스트로 검증했다. 이 LLM 평가에는 실제 SQL retrieval, 발송, 후보자 final delivery, 브라우저 E2E가 포함되지 않는다. 원문·식별자·완료 응답은 ignored run 폴더에 보존하며 이 보고서에는 집계와 해석만 둔다.
