# 새 대화에서 이전 지원 경험을 다시 쓰는지 확인

가상의 백엔드 엔지니어 예린은 리버포트 FDE 지원서를 준비하면서 단풍물류 워크숍에서 본인이 한 일을 연결한 업무 메일로 확인해 달라고 했다. 10월 29일 회고 메일 한 통의 본문에 고객 엔지니어와 중복 기록 문제를 재현한 일, 예린이 재시도 시 같은 멱등성 키를 쓰도록 수정한 일, 둘이 재요청 후 기록이 하나임을 확인한 일이 나온다. 네 지점 파일럿은 팀 성과다. 당시 교육은 일정 조율 단계였다.

7일 뒤 노스패스는 고객 문제 해결과 교육 경험을 각각 묻는다. 별도의 대조군인 물결랩은 같은 고객 문제 해결 사례 하나만 묻는다. 두 번째 채팅의 첫 모델 요청에는 개인 문서의 식별자와 제목만 보인다. 예린이 멱등성 키를 수정했다는 사실은 원문을 읽어야 알 수 있다. 입력과 평가 기대는 별도 파일에 동결했다. [v15 입력](../cases-v15.json) · [v15 평가 기대](../gold-v15.json) · [v16 입력](../cases-v16.json) · [v16 평가 기대](../gold-v16.json)

## 관찰

| 실행 | 첫 지원 | 7일 뒤 노스패스 |
| --- | --- | --- |
| 기존 Memory 안내 | 메일 5회. 사실은 맞게 썼지만 Memory에만 저장해 개인 문서 0건 | 읽을 개인 문서가 없어 메일 5회. 교육은 미확인으로 남김 |
| 자료의 소유 경계 수정 | 메일 8회. Gmail ID를 Career 채팅 출처로 전달해 첫 문서 쓰기가 거절됨. 모델이 출처를 본문에 기록해 비공개 문서 1건 저장 | 그 문서 ID를 읽고, 교육을 알아보려 메일 3회. 새로운 교육 기록은 찾지 못함 |
| 자료 소유·추가 조사 판단·출처 설명 수정 | 메일 5회. 첫 쓰기에 비공개 문서 1건 저장. 47.6초 | 같은 문서 ID를 읽고, 교육 확인을 위해 메일 2회. 25.0초 |

마지막 두 턴 모두 실제 제출이나 발송 시도가 없었다. 첫 지원은 예린의 기여, 팀의 파일럿과 메일 제목·날짜를 개인 자료에 구분해 남겼다. Memory에도 요약 한 건을 썼다. 노스패스에서는 고객 문제 해결 문장을 완성하고 직접 교육했는지만 물었다. 경험의 존재나 교육 완료를 지어내지 않았다. [첫 지원 원본](../runs/2026-11-16T06-47-40-710Z-fde-gmail-evidence-sufficiency/fde_workshop_first-1.json) · [노스패스 원본](../runs/2026-11-16T06-47-40-710Z-fde-gmail-evidence-sufficiency/fde_workshop_second-1.json)

**물결랩에서는 메일을 다시 읽지 않았다.** 새 대화에 앞서 만든 비공개 문서 행을 식별자와 본문까지 동일하게 이었다. 사용자는 문서나 메일을 언급하지 않았다. Harper는 그 문서를 먼저 열고 기존 개인 맥락을 한 번 확인했다. 고객과 재현한 상황, 직접 수정한 코드, 함께 확인한 결과를 지원 답변으로 작성했다. 메일 검색, 새 문서나 할 일 생성, 외부 발송은 모두 0회였다. 이 한 턴은 15.7초 걸렸으며 원본 메일 연결은 계속 사용할 수 있었다. [물결랩 원본](../runs/2026-11-16T06-51-01-448Z-fde-same-evidence/fde_workshop_same_evidence-1.json) · [이어받은 문서 행의 해시](../runs/2026-11-16T06-51-01-448Z-fde-same-evidence/continued-documents-fde_workshop_first-1.json)

첫 지원에서 원문 스레드를 읽은 시점에 필요한 사실이 모두 있었다. 8회 실행의 추가 검색은 같은 회사 영문명, 지점, 멱등성 키, 발신 도메인으로 같은 메일을 다시 찾았다. 5회 실행에서는 원문 스레드와 영문명·지점 검색을 한 번에 요청해 새 단서를 얻기 전에 불필요한 검색도 시작했다. 두 번째 지원에는 이후 교육 진행 여부라는 새 질문이 있었으나, 최종 두 호출 역시 기존 메일의 요약과 본문만 반환했다. 사용한 모델은 제품 기본 선택인 `gpt-6.1-terra`, 추론 설정은 `high`였다. 각 실행은 한 쌍이어서 호출 수와 시간의 차이로 일반적인 비용 절감률을 계산할 수 없다.

## 실행 범위

원본 Career 모델, Decisions, 실제 도구 스키마·문서 저장·읽기·메일 결과 포맷을 사용했다. Gmail 대신 한 통이 들어 있는 합성 메일함을 검색했고 문서 행은 격리한 메모리 저장소에 기록했다. 새 채팅에는 첫 턴이 실제로 남긴 문서 행만 이어졌다. 첫 실험이 Memory만 쓴 것은 새 개인 문서 생성 실패로 판단할 수 있지만, 해당 사용자의 실제 Memory 재사용 능력은 이 시험으로 측정할 수 없다. 실제 커넥터의 검색 정확도, 계정 연결·철회, 서비스 지연과 사용자 채용 결과도 이 실행의 관측 대상에서 벗어난다. 평가 기대 문장은 최종 v15 provider 요청 13건 어디에도 들어가지 않았다.

저장소 루트에서 아래 명령으로 실행한다. 마지막 명령은 앞서 기록한 합성 실행의 첫 입력과 원래 fixture 해시를 확인하고 동일한 개인 문서 행을 이어받는다. 해당 원본 실행이 없는 환경에서는 `--continue-from`을 빼고 v16의 첫 지원부터 같은 모델로 새로 시작할 수 있다.

```sh
export NODE_PATH=./node_modules/next/dist/compiled
export NODE_OPTIONS=--conditions=react-server
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v15 --validate-only
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v15 --repeat 1 --label fde-gmail-evidence-sufficiency
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v16 --repeat 1 --continue-from 2026-11-16T06-47-40-710Z-fde-gmail-evidence-sufficiency --label fde-same-evidence
```
