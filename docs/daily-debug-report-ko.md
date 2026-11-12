# Daily Debug Slack 리포트

구현 상태: 로컬 구현, 미배포. 2026-11-11 사용자 요청으로 당일 00:00~21:07 KST 실제 데이터를 수동 집계하여 [지정 채널에 본문과 상세 스레드](https://match-harper.slack.com/archives/C0BULQ5K5EJ/p1794398897038939)를 발송했다. 정기 발송을 위한 운영 배포는 하지 않았다.

- 채널: `C0BULQ5K5EJ`
- 경로: `/api/internal/daily-debug-report`
- 예약: 기존 daily status와 같은 KST 01:00 (`0 16 * * *`). 별도 cron이라 기존 사용자·회사 리포트와 실행을 분리한다.
- 인증: 기존 `DAILY_USER_STATS_CRON_SECRET` 또는 `CRON_SECRET` Bearer. DB service role과 `SLACK_BOT_TOKEN`을 재사용한다.
- 본문: 이력서·LinkedIn 등록자의 프로필 누락, 정기·일일 실행의 발송 결과, 기능별 오류·지연, 추천·반응, Tool 호출·오류 합계. 오류·지연은 무엇이 실패했는지 문장으로 명시한다.
- 스레드: Tool 상위 20개와 그 밖에 오류가 발생한 Tool, 확인할 오류·지연 요약. 같은 오류 문구는 묶어서 건수로 표시하고 항목마다 상위 3개 문구를 보여준다. 지연은 건수와 최장 경과 시간으로 표시한다. 개별 ID와 오류 원문은 인증된 dry run의 `report`에서 확인한다.

## 집계 기준

- 기본은 전일 KST `[00:00, 다음 날 00:00)` 기준이다. 오늘 날짜로 수동 조회하면 상한을 조회 시작 시각으로 제한하고 실제 집계 기간을 본문에 표시한다. 사용자 제외 목록과 fixture 제외, Tool 집계·정렬은 daily status의 공통 함수를 재사용한다.
- 실행은 `started_at` 기준이며 Worker를 거치지 않는 실행은 `agentInvocation.acceptedAt`을 쓴다. 전일 시작한 run의 **조회 시점 결과**를 보여준다. 자정 이후 도착한 전달 영수증도 run ID로 연결한다. 실행 수와 메일 수는 서로 다른 단위다.
- `career_agent_v1` 실행의 발송 결과와, 전달을 하지 않는 내부 평가 등 Worker 실행의 완료 결과를 구분한다.
- 무발송 완료: `completed` + `agentOutcome=no_send` + 전달 영수증 없음. 중간 Tool 오류까지 없었다는 뜻은 아니다. Tool 오류 로그가 최종 실행 실패 건수인 것처럼 표시하지 않는다.
- 전달 대기·재시도, 취소·상황 변경, 발송 미확정은 무발송 완료에 포함하지 않는다. 제공자 영수증이 남은 발송은 후속 단계가 실패하더라도 오류 미발송으로 바꾸지 않는다. 일부 실패는 오류로 표시한다.
- 메일 발송 결과는 `talent_opportunity_delivery.channel=email`의 제공자 접수 기록을 사용한다. 답장 경로는 `email_reply_jobs`의 실패와 지연을 표시하고 Ops 테스트 메일은 제외한다.
- 미완료 실행·브라우저·이메일 답장은 전일 생성 건에 한정하지 않는다. 삭제 계정의 미완료 작업은 제외한다. 기한 지난 활성 예약은 자동 예약의 수신 설정을 확인하지만, 미실행 장애라고 확정하지 않는다. 미검토 일일 사건도 09시 이후 처리 창 등 실행 조건을 감안해 조사해야 한다. 예약·사건 세부 집계는 스레드에 둔다.
- 외부·내부 추천은 각각 생성일, 반응·저장·지원 행동은 해당 행동일 기준으로 표시한다. 과거 추천에 대한 당일 반응도 포함한다. 모든 항목에 건수와 고유 사용자 수를 표시하며 인원은 항목별로 중복 제거한다.
- 조회 실패는 해당 항목을 `집계 실패`로 표시한다. 실패한 페이지의 일부 데이터를 0건이나 전체 결과로 사용하지 않는다. 본문에 전체 정상이라는 판정을 추가하지 않는다.
- 추가 DB 테이블·모델 호출·발송 재시도는 만들지 않는다. 기존 stats의 페이지 조회·동시성 제한을 재사용하며 Slack 상세는 텍스트 한도에 맞춰 분할한다.

## 외부·내부 추천, 저장, 지원 단계

- 내부 구분은 daily status와 동일하게 `internal_recommendation`·`intro_request`를 사용한다.
- 사용자 직접 요청으로 추가된 추천은 집계 기간에 `apply_to_internal_role`이 새로 생성한 내부 추천(`evidence.source=candidate_request`)과 고유 사용자 수다. 기존 추천을 다시 불러온 경우는 새 추천으로 세지 않는다.
- 좋아요·싫어요·보관은 `talent_progress.kind=candidate_opportunity_feedback_changed`의 불변 `metadata.feedback`를 사용한다. 다음 날 취소·변경해도 전일 반응을 바꾸지 않는다. insert 시점 반응 등 해당 날짜에 변경 이력이 없는 추천은 저장된 `feedback_at`이 당일인 경우에만 보완한다. 단순 `updated_at` 변경은 반응으로 세지 않는다.
- 보관은 `feedback=keep`, 저장함 이동은 `saved_stage_changed` 중 `savedStage=saved`다. 두 수치는 합산하지 않는다. 지원 준비 과정에서 저장함으로 이동하는 경우도 있으므로 보관 버튼 클릭과 구분한다.
- 조회·링크 클릭은 추천의 `viewed_at`·`clicked_at` 기준 추천 건수다. 지원하기 클릭은 별도 클릭 로그의 발생 횟수이며 같은 사람이 반복 클릭하면 건수는 늘지만 인원은 한 명이다.
- 외부 지원하기 클릭은 `career_click_history_external_apply`와 모바일 대응 로그다. Harper와 지원하기는 공통 버튼의 `career_click_apply_with_harper`만 센다. 모달에서 동시에 발생하는 `career_click_history_external_apply_with_harper`는 중복 합산하지 않는다. 채용 페이지에서 직접 지원 선택은 별도 로그로 표시하며, 이것만으로 제출 완료를 주장하지 않는다.
- 내부 지원·연결하기 클릭은 수락 모달을 연 로그다. 연결 수락 확정은 `agent_contact_messages`의 신규 `to_company` introduction root이며, legacy correspondence 이관과 후속 답장은 제외한다. 실제 회사 에이전트에 지원 의사·프로필이 전달된 건은 공유 자료 `material_id`까지 있는 root다. 회사의 수락·열람·면접 확정을 뜻하지 않는다. 채팅·이메일 수락도 포함하므로 버튼 클릭 수보다 클 수 있다.
- 외부 제출 승인·완료는 `talent_simulate_application`에 확인 기록이 있는 경우만 본문 한 줄에 표시한다. 일반 `use_browser` 및 외부 사이트 직접 제출을 포함한 전체 수치는 집계할 수 없다. 승인 시각은 검토본 실행의 `startedAt` 또는 승인 근거 메시지 시각이다. 완료는 `succeeded + approval.approved + approval.executed + result.evidence`를 충족한 시도의 `updatedAt` 기준이며 시도 ID로 중복 제거한다.

## 프로필 누락과 기능별 오류

- 프로필 분모는 **리포트 날짜의 KST 00:00부터 다음 날 00:00까지 24시간 동안 이력서를 업로드하거나 개인 LinkedIn URL을 등록한 사람**이다. 두 가지를 모두 등록하거나 여러 번 업로드한 사람도 한 번만 센다. 내부·테스트·삭제 계정을 제외한다. 전체 누적 등록자나 당일 가입자 수가 아니다.
- 이력서는 `talent_documents(kind=resume).created_at`으로 업로드 시각을 확인한다. Harper가 생성한 파일은 제외한다. 업로드 후 삭제한 파일도 당일 업로드 사실에는 포함한다.
- LinkedIn은 기본 프로필의 `talent_profile_revisions.created_at`과 직전 revision의 `resume_links`를 비교해 개인 `/in/` 링크가 실제 추가·변경된 날에만 센다. 기존 프로필의 최초 이관(`existing_profile`), 로그인·다른 프로필 수정·같은 링크의 유지로는 다시 세지 않는다. 이전 revision이 없으면 집계 실패로 표시한다. 수정 가능한 `talent_users.updated_at`을 등록일로 사용하지 않는다.
- 분자는 위 24시간 등록자 중 **조회 시점에** 경력 행 0개, 학력 행 0개, 기존 프로필 reader가 읽는 extra 항목 0개인 사람이다. `null`, 빈 JSON, 내용 없는 extra 항목도 비어 있는 것으로 센다. 등록 후 아직 비어 있다는 관측이며 원인을 단정하지 않는다. 분모가 없으면 비율은 `해당 없음`이다.
- 이력서 업로드·프로필 저장 오류: 전일 `career_profile_source_save_failed:*` 로그 건수와 고유 사용자 수. 재시도 중 반복된 오류 로그도 포함하며 최종 저장 실패자 수와는 다르다.
- 외부 공고 검색: 전일 종료한 `external_recommendation_runs(variant=career_agent)` 중 `failed` 또는 `partial`의 건수·비율. 검색 실패와 일부 실패를 모두 드러낸다.
- 자동 브라우저: 운영 `talent_external_operations(kind=browser_run)`의 종료 건 중 `failed` 비율. 종료일은 `updated_at` 기준이며 성공·실패만 분모에 포함한다. 생성 후 1시간이 지나도 예약·준비·실행·취소 진행 중인 건은 별도 표시한다. 브라우저 실행 성공을 지원서 제출 성공으로 해석하지 않는다.
- 사용자 이메일 답장: 전일 실패한 답장 작업과, 이메일 접수 후 30분이 지나도 발송·생략·실패로 끝나지 않은 작업을 별도 표시한다. 30분과 1시간 기준은 기존 [이메일 답장 장애 점검](https://github.com/matchharper/harper_incidents/issues/86), [브라우저 장기 실행 장애 점검](https://github.com/matchharper/harper_incidents/issues/92)을 따른다. 지연은 실패 확정과 구분한다.

## 발송 없는 확인

```sh
# 가상 수치로 formatter 출력
node --import tsx scripts/previewDailyDebugReport.ts

# 실제 DB를 읽기만 하는 미리보기
node --env-file=.env.local --import tsx scripts/previewDailyDebugReport.ts --date 2026-11-10
```

인증된 `GET /api/internal/daily-debug-report?dryRun=1&date=2026-11-10`도 `report`와 `messages`를 반환하며 Slack을 호출하지 않는다. dryRun 없는 호출은 실제 발송이다.

검증: 날짜 경계·자정 이후 전달, 내부 평가, 발송 후 오류·재시도 영수증, 결과 미확정, 조회 실패, 삭제·테스트 계정 제외, 1,000행 초과 페이지 조회, 오래된 추천의 반응, Tool 20위 밖 오류, 프로필 분모·내용 누락, 오류·지연 구분, cron 인증·dry-run·채널/스레드 라우팅을 테스트한다. 기존 daily status 테스트도 함께 확인한다.
