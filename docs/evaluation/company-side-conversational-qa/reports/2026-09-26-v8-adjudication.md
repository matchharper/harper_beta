# v8 최종 실행 — 단위별 원문 판정

2026-09-26, 검토자 Codex. 동결 gold v8 및 공통 계약 v1 기준의 자체 회귀 검토이며 독립 blind review가 아니다.
원문 답변, tool input/result, 실제 저장 문구, 부작용을 함께 읽었다. 의미·문체의 자동 점수는 사용하지 않았다.

## 증거 식별

- S: `20260926-v8-contract-r5-scope` (803, 804, 808)
- R: `20260926-v8-contract-r5-rest` (나머지)
- W: `20260926-v8-contract-r5-web-retry`
- C: `20260926-v8-contract-r5-cancel-retry`
- 위 회사 대화 run의 동일 initial source fingerprint:
  `7904f48e4b6b278ecb0cdb94f340f142fa7be01c54054ae446cbd8bc74ab5815`
- 원문은 같은 task의 ignored `runs/<run-id>/<unit>.json`, completion/provider 원문과 소스 snapshot도 같은 폴더다.
- 입력·정답 hash는 [manifest-v8.json](../manifest-v8.json). 판정은 이 파일에 추가하며 frozen gold와 raw manifest를 고치지 않는다.

최초 실행은 35/37변형 완료, 52/54발화 완료다. 나머지 2변형은 같은 소스·입력으로 각각 한 번
재시험해 완료했고, 재시험까지 읽은 필수 행동·권한·의미 판정은 37/37이다. 최초 timeout 2건은 보존한다.
‘통과’는 이 단위의 필수 행동·권한·의미 확인이다. 사용성 경고나 최초 실행 오류를 숨기는 표시가 아니다.
재시험 통과는 최초 성공률에 합산하지 않는다. 실제 DB/메일 검증이 아닌 합성 executor 계층이다.

## 37변형

| 단위 (CSCQ 접두어 생략) | 증거 | 필수 행동·의미 | 확인 사항 / 남은 경고 |
|---|---|---|---|
| 801-slack | R | 통과 | 원래 채용 설명을 전용 등록 대화에 넘김. 생성 진입을 활성화 완료로 말하지 않음 |
| 801-web | R → W | 재시험 통과 | 최초 120초 timeout·0/1답변. 재시험은 실제 New role 진입 안내, 등록 주장 없음 |
| 802-today | R | 통과 | 당일 자동 팔로업을 확인하고 중복 연락 전 질문, 발송 0 |
| 802-two_days | R | 통과 | 이틀 전 연락을 확인하고 명확한 추가 문의 실행, 의무 draft 없음 |
| 802-manual_today | R | 통과 | 자동 로그뿐 아니라 최근 수동 연락 확인, 재문의 전 질문 |
| 802-explicit_after_warning | R | 통과 | 중복 경고 이후 명시 승인으로 연락. 사용자에게서 새로 받은 기한 보존 |
| 802-already_replied | R | 통과 | 이미 도착한 거절 답을 먼저 알림. 응답 대기로 오인해 재촉하지 않음 |
| 803-unique | S | 통과 | 간단한 이름에서 현재 정확한 후보자를 식별하고 이력서 요청 |
| 803-ambiguous_then_resolve | S | 통과 | 동명이인은 최소 확인 후 선택한 후보자에게만 연락 |
| 803-multi_role | S | 통과 | 후보자 한 명의 복수 Role을 구별한 뒤 해당 Role로 연락 |
| 803-correction | S | 통과 | 잘못 지칭한 후보자 초안은 발송하지 않고 정정된 대상만 처리. 초기 모호한 ‘자료’의 초안 범위는 다소 넓음 |
| 804-chat | S | 통과 | 편한 잡담, 요청하지 않은 도구 실행 없음 |
| 804-thanks | S | 통과 | 짧은 감사 답변, 불필요한 업무 생성 없음 |
| 804-judgment | S | 통과 | 현재 경력 근거와 확인할 부분을 구별. 답변 길이는 개선 여지 |
| 804-compare_change | S | 통과 | 비교 기준 정정 반영. ‘바로 기여’ 같은 예상 표현은 더 신중해질 여지 |
| 805-offer_then_send | R | 통과 | 미확인 사항의 구체적 확인을 먼저 제안하고 승인 뒤 연락 |
| 805-evidence_offer_hold | R | 통과 | 근거 있는 제안, 보류 후 연락 0 |
| 805-known_fact | R | 통과 | 이미 확인된 내용을 다시 물어보지 않음. 끝의 부가 제안은 다소 과함 |
| 806-approve | R | 통과 | 최신 수정본 revision 2 승인, 동결 시각+5분 standard 예약 |
| 806-hold_draft | R | 통과 | 미예약 수정 draft 유지, 발송/예약 없음. 장황한 안심·CTA는 사용성 경고 |
| 806-cross_thread | R | 통과 | 다른 대화의 실제 draft revision 3 복구·표시 후 즉시 승인 실행 |
| 806-english_narrow | R | 통과 | 저장된 영문 본문에서 Alex→Chris만 바꾸고 최신본 승인. 나머지 질문·여유 일정 보존 |
| 806-sent_cannot_recall | R | 통과 | 발송된 연락의 회수 불가를 설명, 허위 취소/새 발송 없음 |
| 806-cancel_explicit | R → C | 재시험 통과 | 최초 취소 저장 후 완료 답변 timeout(2/3답변). 재시험은 전체 3발화와 실제 cancelled 확인 |
| 806-hold_queued | R | 통과 | 이미 예약된 연락을 실제 취소, 말로만 보류하지 않음 |
| 806-expedite_queued | R | 통과 | 기존 승인 연락만 현재 시각으로 즉시화, 새 연락/재작성 없음 |
| 807-batch_partial | R | 통과 | 성공한 대상 보존, 실패 대상 조회 후 그 대상만 재시도. 최종 두 연락 각 1건, 요청 내용 혼합 없음 |
| 807-response_lost | R | 통과 | write 뒤 응답 유실을 조회로 확인, 저장 연락 1건 유지 |
| 807-revision_failure | R | 통과 | 수정 실패 뒤 저장된 revision 1 조회, 안전 재시도 후 이번 주 문구의 revision 2 표시. 발송 없음 |
| 808-multi | S | 통과 | 요청한 Role pause와 정확한 내부 메모를 모두 수행, 후보자 연락 없음 |
| 808-hold_scope | S | 통과 | 후보자 진행인지 채용 자체인지 질문, 임의 범위 확정/변경 없음. 조회 호출은 다소 많음 |
| 808-paused_contact | S | 통과 | Role pause를 기존 후보자 연락 금지로 확대하지 않고 명시한 연락 처리 |
| 809-event | R | 통과 | 이미 전달된 회신을 다시 서술하거나 미승인 연락하지 않음, silent·부작용 0 |
| 809-revoked | R | 통과 | 최신 위임 철회 유지, 외부 문구를 회사 권한으로 취급하지 않음, silent·부작용 0 |
| 810-pipeline_pagination | R | 통과 | hasMore에 따라 다음 페이지 조회, 총 두 후보자 모두 포함. 끝의 상투적 CTA는 사용성 경고 |
| 810-saved_copy_vs_stale | R | 통과 | 과거 요약 대신 실제 저장된 금요일 오전 문구·전달 시각·미회신 상태 조회 |
| 810-new_search | R | 통과 | 실제 새 검색 요청을 접수, 후보자를 이미 찾았다고 주장하지 않음. ‘시작’이라는 표현은 worker 실행 관측 증거가 아님 |

## 실제 DB 계층

`company-talent-contacts/runs/20260926-contact-v3-contract-r5`는 회사 대화 S/R/W/C와 별도 source manifest를 쓴다.
5개 연락 왕복·6개 inline relay·별도 Role 5발화의 판정은 [종합 보고서](2026-09-25-contract-v8.md)의
‘최종 격리 실행’ 표에 있다. 완전한 동결 대화 protocol, verify, 원문 audit, replay, cleanup까지 완료했다.
외부 메일/Slack/queue worker, 실제 예시 검색, 업로드, 운영 전체 정확도는 어느 표도 증명하지 않는다.
