# 데이터 계약 — 일곱 원장과 내부 기록

버전: 1.2 · 적용일: 2026-09-17 · 상태: 업무 테이블 11개와 공통 API 구현. [AGENTS.md](AGENTS.md)를 먼저 읽는다. 아래는 저장 의미와 운영 계약이며 실제 칼럼은 마지막 물리 목록, 호출은 Connections를 따른다.

## 공통 규칙

원장은 사람이 떠올리는 대상과 맞춘다. `id`는 불변 ID, `ref`는 화면에 표시하는 짧은 번호다. 변경 가능한 행은 생성/수정 시각·주체, `row_version`, 보관 여부를 가진다. 삭제보다 보관을 기본으로 하되 개인정보·외부 소스 보존 의무를 우선한다.

팀원과 Agent는 같은 일반 조회/변경 함수를 쓴다. 기본 조회는 연결 요약까지 반환하고 수정은 필드의 실제 소유 원장에 한 번만 쓴다. 권한·필수값·ID·동시 수정·중복은 서버와 DB가 검증한다. 표의 칼럼 묶음은 설명을 위한 것이며 관계 ID·금액·시각을 한 JSON에 몰아넣으라는 뜻이 아니다.

기본 목록의 계산값은 별도 편집 원본이 아니다. 통화와 금액, 시각과 시간대를 명시한다. 미확인 금액·지표는 null이며 관측된 0과 다르다. 기본 화면은 사람이 한 대상에 대해 바로 결정해야 하는 식별·규모·활동·연락·다음 업무·최신성을 먼저 보여주고, 원본과 긴 이력은 상세에서 펼친다.

업무 데이터의 설계 범위는 7개 기본 원장과 4개 보조 기록, 총 11개다. 문서 수는 테이블 수와 관계없다. 접근 키 해시·권한·만료를 보관하는 내부 gtm_access_tokens 1개가 추가되어 물리 테이블은 총 12개다. 기존 공통 마케팅 접근 저장소가 없어 최소로 추가했다.

## 1. gtm_creators — 크리에이터

한 행: 사람 또는 제작 팀. 한 사람이 여러 플랫폼에 있어도 한 행이다.

| 칼럼 | 의미·입력 |
| --- | --- |
| `name`, `description`, `content_topics` | 이름, 확인된 콘텐츠·배경 설명, 반복해서 관측한 주요 주제 |
| `country`, `activity_regions`, `languages` | 대표 국가, 실제 활동 국가·도시·시장 목록, 언어. 거주지나 관객 지역과 구분 |
| `outreach_score` | 최근 근거를 종합한 현재 연락 우선순위 1~5. null은 미평가. 활동성·타깃/주제 적합성·콘텐츠/반응 품질·연락 준비도·리스크를 Agent/팀원이 함께 판단하며 자동 계산하지 않는다. 근거·기준일·이번 요청의 상세 적합성은 `research_result`에 남김 |
| `primary_platform`, `primary_handle`, `primary_profile_url`, `platforms`, `account_summary`, `total_followers`, `content_count_365d`, `latest_post_at` | 기본 조회에 붙는 필터 가능한 대표 계정과 전체 계정 요약. 대표 계정은 최신 팔로워가 큰 계정을 우선하며 원본은 accounts와 metric snapshots다. 플랫폼별 팔로워 합계와 게시물 합계는 동일 관객·교차 게시 중복 가능성을 표시 |
| `audience_summary` | 계정별 관객 근거를 묶어 보여주는 조회값. 원본은 해당 accounts의 관객 근거이며 추정은 사실과 구분 |
| `contacts`, `primary_email`, `contact_summary` | 원본은 고정 항목 ID, channel, address, 본인/매니저, source_ref, as_of, 반송/유효 상태를 가진 소수 연락 경로 목록. 기본 조회는 필터 가능한 대표 이메일과 전체 요약을 표시 |
| `owner_id`, `notes` | 담당 팀원, 필요한 맥락 |
| `do_not_contact`, `contact_restriction_source` | 명시적 연락 중단과 근거 |
| `outreach_status`, `first_outreach_at`, `first_reply_at`, `last_contact_at`, `current_collaboration_*`, `current_plan_*`, `next_action*` | 기본 조회에서 연락 여부·최초 발송/회신·마지막 실제 연락·열린 협업과 집행·가장 이른 후속 업무를 보여주는 계산값. 원본은 activities/collaborations/plans/action_items |
| `published_content_count`, `last_published_at`, 조회 기간의 귀속 방문·가입·7일 완료·기록 비용·잠정 완료당 비용 | 기본 Sheet에서 과거 실행량과 현재 조회 기간의 결과를 함께 비교하는 계산값. 원본은 contents, metric snapshots, costs와 기존 제품 logs/landing_logs이며 관측 기간·통화·결측 상태를 함께 표시 |
| `latest_direction*` | 관련 크리에이터·협업·콘텐츠에 팀이 마지막으로 채택한 Scale/Retry/Hold/Stop과 근거. 임시 Agent 판단은 포함하지 않음 |
| `data_status`, `profile_metrics_as_of`, `refresh_fields` | 계정 없음, 활동 지역/주제/연락 경로/계정 수치/최근 게시/관객 근거 누락, 오래됨, 현재 상태와 다시 조사할 항목. 수치 30일, 관객 근거 90일 초기 기준을 적용 |

플랫폼은 사람 한 명에게 여러 개일 수 있으므로 물리 `gtm_creators` 행에 단일 플랫폼·팔로워 값을 복제하지 않는다. 플랫폼/handle/URL은 `gtm_accounts`, 시점별 팔로워와 최근 365일 게시 수는 `gtm_metric_snapshots`, 최근 게시 시각은 account에 둔다. 그러나 팀원과 Agent가 쓰는 `list/get gtm_creators`는 이 정보를 `gtm_creator_overview`에서 한 번에 반환한다. 정규화 때문에 기본 업무 화면에서 핵심 정보가 사라져서는 안 된다.

`outreach_status`는 실제 기록으로 계산한다: 연락 중단 → `do_not_contact`, 실제 회신이 마지막 발송보다 같거나 최신 → `replied`, 실제 발송 후 회신 없음 → `awaiting_reply`, 초안만 있음 → `draft_ready`, 열린 협업만 있음 → `preparing`, 아무 기록 없음 → `not_contacted`. 협업의 세부 단계는 별도의 `current_collaboration_status`로 보므로 연락 여부와 제작/정산 단계를 한 상태값에 섞지 않는다.

동일 이메일만으로 같은 사람이라고 병합하지 않는다. 같은 매니저 주소는 여러 사람에게 연결될 수 있다. `outreach_score`는 영구 품질 등급이나 팔로워 기반 자동 점수가 아니라 현재의 넓은 연락 우선순위다. 최신 활동·관객·연락 경로가 달라지면 근거를 다시 읽고 갱신한다. 전 생애 ROI·Tier·Scale을 사람 속성으로 만들지 않으며, 특정 집행의 최종 추천은 현재 목표·단가·관련 과거 기록으로 별도 설명한다.

## 2. gtm_collaborations — 협업

한 행: 한 크리에이터와 진행하는 거래. 첫 구체적인 제안 또는 들어온 협업 문의부터 기록하고 무응답·거절도 남긴다. 같은 사람에게 새로 맡기면 새 행이다. 집행 미정인 초기 문의/초안은 plan_id 없이 기록할 수 있으며, 비용 약정·제작 착수 전에는 집행과 허용 범위를 연결한다. 미분류 협업도 운영 조회에서 빠지지 않는다.

| 칼럼 | 의미·입력 |
| --- | --- |
| `creator_id`, `plan_id?`, `title` | 상대, 정해진 경우 소속 집행, 알아보기 쉬운 이름 |
| `status` | 제안 준비/연락/협의/합의/제작/정산/완료/종료 등 실제 업무 진행 |
| `owner_id`, `contact_ref` | 담당자와 사용할 연락 경로 |
| `terms`, `terms_version` | 산출물·수정·사용권·게시 유지·통계 제출·취소·지급 조건의 짧은 문서와 버전 |
| `agreed_at`, `due_at`, `closed_at`, `close_reason` | 합의·주요 약속·종료 사실 |
| `action_items` | 실제 후속 업무 목록. 대표 next_action·담당·기한은 이 목록의 조회값 |
| `previous_collaboration_id`, `origin_activity_id` | 재협업의 이전 거래·계기가 된 채택 리뷰 |

대화는 gtm_activities에서 같은 상세에 노출한다. get은 최근 활동·콘텐츠·비용 원본을 함께 제공하며 최근 연락일·응답 지연·미지급 해석은 이 원본으로 Agent가 계산한다. 약정 숫자의 원본은 costs이고 terms의 해당 숫자는 같은 변경에서 생성한 표시본으로 일치시킨다.

통계 제출과 지급 확인이 동시에 필요할 수 있으므로 단일 next_action을 덮어쓰지 않는다. 아래 ‘후속 업무’ 계약으로 같은 협업 안에서 각각 담당·기한을 관리한다. 콘텐츠별 작업은 해당 콘텐츠에 한 번만 기록하고 협업 상세에서는 이를 함께 보여준다. 별도 work_items 테이블은 만들지 않는다.

## 3. gtm_contents — 콘텐츠

한 행: 한 계정에 게시할 콘텐츠 한 건. 제작 준비 단계부터 생성하며 게시 뒤에도 같은 행을 사용한다. 계정 미정인 초안은 허용하고 실제 게시 준비를 확정할 때 계정을 정한다. 플랫폼이 둘이면 두 행이다.

| 칼럼 | 의미·입력 |
| --- | --- |
| `title`, `creator_id`, `collaboration_id?` | 제목, 소재 제작자, 제작을 의뢰한 협업. 내부 제작도 허용 |
| `plan_id`, `campaign_id`, `format_id` | 이번 집행, 주제, 대표 표현 방식 |
| `account_id`, `placement`, `distribution_type` | 게시 계정, Reel/뉴스레터 등 위치, organic/paid/mixed 등 실제 배포 |
| `content_group_id` | 같은 제작물의 여러 플랫폼 행을 함께 보여주는 자동 번호. 별도 원장 없음 |
| `brief_ref`, `brief_version`, `asset_refs`, `rights_source` | 이번 브리프의 고정 참조·버전, 대본·파일의 버전 있는 주소, 실제 사용권 근거. brief 본문은 참조에서 읽음 |
| `target_market`, `target_audience`, `language`, `cta`, `destination_url` | 자주 필터링하는 당시 실행 조건 |
| `execution_reason`, `execution_snapshot` | 실행 이유 한 개의 본문, 실제 사용한 가이드·조건·랜딩·지표 정의의 버전과 근거 |
| `production_status`, `publish_status` | 제작/검수 진행과 예정/게시/삭제 등 배포 진행을 구분 |
| `due_at`, `scheduled_at`, `published_at`, `post_url`, `external_post_id` | 실제 약속·게시 식별자와 시각 |
| `tracking_links` | 위치별 고정 ID, 목적지, UTM, 귀속 범위(content/account/plan 등과 대상 ID), 발급 시각을 가진 소수 링크 목록 |
| `action_items` | 이 콘텐츠에 속하는 실제 후속 업무 목록 |
| `previous_content_id?`, `origin_activity_id?` | 무엇을 이어서 시도하며 어느 채택 리뷰에서 시작했는가 |
| `reused_from_content_id?` | 원래 소재·제작 협업을 찾아갈 콘텐츠 |

초안에서는 집행·캠페인·포맷·계정이 미정일 수 있고 가짜 ID를 채우지 않는다. 외부 제작 의뢰를 확정할 때 집행·브리프·허용 조건을, 게시 준비를 확정할 때 계정·캠페인·포맷·추적 방식을 갖춘다. 계약의 필수값은 이 실제 실행 경계에서 검사하며 조사나 아이디어 초안부터 모든 값을 요구하지 않는다.

당시 조건은 실행 확정 시 버전을 고정한다. 실제 실행 후 내용을 바꾸면 변경 시각·전후를 남긴다. 주요 조건을 바꿔 새로 배포하면 새 콘텐츠이며 과거 행을 새 실험으로 재활용하지 않는다. 같은 라이브 게시물에 뒤늦게 바뀐 조건은 혼합 기간임을 표시한다.

performance API는 성과·배분 비용·잠정 CPA·측정 상태를 반환한다. 최신 채택 방향·이유·기준일은 get의 review_adopted 활동을 읽어 같은 대상에 붙인다. 별도의 시도·소재·게시물·링크 원장을 팀원에게 요구하지 않는다.

같은 파일을 가리키는 여러 행은 파일을 복제하지 않는다. 콘텐츠 묶음의 콘텐츠 조건이 다르면 그 차이를 표시하고 한 조건인 것처럼 합치지 않는다. 자사 계정 재사용은 게시 계정과 제작자가 달라도 가능하며 실제 사용권을 확인한다. 재사용 행의 collaboration_id는 이번 게시를 새로 의뢰한 거래가 있을 때만 연결하고, 원 제작 거래는 reused_from_content_id로 찾아간다. 원래 협업의 산출물 이행은 그 거래가 의뢰한 콘텐츠를 기준으로 계산하고 이후의 재사용 게시를 이행 건수에 더하지 않는다.

같은 제작물의 공통 브리프·파일은 동일한 고정 참조를 사용한다. 묶음에서 ‘공통 브리프 수정’을 하면 적용할 미게시 행과 현재 버전을 확인하고 한 변경으로 새 버전을 연결한다. 플랫폼별 CTA·일정은 개별 행의 값이다. 이미 게시한 행의 실제 사용 버전은 유지한다. 검수 기록도 확인한 파일·브리프·게시 문구 버전에 연결하여 수정 전 검수를 수정본의 검수로 재사용하지 않는다.

플랫폼 범위+계정+external_post_id가 같으면 실제 게시물은 하나다. 같은 게시물을 나중에 유료 증폭해도 새 게시 행을 복제하지 않는다. 배포 조건·시작/종료 시각의 변경 활동과 추가 비용을 연결하고 organic/paid/mixed를 표시한다. 유료/자연 성과를 원본에서 나눌 수 없으면 혼합 결과로 보고한다. 별도 광고 집행 최적화·광고 단위 수집은 실제 기능을 추가할 때 범위를 정한다.

## 4. gtm_campaigns / gtm_formats / gtm_outreach_templates — 재사용 기준

| 원장 | 주요 칼럼 | 역할 |
| --- | --- | --- |
| `gtm_campaigns` | `name`, `description`, `audience_brief`, `value_proposition`, `guide_ref`, `guide_version`, `owner_id`, `archived_at` | 주제·대상·전달 가치 |
| `gtm_formats` | `name`, `status`, `default_campaign_id`, `default_outreach_template_id`, `hook`, `shot_sequence`, `required_moment`, `caption_template`, `example_links`, `replicate_rule`, `kill_rule`, `target_creator_profile`, `cold_outreach_angle`, `description`, `guide_ref`, `guide_version`, `owner_id`, `archived_at` | 표현 흐름·제작 방식·참고 예시·반복/중단 기준과 기본 연락 각도 |
| `gtm_outreach_templates` | `name`, `status`, `campaign_id`, `channel`, `language`, `target_creator_profile`, `subject_template`, `opening_template`, `value_proposition`, `ask`, `offer_structure`, `follow_up_template`, `link_refs`, `usage_notes`, `template_version`, `owner_id`, `archived_at` | 재사용할 첫 연락의 메시지·요청·조건·후속 문구 |

가이드 본문은 버전 있는 Markdown/문서다. DB의 이름·짧은 설명과 가이드 본문은 역할이 다르며 같은 본문을 양쪽에서 독립 편집하지 않는다. 포맷은 영상·글·뉴스레터를 수용하므로 고정 Shot 1~4 칼럼 대신 순서 있는 `shot_sequence`를 쓴다. Format Bank는 연결 콘텐츠 수·게시 수·마지막 게시일을 계산해 보여준다. Outreach Templates는 원문을 복사하는 출발점이며 상대의 실제 콘텐츠 근거로 개인화한다. 정확한 초안·발송·수신 원문은 activities에 남기고 `outreach_template_id`로 사용한 기준을 연결한다. 템플릿 화면은 초안·발송·회신 스레드와 응답률을 계산해 보여주되 이를 메시지 품질의 자동 판정으로 쓰지 않는다.

## 5. gtm_plans — 집행 계획

한 행: 목표·예산·기간을 정해 추진하는 집행 계획. 구체적인 계획안부터 저장할 수 있지만 사업 아이디어마다 행을 만들 필요는 없다. 초안/채택/진행 상태를 구분하며 계획 저장이 지출 허용을 뜻하지 않는다.

| 칼럼 | 의미·입력 |
| --- | --- |
| `name`, `brief`, `target_market`, `target_audience` | 이번 목적·대상 |
| `goal_metric`, `metric_version`, `goal_value?` | 무엇을 얼마나 달성하려는지. 탐색이면 수치 목표 생략 가능 |
| `currency`, `cash_budget`, `contingency`, `labor_budget_minutes?` | 현금 상한·예비비·선택적 팀 시간 한도 |
| `start_at`, `end_at`, `timezone`, `owner_id`, `status` | 기간·책임·실제 진행 |
| `plan_document_ref`, `plan_version` | 현재 계획안의 후보·조건·예측·가정 버전. 채택 사실·당시 버전은 활동에 별도 보존 |
| `action_items` | 집행 전체의 실제 후속 업무. 하위 협업/콘텐츠 업무는 복사하지 않음 |

비용·예산·성과는 같은 상세에서 집계한다. 월별 계획과 캠페인을 혼동하지 않는다. 계획 하나에 여러 캠페인·포맷이 들어갈 수 있다.

## 후속 업무와 시작 시 필요한 정보

gtm_collaborations/gtm_contents/plans의 action_items는 부모 한 건의 현재 업무를 담는 작은 목록이다. 항목은 불변 id, 할 일, 담당자, 기한, open/done/cancelled, 완료 시각·근거를 가진다. 이는 실제 약속/처리할 일이며 Agent의 중간 생각 목록이 아니다. 항목 ID와 부모 버전으로 수정하고 완료 기록은 activities에 남겨 배열이 끝없이 커지지 않게 한다. 대표 next_action은 미완료 항목에서 선택한 조회값이고, 오늘 할 일은 세 원장의 미완료 항목을 모은 보기다. 닫힌 협업의 미지급 같은 업무도 남아 있으면 포함한다.

조사만 할 때는 집행·협업·콘텐츠를 억지로 만들지 않는다. 시작 조회에는 요청과 관련된 집행 후보, 진행 중 연락, 자료 기준일, 남은 한도, 실제 다음 업무와 상세 참조를 짧게 제공한다. 집행이 여럿이면 가장 최근 것을 임의로 선택하지 않는다. 초안은 미정 조건을 표시하며 진행하고, 외부 약속 전에 필요한 집행·권한만 확인한다.

## 6. 자동으로 붙는 네 보조 기록

아래는 반복 사실을 보존하기 위한 내부 저장이다. 각각의 독립 편집 메뉴를 만들지 않는다. 기존 공통 저장 구조가 같은 계약을 충족하면 재사용한다.

| 기록 | 필요한 독립 사실·주요 칼럼 | 기본 조회에 붙일 결과 |
| --- | --- | --- |
| `gtm_accounts` | 계정 ID, `creator_id?`, 소유 주체, 플랫폼, provider 범위·external ID, handle·URL, 최근 게시 시각, 관객 요약·원본 근거/기간, 확인일·출처 | 크리에이터의 계정 카드, 콘텐츠 게시 계정 |
| `gtm_activities` | 관련 원장 ID, 실제 기록 종류, 본문/제한 파일 주소, 발생·기록 시각, 작성자, 출처·외부 ID, 대화 thread, 사용한 outreach template, 정정/이전 기록 참조 | 대화·견적·채택 리뷰 등 타임라인 |
| `gtm_metric_snapshots` | 계정 또는 콘텐츠 ID, 지표·값·단위, 관측 기간, 원본 시각·수집 시각, 출처·정의, 누적/기간 구분, 결측 이유·보존 기한 | 최신 규모, 관측 창별 성과·기준일 |
| `gtm_costs` | 집행/협업, 종류·설명, 통화, 예상·약정·발생액, 시간·단가·측정 근거, 지급 내역, 배분 내역, 증빙 | 협업·집행 비용, 콘텐츠 원가 |

activities에는 메시지 전송 결과·provider thread/message ID 같은 실제 통신 metadata가 붙을 수 있다. 종류별 작은 구조 계약을 쓰되 중간 추론·intent·confidence·상황별 계획을 적재하지 않는다. 현재 업무 원장은 자체 칼럼으로 유지하며 activities를 매번 재생해야만 현재 상태를 아는 구조로 만들지 않는다.

활동에는 불변 id/ref, 관련 원장 참조, 발생·기록 시각과 작성자를 둔다. 메시지 초안은 draft로 구분하고 실제 발송 결과는 그 초안 버전·원문 hash·provider ID를 참조한다. 대화 식별자는 사용 연결+provider thread ID 범위로 관리하며 같은 스레드의 새 협업도 조회할 수 있게 한다. 자동 동기화가 수동 기록과 같은 외부 메시지 ID를 발견하면 실제 메시지를 중복 적재하지 않고 출처를 보완한다. 일치가 불확실하면 내용을 보고 확인하며 추측으로 병합하지 않는다.

별도 집행 없는 조사도 완료/부분 결과 활동 한 건으로 찾을 수 있다. 조사 목적·기준, 검색 출처/범위·진행 위치, 확보한 creator IDs, 제외·미확인 요약, 자료 기준일, 실제 비용·시간 참조와 결과 파일 버전을 남긴다. ‘같은 기준으로 더’는 이 ref로 이어간다. 후보마다 임시 점수/생각을 새 사실로 저장하지 않는다. 생성한 최종 조사 결과라는 독립 기록만 보존한다.

채택 리뷰는 activities에 기록한다. 대상/범위, 당시 결과·비용·조건·cutoff를 고정한 증거, `direction`, 이유 한 개의 본문, 채택자·시각을 담는다. 임시 추천과 실제 채택을 구분한다. 최신 방향은 get의 최근 활동 또는 list gtm_activities의 해당 대상 필터로 읽어 표시한다. 독립 물리 칼럼으로 복제하지 않는다. 다음 행동 변경과 리뷰 연결은 같은 변경으로 처리한다. 여러 원장에 걸친 결론은 집행에 두고 대상 콘텐츠 ID와 필터·범위를 기록한다. 서로 다른 범위의 결론은 덮어쓰지 않는다.

costs의 선금·잔금·환불은 해당 비용 한 건에 붙는 작은 지급 내역 배열로 시작한다. 각 항목에 고정 ID·실제 시각·외부 ID·금액·증빙을 둔다. 배분도 대상과 비중·기준·버전을 가진 작은 목록이다. 약정액+송금액을 합산하지 않는다. 같은 비용의 배분 합은 100%, 한 항목의 배분 대상은 하나이며 공통 함수에서 원자적으로 검증한다. 원통화·기준 통화·환율 근거를 보존한다. 복잡한 결제 대사 수요가 생기면 기존 재무 원장으로 옮기고 업무 화면은 유지한다.

비용의 집행별 귀속은 배분 내역으로 한 번만 계산한다. 비용의 소속 협업과 콘텐츠의 집행을 모두 따라가 같은 금액을 두 번 더하지 않는다. 여러 집행에 걸친 공통 비용은 직접 소속을 비워 두고 집행별 배분을 기록한다. 미배분 비용은 별도로 보여주며 집계에서 조용히 제외하지 않는다.

한 비용 안에서도 여러 보너스·수수료를 설명하기 어려우면 별도 비용 항목으로 나누되 지급액을 새 비용으로 세지 않는다. 환불은 지급 내역, 약정 취소/감액은 근거가 있는 현재 약정·발생액 정정으로 각각 남긴다. 배열의 지급 ID도 provider+연결 범위에서 중복 검증하고 동시에 입력되는 같은 외부 지급은 한 번만 반영한다.

## 7. 통합해도 사라지면 안 되는 계약

- accounts의 provider 범위+external ID는 unique. 연락처의 작은 목록과 계정·성과의 반복 이력을 같은 것으로 취급하지 않는다.
- tracking_links의 ID는 서버가 전체에서 충돌 없이 발급한다. 발급 후 ID·목적지·캠페인 mapping은 불변이다. 원장을 삭제/수정해 과거 귀속을 옮기지 않는다. 링크 변경은 새 항목을 추가한다. 여러 게시가 같은 프로필 링크를 공유하면 특정 게시 성과라고 단정하지 않는다.
- 발급/실행 후 캠페인·포맷·타깃을 정정할 때 기존 링크와 당시 실행 버전을 덮어쓰지 않는다. 정정 이력과 집계 버전을 남기고, 실제 다른 조건의 새 배포는 새 콘텐츠로 만든다.
- 소수 연락처·링크·현재 후속 업무·지급/배분처럼 부모 한 건에 속한 작은 목록만 구조 있는 JSON을 쓴다. 메시지·시계열을 끝없이 큰 배열로 누적하지 않는다. 서버의 항목 ID·중복·부모 버전 잠금 검사가 필요하며 클라이언트가 배열 전체를 임의 덮어쓰지 않는다. 다른 부모에도 동일 외부 ID가 들어갈 수 있는 지급/전송은 해당 provider 식별자 범위의 동시성 검사도 한다.
- 고정 문서·파일 버전은 제한 저장소에 두고 해당 행/활동이 주소·hash·시각을 가진다. 별도 artifacts 업무 원장은 만들지 않는다.
- 현재값의 정정 전후와 주체는 기존 변경 이력에 보존한다. 기존 이력이 없으면 최소 공통 이력을 구현해야 하며, 단순 updated_at만으로 이전 조건을 복원할 수 있다고 주장하지 않는다.
- 계정·연락처·견적·성과의 기준일은 각각 다르다. 한 행의 수정일을 전체 정보의 최신성으로 쓰지 않는다.
- 외부 자료의 `source_ref`, `as_of` 또는 원본 기간, `collected_at`, `valid_until?`/보존 기한을 해당 근거·관측에 연결한다. 갱신 시도·성공·다음 예정·실패는 실행 기록에서 읽으며 업무 원장마다 복제하지 않는다. 갱신 우선순위와 초기 주기는 operations.md를 따른다.

## 8. 실행 기반은 별도 업무 개념이 아니다

발송 중복 방지, 주소 단위 연락 중단, 허용된 발송/지출 범위, 작업 재시도, 변경 이력은 필요하다. 기존 공통 기반의 실제 유무를 구현 전에 확인한다. 없다면 이를 위한 최소 내부 저장은 추가하되 팀원이 쓰는 원장을 늘리지는 않는다. creator의 연락 중단 플래그만으로 새로 발견된 동일 주소까지 차단할 수 있다고 보지 않는다.

제품 가입·완료와 사용자 연결은 제품 영역이 소유한다. 마케팅은 제한된 집계/가명 결과를 읽는다. 방문 시각·로그인 연결 등 기존 계측이 부족하면 제품의 공통 계측을 보완하고 마케팅 전용 사용자 복제 테이블을 만들지 않는다.

## 9. 원장 통합 결정

| 이전 제안 | 이번 결정 |
| --- | --- |
| channel_accounts / contact_points | 계정만 내부 gtm_accounts 유지, 소수 연락 경로는 gtm_creators 안 |
| engagements / attempts / content_items / publications / tracking_links | gtm_collaborations + contents로 통합 |
| threads / messages | 실제 통신 metadata와 원문을 activities에서 묶어서 제공 |
| cost_items / settlements / cost_allocations | costs와 그 안의 작은 지급·배분 내역 |
| observations | 내부 gtm_metric_snapshots |
| artifacts / work_items | 문서 주소·버전과 활동 이력 / 부모 원장의 작은 실제 후속 업무 목록 |
| approvals / job_runs / audit_events / contact_suppressions | 기존 실행 기반 확인 후 필요한 내부 기능만 구현 |

향후 분리는 별도 검색·동시 갱신·관계 제약의 실제 필요를 근거로 결정한다. 내부 분리가 필요해져도 기본 업무 원장과 탐색 경로를 유지한다.

## 실제 물리 칼럼 목록

공통: id(UUID), ref(원장별 짧은 번호), created_at/updated_at, created_by/updated_by, row_version, archived_at. 내부 접근 테이블은 별도 계약이다. 계산 칼럼은 편집 대상이 아니다.

- **gtm_creators**: `id`, `ref`, `name`, `description`, `country`, `activity_regions`, `languages`, `content_topics`, `outreach_score`, `contacts`, `owner_id`, `notes`, `do_not_contact`, `contact_restriction_source`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_campaigns**: `id`, `ref`, `name`, `description`, `audience_brief`, `value_proposition`, `guide_ref`, `guide_version`, `owner_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_formats**: `id`, `ref`, `name`, `status`, `default_campaign_id`, `default_outreach_template_id`, `hook`, `shot_sequence`, `required_moment`, `caption_template`, `example_links`, `replicate_rule`, `kill_rule`, `target_creator_profile`, `cold_outreach_angle`, `description`, `guide_ref`, `guide_version`, `examples`, `owner_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_outreach_templates**: `id`, `ref`, `name`, `status`, `campaign_id`, `channel`, `language`, `target_creator_profile`, `subject_template`, `opening_template`, `value_proposition`, `ask`, `offer_structure`, `follow_up_template`, `link_refs`, `usage_notes`, `template_version`, `owner_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_plans**: `id`, `ref`, `name`, `brief`, `target_market`, `target_audience`, `goal_metric`, `metric_version`, `goal_value`, `currency`, `cash_budget`, `contingency`, `labor_budget_minutes`, `start_at`, `end_at`, `timezone`, `owner_id`, `status`, `plan_document_ref`, `plan_version`, `action_items`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_accounts**: `id`, `ref`, `creator_id`, `owner_kind`, `platform`, `provider_scope`, `external_id`, `handle`, `profile_url`, `last_post_at`, `audience_summary`, `audience_evidence`, `source_ref`, `as_of`, `collected_at`, `valid_until`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_collaborations**: `id`, `ref`, `creator_id`, `plan_id`, `title`, `status`, `owner_id`, `contact_ref`, `terms`, `terms_version`, `agreed_at`, `due_at`, `closed_at`, `close_reason`, `action_items`, `previous_collaboration_id`, `origin_activity_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_contents**: `id`, `ref`, `title`, `creator_id`, `collaboration_id`, `plan_id`, `campaign_id`, `format_id`, `account_id`, `placement`, `distribution_type`, `content_group_id`, `brief_ref`, `brief_version`, `asset_refs`, `rights_source`, `target_market`, `target_audience`, `language`, `cta`, `destination_url`, `execution_reason`, `execution_snapshot`, `production_status`, `publish_status`, `due_at`, `scheduled_at`, `published_at`, `post_url`, `external_post_id`, `tracking_links`, `action_items`, `previous_content_id`, `origin_activity_id`, `reused_from_content_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_activities**: `id`, `ref`, `entity`, `entity_id`, `kind`, `body`, `payload`, `occurred_at`, `source_ref`, `provider`, `connection_ref`, `external_id`, `thread_id`, `outreach_template_id`, `correction_of_id`, `request_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_metric_snapshots**: `id`, `ref`, `account_id`, `content_id`, `metric`, `value`, `unit`, `period_start`, `period_end`, `as_of`, `collected_at`, `source_ref`, `definition_version`, `value_kind`, `missing_reason`, `retention_until`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_costs**: `id`, `ref`, `plan_id`, `collaboration_id`, `kind`, `description`, `currency`, `base_currency`, `fx_rate`, `fx_source`, `expected_amount`, `agreed_amount`, `incurred_amount`, `labor_minutes`, `hourly_rate`, `measurement_basis`, `due_at`, `incurred_at`, `source_ref`, `payments`, `allocations`, `created_at`, `updated_at`, `created_by`, `updated_by`, `row_version`, `archived_at`.
- **gtm_access_tokens**: `id`, `name`, `token_hash`, `can_write`, `created_at`, `expires_at`, `revoked_at`, `last_used_at`.


## 현재 조회 계약의 경계

list는 원장 행과 페이지네이션을 반환한다. `gtm_creators`는 `gtm_creator_overview`, plans는 비용 요약 뷰, formats는 `gtm_format_overview`, outreach templates는 `gtm_outreach_template_overview`를 사용한다. 크리에이터 기본 조회에는 플랫폼 계정, 팔로워, 최근 365일 게시물 수, 최근 게시, 연락 상태, 열린 협업/후속 업무, 최신 채택 방향, 자료 최신성이 포함된다. Format Bank와 Outreach Templates 기본 조회에는 편집 원본과 실제 사용 결과가 함께 포함된다. get은 이 기본 행과 계정별 원본·관련 활동을 붙이고 과거 이력이 더 필요하면 activities를 대상 필터로 추가 조회한다. performance는 제품 전체·일별·콘텐츠·공용 귀속을 반환한다. 기본 목록이 모든 원문과 시계열을 무제한 조인한다고 가정하지 않는다.

Sheets의 세 크리에이터 화면은 새 물리 테이블이 아니다. `gtm_creator_directory_sheet_v1`은 전체 크리에이터와 대표 계정·연락·현재 진행을 합치고, `gtm_connected_creator_sheet_v1`은 실제 관계가 시작된 크리에이터에 협업·콘텐츠·비용 이력을 더하며, `gtm_outreach_sheet_v1`은 `message_%` 활동을 크리에이터·협업·집행·사용 템플릿과 연결한다. 제한 토큰을 검사하는 `gtm_sheet_view`가 이 읽기 View만 페이지 단위로 반환한다. Format Bank와 Outreach Templates는 각각 계산값이 붙은 기본 API 조회를 쓰며 편집 원본은 `gtm_formats`와 `gtm_outreach_templates`다. 모든 원본 변경은 기존 `gtm_api`와 행 버전 계약을 그대로 사용한다.

계정 수치의 표준 기록은 `metric='followers'`(누적, unit=`people`)와 `metric='published_content_count'`(기간, unit=`posts`, 정확한 365일 period_start/period_end)다. 값·단위·기간·as_of·collected_at·source_ref·definition_version을 함께 기록한다. 기본 조회의 `total_followers`와 `content_count_365d`는 플랫폼 계정 합계라 고유 사람 수나 고유 제작물 수가 아니다.

activities의 system.mutation은 실제 변경의 before/result와 요청 해시를 보존하는 서버 감사 기록이다. 임시 모델 판단이 아니다. 일반 호출은 해당 kind/request_id를 위조할 수 없다. 모든 API 쓰기는 행 버전·허용 칼럼·관련 ID·약정 예산·지급 중복을 검사한다. 실제 외부 발송 중복을 막는 실행기는 아직 연결하지 않았다.
