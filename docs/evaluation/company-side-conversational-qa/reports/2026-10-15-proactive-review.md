# Company-side 선제적 점검: 오류·대화 품질 검토

- 기준일: 2026-10-15
- 판정: 로컬 수정과 일부 행동 개선은 확인했다. **정기 자동 발송의 전체 품질 gate는 미통과**다.
- 범위: 기존 company-side 원본 모델·일반 tool loop, 선택적 scheduled-review 입력, 후속 회사 답변, 설계 문서. 정기 scheduler·공고 홍보·임의 Slack 스레드·market reader는 구현하지 않았다.
- 운영 효과: 배포·DB 변경·실제 후보 연락·Slack 발송 없음. 합성 데이터와 격리 도구로 평가했다.

## 고친 문제

| 문제 | 수정과 의미 |
| --- | --- |
| Background 입력이 항상 검증된 제품 사건으로 설명됨 | 선택적 `scheduled_review` origin을 명시했다. 새 회사 지시나 필수 알림으로 취급하지 않고, 읽은 뒤에도 조용히 완료할 수 있다. 기존 product-event의 전달 의무는 유지한다. |
| 정기 caller가 전체 도구를 열려면 전역 mode 변경이 필요 | 실행별 capability mode를 전달한다. 지원 schema와 같은 policy를 함께 사용하며 정상 executor의 권한을 유지한다. 실제 scheduler는 아직 연결하지 않았다. |
| 평가에서 실제 후속 회사 답변을 처음의 event로 덮어씀 | Frozen turn origin을 명시하고 첫 event 뒤의 문자열은 실제 회사 발화로 처리한다. 숨은 event를 회사가 한 말로 저장하지 않으며 조용한 완료도 가짜 답변으로 저장하지 않는다. |
| 회사가 구체적인 질문 발송을 승인했는데 초안 승인을 다시 요구 | 일반 질문의 명시적 승인과 첫 접촉 문안 검토가 필요한 경우를 기존 contact policy에서 구분했다. Preview-only 요청과 중요한 문안 검토 계약은 유지한다. |
| 후보자 연락에 회사가 표현하지 않은 긍정 평가를 추가 | 전체 원문 검토에서 발견했다. Harper의 판단과 회사가 실제 표현한 평가·의사 결정을 구분하도록 기존 contact policy를 보완했다. 아래의 후속 선택 실행으로 별도 검증한다. |
| 파이프라인을 시장 전체 분포로 읽을 여지 | 일반 조회 설명에 회사에 이미 공개된 후보 범위와 전체 시장의 차이를 명시했다. 빈 선택 criteria도 broad request가 매칭에 쓰이지 않는다는 뜻이 아니다. |
| 보고서 같은 반복 설명·막연한 업무 메뉴 | 공통 UX prompt와 review 입력에 이번 대화의 판단·근거·Harper가 맡을 다음 일을 먼저 설명하도록 보완했다. 문장이나 어미를 코드로 교정하지 않는다. |
| 72시간 전체 중단·검색 중 전체 중단 설계 | 최근 실제 발송을 보고 의미 반복만 생략한다. 별도 승인 업무는 진행 중 검색과 무관하게 계속할 수 있게 계획을 수정했다. 일일 job 멱등성과 실제 대화 충돌 경계는 유지한다. |

검증기 자체도 수정했다. 합성 `read_role`가 요청한 description을 미조회로 표시하고, 요청하지 않은 pipeline까지 반환하던 계약 오류를 고쳤다. Pipeline의 전체 stage count와 필터된 people page도 구분한다. ACL fixture와 최신 followup schema에 뒤처진 테스트를 맞췄으며 production 권한 검사를 완화하지 않았다.

## 입력 버전과 실제 실행 경계

[v25 입력](../cases-v25.json)·[gold](../gold-v25.md)·[manifest](../manifest-v25.json)는 최초 모델 호출 전에 동결한 합성 9대화·13턴이다. 반복 점검과 회사의 다음 답변을 같은 단위로 평가한다.

[v26 입력](../cases-v26.json)·[gold](../gold-v26.md)·[manifest](../manifest-v26.json)는 시장 사례의 원본 통계 의미를 정정했다. v25의 최신 평가 18건을 긍정 적합 후보 18명으로 해석한 출력이 발견됐다. 새 버전은 평가 coverage·적합·소개 자격·관심·실제 소개 전달과 기간을 명시적으로 구분한다. 기록되지 않은 종료 사유도 미제공 사실로 명시하고 legacy stage를 canonical stage로 고쳤다. 입력을 본 뒤의 정정이며 blind holdout이 아니다. 기존 버전과 gold는 보존하고 기대 행동을 완화하지 않았다.

Canonical runner는 `scripts/evalCompanyAgentCapabilities.ts --dataset=v26 --mode=full --run=<new>`다. 실행 당시 기본 설정인 OpenRouter `google/gemini-3.8-flash`, reasoning `medium`, temperature `0.5`, turn timeout 120초를 유지했다. 별도 판단·작성 LLM은 추가하지 않았다. 실제 모델·system/input·schema/policy·loop를 쓰되 read/write 효과는 합성 adapter다. 직접 연락 문안은 원본 모델이 작성하며 production direct-message preparation을 사용한다. Draft adapter와 외부 배송은 운영 경로 검증이 아니다.

Provider만 네트워크를 허용하고 DB·Slack·메일·Calendar는 차단했다. Source snapshot·설정·input/prompt hash·raw completion·tool effect·수동 검토는 ignored owner-only `runs/`에 남긴다. 이 보고서에는 모델 원문이나 운영 회사·후보 정보를 복사하지 않는다.

## 실행 기록

각 run은 소스가 달라질 수 있어 같은 최종 revision의 반복으로 합산하지 않는다. 실행 완료와 의미 통과는 별개다.

| Run 접미사 | 실행 범위·결과 | 의미 검토와 용도 |
| --- | --- | --- |
| `proactive-quality-r1` | v25 전체 9/9대화·13턴 실행 | 침묵·조회·승인 뒤 연락 등은 관찰됐으나 시장 제안에 미확인 기준·원인 추정이 있어 전체 실패. |
| `proactive-quality-r2` | 전체 중 6/9대화 완료 | 3대화 provider 연결 종료/timeout. 실패 실행으로 보존. |
| `proactive-quality-r3` | 선택 2/2 완료 | 최신 취소와 시장 입력 재검토. 전체 회귀가 아니다. |
| `proactive-quality-r4` | 전체 중 7/9대화 완료 | 2대화 연결 종료. 승인 뒤 추가 초안 승인을 요구하는 마찰과 시장 제안의 한계를 확인. |
| `proactive-quality-r5` | 선택 5대화·8턴 완료 | Contact policy 수정 뒤 shortlist→승인 연락, 기존 위임→다음 침묵, 제안→승인 즉시 실행, 검색 중 별도 위임 실행을 관찰. 시장 답변은 최신 평가를 적합으로 오인해 실패. |
| `proactive-quality-v26-r1` | 시장 0/1 완료 | Timeout. 품질 통과로 세지 않는다. |
| `proactive-quality-v26-r2` | 시장 1/1 실행 | 통계 오인은 줄었지만 일반적인 요건 완화 메뉴가 남아 미통과. |
| `proactive-quality-v26-r3` | 시장 1/1 실행 | UX 지침 위치 변경 실험이 유의미하게 개선하지 않아 위치 변경을 되돌렸다. |
| `proactive-quality-v26-r4` | 시장 1/1 실행 | Role reader 계약 수정 뒤에도 근거 없는 연차 구간·종료 원인 추정이 남아 미통과. |
| `proactive-event-regression-r2` | v24 선택 중 2/3 완료 | 이미 알린 사건의 침묵·구체적인 다음 제안은 확인. 승인 업무 case는 연결 종료. |
| `proactive-event-regression-r5` | 같은 승인 업무 0/1 완료 | Timeout 보존. |
| `proactive-event-regression-r6` | 같은 승인 업무 1/1 완료 | 현재 후보를 읽고 이미 맡긴 질문을 한 번 연락. 추가 승인·stage 변경·중복 소개 없이 결과를 설명했다. |

Run ID 앞에는 모두 `20261015-`가 붙는다. Provider 연결 종료와 timeout은 실제 관찰한 실행 오류다. 오류 로그만으로 애플리케이션 결함이나 특정 원인을 확정하지 않았다. 기존 같은 모델 재시도·abort 경로는 확인했으나, 성공한 재실행이 앞선 실패를 없애지는 않는다.

### 조회 계약 정정 후 전체 실행

`20261015-proactive-quality-v26-final-r1`은 v26 **9대화·13턴 전체 실행 완료**, provider 실행 오류 0이다. 모든 회사 답변·후보자 연락 본문·trace·효과를 직접 읽었다. 전체 원문 의미·효과 기준으로 7/9 통과, 2/9 미통과다. 통과 사례에도 말투·불필요한 알림 편차가 있어 완성된 경험으로 보지는 않는다.

| Case 접미사 | 의미·효과 판정 | 관찰 |
| --- | --- | --- |
| `unchanged_silent` | 통과 | 새 일 없는 점검은 빈 답변·효과 0. |
| `shortlist_then_contact` | 통과 | 잘린 목록을 추가 조회하고 실제 설계 경험을 비교. 실제 회사 답변 뒤 정확한 후보에게 질문 한 번, 별도 승인·단계 변경 없음. |
| `delegated_work_then_silence` | 통과 | 이미 맡긴 질문을 한 번 전달하고 다음 변화 없는 점검은 침묵. |
| `proposal_then_execute` | 미통과 | 제안→실제 승인→한 번 연락은 맞지만, 후보자 문안에 회사가 표현하지 않은 긍정 평가를 덧붙임. 효과 성공과 문안 사실성을 분리한다. |
| `latest_cancellation` | 효과·필수 의미 통과, 품질 주의 | 연락 0, 취소 우선. 다만 이미 한 취소를 다시 설명하는 불필요한 알림을 보냄. 침묵 판단이 일관되게 좋아진 것은 아니다. |
| `market_evidence_missing` | 미통과 | 빈 optional criteria/JD를 탐색 문제와 연결하고, 원문에 없는 인하우스 요건·대체 연차 구간·출신 집단을 제안. 실제 기준 변경은 없지만 근거 있는 시장 제안으로 인정하지 않음. |
| `contact_response_loss` | 통과 | 응답 유실 뒤 list/read로 저장 사실 확인, 실제 연락 효과 한 번. 내부 오류를 회사 답변으로 노출하지 않음. |
| `search_does_not_suspend_delegated_work` | 통과 | 검색 중에도 별도 승인 질문을 한 번 연락. 검색 완료 주장·추가 검색 없음. |
| `external_meeting_then_company_reply` | 통과 | 외부 미팅 상태를 단정하지 않고 확인·조율 제안. 실제 금요일 미팅·연락 중단 답변 뒤 연락 효과 0. |

이 전체 run 뒤 contact policy의 회사 평가 귀속 지침을 보완했다. 이후 `20261015-proactive-quality-v26-contact-copy-r1`의 동일 `proposal_then_execute` 2턴 재실행은 의미·효과 검토 1/1 통과다. 회사의 미표현 긍정 평가를 덧붙이지 않은 질문 본문, 실제 승인 뒤 한 번 연락, 추가 승인·단계 변경 없음을 확인했다. 최종 코드 검사도 다시 60/60 통과했다. 한 사례의 보완 검증이며 전체 run을 최종 소스의 9/9 회귀로 바꾸어 표시하지 않는다. 시장 제안 gate와 침묵·말투 편차는 여전히 남는다.

## 사람 같은 대화·Agentic 행동의 판단

개선된 부분은 먼저 할 일을 선택하고 일반 도구로 이어간다는 점이다. 후보 목록을 더 읽어 비교하고, 중요한 미확인 경험을 확인하는 연락을 제안하고, 실제 승인이 오면 질문을 보내는 흐름을 관찰했다. 다음 점검에서 새 사실이 없으면 침묵했다. 최신 취소·외부 미팅에 대한 실제 회사 답변도 이전 계획보다 우선했다. 응답 유실 사례에서는 저장된 연락을 확인해 중복 효과 없이 이어갔다.

다만 **시장 근거가 없는 상황에서 자연스러운 문장만으로 좋은 recruiter가 되지는 않았다.** 합성 조회 범위만으로 연차 완화 구간을 제시하고, 진행 종료 상태를 종료 이유처럼 설명하거나, 여러 요건 질문을 회사에 되돌리는 답변이 남았다. 이런 제안은 데이터 기반 market mapping이 아니다. 말투도 일부 응답에서 목록형 상담 문장으로 길어지는 편차가 있다. 취소 뒤 정기 알림의 침묵도 일관되지 않다. 모델이 근거를 읽었다는 사실과 근거를 올바르게 해석했다는 판단을 분리한다.

이를 감추려고 특정 단어·연차·어미를 차단하거나 출력 문구를 덮어쓰는 코드는 넣지 않았다. 기준을 자동 변경하거나 추가 외부 연락을 허용하지도 않았다. 현재 통계의 coverage만으로 한 기준 완화의 추가 소개 가능 인원을 계산할 수 없다. 기존 fit의 모집단·version·다른 기준 충족·공유 자격을 읽는 근거 계약이 필요하며, 그 reader는 사용자가 이번 구현에서 제외한 별도 설계 범위로 유지한다.

## 코드 검사와 남은 gate

최종 targeted 단위 검사 **60/60 통과**. Loop의 실행별 전체 도구, 선택적 origin·침묵, 기존 입력·회사 업데이트, prompt assembly, tool schema, 평가 turn/Role reader 계약을 포함한다. 전체 policy를 담는 full prefix에 예전 cold-context 크기 제한을 잘못 적용하던 테스트는 실제 progressive cold prefix와 같은 schema/policy 조립을 검사하도록 고쳤다. 문장 의미를 문자열 검사로 대신하지 않는다.

자동 발송 전에 필요한 것은 다음과 같다.

1. 같은 최종 source/input 계약의 전체 9대화·13턴 의미·효과 검토와 중대한 위반 0. 한 번 좋은 답변만으로 시장 제안의 편차가 해결됐다고 판정하지 않는다.
2. 시장 근거가 부족할 때 구체적이고 지원 가능한 다음 일 또는 중요한 한 가지 질문을 고르는 품질 개선. 실제 분포 기반 제안은 reader를 별도 구현·검증한 뒤 평가한다.
3. Scheduler·공고 수요 consumer·Slack 다중 메시지의 실제 권한·멱등·부분 실패·배송 검증. 이번 실험은 해당 기능의 출시 증거가 아니다.
4. Provider timeout·연결 종료의 운영 복구와 재시도 관측. 실제 연락/Slack transport와 운영 queue의 종단 검증은 이번 합성 실험 밖이다.

작은 작성자 challenge이며 독립 팀원 검토·운영 대표 표본·실제 SBVA 수신자 반응은 없다. 이 문서는 로컬 구현과 관찰을 설명하며 현재 배포된 제품 동작으로 주장하지 않는다.
