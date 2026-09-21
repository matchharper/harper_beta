# Talent GTM Daily Slack Report

## 목적

매일 오전 9시, 전날 KST 하루 동안 talent-side GTM이 실제로 만든 유입과 다음 행동을 팀원이 30초 안에 파악한다. Google Analytics가 아니라 Harper production DB의 `landing_logs`, `logs`, `talent_activity_events`, `official_jobs`, `official_job_events`, `talent_users`를 읽는다. 실행은 read-only이며 Slack 메시지만 생성한다.

이 리포트는 모든 분석을 한 화면에 넣는 대시보드가 아니다. Microsoft의 dashboard guidance처럼 가장 중요한 수치를 첫 화면에 두고, 세부 행은 drill-down으로 분리한다. Slack의 native table block과 `thread_ts`를 이용해 요약과 상세를 분리한다.

- [Power BI dashboard design tips](https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips)
- [Google Analytics date comparisons](https://support.google.com/analytics/answer/13412290?hl=en)
- [Amplitude period-over-period and rolling averages](https://amplitude.com/docs/analytics/charts/event-segmentation/event-segmentation-interpret-2)
- [Slack table block](https://docs.slack.dev/reference/block-kit/blocks/table-block/)
- [Slack threaded messages](https://api.slack.com/methods/chat.postMessage)

## 메시지 구조

### 채널의 root message

1. **제목보다 위에 한 줄 분석**: 예약 작업을 실행하는 Codex가 실제 집계 결과를 읽고 가장 의미 있는 변화와 관련 채널을 한국어 한 문장으로 설명한다. 수치로 확인되지 않은 원인을 단정하거나 일일 발생 건수를 전환율로 표현하지 않는다. 변화가 작거나 근거가 부족하면 그 사실을 간결하게 쓴다.
2. 전날 `방문자`, `회원가입`, `온보딩 완료`
3. 각 건수의 전일 대비 증감률
4. 방문자만 전주 같은 요일 대비 증감률
5. 6개 채널 표
   - LinkedIn
   - Jobs
   - Threads
   - Instagram·콘텐츠
   - SEO
   - 기타

Root의 `방문자`, `회원가입`, `온보딩 완료`는 모두 전일과 비교한다. 방문자에는 전주 같은 요일 대비도 한 줄로 추가한다. 가입과 온보딩은 전주 대비를 표시하지 않는다.

채널 표에서는 각 `방문자`, `회원가입`, `온보딩 완료` cell에 현재 수치와 전일 대비를 함께 표시한다. 오른쪽 `지난주 방문자 대비` 열에는 방문자만 전주 같은 요일과 비교해 표시한다. 변화가 없는 경우 `→`, 증가·감소는 `▲`·`▼`로 표시한다. 비교일이 0이면 무한대 퍼센트를 만들지 않고 `신규 N`으로 표시한다. 비교 기준, 집계 방식, 상세 위치 같은 반복 설명은 매일 보내지 않고 이 문서에만 둔다.

### thread reply

1. **공고별 유입 표**
   - 현재 게시 중인 모든 job과 해당 일자에 활동이 있었던 종료 job
   - 공고, 방문자, 회원가입, 온보딩 완료
   - 해석을 위해 별도 설명이 필요한 내부 상태는 노출하지 않는다.
2. **Instagram·콘텐츠별 유입 표**
   - `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`
   - 각 조합별 방문자, 회원가입, 온보딩 완료
   - 과거 `contents04`, `contents05`처럼 source만 있는 링크도 별도 행으로 유지
3. **기타 유입 상세**
   - `기타`가 커졌을 때 무엇이 늘었는지 유입 경로별로 확인
   - 내부 source 이름 대신 `직접 방문·출처 미확인`처럼 사람이 이해할 수 있는 이름을 표시

## 지표 계약

| 지표 | 정의 |
| --- | --- |
| 방문자 | 해당 KST 날짜에 `new_visit` 또는 `new_session` entry가 있는 고유 `local_id` |
| 회원가입 | 해당 날짜의 `logs.type = career_signup_completed` 고유 `user_id` |
| 온보딩 완료 | 해당 날짜의 `talent_activity_events.event_type = onboarding_completed` 고유 `talent_id` |
| Jobs unique users | 해당 공고의 `official_jobs:job_view:<slug>`를 만든 고유 `local_id` |

가입과 온보딩 완료는 그날 발생한 event volume이다. 같은 날 단계별 발생량을 전환율처럼 오해하지 않도록 일일 Slack 리포트에서는 단계 사이의 비율을 표시하지 않는다. 장기 의사결정이나 캠페인 ROI에는 Ops UTM의 acquisition cohort 화면을 함께 사용한다.

## attribution

- 한 사람은 한 지표·하루에 한 채널만 포함한다.
- 방문자는 그날 가장 최근 entry source, 가입·온보딩은 이벤트 직전 가장 최근 `login_email:*:<source>`를 사용한다.
- 같은 local ID에서 30분 안에 기록된 가장 가까운 `utm:*` 로그를 우선 사용해 UTM dimensions를 복구한다. entry source가 `career`로 남은 경우에도 명시 UTM source가 있으면 그 channel로 분류한다.
- Jobs 페이지를 거쳐도 확인된 외부 유입 출처를 먼저 반영한다. 명시 UTM이 우선이며, 없으면 같은 Jobs 방문 세션의 `official_job_events.path`와 `referrer`를 사용한다. LinkedIn 웹·앱·단축 링크 유입은 `LinkedIn`, 검색 유입은 `SEO` 등 해당 채널에 포함한다. 외부 채널이 확인되지 않는 직접·내부 Jobs 유입은 `Jobs`에 남긴다. 공고의 LinkedIn 게시 여부만으로 유입을 추정하지 않는다.
- Jobs 이벤트 간격이 30분 미만이면 같은 세션의 출처를 이어가고, 30분 이상 떨어진 새 세션에는 이전 출처를 이어 붙이지 않는다. 방문 entry와 page event의 비동기 기록 차이는 30분 범위에서 연결한다. 가입·온보딩은 identity 로그 시점까지 기록된 같은 세션의 출처를 사용하며, 미래 Jobs 이벤트로 과거 전환의 채널을 바꾸지 않는다.
- 이 기준은 당일·전일·전주 비교에 동일하게 적용한다. 채널 표에서는 중복 집계하지 않으며, 별도 공고별 상세 표에는 유입 채널과 관계없이 해당 공고의 활동을 계속 표시한다.
- Instagram·콘텐츠는 `instagram`, `instantdm`, `dm`, `contentNN`, `contentsNN`을 포함한다.
- SEO는 UTM source가 `seo`이거나 Google, Naver, Bing, Daum, DuckDuckGo, Yahoo referrer에서 새로 기록된 `seo` source다.
- 그 밖의 direct, 미분류, network, email, AI assistant 등은 기타다.
- UTM이 없는 과거 검색 유입은 사후 복구할 수 없으므로 역사적으로 `career`/기타에 남는다.
- 일일 메시지에서는 `career`를 `직접 방문·출처 미확인`으로 표시한다. 명시된 캠페인이 기존 채널에 속하지 않으면 기타 상세에 해당 source를 표시한다.

내부 계정과 `analytics_excluded_test_fixture_talent` marker가 있는 fixture는 제외한다. `GROWTH_TALENT_GTM_EXCLUDED_EMAILS`에 쉼표 또는 줄바꿈으로 추가 exclusion을 줄 수 있다.

## 실행

```bash
# 전날 preview
pnpm growth:talent-gtm-report --dry-run

# 특정 날짜 preview
pnpm growth:talent-gtm-report --dry-run --date 2026-09-15

# 집계 결과를 읽고 한국어 한 줄 분석을 작성한 파일로 preview
pnpm growth:talent-gtm-report --dry-run --date 2026-09-15 --insight-file /absolute/path/insight.txt

# 같은 날짜와 분석으로 특정 Slack 채널에 root + thread 3개 발송
pnpm growth:talent-gtm-report --date 2026-09-15 --insight-file /absolute/path/insight.txt --channel C0123456789
```

예약 작업은 먼저 `--dry-run`으로 수치를 읽고, 그 실행에서 직접 작성한 분석을 권한 `0600`의 임시 UTF-8 파일에 저장한 뒤 `--insight-file`로 넘겨 발송한다. 분석 파일이 없거나 비어 있으면 발송하지 않는다. 분석의 의미·말투는 Codex 지시문이 담당하며, 스크립트는 문장을 생성하거나 규칙으로 고치지 않는다. 같은 문장이 Slack 첫 block과 텍스트 fallback의 맨 위에 들어간다. 실행 후 임시 파일은 지운다.

기본 Slack destination은 `_growth-candidate`(`C0A795ULXGF`)이고 `GROWTH_TALENT_GTM_SLACK_CHANNEL`로 바꿀 수 있다. Slack native table이 workspace나 token에서 거절되면 같은 내용을 고정폭 텍스트 표로 자동 재시도한다.

## 운영상 제한

- 기존 Jobs 이벤트에 referrer 또는 UTM이 남아 있으면 과거 날짜도 다시 분류할 수 있다. 원본 출처가 저장되지 않은 유입은 사후 복구할 수 없다.
- 브라우저 privacy 설정이나 앱 내 브라우저가 referrer를 제거하고 UTM도 없으면, Jobs 유입은 `Jobs`, 일반 유입은 기존 기타 분류에 남는다. 따라서 `Jobs`에는 출처를 확인할 수 없는 방문도 포함된다.
- 출처 복구는 같은 anonymous ID와 방문 세션 안에서만 수행한다. 식별자가 달라지거나 세션이 끊긴 경우 출처를 임의로 연결하지 않는다.
- 일일 event volume과 acquisition cohort conversion을 섞어 장기 ROI를 판단하지 않는다.
