# Research_Creators.md

버전: 1.1 · 적용일: 2026-09-17 · 상태: active (범위는 Connections 기준) · 관리: 아래 관리 역할

[AGENTS.md](AGENTS.md)를 먼저 읽는다. 이 문서는 해당 작업의 입력 파악부터 분석·실행·저장·결과 확인까지 소유한다. 외부 발송·게시·송금·플랫폼 API 연결은 문서만으로 생기지 않는다.

## 업무 계약

- **호출 상황:** ‘학생 대상 후보를 더 찾아’, ‘지난 목록의 관객·활동을 다시 확인해’, ‘이 계정들 중 누가 적합한지 조사해’. 신규 검색과 지정 목록 재조사는 같은 업무의 입력 차이다.
- **입력·근거:** 목적·시장·언어·관객·플랫폼·원하는 규모, 조사 시간/비용 한도. 기존 gtm_creators/gtm_accounts, 관련 gtm_collaborations/gtm_contents 결과, 이전 검색 brief·출처를 읽는다. 연결할 집행이 명확하면 조건을 가져오고 결론을 바꾸는 미확인 조건만 확인한다. 집행 없이 조사할 수도 있다.
- **소유하는 방법:** 기존 목록 재사용 → 검색 경로 선택 → 후보 수집·동일인 확인 → 최근 콘텐츠·관객·연락 경로 조사 → 목적에 대한 적합성과 불확실성 분석 → 저장 → 추가 조사할 대상과 한계 보고. 검색어·소스·기준일을 남겨 ‘같은 기준으로 더’에 이어갈 수 있게 한다.
- **분석 내용:** 플랫폼별 규모·최근 365일 게시량·최근 게시일·대표 콘텐츠·가능한 범위의 조회 분포, 반복 주제/포맷, 활동 지역/언어, 관객 지역/대상의 근거, 연락 경로, 확인된 조건·과거 협업 결과를 연결한다. 팔로워만으로 수익을 예상하지 않고 이번 목적에 어떤 근거가 유리하며 무엇을 더 확인해야 하는지 설명한다. 단가·전환 근거가 없으면 기대 리턴을 확정 수치로 쓰지 않는다.
- **갱신:** operations의 최신성 기준과 실제 출처 조건을 적용해 이번 작업에 필요한 자료만 다시 수집한다. 지난 조사의 결과 ref와 범위를 재사용하고 수집 실패·미확인을 기존 관측과 구분한다.
- **저장:** 확인된 소개·연락처는 gtm_creators, 플랫폼별 관객 근거는 gtm_accounts, 수치는 metric_snapshots에 남긴다. 집행이 없는 조사도 activities의 최종/부분 조사 결과 한 건에 목적·검색 범위/진행 위치·확보한 creator IDs·제외/미확인 요약·비용과 기준일을 연결해 다시 찾을 수 있게 한다. 이번 목적의 추천 이유는 그 결과에 남기며 사람의 영구 등급으로 쓰지 않는다.
- **완료:** 중복을 구분한 후보마다 활동 지역, 플랫폼/계정, 팔로워, 최근 365일 게시 수, 최근 게시일, 주제/포맷, 관객 근거, 연락 가능 여부, 자료 기준일·출처, 분석 이유와 미확인이 확인 가능하다. 단순 프로필 URL 목록이나 팔로워만 있는 목록은 완료가 아니다.
- **예외·경계:** 요청 수를 못 채우면 실제 확보 수와 한계를 보고한다. 비공개 관객 정보를 추측으로 채우지 않는다. 선정 자체가 연락이나 지출을 뜻하지 않는다. 오늘 보낼 최종 목록은 Outreach_Creators.md가 책임진다.
- **관리:** 발굴 담당이 검색 성과·중복·후속 협업 결과를 보고 개선한다. 소스 접근 방식이 바뀌면 Connections도 함께 검토한다.

## 현재 도구로 끝까지 수행하기

[Connections.md](Connections.md)의 gtm_api 호출 형식을 사용한다. 칼럼은 [data-model.md](data-model.md), 제품 사실은 [Business_Context.md](Business_Context.md), 계산은 [measurement.md](measurement.md)가 원본이다.

1. `list gtm_creators`의 기본 운영 조회로 기존 후보를 먼저 찾는다. 여기서 대표 플랫폼·handle·프로필·이메일, 활동 지역·언어·주제, 전체 플랫폼/계정, 팔로워, 최근 365일 게시 수, 최근 게시, 연락 상태, 열린 협업·집행, 게시 이력, 조회 기간의 귀속 결과와 기록 비용, 최신 채택 방향, `data_status`와 `refresh_fields`를 한 번에 본다. 지정 후보나 원본 근거가 필요할 때만 `get`과 계정/관측 이력을 더 읽는다. 이전 `research_result`의 검색 범위와 진행 위치를 이어 쓴다.
2. 공개 프로필·실제 콘텐츠·제공된 통계 등 접근 가능한 출처를 확인한다. 후보마다 최소한 다음을 조사한다.
   - 동일인 확인 근거와 플랫폼별 handle/URL
   - 팔로워 수와 관측 시각
   - 정확한 최근 365일 게시물 수와 기간 시작/끝
   - 최근 게시 시각, 대표 게시물, 가능한 경우 최근 조회/참여 분포와 그 정의
   - 반복 주제·표현 방식, 활동 국가/도시/시장, 사용 언어
   - 관객 지역·연령/학생 여부 등 실제로 볼 수 있는 근거와 기준일
   - 공개 연락 경로, 이전 광고/협업 흔적, 확인된 견적·조건, 미확인 항목
3. 새 사람은 `save gtm_creators`에 name, activity_regions, languages, content_topics, description을 저장하고, 플랫폼별 계정은 `save gtm_accounts`에 platform/handle/profile_url/last_post_at/audience_summary/audience_evidence/source_ref/as_of를 저장한다. 연락 경로는 `patch_item contacts`를 쓴다. 같은 계정의 provider_scope/external_id를 먼저 확인한다.
4. 팔로워는 `save gtm_metric_snapshots`에 metric=`followers`, unit=`people`, value_kind=`cumulative`로 기록한다. 최근 365일 게시 수는 metric=`published_content_count`, unit=`posts`, value_kind=`period`와 정확한 period_start/period_end로 기록한다. 두 수치 모두 as_of, collected_at, source_ref, definition_version을 가진다. 값을 못 봤으면 0을 넣지 않고 missing_reason을 기록한다.
5. 이번 목적에 적합한 이유·반대 근거·가격/성과의 미확인 항목을 사람이 읽을 수 있는 문장으로 분석한다. 최종 결과는 `save gtm_activities`의 kind=`research_result`, body=요약, payload={brief, sources, creator_ids, excluded, unknowns, continuation, document_version, cost_refs}에 기록한다. 집행이 없으면 entity/entity_id는 비워도 된다. 목적별 추천 이유를 크리에이터의 영구 등급으로 저장하지 않는다.
6. 저장 후 `list/get gtm_creators`를 다시 읽어 플랫폼·팔로워·최근 365일 게시 수·최근 게시·활동 지역·연락 상태·자료 기준일이 기본 조회에 실제로 나타나는지 확인한다. 자료가 누락되거나 30일/90일 초기 최신성 기준을 넘으면 `data_status`와 `refresh_fields`가 이를 숨기지 않는지 확인한다. 요청 수보다 적으면 실제 확보 수와 다음 검색 위치를 보고한다.

## 중단·충돌·완료 확인

같은 쓰기를 재시도할 때 request_id와 본문을 유지한다. row_version 충돌은 최신 행을 읽고 실제 변경을 재판단한다. 애매한 외부 결과를 성공으로 기록하지 않는다. 외부 입력을 기다리면 기존 원장의 실제 할 일·담당·기한·재개 조건을 남긴다. 결과에는 사용한 문서 버전, 저장한 원장 ref/ID, 실제 완료 범위와 남은 사항을 포함한다.

## 변경 이력

| 날짜 | 버전 | 변경 |
| --- | --- | --- |
| 2026-09-17 | 1.1 | 후보별 필수 조사 정보, 계정 수치 저장 계약, 기본 조회·최신성 검증 추가 |
| 2026-09-16 | 1.0 | 작업 계약과 실제 GTM 공통 API 사용 절차 발행 |
