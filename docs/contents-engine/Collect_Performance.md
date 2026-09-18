# Collect_Performance.md

버전: 1.2 · 적용일: 2026-09-18 · 상태: active (범위는 Connections 기준) · 관리: 아래 관리 역할

[AGENTS.md](AGENTS.md)를 먼저 읽는다. 이 문서는 해당 작업의 입력 파악부터 분석·실행·저장·결과 확인까지 소유한다. 외부 발송·게시·송금·플랫폼 API 연결은 문서만으로 생기지 않는다.

## 업무 계약

- **호출 상황:** ‘올라간 콘텐츠 성과 업데이트해’, ‘7일 결과 수집해’, ‘이 링크 전환이 빠졌는지 확인해’. 정기 수집과 지정 대상 갱신은 같은 문서로 처리한다.
- **입력·근거:** contents와 링크, 관측 시점·지표 정의, 기존 수집 이력·실패, 허용된 플랫폼/제품 데이터 연결.
- **소유하는 방법:** 필요한 대상과 관측 창 선택 → 기존 결과/동기화 확인 → API·제출 자료·제품 이벤트 수집 → 정의·단위·중복·매핑 확인 → 저장과 공통 집계 → 누락·지연·권한 한계를 표시. 기존 의미를 유지하는 누락분 재수집까지 포함한다.
- **저장:** metric_snapshots와 수집 실행 근거, 재생성 가능한 제품 집계. 원본과 기준 시각을 보존하고 정정본을 구분한다.
- **완료:** 성공 수집·관측 중·미제출·권한 없음·오류가 구분되고 같은 기간의 비교가 가능하다. null을 0으로 채우거나 현재 누적값을 과거 관측값으로 저장하지 않는다.
- **예외·경계:** 잘못된 사람/콘텐츠 연결의 정정은 Maintain_Data.md이다. 합의된 통계 제출을 요청하는 일은 이 작업이 기존 대화에서 수행하고 범위·기한을 새로 협의해야 할 때 Manage_Collaborations.md를 읽는다. 수집 자체가 Scale/Stop 결론은 아니며 해석은 Review_Performance.md이다.
- **관리:** 데이터 담당이 결측·정의 변경·수집 비용·지연을 보고 개선한다.

## 현재 도구로 끝까지 수행하기

[Connections.md](Connections.md)의 gtm_api 호출 형식을 사용한다. 칼럼은 [data-model.md](data-model.md), 제품 사실은 [Business_Context.md](Business_Context.md), 계산은 [measurement.md](measurement.md)가 원본이다.

1. 콘텐츠와 이전 metric_snapshots, 요청한 기간, 실패/미제출 활동을 확인한다. `performance`에 start_at/end_at와 필요한 content_id 또는 plan_id를 전달한다.
2. 제품 집계는 logs, landing_logs, 인증 가입 연결, 실제 온보딩 이벤트를 서버에서 읽는다. 반환된 정의 버전과 한계를 같이 보존한다. raw 사용자/이메일을 마케팅 DB로 복제하지 않는다.
3. 플랫폼 수치는 허용된 API 또는 실제 제출 통계에서 수집한다. 현재 Instagram 공개 게시물은 매일 수집 작업이 `views`, `likes`, 플랫폼 전체 `comments`, 플랫폼 전체 댓글에서 수집기가 확인한 계정 작성자 댓글 수를 뺀 `comments_non_author`를 저장한다. 수집기가 모든 댓글을 노출받았다고 보장할 수 없으므로 이 값에는 `platform_total_minus_observed_creator_comments` 한계를 함께 남긴다. 플랫폼 전체 댓글 수가 없으면 공개적으로 읽힌 댓글 기록만 세고 그 한계를 따로 표시한다. 숨긴 좋아요나 노출하지 않은 지표는 0으로 만들지 않고 missing_reason을 쓴다. 다른 플랫폼은 검증된 수집 연결이 생기기 전 자동 수집 완료로 보고하지 않는다. `save gtm_metric_snapshots`에 account_id 또는 content_id 중 하나, metric/value/unit/period/as_of/source_ref/definition_version/value_kind를 기록한다. 계정 팔로워는 metric=`followers`, unit=`people`, value_kind=`cumulative`; 최근 365일 게시 수는 metric=`published_content_count`, unit=`posts`, value_kind=`period`와 정확한 365일 period_start/period_end를 쓴다. 계정의 실제 최근 게시 시각은 `gtm_accounts.last_post_at`에 저장한다.
4. 수집 결과/실패를 `collection_result` 활동에, 다음 확인을 원장의 action_items에 남긴다. 성공/실패·원본 시각·수집 시각을 구분한다.
5. 저장 후 get/performance로 다시 확인하고 누락·공용 귀속·미성숙 cohort를 표시한다. 현재 집계는 조회 기간 성과이며 자동으로 D14 고정 cohort가 되는 것은 아니다. D14 비교는 그 창을 따로 확정한다.

## 중단·충돌·완료 확인

같은 쓰기를 재시도할 때 request_id와 본문을 유지한다. row_version 충돌은 최신 행을 읽고 실제 변경을 재판단한다. 애매한 외부 결과를 성공으로 기록하지 않는다. 외부 입력을 기다리면 기존 원장의 실제 할 일·담당·기한·재개 조건을 남긴다. 결과에는 사용한 문서 버전, 저장한 원장 ref/ID, 실제 완료 범위와 남은 사항을 포함한다.

## 변경 이력

| 날짜 | 버전 | 변경 |
| --- | --- | --- |
| 2026-09-18 | 1.2 | Instagram 게시물 조회수·좋아요·전체/작성자 제외 공개 댓글의 자동 수집과 결측 표시 계약 추가 |
| 2026-09-17 | 1.1 | 크리에이터 기본 조회에 쓰는 팔로워·최근 365일 게시 수·최근 게시 시각 기록 계약 명시 |
| 2026-09-16 | 1.0 | 작업 계약과 실제 GTM 공통 API 사용 절차 발행 |
