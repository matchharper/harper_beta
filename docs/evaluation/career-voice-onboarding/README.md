# Career Voice 온보딩 A/B 결과 평가

## 목적과 평가 단위

첫 온보딩에서 통화를 선택한 사용자가 **첫 통화만으로 추천에 필요한 충분하고 정확한 정보를 남겼는지** 비교한다. 1회·8회 발화, 통화 길이, 모델의 완료 선언은 성공의 대체 지표가 아니다. 단위는 사용자이며 A/B 배정은 기존 `assignCareerVoiceModel`을 재사용한다. 실제 model log와 배정의 불일치를 별도로 감사한다.

## Frozen input과 gold

- Dataset `pilot-v1`: `2026-09-28T01:17:29.323990Z`까지의 기록. 실험 최초 attempt 이후 첫 온보딩 선택이 call인 사용자 전체. 내부 `matchharper.com` 계정 제외.
- 주 분석은 첫 선택 후 24시간의 관찰 기회가 확보된 사용자. 미성숙 표본은 별도 표시한다. 연결 실패·무발화·기록 누락을 성공자 분모에서 임의로 제외하지 않는다.
- 첫 callSessionId의 attempt부터 해당 wrap-up log 또는 다음 attempt 중 이른 시점까지가 첫 통화. 종료 이벤트가 없으면 관측 가능한 발화를 사용하되 통화 경계 한계를 표시한다.
- `private/pilot-v1.json` 원본 캡처와 `private/packets/`의 그룹 비표시 자료를 동결한다. 현재 context 행을 과거 사실로 쓰지 않는다. `talent_context_write_requests.response.applied`에서 당시 내용을 복원하며, 첫 통화 직후 비동기 저장은 최대 5분까지 허용하되 다음 사용자 대화/다음 통화보다 앞선 경우에만 포함한다.
- 최초 rubric은 `rubric-v1.md`. 결과는 `gold-v1.json`(비식별 ID·판정만), 상세 근거는 private. 수정 시 새 버전과 변경 이유를 남긴다. 독립적인 사람 검토 전에는 human gold라고 부르지 않는다.

## Input / 평가 계약

평가자는 모델명을 숨긴 기존 프로필 증거, 첫 통화, 통화 전후 저장 내용, 기록 가용성만 읽는다. 후속 대화에서 확보된 정보는 첫 통화 점수에 사용할 수 없다. 모델/그룹과 자동 완료 상태는 판정 완료 후 합친다. 현재 Codex가 직접 의미를 평가하며 추가 외부 LLM API 호출은 하지 않는다. 키워드·길이·정규식으로 정성 판정을 만들지 않는다.

## Canonical runner

- `scripts/evalCareerVoiceOnboarding.ts capture`: GET-only production capture, private 파일 0600, 기존 frozen 파일 덮어쓰기 금지.
- `scripts/evalCareerVoiceOnboarding.ts packets`: 원본에서 그룹 비표시 review packet 생성.
- `scripts/evalCareerVoiceOnboarding.ts summarize`: 동결된 수동 판정과 배정 결합 및 비식별 집계.

## Metrics와 의사결정

- 주 지표: 첫 통화 정보 충분성 + 저장 정확성 모두 확인된 사용자 / 전체 성숙 배정 사용자.
- `ready`, `not_ready`, `unknown`을 분리한다. unknown은 실패로 단정하지 않는다. confirmed rate와 unknown을 모두 성공으로 보는 상한을 함께 제시한다.
- 충분성: 희망 역할/방향, 시점·탐색 의사, 지역·근무 방식, 보상 기준, 필수·기피 조건/우선순위가 추천을 시작할 만큼 명확한가. 해당 없음·제약 없음·미정도 명시됐다면 유효하다. 경력 원본에 이미 있는 사실을 다시 말할 필요는 없다.
- 정확성: 사용자 확인 사실과 저장된 정보가 일치하고, 추천을 바꿀 중요한 누락·날조·강도 왜곡이 없는가.
- 보조: 24시간 내 실제 완료 event(품질 검증 없는 운영상 완료), 실패/무발화/누락, 반복 통화. 비용·음성 latency는 충분한 telemetry가 없으면 N/A.
- 모델 선택에는 주 지표 차이, 불확실성, 중요한 저장 오류를 함께 본다. 작은 pilot만으로 확정 승자/전체 대화 품질을 선언하지 않는다. 배포는 이 평가에 포함되지 않는다.

## 설정·출처·개인정보

- Production observed A=`gpt-realtime-2.1`, B=`gpt-live-1`; historical runtime의 provider/prompt 변경은 재실행한 모델 실험처럼 통제되지 않는다.
- 평가자: 현재 Codex 대화의 직접 검토. 모델명·reasoning의 정확한 runtime 식별자는 제공되지 않으므로 임의로 기록하지 않는다. 추가 API sampling/reasoning/temperature는 해당 없음.
- 데이터: logs, talent_messages, talent_context_write_requests, talent_contexts, talent_documents, talent_users/experiences, talent_calls, talent_activity_events. Supabase GET-only, DB mutation·추천·발송 없음.
- 원문·계정 ID·model mapping은 ignored private에만 보관하고 0600을 적용한다. 공개 gold/manifest/report는 원문·개인정보를 포함하지 않는다. 별도 provider 전송 없음.

## 한계

관측형 pilot이며 이미 전체 그룹별 발화 집계를 본 평가자의 완전한 blind를 보장할 수 없다. 개별 자료에서는 그룹 정보를 숨긴다. 원음/음성 인식 품질·무음·응답 지연은 텍스트만으로 평가하지 않는다. 과거 프로필이나 저장 변경 이력이 없으면 현재값으로 보충하지 않는다. 기존 이력서 원문에는 연락처·학력·주소 등의 개인정보가 포함될 수 있어 review packet도 raw production 자료로 취급하며 ignored private에만 보관한다. 공개 산출물에는 넣지 않는다. 향후 재현은 private snapshot 보존에 의존한다.

## Pilot 결과와 release gate

[2026-09-28 결과](reports/2026-09-28-pilot-v1.md): 성숙 40명의 성공 확인 비율은 Realtime 9/18=50.0%, Live 5/22=22.7%. 기록 부족 17명 및 정성 평가 불확실성으로 확정 승자는 아니다. Realtime 우선 선택의 잠정 근거이며, 자동 rollout 승인 gate는 충족하지 않는다. 실제 전환 판단에는 동일 session 단위 관측 누락 해소, 독립적인 기준 검토, 주 지표의 불확실성과 실패·지연·비용 확인이 필요하다. 배포 또는 실험 비율 변경은 수행하지 않았다.
