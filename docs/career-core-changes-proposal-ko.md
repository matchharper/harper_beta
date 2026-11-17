# Harper Career 구체 구현 계약

2026-11-13. 현재 요청의 비공개 경험 재사용, 회사·작업 기록, 공고 밖 기회, 선택적인 준비와 실행, 우선순위·묶음 화면, 추천 근거, 탐색 방향을 구현하는 설계다. 이름과 필드는 제안하는 변경이며 아직 migration·제품 코드·배포를 실행하지 않았다.

이 문서는 이전의 다섯 가지 방향 설명을 구체적인 구현 계약으로 교체한다. [제품 목적](career-value-and-agent-direction-ko.md), [조사 근거](career-redesign-evidence-ko.md), [앞선 검토 기록](career-redesign-work-plan-ko.md)은 유지한다. 기존 다른 작업의 미커밋 코드는 수정하지 않는다.

## 1. 구현 결론

**새 테이블은 네 개다. 검색 집합과 그 항목, 공고 없는 사용자별 기회, 저장된 화면이다.** 개인 경험·작업 메모는 기존 talent_documents, 사용자 사실·조건은 talent_contexts, 회사는 company_db, 실제 수행은 talent_external_operations, 제안·사용자 요청은 career_action_items를 확장한다. 새 todo 실행 엔진·전략 테이블·직군별 경험 테이블은 만들지 않는다.

| 사용자 요구 | 저장 원본 | agent가 사용하는 경로 | 사용자가 보는 것 |
| --- | --- | --- | --- |
| 비공개 경험 축적·재사용 | talent_documents + 기존 source_refs, 관련 사용자 사실은 talent_contexts | 문서 전체 검색·부분 읽기·일반 Markdown 수정 + Gmail 검색 | 필요한 경우 경험 확인/보완 요청, 그 경험을 쓴 지원 자료 |
| 회사 정보·조사 결과 | company_db + company_snapshot + 기존 원문 cache | 회사 조회/갱신, 대상별 조사, 공개 조사 기록 읽기 | 실제 선택에 중요한 회사 사실과 근거 |
| 개인별 중요한 작업 기록 | 비공개 talent_documents, 기존 work 결과 | 같은 문서 도구로 자유롭게 작성·갱신·검색 | 필요한 경우 현재 접근·진행 설명 |
| 공고 없는 기회 | 신규 talent_career_opportunities. 기존 Role 추천은 기존 테이블 | 기존 기회 도구의 일반 대상 지원 | 회사·사람·제안을 공고 없이 추천·저장·후속 의뢰 |
| 선택적인 todo와 백그라운드 작업 | career_action_items + talent_external_operations + 기존 예약/폼 | 기존 도구에 기회 참조를 연결 | 제안된 일, Harper가 맡은 일, 사용자 입력이 필요한 일 |
| 우선순위·묶음·대량 목록 | 신규 career_views + career_result_sets/items | 화면 관리, 집합 읽기·선택 | 먼저 볼 것, 함께 검토할 묶음, 탐색 목록 |
| 추천 이유·현재 탐색 기준 | 기회의 개인별 설명 + 기존 Brief/비공개 작업 문서 | 기회 수정·문서 수정·화면 구성 | 조사 근거가 있는 상세, 수정 가능한 현재 탐색 설명 |

가입·온보딩 전환 등 앞선 다른 제안은 이 구현 묶음의 선행 조건으로 삼지 않는다. 현재 Career 실행에서 위 경험을 먼저 연결한다.

## 2. 테이블: 무엇을 추가하고 무엇을 재사용하는가

### 2.1 새 테이블 네 개

집합·기회·view는 UUID 식별자, 소유 사용자, 생성·수정 시각을 두고 수정 가능한 사용자 데이터에는 revision을 둔다. 집합 항목의 소유권은 부모 집합을 통해 확인한다. 아래는 제품상 필요한 필드이며 SQL 전문은 아니다.

| 신규 테이블 | 주요 필드 | 실제 reader와 필요한 이유 |
| --- | --- | --- |
| career_result_sets | id, talent_id, title, source_manifest JSONB, operation_ref, revision, archived_at | 검색·조사·평가·UI가 같은 집합을 참조. 어떤 검색/선택의 결과인지와 범위를 유지 |
| career_result_items | set_id, member_key, resource_ref JSONB, observed_data JSONB, source_refs JSONB, ordinal | 집합의 서버 페이지 조회·선택·차집합. 검색 cursor가 사라져도 당시 항목을 읽을 수 있음 |
| talent_career_opportunities | id, talent_id, subject_refs JSONB, title, content TEXT, evidence_refs JSONB, priority INTEGER, feedback TEXT, feedback_at, archived_at, revision | 공고 없는 개인별 추천 이유·관심과 후속 작업의 대상. 기회 reader와 상세/작업 화면이 사용 |
| career_views | id, talent_id, title, definition JSONB, revision, archived_at | 저장한 묶음·우선순위·원본 연결·선택 인터페이스를 새 방문에서도 동일하게 표시 |

career_result_items의 유일성은 집합 안의 member_key로 둔다. 모델이 쓰는 추천 점수나 회사 이름을 식별자로 사용하지 않는다. resource_ref는 기존 회사 ID·사람 ID·Role/추천 ID 또는 읽을 수 있는 외부 URL을 가리킨다. 아직 내부 원본이 없는 대상도 포함할 수 있다.

source_manifest는 검색 조건·검색 실행 ref·확보 범위 등 실제 결과의 원본이다. 자유로운 내부 사고 과정을 저장하는 필드가 아니다. observed_data는 외부 검색에서 실제 받은 표시·조회용 사실이며, 이미 내부 원본이 있는 사실은 원본 참조를 우선한다.

**검색 결과의 모든 행을 talent_career_opportunities로 만들지 않는다.** 넓게 보는 500개는 집합이고, agent가 개인별 기회로 제안하거나 사용자가 저장·진행할 대상은 기회 관계다. 추천이라는 의미가 없는 단순 자료는 원래 문서/콘텐츠 원본에 둔다.

기존 Role 추천은 talent_opportunity_recommendation 및 memberships를 유지한다. role_id를 nullable로 바꾸거나 새 테이블에 복제하지 않는다. 일반 기회 도구와 UI resolver가 기존 추천 ref와 신규 일반 기회 ref를 함께 처리한다. 이 분기는 저장·실행 원본을 찾는 adapter이며, 어떤 회사가 좋은지 판단하는 분기가 아니다.

### 2.2 기존 테이블 변경

| 기존 원본 | 변경 | 추가하지 않는 것 |
| --- | --- | --- |
| talent_documents | about_refs JSONB 추가. 제목·description·본문 검색 인덱스. 기존 structured_content의 source_refs 계약에 Gmail·조사 관측본·work 등의 참조 지원 | FDE 경험 전용 테이블, 공개 Profile로의 자동 복사 |
| talent_contexts | 기존 read/write·Brief·Memory·importance 재사용. 관련 문서 참조를 기존 source_refs로 읽을 수 있게 연결 | agent의 잠정적 계획을 사용자 사실로 저장 |
| company_db | research_context JSONB 추가: 자유 본문, 공개 source_refs, revision, updated_at. 회사 기본 필드와 함께 일반 조회·갱신 가능 | 회사마다 필수 질문 checklist나 고정 평가표 |
| company_snapshot | 공개 조사 결과의 원본 보존에 재사용. content의 record_type으로 신규 근거 기록을 구분하고 reader를 명시적으로 분리 | 현재 고정 보고서 생성·7일 cache·전체 모델 호출 흐름을 그대로 강제 |
| company_roles | 공개 탐색에서 확보한 공고의 공통 원본으로 재사용. 공개 수집 근거·관측 시점·원문 version을 보존하고 검색 인덱스에 반영 | 사용자별 추천 이유·경험·관심을 공통 공고 본문에 저장 |
| career_action_items | subject_ref JSONB와 resource_refs JSONB 추가. 기회별 조회와 홈 highlight 조회를 분리 | 실행 완료 상태를 별도로 추측·복제하는 todo 상태 머신 |
| talent_external_operations | subject_ref JSONB 추가. user_id + subject_ref 조회 인덱스. 기존 conversation_id는 발생 대화로 보존 | 기회별 새 실행 엔진·중복 발송 기록 |
| 기존 schedules/forms | 관련 기회 ref를 기존 metadata/참조 계약으로 전달·조회 | 대상마다 전용 일정·승인 테이블 |

개인 경험과 작업 메모는 type=markdown, kind=document, is_public=false인 기존 문서다. title·description·본문의 구성은 agent가 정한다. about_refs는 관련 회사·기회·검색 집합·work를 찾기 위한 연결이며, 모든 문서에 필수인 분류가 아니다.

source_refs에는 원문을 다시 읽을 수 있는 식별자와 필요한 revision/관측본을 넣는다. 메일 근거는 계정 소유권을 확인한 thread/message ref로 연결한다. 검색 범위·모르는 부분·다시 조사할 조건은 필요할 때 문서 본문에 남긴다. 모든 메모가 같은 필드를 채우게 하지 않는다.

company_db.research_context는 현재 공개 근거를 다시 읽기 위한 자유로운 메모다. 실제 조사 결과는 company_snapshot과 원문 ref에 남긴다. 공유 기록 작성 경로에는 공개 정보만 접근 가능한 조사 context를 제공한다. 개인 목표·Gmail·개인별 추천 판단은 비공개 문서에 남긴다. 개인 context에서 만든 임의 텍스트를 공개 기록으로 자동 승격하지 않는다.

기존 company_snapshot reader는 자신의 기존 record_type/schema만 조회하게 수정한다. 이 조건은 LIMIT 이전에 적용한다. 최신 행을 먼저 자르고 나중에 schema를 검사하면 신규 근거 행 때문에 기존 보고서 cache를 찾지 못하기 때문이다. 신규 근거 기록은 일반 reader가 읽는다. 전체 회사 보고서를 재작성하는 기존 함수를 호출해야 새 근거를 읽을 수 있게 만들지 않는다.

### 2.3 참조와 실행 상태

공통 ResourceRef resolver를 추가해 타입별 기존 reader에 연결한다. 필요한 최소 형태는 type, id 또는 URL, 선택적 revision이다. tool이 반환한 정확한 ref를 재사용한다. 서버가 지원하지 않는 table 이름이나 임의 SQL을 ref로 받지 않는다.

UI는 표시 내용과 실제 실행 상태를 분리한다. 일반 기회에 '지원 완료'를 자유 텍스트로 쓰더라도 제출 완료로 처리되지 않는다. 실제 발송·제출·대기·실패는 기존 execution receipt, 사용자 직접 수행은 그 사용자 보고 원본에서 읽는다.

### 2.4 A를 돕다가 확보한 정보를 B도 사용하게 하는 경로

**공개 사실의 공통 원본과 사용자별 집합·추천을 분리한다.** A의 result_set이나 개인 문서를 B에게 읽히는 방식으로 재사용하지 않는다. 공개 원본을 공통 검색에서 발견할 수 있어야 다른 검색어와 목적을 가진 B도 이득을 얻는다. 같은 URL이나 검색어를 다시 입력했을 때 cache가 적중하는 것만으로 완료하지 않는다.

회사 조사 결과는 같은 company_db ID 아래 공개 근거와 확인 시점을 저장한다. research_resources는 이를 다시 읽어 답할 수 있고, search_resources는 조사에서 새로 확인한 공개 사실도 검색할 수 있게 company_db의 공개 조사 본문을 검색 인덱스에 포함한다. B가 그 회사를 미리 지목하지 않아도 해당 사실을 통해 발견할 수 있어야 한다. B에게 필요한 추가 질문이나 시점 확인만 새로 수집하고, A에게 맞는다는 개인별 결론은 가져오지 않는다.

공개 공고는 company_roles의 공통 원본에 등록하고, A의 결과 집합·추천은 그 role ID를 참조한다. 원문을 확보해 공고로 식별한 공개 대상은 수집 경로에서 공통 등록·인덱스 갱신까지 수행한다. agent가 일반 웹 도구로 별도 발견한 경우에도 기존 save_job_posting의 index mode로 같은 등록 경로를 호출할 수 있게 한다. 단순 검색 snippet만으로 확인되지 않은 채용 자리나 조건을 채우지 않는다.

현재 save_job_posting은 사용자에게 저장/추천하는 동작과 원본 import가 결합돼 있고, user_submitted 공고는 roleSql.ts·indexedTitleSearch.ts·roleTitleSearchSql.ts 등에서 공통 검색 대상에서 제외된다. 따라서 현재 구현이나 앞선 집합 설계만으로 B의 재사용이 완성됐다고 말할 수 없다. 다음과 같이 변경한다.

1. 기존 import의 공고 식별·공통 원본 upsert를 개인별 추천 생성에서 분리한다. 공식 공고 URL 또는 제공자 공고 ID 같은 원본 식별자를 사용하며 제목·회사명만 같다고 병합하지 않는다. 동일 공고를 동시에 수집해도 공통 식별자를 기준으로 같은 원본을 반환한다.
2. 공개 페이지를 독립적으로 읽어 확보한 공고는 공개 수집 근거를 갖는 source로 등록한다. 예를 들어 source_provider=career_public_discovery로 provenance를 보존한다. 기존 user_submitted의 비공개 접근을 일괄 해제하지 않는다. 과거 개인 공고의 공개 원문이 확인되면 공개 원본을 별도로 식별·재사용하고 개인 이력은 기존 관계에 보존한다.
3. 공개 수집 결과가 공통 공고 검색·직함 인덱스·회사별 공고 reader에서 실제 조회되도록 연결한다. 현재 회사 설정·만료·접근·test-only 경계는 유지한다. 회사 연결이나 인덱싱이 미완료면 공통 검색에 반영됐다고 반환하지 않는다.
4. B는 자신의 기준으로 공유 공고 인덱스에서 이 원본을 찾는다. 외부 웹에서 같은 공고를 재발견·추출할 필요가 없고, 기존 회사 조사와 공고 사실도 재사용한다. B의 적합성 판단과 추천 설명은 B의 맥락으로 작성한다. 이미 확보한 정보가 부족하거나 오래된 부분은 새로 확인할 수 있다.

A에게 추천하지 않거나 A가 거절한 공개 공고도 공통 원본에는 남는다. A의 개인적 판단이 다른 사용자에게의 검색 자격이 되지 않는다. 반대로 실제 종료·철회 등 공고 자체의 변화는 공통 원본에 반영한다. 공통 원본 등록은 B에게 자동 추천·알림을 보내는 행동이 아니며, B의 현재 요청이나 기존 정기 실행에서 활용한다.

새 공유 테이블은 추가하지 않는다. company_db/company_snapshot/company_roles와 기존 원문 cache·검색 인덱스의 write→index→read 연결을 완성하는 변경이다. 사용자별 result_sets·opportunities·views에는 공통 원본 ref와 각 사용자에게 필요한 내용만 남긴다.

## 3. Tools: 무엇을 수정·추가하는가

표의 신규 이름은 구현할 도구 이름이다. 업무 사례별 도구는 추가하지 않는다.

| 도구 | 변경 | 핵심 입력과 결과 |
| --- | --- | --- |
| list_documents | 확장 | query, about_refs, cursor. 관련 문서의 id·설명·revision·출처 범위를 반환 |
| read_document | 재사용·출처 확장 | document_id와 query/offset. 필요한 본문과 근거 참조를 읽음 |
| upsert_document | 확장 | 기존 Markdown/부분 수정/expected_revision에 about_refs와 확장 source_refs 지원 |
| search_resources | 신규 | 자연어 query, 사용할 정보원, 실제 필터. 회사·허용된 공개 사람 정보·외부 결과를 set_ref로 반환 |
| search_opportunities | 확장 | 평가 없는 retrieve action 추가. 기존 search의 검색+평가는 유지. 둘 다 결과 집합 ref를 제공 |
| save_job_posting | 확장 | index mode는 공개 공고 원본 등록과 검색 반영만 수행. 기존 save/suggest는 원본을 재사용해 해당 사용자의 저장/추천을 추가 |
| manage_result_sets | 신규 | read/select/union/difference. set_ref와 서버 selector를 받아 페이지 또는 새 set_ref 반환 |
| research_resources | 신규 | refs 또는 set_ref, 알아낼 질문. 기존 work 실행에 연결해 조사 receipt와 부분/완료 결과 반환 |
| manage_companies | 신규 | 원본 읽기·새 공개 회사 등록·사실/공개 메모 갱신. company ref와 revision 반환 |
| read_recommended_opportunities / upsert_opportunities | 확장 | 기존 Role 추천과 일반 기회 모두 read/upsert/feedback/priority/archive. 기존 Role의 권한·연결 계약 보존 |
| manage_action_items | 확장 | subject_ref·resource_refs로 기회별 제안과 사용자 입력 항목 관리 |
| manage_work / 기존 schedule 도구 | 확장 | 일반 subject_ref와 원본 사용자 지시로 실행·재개·수정·취소. 동일 사용자 소유의 관련 작업을 다른 대화에서도 조회 |
| follow_company | 확장 | 기존 회사명/workspace 입력에 company_db ref를 연결. 기존 follow의 instruction과 예약 실행을 재사용 |
| manage_views | 신규 | read/upsert/archive. 결과 집합·기회 ref, 블록 구성·표시 순서·제외 항목을 저장하고 view URL 반환 |

search_resources의 첫 내부 adapter는 company_db와 공개 가능한 사람 필드다. candid에 값이 있다고 모두 공개 가능한 것으로 취급하지 않는다. 공개 범위가 확인되지 않은 필드는 사용하지 않고 공개 웹 경로를 이용한다. 기존 정확한 회사 이름 조회도 내부 adapter로 재사용한다.

research_resources는 새로운 커리어 판단 agent가 아니다. 여러 대상의 질문별 수집·기존 근거 확인·부분 결과 저장·외부 조사 제공자 실행을 맡는다. 기존 작업 실행과 웹 도구를 사용하며, 개인별 선택과 추천 이유는 원본 Career LLM이 작성한다.

집합 selector는 실제 필드 필터·명시 선택·기존 평가 결과의 선택을 처리한다. '좋은 회사만' 같은 정성적 결정을 SQL 키워드 규칙으로 바꾸지 않는다. 필요하면 원본 agent가 기존 평가 계산에 자신이 정한 질문과 근거를 전달하고 그 결과를 읽는다. 평가 자체는 필수가 아니다.

도구 결과는 필요한 사실·정확한 ref·revision·cursor·실패/미처리 범위를 읽기 쉬운 text projection으로 반환한다. 서버/UI는 구조화 원본을 사용하고 모델 답변을 다시 파싱하지 않는다.

### 3.1 검색·조사가 실제로 수행하는 일

search_resources는 자연어 하나를 받아 숨은 LLM이 다시 전략을 세우는 도구로 만들지 않는다. 원본 agent가 검색어와 정보원, 이용 가능한 사실 조건을 고른다. 회사 adapter는 company_workspace의 이름 조회만 재사용하는 데서 끝내지 않고 company_db 전체의 이름·설명·specialities·위치 등 검색 가능한 필드를 조회한다. 이름/URL의 정확한 조회와 본문 검색을 지원하며, 검색 가능한 필드·정보가 없는 범위·다음 cursor를 반환한다. 어떤 회사가 사용자에게 좋은지는 이 문자열 검색의 순위가 결정하지 않는다.

외부 adapter는 기존 웹 검색·페이지 읽기와 Exa 등의 제공자에 연결한다. 내부 DB에 결과가 있어야 외부 검색을 허용하는 gate는 두지 않는다. 서로 다른 검색의 집합을 union할 수 있고, 새로운 공개 회사를 확인하면 manage_companies로 등록한다. 검색 결과가 없는 것과 전체 시장에 그런 회사가 없는 것을 구분한다. 회사 데이터의 빈 필드를 이유로 후보를 자동 탈락시키지 않는다.

search_opportunities의 retrieve 경로는 기존 retrieveRoles의 조회 결과를 집합으로 저장하고 평가 앞에서 반환한다. 현재 externalSearch의 검색 → 급여 보완 → 평가 전체를 호출해 놓고 결과 이름만 바꾸지 않는다. 기존 search 경로가 필요한 경우에는 계속 쓸 수 있다. 원본 agent는 넓은 집합을 그대로 보여 주거나, 사실 조건으로 좁히거나, 일부/전체의 조사와 평가를 의뢰할 수 있다. 500개라는 현재 처리 단위를 제품의 탐색 상한으로 만들지 않는다.

research_resources는 다음 작업을 서버에서 묶는다. 이는 도구 내부의 데이터 수집 절차이며 사용자가 거쳐야 하는 커리어 절차가 아니다.

1. refs/set_ref를 서버에서 펼치고 기존 회사 정보·공개 관측본·URL 원문에서 요청 질문에 관한 근거와 확인 시점을 모은다.
2. 새 수집이 필요한 대상은 기존 백그라운드 실행에서 처리한다. 공식 페이지 등 이미 알려진 URL은 읽기 경로를, 모르는 사실은 검색/조사 제공자를 사용한다. 기본 회사 정보가 이미 있으면 같은 소개를 처음부터 다시 수집하지 않는다.
3. 결과는 대상별 자유 답변과 source refs·확인 시점·미확인 범위를 남긴다. 원본 agent가 질문을 정하며 모든 회사에 같은 조사 필드를 채우지 않는다. 한 회사의 여러 질문을 같은 수집에 묶고, 큰 집합의 진행·부분 결과는 work reader로 읽는다.
4. 외부 원문과 공개 관측 사실은 공유 cache에, 개인화한 질문·판단·추천 이유는 사용자 소유 기록에 저장한다. 공유 메모를 작성하는 context에는 공개 원문만 공급하며 사용자 요청 전문이나 개인화한 조사 지시를 자동으로 전달하지 않는다.

이미 조사한 정보가 충분한지는 원본 agent가 출처와 시점으로 판단한다. reader는 관측 시점과 갱신 여부를 숨기지 않는다. 동일한 공개 URL 읽기는 정규화 URL과 원문 version으로, 동일한 실행 중 조사 요청은 대상·정규화 요청·공개 범위·요구 시점의 key로 합친다. 정확히 같은 요청만 자동 합치고, 의미가 비슷한 질문을 같다고 단정하지 않는다. 기존 company_hiring_search_cache의 lease 방식과 실행 기록을 재사용·일반화하되 기존 hiring과 새 research key의 namespace를 구분하고, 공개 근거와 개인별 결론은 같은 cache key에 넣지 않는다.

### 3.2 저장할 화면의 구체적인 예

아래는 모델에 강제하는 출력 형식이 아니라 manage_views가 저장하고 UI가 읽는 definition의 예다. 집합·기회 식별자는 실제 tool 결과에서 받는다.

~~~json
{
  "blocks": [
    { "component": "DirectionPanel", "source": { "type": "brief" } },
    {
      "component": "OpportunityCollection",
      "title": "먼저 함께 검토할 회사",
      "source": { "type": "result_set", "id": "<selected-set-id>" },
      "layout": "list",
      "order": "priority",
      "interaction": "select_and_reply"
    },
    {
      "component": "OpportunityCollection",
      "title": "더 넓게 둘러보기",
      "source": { "type": "result_set", "id": "<search-set-id>" },
      "layout": "table",
      "interaction": "select_and_reply"
    }
  ]
}
~~~

선택과 질문은 기존 대화 입력에 view ref·revision·selected_set_ref를 함께 전달한다. 사용자에게 500개를 보여 주기 위해 agent가 500개 ID를 다시 쓰지 않는다. view를 저장한 다음 표시할 때는 기존 inline UI 계약에 추가한 `[[career_ui:{"type":"view","viewId":"실제 ID"}]]` 참조를 사용한다. 저장과 표시를 모두 실제 코드에 연결한다.

## 4. Context: 매 실행에 실제로 무엇을 넣는가

새 요약 모델이나 intent classifier를 앞에 붙이지 않는다. 기존 원본 agent의 context 조립을 수정한다.

| context 블록 | 기본으로 포함 | 필요할 때 읽음 |
| --- | --- | --- |
| 사용자 | 현재 요청, 관련 Profile·Brief·Memory, 최근 정정 | 전체 경험 원문·과거 메일·문서 본문 |
| 현재 대상 | 사용자가 연 기회/view ref, 정확한 선택, 표시된 개인별 설명 | 회사 원문·전체 JD·상세 근거 |
| 재사용할 기록 | 해당 대상에 연결된 문서의 제목·설명·revision, 이전 관련 작업 결과의 작은 색인 | 비공개 경험 문서·조사 메모 본문 |
| 맡은 일 | 관련 work의 실제 상태, 남은 사용자 입력, 새로 도착한 결과 | 이전 발송·제출 원문과 첨부 |
| 현재 방향 | 현재 탐색에 연결된 Brief와 선택적 접근 메모 ref | 다른 의뢰의 조건과 과거 계획 |
| 능력 | 실제 사용 가능한 도구와 연결 상태의 짧은 catalog | 필요한 tool schema와 handbook 본문 |

현재 대상의 about_refs로 관련 기록을 찾고, 대상이 없는 새 요청은 원본 agent가 list_documents(query=...)로 검색한다. 대화 전체를 별도 모델로 매번 요약해 모든 기록을 넣지 않는다. 긴 자료를 읽었으면 원본 ref를 유지하고 필요한 부분부터 다시 읽는다.

정기 실행에는 예약 목적·위임, 관련 작업 메모 색인, 이전 집합/조사 ref, 새로 확인된 실행 결과를 제공한다. 세 번 전의 채팅을 모두 다시 읽어야 이전 조사 결론을 찾을 수 있는 구조를 피한다. 실제 source 갱신 여부를 모르면 '변화 없음'으로 주입하지 않는다.

## 5. Prompt: 기존 원본에서 수정할 본문

mainPrompt2.ts의 목적·durable context·opportunity 표현 절을 아래 의미로 수정한다. 기존 언어/문체와 실제 권한 계약은 보존한다. 지침을 별도 후속 메시지에 덧붙여 충돌시키지 않는다.

~~~text
사용자가 원하는 커리어 결과와 현재 요청을 이해하고, 필요한 조사·판단·준비·실행을 수행한다.
무엇을 먼저 할지, 어디에 더 조사할 가치가 있는지, 어떤 결과를 보여 줄지는 현재 맥락으로 판단한다.

사용자 경험과 근거는 비공개 자료로 축적해 재사용할 수 있다. 이미 있는 관련 자료를 읽고,
새 사실·정정·부족한 범위를 반영한다. 자료 저장은 공개 Profile 변경이나 외부 공유가 아니다.

이후의 작업에 도움이 되는 발견·결론·남은 일을 기존 문서와 작업 기록에서 관리한다.
무엇을 남기고 어떻게 정리할지는 재사용 가치에 따라 정한다.
사용자의 사실과 조건, 현재 접근의 가설, 실제 실행 결과를 구분한다.
실제 실행과 권한은 원본 메시지·reader·executor의 기록을 따른다.

회사·사람·공고·외부 대상을 필요한 정보원에서 찾을 수 있다.
큰 집합은 집합 참조로 다루고, 필요한 사실과 판단을 확보한다.
검색된 모든 대상이 추천이 되는 것은 아니다.

사용자가 판단하고 선택하기 좋은 묶음과 순서로 결과를 구성한다.
추천 이유는 확인한 근거와 이 사용자의 목적을 연결해 작성한다.
설명의 깊이와 보여 줄 내용은 실제 판단에 필요한 만큼 정한다.

기회를 얻는 데 유효한 준비와 후속 일을 제안하거나 수행한다.
이미 충분히 준비됐다면 불필요한 작업을 만들지 않는다.
명확히 맡긴 일을 제안 카드만 만들어 사용자에게 되돌리지 않는다.
~~~

활성 application handbook의 고정 검색 횟수·이메일 우선·항상 두 경로 준비 같은 작업 순서를 수정한다. 특히 현재의 '대표 이력서는 사용자 요청 없이는 수정·복사하지 않는다'는 고정 정책도 수정한다. 현재 자료가 충분한지, 새 버전을 작성할 가치가 있는지는 원본 agent가 요청과 근거로 판단하고 사용자가 특정 파일·수정 범위를 지정했다면 그 범위를 따른다. 실제 제출에는 선택된 정확한 버전을 사용한다. 준비 자료를 개선하는 판단과 공개 Profile/대표 파일 변경을 동일시하지 않는다.

documents capability를 열 때 resume handbook을 자동 로딩하는 runtime.ts 경로를 제거한다. 일반 경험 메모를 쓰기 위해 이력서 작성 지침을 받지 않게 한다. 이력서 작성이 실제 필요한 경우 기존 resume handbook을 선택해서 사용한다. mainPrompt2.ts의 표시 계약도 Role marker만으로 끝나지 않게 view 참조를 추가하고, 기존 handbook·tool description이 다른 경로에서 같은 제한을 되넣는지도 확인한다.

현재 Search Brief는 사용자 조건과 전제다. Harper의 임시 가설을 Brief/Memory 사실로 쓰지 않는다. 사용자와 함께 볼 접근이 유용하면 비공개 문서로 작성하고 관련 view에 연결한다. 매번 전략 문서를 작성하는 단계는 추가하지 않는다.

## 6. Handbook과 capability catalog

| 원본 | 역할 | 로딩 |
| --- | --- | --- |
| 신규 private_context handbook | 비공개 자료의 조회·수정·출처 연결·공개 경계와 실제 tool 사용법 | 경험 조사나 기록 관리에 필요할 때 |
| 기존 opportunity_search handbook | 내부/외부 대상, 집합 참조, 선택적인 평가, 회사 원본·근거 조회 | 탐색/조사에 필요할 때 |
| 기존 application handbook 개정 | 일반 기회의 실제 준비·연락·지원·자료·결과와 기존 executor 계약 | 해당 기회를 진행할 때 |
| 신규 presentation handbook | view의 source 참조, 컴포넌트 catalog, 우선순위·선택·숨김·이벤트 계약 | 저장 화면을 만들거나 수정할 때 |
| 기존 resume handbook | 이력서 원본과 작성·출력 계약 | 이력서 작성이 필요할 때 |

career capability catalog에서 각 능력의 존재를 먼저 알려 주고 세부 schema·본문은 필요할 때 로딩한다. handbook에 직군별 정답, 추천 개수, 필수 todo 목록, 설명 대본을 넣지 않는다. 유용한 방법 근거를 추가할 때도 같은 읽기 경로를 사용하고 적용 맥락과 출처를 남긴다.

## 7. UI: 네 가지 조합을 우선 구현한다

임의 HTML/JS를 생성하는 UI를 만들지 않는다. 기존 디자인 컴포넌트로 다음 네 조합을 구현하고, view가 필요한 조합·데이터·순서를 선택한다.

| 조합 | 실제 기능 |
| --- | --- |
| OpportunityCollection | 묶음 설명, 우선순위·강조, 목록/간단한 표, 전체 집합 참조, 다중 선택, 더 보기/숨김 |
| OpportunityDetail | agent가 작성한 개인별 본문, 회사/공고 원본, 근거 링크, 연결 자료, 가능한 후속 요청 |
| WorkPanel | 해당 기회의 제안 카드, 실제 Harper 작업, 사용자 입력·검토 요청을 원본에서 합성 |
| DirectionPanel | 현재 조건과 선택적 접근 메모를 표시하고 수정 요청을 agent에 전달 |

기존 문서 preview와 form은 그대로 사용한다. 자료는 근거와 입력이며 Documents 탭을 주 작업 화면으로 바꾸지 않는다.

view.definition에는 blocks, 각 block의 source ref, 표시 순서, 직접 추가/제외한 ref, 선택 동작을 둔다. source는 set_ref, 기존 matching/run ref, 기존 추천 목록, 개별 일반 기회 등을 받을 수 있다. matching만 지정하면 어느 결과인지 불명확한 경우 run/ref를 해석한 후 그 선택을 저장한다. 스냅샷 목록과 계속 갱신하는 검색 화면을 구분한다.

기회 추천의 기본 정렬은 명시된 priority/rank를 사용하고 시간순은 동률·미지정 시 보조로 사용한다. view 안의 순서 override도 가능하다. 우선순위는 agent가 선택하는 표시 순서이며 적합성 점수나 노출 자격이 아니다. 기존 internal/external 고정 섹션은 view 구성으로 옮기되 실제 소개 가능 여부는 각 기회에서 정확하게 표시한다.

500개 목록은 한 set_ref를 페이지로 읽는다. 다중 선택도 서버에 selection set을 만들고 selected_set_ref로 agent에 전달한다. 화면에 전부 표시하는 것과 모두 평가하는 것을 분리한다.

단순 정렬·페이지 이동·접기는 모델 호출 없이 처리한다. 새 조사·추천·실행이 필요한 선택은 원본 agent로 전달한다. UI 이벤트에는 view revision·선택 ref·사용자 입력이 포함된다. 특정 view에서 숨긴 항목을 다른 view와 실제 작업에서 삭제하지 않는다.

추천 상세는 저장된 개인별 설명을 사용한다. 상세 안에서도 설명·회사 사실·공고·근거·자료·진행의 블록 순서를 view에서 정할 수 있게 한다. JD를 항상 맨 위에 고정하지 않는다. 기존 Role 추천의 긴 본문은 membership의 explanation, 근거는 recommendation의 evidence를 우선 재사용하고 일반 기회는 content/evidence_refs를 사용한다. reader가 같은 표시 모델로 변환하되 원본을 복제하지 않는다.

클릭할 때마다 회사 조사를 다시 실행하거나 설명을 새로 생성하지 않는다. 새로운 중요 사실이나 사용자 정정이 있으면 관련 원본과 설명을 갱신한다. 우선순위 값이 없는 탐색 집합을 '추천 순'이라고 표시하지 않으며, view order가 지정되면 그 순서가 기본 추천 순위보다 우선한다.

## 8. Todo와 백그라운드 연결

추가 todo 테이블은 만들지 않는다. 두 기존 원본을 기회 ref로 연결한다.

- 아직 제안이거나 사용자의 입력/선택이 필요한 것은 career_action_items에 저장한다.
- Harper가 실제로 맡은 일은 talent_external_operations에 기존 manage_work로 저장한다.
- 자료와 확인 폼은 기존 document/form ref, 나중에 해야 할 일은 기존 schedule ref로 연결한다.
- WorkPanel이 같은 subject_ref를 기준으로 이 원본들을 읽어 보여 준다.

모든 지원에서 todo를 먼저 만들게 하지 않는다. 짧고 명확한 일은 현재 실행에서 바로 처리할 수 있다. 분리 실행이 유리한 일은 기존 work로 위임하고, 서로 독립적인 지원은 병렬로 맡길 수 있다. '다섯 곳 지원'이라는 말 자체가 동일한 준비 단계 다섯 벌을 만들라는 뜻은 아니다.

대화가 바뀌어도 같은 사용자와 같은 기회의 work를 조회·수정할 수 있게 현재 conversation 한정 reader를 확장한다. 원래 사용자 지시·실행 effect key·첨부 snapshot은 보존한다. 조회 범위 확장은 다른 사용자나 공개되지 않은 회사 자료를 읽을 권한을 만들지 않는다.

작업 결과·실패·질문이 돌아오면 현재 사용자 지시와 실제 상태를 읽고 이어 간다. UI 카드 삭제는 작업 취소가 아니고, '준비 완료'는 제출/발송 완료가 아니다. 같은 효과의 재시도는 기존 effect identity로 처리한다.

## 9. 세 상황에서 연결되는 실제 경로

아래는 구현 확인용 사례이며 런타임 순서나 직군 분기로 만들지 않는다.

### 비공개 경험을 찾아 지원 자료에 활용

요청을 받은 원본 agent가 문서 검색으로 관련 경험을 확인한다. 부족하면 연결된 Gmail을 검색하고 필요한 thread를 읽는다. 확인한 경험과 근거를 기존 비공개 Markdown 문서에 정리·갱신한다. 실제 source refs와 조사 범위를 남겨 다음 작업에서 재사용할 수 있게 한다.

그 경험으로 이번 지원 자료를 작성하고 기회 ref에 연결한다. Profile은 자동 변경하지 않는다. 다음 요청에서는 관련 문서를 찾아 읽고 새 사실이나 이전 조사에서 빠진 범위만 보강한다. 저장된 이력서 문장을 다시 경험 사실의 원본으로 삼지 않는다.

### 정기 탐색에서 같은 조사를 반복하지 않기

예약 목적과 관련 작업 메모·이전 set_ref·회사 근거 index가 context에 들어간다. agent가 이전 결론과 남은 질문을 읽고 필요한 최신 사실만 확인한다. 공개 원문 수집과 같은 조사 입력은 공유 cache/진행 중 작업을 재사용한다.

새 사실이나 조건 변화가 있으면 필요한 대상을 다시 판단하고 기회·view를 갱신한다. 기록이 없거나 조사 범위가 부족하면 넓혀 조사할 수 있다. 이전에 한 번 보류했다는 이유로 영구 제외하지 않는다.

### 공고 없는 회사를 묶음으로 제안하고 이어 진행

검색 집합과 공개 근거에서 유력한 회사를 골라 upsert_opportunities로 일반 기회를 만든다. source/evidence와 개인별 설명·priority를 저장한다. manage_views는 해당 기회 또는 집합을 묶어 설명과 선택 UI를 만든다.

사용자의 선택은 정확한 ref로 agent에 돌아간다. 필요하면 제안/입력 카드를 만들고, 실제로 맡은 조사·자료·연락은 기존 work/메일/브라우저로 수행한다. 별도 공고나 가짜 Role이 없어도 이 연결이 성립한다.

## 10. 비용과 재사용 경계

| 비용 | 줄이는 구현 | 유지하는 여지 |
| --- | --- | --- |
| 모든 자료를 매번 모델에 넣음 | 문서 검색, 작은 description/상태 index, 부분 읽기 | 원본 전문과 다른 관련 자료를 추가로 읽을 수 있음 |
| 같은 경험을 여러 지원에서 다시 조사 | 비공개 경험 원본 + source refs + 수정 가능한 조사 메모 | 새 역할에서 필요한 과거 미조사 영역과 최신 사실을 확인 |
| 같은 공개 페이지·회사를 사용자마다 수집 | 원문 cache, company_snapshot, 공개 회사 메모, 동일 요청 합치기 | 질문/시점/출처가 달라지면 새 조사 |
| A가 발견한 공개 공고를 B가 웹에서 다시 찾음 | 공통 company_roles 등록·중복 원본 재사용·검색 인덱싱, 개인 집합은 ref만 보유 | B의 다른 조건으로 조회·판단하고 필요한 최신 사실만 확인 |
| 500개 ID와 카드를 매번 생성 | set_ref, 서버 selection, view source 참조 | 필요하면 전체 집합에 실제 조사·평가 수행 |
| 상세 화면을 열 때마다 생성 | 저장한 개인별 설명·근거·원본 reader | 관련 사실이나 조건이 바뀌면 갱신 |
| todo 화면과 실행 상태를 따로 동기화 | 기존 action/work/form/schedule을 기회 ref로 조회해 합성 | 필요한 새로운 executor는 같은 계약에 추가 |
| agent 메모를 또 다른 모델이 계속 압축 | 원본 agent가 필요할 때 직접 수정, 기본 context는 색인만 | 메모 본문과 실제 실행 원본을 필요에 따라 읽음 |

조사 API 한 번 호출했다고 비용이 작아졌다고 계산하지 않는다. 실제 원문 수집·모델 사용·외부 제공자 과금, 첫 결과와 완료까지의 시간, 사용자 입력 부담을 비교한다. 임의 검색 횟수·추천 수·메모 문장 수로 비용 관리를 대신하지 않는다.

## 11. 실제 수정할 코드와 구현 순서

| 묶음 | 주요 경로 | 완료 기준 |
| --- | --- | --- |
| 비공개 경험·작업 기록 | talentOnboarding/documentTool.ts, documents/authoring.ts·sources.ts, capabilities/runtime.ts·registry.ts, context 조립 | 관련 자료를 검색·갱신하고 다음 요청에서 재사용. 일반 메모에 resume 지침이 강제되지 않음 |
| 회사·집합·일반 기회 | career/companies, matching 조회·게시 adapter, 신규 resource/sets reader, migration | 평가 없는 집합, 회사 원본 갱신, Role 없는 기회가 실제 저장·조회됨 |
| 화면·실행 연결 | inlineUi.ts, history/NewOpportunityList.tsx·상세, 신규 view renderer, actionItems·work reader | 우선순위·묶음·근거·선택과 기회별 작업이 하나의 경험으로 연결됨 |
| 입력·handbook 검증 | mainPrompt2.ts, handbook 원본·registry, 실제 provider 입력 | 수정 지침과 필요한 자료가 실제 모델에 전달되고 고정 순서가 다른 입력에서 재주입되지 않음 |

비공개 경험 검색과 Role 없는 기회+집합+화면을 작은 범위에서 끝까지 연결하고, 이후 정보원·묶음 조사·화면 구성을 넓힌다. DB만 만들고 끝내거나, 실제로 없는 작업 상태를 UI mock으로 보여 주는 것을 완료로 계산하지 않는다.

확인은 변경 경로에 집중한다. 비공개 자료가 공개 Profile/공유 회사 메모로 넘어가지 않는지, 동일 대상의 다른 요청에서 기존 경험과 조사 범위를 쓰는지, 원본 ref 하나로 큰 묶음을 표시하는지, 실제 priority가 시간순 정렬보다 우선하는지, 선택한 기회와 실행 대상이 일치하는지, 저장된 설명과 탐색 방향이 다음 방문에도 읽히는지를 확인한다. 실제 모델 실행·화면 렌더링·실행 결과 확인은 구현 후 수행하며 이번 문서 작업의 완료 주장에 포함하지 않는다.

사용자 간 재사용은 A/B 두 사용자의 분리된 경로로 확인한다. A가 확보한 공개 회사 근거와 공고를 B가 A의 집합 ID·정확한 검색어를 몰라도 자기 조건으로 찾을 수 있어야 한다. 같은 근거가 유효하면 수집 호출이 반복되지 않아야 하고, B에게 부족한 질문·만료된 근거는 보완 가능해야 한다. A의 경험·추천 이유·거절 사유·사적 원문은 B의 context와 결과에 포함되지 않아야 한다. 저장만 성공한 경우와 실제 검색 반영까지 완료된 경우를 구분한다.

## 12. 이번 결정의 코드·DB 근거

- talent_documents는 이미 is_public, description, extracted_text, structured_content, revision을 갖는다. 현재 Markdown 작성은 기본 비공개이고 부분 수정과 source_refs를 지원한다.
- 문서 목록은 현재 최신/primary 순 페이지이며, read_document의 query는 이미 지정한 한 문서 안의 문자열 검색이다. 전체 문서 검색은 별도로 추가해야 한다.
- documents capability 활성 시 resume handbook을 자동 로딩하는 코드가 존재한다.
- company_db, company_snapshot, career_action_items, talent_external_operations 및 기존 Role 추천·membership schema를 운영 DB에서 읽기 전용으로 확인했다.
- career_action_items는 사용자 선택용 카드이고 실행 queue가 아니다. work read/list는 현재 사용자와 conversation을 함께 필터링한다.
- 새 기회 목록은 현재 recommendedAt 시간순 정렬 뒤 internal/external로 나눈다. DB에 rank 필드가 존재하는 것만으로 현재 UI의 우선순위가 해결되지는 않는다.

운영 DB의 schema와 로컬 수정 중인 코드는 별도로 확인했다. 로컬 source_refs 개선 등 이미 진행 중인 변경을 재사용 대상으로 삼았으며 이 작업에서 덮어쓰지 않았다.

## 13. 세 차례 재검토에서 보완한 부분

1. **저장 구조만으로 사용자 행동이 열리는가:** 문서와 작업 이력만으로는 Role 없는 회사를 선택하고 이어 진행할 수 없다. 일반 기회 원본과 기존 Role 추천을 함께 읽는 resolver, 기회별 work/action 연결까지 포함했다. 반대로 기존 실행 엔진과 별도의 todo 상태는 중복이므로 추가하지 않았다.
2. **도구 이름만 넓히면 탐색 범위와 비용이 개선되는가:** 회사 이름 조회만으로는 넓은 회사 탐색이 되지 않고, 검색을 호출할 때마다 기존 평가 전체가 실행되면 집합 UI의 비용이 줄지 않는다. company_db 검색 adapter, 평가 앞에서 반환하는 retrieve 경로, 외부 검색과 공유 근거 수집, 서버 집합 선택을 명시했다. 이 변경만으로 모든 회사 중 최선을 찾는다고 주장하지 않는다.
3. **데이터와 화면이 생겨도 원본 지침이 다른 행동을 강제하는가:** documents→resume 자동 로딩뿐 아니라 활성 application의 대표 이력서 수정 금지와 고정 지원 순서를 확인했다. 해당 원본 수정, view 표시 marker, 상세 블록 순서, 실제 priority reader까지 구현 범위에 포함했다. 저장 기능이 있다는 사실만으로 새로운 사용자 경험이 제공됐다고 평가하지 않는다.

남은 검증은 구현 후 실제 입력과 출력으로 한다. 특히 검색 누락·조사 사실성·사용자별 추천 이유·실제 준비의 유효성은 테이블 개수나 prompt 문장만으로 보장할 수 없다. 이 설계는 그 품질을 개선하고 확인할 실행 경로를 구체화한 것이며 제품 성능 검증 결과가 아니다.
