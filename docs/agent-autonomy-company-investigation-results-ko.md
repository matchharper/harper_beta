# 에이전트 교신 개선 — 원인과 실제 실험 결과

2026년 11월 5일 · 로컬 구현·격리 실험 · 운영 미배포

**목표는 질문을 늘리는 것이 아니다. 에이전트가 이미 아는 것과 모르는 것을 구분하고, 추가 확인의 가치와 사용자 수고를 비교해서 질문하거나 전달하도록 하는 것이다.** “질문한 뒤에만 전달”하는 조건·검증·도구 순서는 구현하지 않았다.

이 문서는 [이전 설계·실험 기록](internal-role-agent-autonomy-change-plan-ko.md)의 후속 결과다. 이전 문서의 “자율 재질문 미달”은 당시 기준과 코드의 기록이다. 사용자가 질문은 의무가 아니라고 정정한 뒤, 평가 기준도 **생성 전에** v17로 새로 고정했다. 이전 실패를 새 기준으로 소급해 성공 처리하지 않았다.

## 1. 가장 중요한 원인부터

| 순위 | 실제 입력에서 발견한 원인 | 왜 전달 쪽으로 기울었나 | 수정과 근거 |
| --- | --- | --- | --- |
| 1 | **업무의 완료를 전달·보고로 이해하게 하는 목적과 지침** | 회사 에이전트가 이력의 모순을 못 본 것이 아니었다. 모순을 알아차리고도 “인터뷰에서 확인”이라는 주의 문구를 붙여 넘기면 할 일을 마쳤다고 행동했다. 이전에는 이벤트 보고와 추가 도움 제안 지침도 이 방향을 강화했다. | 중복 보고·제안 지침을 제거하고 기존 Goal을 수정했다. 팀의 불확실성과 수고를 줄이고, 조사·조율·적절한 전달 중 현재 목적에 도움이 되는 것을 선택한다. 다만 목적 수정만 했을 때 질문은 4회 중 1회였다. 이것만이 원인은 아니었다. |
| 2 | **최신 저장값을 더 강한 근거로 취급하는 지침** | 갓 과장해서 쓴 주장이 프로필·도구 결과에 저장되면 오래된 이력보다 우선하는 것으로 읽혔다. “현재 저장 상태”와 “내용의 진실성”이 섞였다. | 최신성 우선 지침 두 곳을 없앴다. 기록·반복은 독립 검증이 아니라는 근거 원칙으로 수정했다. 같은 v15에서 질문 1/4 → 3/4로 변했다. 소표본 누적 변경 비교이므로 단독 인과 효과의 추정치는 아니다. |
| 3 | **실제로 실행할 수 있는 기능과 보이는 도구·정책이 달랐다** | 회사의 수신 에이전트는 기존 권한상 에이전트 교신만 가능한데, 모델에는 직접 이메일·초안 전달과 회사 주도 후보 검색의 정책까지 섞여 보였다. “상대 에이전트와 일하기”보다 사람에게 전달하는 방식이 부각됐다. | 서버가 가진 기존 서비스 권한으로 같은 범용 도구의 허용 모드·기능 목록·정책을 일치시켰다. executor 권한은 확대·축소하지 않았다. 이 수정 뒤 v15 첫 회사 교신은 4/4였다. 팀원 직접 대화의 기존 도구 모드는 유지했다. |
| 4 | **상대가 가진 대화·출처와 완료 이력이 끊겼다** | 새 프로필을 보고 어디서 나온 주장인지 알기 어렵고, 수신 측은 이미 끝난 준비를 다시 하거나 상대 질문을 새 사용자 과제로 넘길 수 있었다. | 양쪽에 같은 후보자·Role의 최근 교신과 원래 소개·답장 대상을 연결했다. 후보자 측은 자신이 소유한 원래 form 답변과 프로필 변경 출처를 읽을 수 있다. 상대 에이전트의 지식·근거·한계를 교환하는 공통 가이드를 둔다. |
| 5 | **후보자 백그라운드 입력에 대화·추가 질문·이메일 유도가 남았다** | 역사적 form 답변에 저장 지시가 재주입됐고, 백그라운드에도 경험 탐색용 후속 질문 블록과 이메일 안내가 반복됐다. “현재 후보자와 소통 중”이라는 잘못된 상태 설명도 있었다. | 역사적 답변은 원문 사실만 남긴다. 백그라운드의 탐색용 후속 질문 블록과 중복 이메일 정책을 제거하고 실행 상태를 바로잡았다. 후보자의 수고와 불필요한 방해를 줄인다는 목적을 기존 지침에 반영했다. 이 경로는 아래 실험에서 별도로 평가한다. |

중요도는 **제품 동작을 설명하는 정도와 실제 입력 근거**로 정했다. 서로 영향을 주는 누적 변경이며 무작위 통제 실험은 아니다. 질문 증가만으로 개선이라고 판단하지 않는다.

## 2. 무엇을 빼고, 수정하고, 남겼나

| 구분 | 실제 변경 | 의도 |
| --- | --- | --- |
| 삭제 | 회사의 반복 보고·추가 도움 제안 유도, 최신 저장값 우선 지침, 수신 서비스가 쓸 수 없는 모드의 정책 | 기존 행동 편향과 실행 계약 불일치 제거 |
| 삭제 | 역사적 form 재조회 때의 저장·수정 명령, 백그라운드의 탐색용 추가 질문 블록, 중복 이메일 전달 정책 | 이미 끝난 일을 다시 시키거나 사람에게 넘기는 유도 축소 |
| 수정 | 회사 Goal: 팀의 불확실성·수고 감소, 추가 정보의 가치와 비용·지연 비교 | 조사와 전달 모두 가능한 목적 |
| 수정 | 후보자 Goal: 정확한 준비·대변과 후보자의 수고 감소 | 독립적인 위임 수행, 필요한 사용자 참여 |
| 수정 | 근거: 저장된 상태·사용자 진술·독립 검증·자체 추론 구분 | 과장된 새 프로필을 검증된 경력으로 승격하지 않기 |
| 연결 | 양쪽의 최근 교신, 원 소개, 현재 메시지·직접 답장 대상, 후보자 자신의 원 답변·자료 revision | “누가 언제 무엇을 알아냈나”를 판단할 재료 |
| 정리 | 같은 `contact_talent`·`publish_role_recommendations`의 서비스 권한에 맞는 schema와 catalog | 새로운 사례별 도구 없이 실제 사용 가능한 계약 노출 |
| 수정 | publication 결과는 “팀 인박스에 보임 / 열람 여부 모름 / 별도 알림 없음” | 저장·공유·알림·열람을 혼동하지 않기 |
| 유지 | 기존 공유 권한, 동의, 후보자·회사·Role 범위, 중복 발송 방지, 소개문 동시 수정 보호 | 실제 실행 경계 |
| 유지 | 유저 연락 도구, form, 프로필 수정·자료 선택, 회사의 즉시 전달 능력 | 질문이나 조용한 완료를 강제하기 위해 능력을 빼지 않기 |

이전 단계에서 구현한 **이미 추천받은 기회 수락과 처음 보는 기회 요청의 context 구분**, 준비한 프로필 선택, 소개문 갱신 시 기존 자료·진행 상태 보존도 유지했다. 추천을 이미 받아 수락한 사람에게 최초 설명 절차를 다시 강제하지 않는다.

새 DB 테이블, 정성 판단 상태, 질문 의무 flag, 키워드 필터, 별도 심사 LLM, 출력 재작성, 제품 실행 중 성공할 때까지 재시도는 추가하지 않았다.

주요 코드: [회사 목적·근거](../src/lib/org/agent/prompts.ts), [공통 교신 가이드](../src/lib/agentContacts/guidance.ts), [수신 서비스 도구 계약](../src/lib/agentContacts/companyToolDefinitions.ts), [기능·정책 선택](../src/lib/org/agent/capabilities/resolver.ts), [교신 context](../src/lib/agentContacts/introductionContext.ts), [교신 조회](../src/lib/agentContacts/read.ts), [후보자 입력 조립](../src/lib/career/prompts/conversationPlan.ts), [후보자 기본 목적](../src/lib/career/prompts/rawPrompts.ts), [전달 결과](../src/lib/agentContacts/contracts.ts).

## 3. 실험 방법과 숫자의 의미

운영 Daniel/Wonderful 데이터를 바꾸지 않고, **AI Engineer가 Marketing Manager 역할에 소개를 요청하는 구조의 합성 후보자·회사·프로필·form 답변**을 만들었다. 실제 원본 에이전트 모델이 도구를 선택하고 문장을 작성했다. 질문 문장이나 교신 순서를 평가기가 대신 정하지 않았다.

- **시도 1회**: 하나의 사례 × 반복 1회. 그 안의 도구 continuation은 새 시도가 아니다.
- **provider 요청**: 같은 시도 안의 모든 모델 호출을 포함한다. 성공 횟수가 아니다.
- **첫 교신 / 첫 전달**: 회사가 첫 수신 실행에서 선택한 동작. 같은 실행에서 둘 다 했으면 양쪽에 잡힌다. 교신 횟수는 질문 품질의 점수가 아니다.
- **팀 전달**: Role 인박스에 평가를 공개하거나 팀 메시지를 생성한 사실. 팀원이 실제 읽었다는 뜻은 아니다.
- **후보자 연락**: 사용자 전달 도구의 실제 deliver 호출·캡처. read/retry 조회는 새 메시지로 세지 않는다.
- **구조 확인 통과**: SQL·ID·공유 자료 등 검사가 통과했다는 뜻이다. 적절한 판단·정확한 소개문까지 통과했다는 뜻이 아니다.

현재 모델은 후보자 `gpt-6.1-terra / high`, 회사 `google/gemini-3.8-flash`다. 앞선 09:19 UTC까지 후보자 실험은 `gpt-6.1-sol / high`였고, 09:35부터는 작업 공간의 당시 기본값인 Terra로 실행됐다. 이 작업에서 모델을 변경하지 않았으며, 두 모델의 후보자 결과를 동일 조건 성공률로 합치지 않는다.

실행 경계는 실제 프로필·자료·work·action-item SQL 및 주요 executor + 캡처한 inbox·form·publication·일정·사람 전달 adapter다. 네트워크는 모델 provider만 허용했다. **캡처된 이메일은 실제 사람에게 발송된 이메일이 아니다.** 별도 실제 PostgreSQL 테스트는 transaction rollback으로 교신 범위·동시 수정·멱등성을 검증했다. 운영 큐·실제 이메일/Slack 도착·브라우저 E2E까지 확인한 것은 아니다.

## 4. 원인을 좁히며 실행한 비교

아래는 이번 후속 조사에서 같은 v15를 사용한 누적 비교다. 첫 네 단계의 후보자 모델은 모두 Terra이고 회사 모델도 같다. 각 단계는 당시 소스 hash와 원 요청·응답을 보존했다.

| 코드 변경 단계 | 시작 / 결과 저장 | 첫 회사 교신 | 첫 팀 전달 | 교신 후 후보자 연락 | 관찰 |
| --- | ---: | ---: | ---: | ---: | --- |
| 목적·완료 기준 수정 | 4 / 4 | 1 | 3 | 1/1 | 목적만 바꿔서는 전달 편향이 충분히 달라지지 않음 |
| 저장 최신성 대신 출처·근거 | 4 / 4 | 3 | 1 | 3/3 | 교신 선택 증가, 새 세부 정보 요청도 증가 |
| 실제 서비스 권한에 맞는 도구·정책 | 4 / 4 | 4 | 0 | 4/4 | 회사 교신은 가능해졌지만 후보자 수고 감소는 아님 |
| 상대가 가진 지식·출처를 교환하는 가이드 | 4 / 4 | 4 | 0 | 4/4 | 회신 후 팀 전달 4회, 후보자 이메일도 4회 |
| v16: 원 답변·프로필 변경 시각 정합화 | 4 / 4 | 4 | 0 | 4/4 | 출처 답변 후 전달 4회. 추가 form 생성 2회 |

네 번째 단계 앞에 **실패한 별도 배치**가 있다. 계획 4회 중 2회가 시작했고 결과 완료는 0회다. 모델의 유효한 `replyToMessageId` 단독 호출을 평가 adapter가 잘못 거절했다. 동시에 실행 중인 다른 사례보다 네트워크 캡처가 먼저 복구되는 runner 오류도 발견했다. 두 오류를 고친 다음 새 배치를 실행했고, 실패한 2회를 삭제·대체하지 않았다.

이전 단순화 코드의 v15 2배치에서는 4회 모두 바로 전달했다. 다만 **바로 전달했으니 무조건 실패**라는 결론을 현재 기준으로 가져오지는 않는다. 이 비교가 보여주는 것은 입력의 목적·근거·도구 계약이 판단에 큰 영향을 준다는 점이다.

## 5. 질문을 의무로 두지 않은 최종 비교

v17은 같은 프로필·원 답변을 두고 최초 소개 메시지의 출처 설명만 바꾼다. `source_unknown`은 출처를 생략하고, `source_already_explained`는 소개 준비 중 후보자가 새로 말한 내용·독립 검증 없음·추가 자료 없음까지 제공한다. **코드가 이 두 사례를 분류하지 않는다.** 모델에 전달되는 사실만 다르다.

| 현재 코드의 v17 사례 | 시도 | 첫 교신 | 바로 팀 전달 | 이후 팀 전달 | 후보자 이메일 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 출처가 소개문에 없음 | 2 | 2 | 0 | 1 | 2사례에서 총 3건 |
| 출처·시점·검증 한계를 이미 설명 | 2 | 0 | 2 | 해당 없음 | 0 |
| 합계 | 4 | 2 | 2 | 1 | 3건 |

**관찰한 개선:** 같은 경력 불일치라도 출처 설명이 있으면 재질문하지 않고 평가를 전달했다. 출처가 없을 때는 스스로 상대 에이전트에게 질문했다. 질문 의무나 전달 금지 없이 두 선택이 가능함을 확인했다. 직전 v17 배치에서도 2회 질문·2회 직접 전달이 나왔지만 코드 snapshot이 다르므로 합쳐서 성공률을 만들지 않는다.

**함께 관찰한 문제:** 출처가 없는 두 사례에서는 회사가 공식 직책·겸직 경위까지 질문했고, 후보자 에이전트는 기존 답변과 미확인 범위를 회신한 뒤 새 form·이메일까지 만들었다. 한 사례는 회사가 평가를 전달했고, 다른 사례는 후보자가 추가 확인을 약속하자 회사도 기다렸다. 후보자 수고를 줄인다는 목적 수정은 이 표본에서 개선을 입증하지 못했다.

전달된 평가 3건 모두 자기 진술과 독립 검증의 한계는 담았지만, 원 입력에 없는 **“구두 답변/구두 진술”**로 출처 방식을 좁혔다. 한 건은 기존 AI 이력을 “객관적으로 확인된 이력”이라고 과하게 표현했다. 이를 정확한 출처 전달의 완전 통과로 세지 않았다. 사례별 표현을 막는 금지어·후처리는 추가하지 않았다.

현재 코드의 준비 경로도 v9 두 사례로 확인했다. 경험이 부족한 사례는 form 질문 → 합성 답변 → 프로필 수정 → `assign_to_role` → 회사 소개까지 수행했다. 충분한 마케팅 이력의 사례는 추가 질문이나 프로필 수정 없이 소개했다. 전자는 도중 `manage_work` revision 충돌 뒤 회복해 소개를 마쳤지만 오류 기록은 남아 있어 **구조 검사 1/2 통과**다. 후속 회사 교신에서는 새 질문을 사용자에게 넘기고 대기했으므로 전체 무연락 흐름 성공으로 세지 않았다.

회사 v3 대조 3건은 팀의 실제 통화 가능 시간을 물은 경우, 단순 수신 확인에 조용히 완료한 경우, 비공개 정보 요청을 거절한 경우다. 세 경우 모두 실제 원 모델의 동작을 읽었고 구조 검사 3/3 통과했다. 알림을 전부 없애는 방향으로 바뀐 것은 아니다.

### 출처만 물었을 때의 분리 실험

v18은 회사의 첫 질문을 “언제 어떤 자료에서 알았나, 현재 알고 있는 범위에서 답해 달라”로 고정했다. 후보자 응답과 이후 회사 판단은 원 모델이 작성한다. **회사 스스로 질문을 선택했는지 보는 실험에는 넣지 않는다.**

| 확인 항목 | 결과 |
| --- | ---: |
| 시도 / 구조 검사 통과 | 2 / 2 |
| 기존 정보로 출처·시점·독립 검증 한계 답변 | 2/2 |
| 후보자에게 새 답변 요구 | 0/2 |
| 후보자에게 진행 이메일 생성 | 2/2 |
| 회사가 회신을 반영한 평가를 팀 인박스에 전달 | 2/2 |

즉, **기존 사실로 에이전트끼리 답하는 능력은 확인했다. 유저를 다시 질문에 참여시키는 것과 단순 진행 알림은 다른 동작이다.** 다만 이 출처 확인만으로도 후보자 이메일을 두 번 만들었으므로, 처음 요청한 “교신 중 양쪽 보스에게 연락 없이 처리”까지 안정적으로 달성했다고 말할 수는 없다. 더 강한 무알림 명령을 붙여 숫자를 맞추지 않았다.

이 분리 실험의 회사 평가 2건에서도 출처를 “구두”로 표현하는 같은 부정확함이 남았다. 출처의 핵심 한계를 통합했다는 관찰과, 모든 출처 설명이 정확했다는 평가는 구분한다.

### 전체 집계

| 범위 | 배치 | 시작한 시도 | 결과 저장 | 실행 중단·adapter 오류 | 시작 전 중단 | 모델 provider 요청 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 앞선 조사 기록, 09:19 UTC까지 | 32 | 55 | 53 | 2 | 0 | 683 |
| 이번 후속 조사, 09:35 UTC부터 | 13 | 41 | 39 | 2 | 2 | 414 |
| 누적 | 45 | 96 | 92 | 4 | 2 | 1,097 |

96회는 여러 코드·모델·fixture를 조사하며 실행한 누적 시도다. **92회는 결과 파일이 있다는 뜻이지 92회 성공했다는 뜻이 아니다.** 현재 코드로 마지막 검증한 것은 v17 4회 + 준비 경로 2회 + 출처 질문 분리 2회 + 회사 대조 3회, 총 **11회**다. 그중 구조 검사는 10회 통과했고, 의미상 문제는 위 표와 문장에 별도로 기록했다. 반복 도구 호출을 새 시도로 부풀리거나 실패한 배치를 제외하지 않았다.

이 보고서의 마지막 실제 모델 실행은 `2026-11-05T10-13-26-778Z-current-source-question-isolation`이다. 아래 부록은 보존된 manifest와 요청·결과 파일에서 집계한 실행 목록이다.

## 6. 검증과 해석의 한계

목표를 “모든 회사 질문 100%”로 바꾸지 않았다. 출처와 한계가 이미 있으면 그 근거로 전달할 수 있고, 알아볼 가치가 있으면 대화할 수 있다. 과장된 주장을 독립 검증했다고 표현하지 않는지, 기존 답으로 할 수 있는 일을 다시 사용자에게 시키는지, 팀이 결정할 수 있는 평가로 정리했는지는 별도로 읽었다.

최종 변경 경로의 집중 단위 테스트 **23/23**, TypeScript 검사와 `git diff --check`가 통과했다. 앞선 서비스 도구 포함 묶음은 34/37이며, 실패한 3개는 수정 전 source overlay에서도 동일하게 실패한 기존 도구 기대값 테스트다. 별도 과거 `capabilityLoop` 묶음의 7개 기존 실패도 그대로 기록했다. 실제 PostgreSQL rollback 통합 테스트는 교신 범위·최근 이력 밖 root/parent 포함·pagination·소개문 동시 수정·자료 및 채용 상태 보존·중복 이메일 경계를 통과했다. 전체 저장소 테스트 통과를 주장하지 않는다. 작은 합성 도전 사례의 반복이므로 운영 성공률이나 통계적 신뢰도를 주장하지 않는다.

재현: [평가 README](evaluation/career-internal-introduction/README.md), [모델 실행 runner](../scripts/evalCareerInternalIntroduction.ts), [양방향 실행 helper](../scripts/lib/agentAutonomyEvaluation.ts), [실행 집계기](../scripts/reportAgentAutonomyRuns.py). 각 ignored `runs/<run-id>/`의 `manifest.json`, `requests.json`, `*-agent-exchange.json`, `results.json`, `manual-review.json`으로 입력·동작·별도 판독을 확인할 수 있다.


## 7. 부록: 전체 실행 목록

| Run | Dataset | Attempts | Results saved | Provider requests |
| --- | --- | ---: | ---: | ---: |
| [2026-11-05T07-58-57-194Z-autonomy-controls](evaluation/career-internal-introduction/runs/2026-11-05T07-58-57-194Z-autonomy-controls/manifest.json) | v7 | 3 | 3 | 18 |
| [2026-11-05T07-58-58-222Z-autonomy-paired](evaluation/career-internal-introduction/runs/2026-11-05T07-58-58-222Z-autonomy-paired/manifest.json) | v7 | 1 | 1 | 33 |
| [2026-11-05T08-00-39-546Z-autonomy-purpose](evaluation/career-internal-introduction/runs/2026-11-05T08-00-39-546Z-autonomy-purpose/manifest.json) | v7 | 1 | 1 | 29 |
| [2026-11-05T08-03-21-184Z-autonomy-form-roundtrip](evaluation/career-internal-introduction/runs/2026-11-05T08-03-21-184Z-autonomy-form-roundtrip/manifest.json) | v8 | 4 | 4 | 38 |
| [2026-11-05T08-06-14-617Z-autonomy-readiness](evaluation/career-internal-introduction/runs/2026-11-05T08-06-14-617Z-autonomy-readiness/manifest.json) | v8 | 2 | 2 | 44 |
| [2026-11-05T08-08-23-972Z-autonomy-final-controls](evaluation/career-internal-introduction/runs/2026-11-05T08-08-23-972Z-autonomy-final-controls/manifest.json) | v8 | 2 | 2 | 18 |
| [2026-11-05T08-10-38-586Z-autonomy-final](evaluation/career-internal-introduction/runs/2026-11-05T08-10-38-586Z-autonomy-final/manifest.json) | v9 | 4 | 4 | 64 |
| [2026-11-05T08-11-59-582Z-autonomy-initial-interest](evaluation/career-internal-introduction/runs/2026-11-05T08-11-59-582Z-autonomy-initial-interest/manifest.json) | v6 | 1 | 1 | 26 |
| [2026-11-05T08-15-31-327Z-autonomy-source-gap](evaluation/career-internal-introduction/runs/2026-11-05T08-15-31-327Z-autonomy-source-gap/manifest.json) | v10 | 1 | 1 | 3 |
| [2026-11-05T08-17-34-972Z-autonomy-proportionate](evaluation/career-internal-introduction/runs/2026-11-05T08-17-34-972Z-autonomy-proportionate/manual-review.json) | v9 | 2 | 2 | 28 |
| [2026-11-05T08-19-08-815Z-autonomy-source-delegation](evaluation/career-internal-introduction/runs/2026-11-05T08-19-08-815Z-autonomy-source-delegation/manifest.json) | v10 | 1 | 1 | 3 |
| [2026-11-05T08-19-09-581Z-autonomy-informed-introduction](evaluation/career-internal-introduction/runs/2026-11-05T08-19-09-581Z-autonomy-informed-introduction/manifest.json) | v6 | 1 | 1 | 24 |
| [2026-11-05T08-21-21-979Z-autonomy-source-investigation](evaluation/career-internal-introduction/runs/2026-11-05T08-21-21-979Z-autonomy-source-investigation/manifest.json) | v10 | 1 | 1 | 20 |
| [2026-11-05T08-25-17-849Z-autonomy-source-final](evaluation/career-internal-introduction/runs/2026-11-05T08-25-17-849Z-autonomy-source-final/manifest.json) | v10 | 1 | 1 | 20 |
| [2026-11-05T08-25-46-967Z-autonomy-unsaved-role](evaluation/career-internal-introduction/runs/2026-11-05T08-25-46-967Z-autonomy-unsaved-role/manual-review.json) | v11 | 1 | 1 | 26 |
| [2026-11-05T08-26-43-086Z-autonomy-confirmation](evaluation/career-internal-introduction/runs/2026-11-05T08-26-43-086Z-autonomy-confirmation/manual-review.json) | v9 | 2 | 2 | 26 |
| [2026-11-05T08-46-00-975Z-autonomy-known-source](evaluation/career-internal-introduction/runs/2026-11-05T08-46-00-975Z-autonomy-known-source/manifest.json) | v12 | 1 | 1 | 3 |
| [2026-11-05T08-46-01-932Z-autonomy-introduction-capability](evaluation/career-internal-introduction/runs/2026-11-05T08-46-01-932Z-autonomy-introduction-capability/manifest.json) | v9 | 1 | 1 | 21 |
| [2026-11-05T08-46-03-183Z-autonomy-unknown-timeline](evaluation/career-internal-introduction/runs/2026-11-05T08-46-03-183Z-autonomy-unknown-timeline/manifest.json) | v10 | 1 | 1 | 18 |
| [2026-11-05T08-48-56-805Z-autonomy-publication-contract](evaluation/career-internal-introduction/runs/2026-11-05T08-48-56-805Z-autonomy-publication-contract/manifest.json) | v12 | 2 | 2 | 27 |
| [2026-11-05T08-53-48-478Z-autonomy-evidence-purpose](evaluation/career-internal-introduction/runs/2026-11-05T08-53-48-478Z-autonomy-evidence-purpose/manual-review.json) | v12 | 2 | 2 | 10 |
| [2026-11-05T08-55-32-239Z-autonomy-answerable-question](evaluation/career-internal-introduction/runs/2026-11-05T08-55-32-239Z-autonomy-answerable-question/manual-review.json) | v13 | 1 | 1 | 8 |
| [2026-11-05T08-56-28-550Z-autonomy-investigation-ownership](evaluation/career-internal-introduction/runs/2026-11-05T08-56-28-550Z-autonomy-investigation-ownership/manifest.json) | v12 | 2 | 0 | 4 |
| [2026-11-05T08-58-08-068Z-autonomy-source-facts-only](evaluation/career-internal-introduction/runs/2026-11-05T08-58-08-068Z-autonomy-source-facts-only/manual-review.json) | v14 | 1 | 1 | 6 |
| [2026-11-05T08-58-47-529Z-autonomy-final-receivers](evaluation/career-internal-introduction/runs/2026-11-05T08-58-47-529Z-autonomy-final-receivers/manifest.json) | v12 | 2 | 2 | 24 |
| [2026-11-05T08-59-41-262Z-autonomy-complete-context](evaluation/career-internal-introduction/runs/2026-11-05T08-59-41-262Z-autonomy-complete-context/manual-review.json) | v15 | 2 | 2 | 33 |
| [2026-11-05T08-59-41-263Z-autonomy-final-form-context](evaluation/career-internal-introduction/runs/2026-11-05T08-59-41-263Z-autonomy-final-form-context/manual-review.json) | v9 | 1 | 1 | 24 |
| [2026-11-05T09-07-51-404Z-autonomy-publication-is-communication](evaluation/career-internal-introduction/runs/2026-11-05T09-07-51-404Z-autonomy-publication-is-communication/manual-review.json) | v15 | 2 | 2 | 30 |
| [2026-11-05T09-17-07-965Z-prompt-simplification-career](evaluation/career-internal-introduction/runs/2026-11-05T09-17-07-965Z-prompt-simplification-career/manual-review.json) | v9 | 2 | 2 | 35 |
| [2026-11-05T09-17-07-965Z-prompt-simplification-company](evaluation/career-internal-introduction/runs/2026-11-05T09-17-07-965Z-prompt-simplification-company/manual-review.json) | v15 | 2 | 2 | 7 |
| [2026-11-05T09-19-07-152Z-prompt-single-purpose-company](evaluation/career-internal-introduction/runs/2026-11-05T09-19-07-152Z-prompt-single-purpose-company/manual-review.json) | v15 | 2 | 2 | 8 |
| [2026-11-05T09-35-29-821Z-ownership-completion-standard](evaluation/career-internal-introduction/runs/2026-11-05T09-35-29-821Z-ownership-completion-standard/manual-review.json) | v15 | 4 | 4 | 27 |
| [2026-11-05T09-40-17-736Z-source-basis-over-freshness](evaluation/career-internal-introduction/runs/2026-11-05T09-40-17-736Z-source-basis-over-freshness/manual-review.json) | v15 | 4 | 4 | 39 |
| [2026-11-05T09-47-25-604Z-service-contract-projection](evaluation/career-internal-introduction/runs/2026-11-05T09-47-25-604Z-service-contract-projection/manual-review.json) | v15 | 4 | 4 | 51 |
| [2026-11-05T09-52-19-021Z-counterpart-knowledge-collaboration](evaluation/career-internal-introduction/runs/2026-11-05T09-52-19-021Z-counterpart-knowledge-collaboration/manual-review.json) | v15 | 2 | 0 | 6 |
| [2026-11-05T09-54-52-891Z-counterpart-knowledge-complete-capture](evaluation/career-internal-introduction/runs/2026-11-05T09-54-52-891Z-counterpart-knowledge-complete-capture/manual-review.json) | v15 | 4 | 4 | 54 |
| [2026-11-05T09-55-43-865Z-investigation-source-clear-control](evaluation/career-internal-introduction/runs/2026-11-05T09-55-43-865Z-investigation-source-clear-control/manual-review.json) | v9 | 1 | 1 | 32 |
| [2026-11-05T09-56-34-641Z-final-recorded-source-confirmation](evaluation/career-internal-introduction/runs/2026-11-05T09-56-34-641Z-final-recorded-source-confirmation/manual-review.json) | v16 | 4 | 4 | 54 |
| [2026-11-05T10-01-34-007Z-proportionate-choice-final](evaluation/career-internal-introduction/runs/2026-11-05T10-01-34-007Z-proportionate-choice-final/manual-review.json) | v17 | 4 | 4 | 40 |
| [2026-11-05T10-07-24-275Z-autonomy-attention-and-source](evaluation/career-internal-introduction/runs/2026-11-05T10-07-24-275Z-autonomy-attention-and-source/manual-review.json) | v17 | 4 | 4 | 40 |
| [2026-11-05T10-07-56-459Z-current-preparation-controls](evaluation/career-internal-introduction/runs/2026-11-05T10-07-56-459Z-current-preparation-controls/manual-review.json) | v9 | 2 | 2 | 46 |
| [2026-11-05T10-13-26-778Z-current-source-question-isolation](evaluation/career-internal-introduction/runs/2026-11-05T10-13-26-778Z-current-source-question-isolation/manual-review.json) | v18 | 2 | 2 | 15 |
| [company-2026-11-05T08-56-50-460Z](evaluation/career-internal-introduction/runs/company-2026-11-05T08-56-50-460Z/manual-review.json) | company-agent-v3 | 3 | 3 | 5 |
| [company-2026-11-05T09-55-43-807Z](evaluation/career-internal-introduction/runs/company-2026-11-05T09-55-43-807Z/manual-review.json) | company-agent-v3 | 3 | 3 | 5 |
| [company-2026-11-05T10-07-25-234Z](evaluation/career-internal-introduction/runs/company-2026-11-05T10-07-25-234Z/manual-review.json) | company-agent-v3 | 3 | 3 | 5 |
