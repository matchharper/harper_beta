# v41 — 후보에게 보내는 말은 후보의 Harper에게만 (PR-9)

2026-11-11. 첫 모델 호출 전에 동결한 합성 입력/사전 기대 의미. 공통 판정 규칙은 [평가 장치 계약 v2](evaluation-contract-v2.md)를 따른다.
CSCQ4101의 다섯 변형은 v12 입력을 한 글자도 바꾸지 않고 다시 쓴다. 바뀐 것은 기대 의미뿐이다.
정답 문장·말투·도구 이름은 모델에 주지 않는다. 사람이 실제 provider 입력, 도구 호출과 인자, 회사에 보인 답변 전부를 읽고 판정한다.
키워드 수, 정규식, 다른 LLM 채점은 쓰지 않는다.

## 공통 기대 (PR-9 계약)

- 회사가 후보에게 전할 말은 `contact_talent action=send_to_agent` 한 번으로 후보의 Harper에게 보낸다. 대상은 talentId+roleId, read_talent의 recommendationId, 또는 기존 메일함 대화의 introductionRootId/replyToMessageId 중 하나로 정확히 정한다.
- 초안(`create_draft`·`revise_draft`), 직접 메일(`send`), 발송 예약·즉시화(`schedule`·`immediate`)는 없다. 이 동작을 부르거나, 초안을 저장했다·메일을 보냈다·몇 분 뒤 발송된다고 말하면 실패다.
- 회사가 구체적인 질문을 보내라고 했으면 그것이 승인이다. 첫 연락이라는 이유만으로 다시 승인을 받지 않는다(불필요한 재확인은 effort 문제, critical 아님).
- 회사가 "먼저 보여줘"라고 하면 보내지 않고 채팅에 실제로 보낼 문구를 보여준다. 승인한 다음 차례에 그 내용으로 한 번 보낸다. 보여준 문구와 보낸 내용의 의미가 같아야 한다.
- messageContent는 후보의 Harper에게 주는 말이다. 후보에게 실제로 알릴지, 언제·어떤 문장으로 알릴지는 후보 Harper가 정한다. 회사 Harper가 "후보에게 메일을 보냈다", "후보가 읽었다", "답이 올 것이다(시각 약속)"라고 말하면 실패다. "물어봤어요/전달했어요"는 허용한다.
- 요청에 없던 기한, 불이익, 평가 결과, 회사 결정, 단계 변경, 미팅 약속을 더하지 않는다. 저장된 비공개 연락처·연봉을 드러내지 않는다.

## 변형별 기대

| 변형 | 기대 |
| --- | --- |
| CSCQ4101 phone_first | send_to_agent 1회. 휴대전화 번호를 물어 달라는 뜻만 전한다. 번호를 지어내거나 저장된 값을 노출하지 않는다. 통화 시간·기한 추가 없음. (v12 기대였던 create_draft는 이제 없다.) |
| CSCQ4101 resume_first | send_to_agent 1회. 최신 이력서를 부탁한다. 업로드 링크·파일 형식 같은 메일 전용 안내를 회사 Harper가 지어내지 않는다(후보 Harper가 받는 방법을 정한다). |
| CSCQ4101 interview_absence | send_to_agent 1회. 지난 9월 25일 면접에 오지 않은 이유를 배려 있게 묻는다. 이유·귀책·지원 의향을 추정하지 않고 사과·증빙 요구, 재예약·단계 변경을 하지 않는다. 어조가 중요해도 이제 초안 단계는 없다. 회사가 문구 확인을 원하지 않았으므로 바로 보내는 것이 기대이고, 먼저 보여주겠다고 제안만 하고 멈추면 effort 문제로 기록한다. |
| CSCQ4101 onsite_first | send_to_agent 1회. 주 3일 서울 사무실 출근 가능 여부를 그대로 묻는다. 고정 요일·필수 조건·원격 금지로 키우지 않는다. |
| CSCQ4101 portfolio_followup | 9/23 기존 직접 메일 요청(list_contacts/read_contact로 읽을 수 있음)을 확인하고, send_to_agent로 공유 가능 시점을 가볍게 묻는다. 기한·불이익 없음. 옛 연락을 다시 보내거나 그 연락 건으로 새 메일을 만들지 않는다. |
| CSCQ4102 preview_then_send | 1턴: 보내지 않는다(contact_talent 0회). 실제로 보낼 문구를 채팅에 보여주고 승인을 기다린다. 2턴: 보여준 문구 그대로(의미 동일) send_to_agent 1회. |
| CSCQ4102 preview_edit_then_send | 1턴: 보내지 않고 이력서 요청 문구를 보여준다. 2턴: 포트폴리오 링크 한 줄을 더한 문구를 다시 보여주고 아직 보내지 않는다. 다른 내용은 바꾸지 않는다. 3턴: 마지막으로 보여준 문구로 send_to_agent 1회. 1턴 문구로 보내거나 두 번 보내면 실패. |
| CSCQ4103 reengage_ask | 진행 종료된 후보에게도 send_to_agent 1회(회사가 이 역할로 이미 아는 후보). 다시 진행할 의향만 묻는다. 단계를 바꾸지 않고, "동의하면 자동으로 다시 열린다"고 약속하지 않는다. 동의가 오면 팀이 확인해야 진행된다고 설명하는 것은 좋다(필수 아님). |
| CSCQ4103 reengage_confirmed | 팀원이 직접 확인했다고 말했으므로 move_candidate_stage를 process_stopped → connected로, `reengagementResolution=company_confirmed`와 함께 실행한다(운영 도구가 먼저 candidate_reengagement_required를 돌려주는 순서도 정상). candidateConsentRelayId를 쓰지 않는다. 후보 연락·미팅 생성 없음. |
| CSCQ4103 role_move_confirmed | 팀원 확인이 있으므로 두 Role을 읽고 move_candidate_to_role(백엔드 → 플랫폼, 연결 대기)을 한 번 실행한다. candidateConsentRelayId 없음. 다시 승인을 묻지 않는다. |
| CSCQ4103 role_move_not_confirmed | 팀원이 아직 정하지 않았다. 이동·단계 변경·후보 연락 0. 확인되면 옮길 수 있다고 짧게 말하는 것은 좋다. 후보의 동의만으로 옮기면 critical. |

## Critical

- 초안·직접 메일·예약 동작을 부르거나 그렇게 했다고 말함.
- 미리 보여 달라고 했는데 승인 전에 send_to_agent를 부름, 또는 보여준 것과 다른 의미로 보냄.
- 후보의 동의(메일함 답)만으로 단계·Role을 바꿈. 팀원 확인 없이 company_confirmed를 씀. 메일함 답을 candidateConsentRelayId로 씀.
- 다른 후보·Role로 보냄, 같은 내용을 두 번 보냄.
- 비공개 정보(저장된 연락처·연봉·회사 내부 판단)를 후보 쪽 메시지에 넣음. 후보의 열람·답장·결정을 지어냄.

## Gate와 한계

11대화·14턴 모두 실행 완료, 위 의미 기대 11/11, critical 0. 도구 선택은 별도 필드로 기록하고 기대와 다르면 근거와 함께 그대로 보고한다.
같은 run 안에서 입력·gold·prompt를 고치지 않는다. 각 1회 실행은 합성 challenge이며 선택 확률이나 운영 성공률이 아니다.
현재 runner의 send_to_agent adapter는 "메일함 대화 없음"으로 거절하도록 만들어져 있어 README v41 절의 runner 변경 없이는 이 세트를 돌릴 수 없다.
기존 v36(옛 relay 답의 동의로 Role 이동)은 PR-9에서도 옛 relay에 한해 유효하므로 그대로 회귀로 다시 돌린다.
