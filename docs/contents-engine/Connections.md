# Connections.md

버전: 1.4 · 적용일: 2026-09-17 · 상태: 10개 운영 시트와 자동 동기화 운영 중. Format Bank·Outreach Templates 원장·결과 집계·Sheet 반영 완료 · 관리: 데이터 연결 담당

## 연결 상태

| 연결 | 현재 범위 | 미설정/경계 |
| --- | --- | --- |
| Supabase gtm_api | GTM 11개 업무 원장의 조회·변경·일괄 저장·UTM 발급·오늘 할 일·제품 집계. Format Bank와 Outreach Templates는 실제 사용·게시·회신 결과가 붙는 기본 조회까지 운영 | 임의 SQL, 원본 제품 사용자 조회, 발송/송금 실행 제공 안 함 |
| 제품 성과 | logs + landing_logs + 인증 가입 연결 + 실제 온보딩 이벤트의 서버 집계 | 동일 UTM 재방문 수집 누락 가능; 관측된 명시적 UTM만 귀속 |
| Notion | 기존 Contents Engine / Agents.md 아래 작업별 지침 | 토큰이나 개인 사용자 데이터 보관 장소 아님 |
| Google Sheets | 전체 성과·Creator Directory·Connected Creators·Outreach Log·Format Bank·Outreach Templates·협업·콘텐츠·집행·캠페인과 5분/열기 자동 동기화 운영 중. 미반영 편집이 있는 시트만 보존하고 나머지 시트는 계속 갱신 | 새 팀원은 첫 실행에서 Google 권한 승인과 본인 GTM 전용 키 연결 필요. 승인된 포맷·템플릿 원본이 아직 없으면 신규 두 탭은 헤더만 표시 |
| 크리에이터 발굴 | Agent가 접근 가능한 공개 출처와 제공 자료로 조사·저장 | 전 플랫폼 전수 발굴 API 미연결 |
| 메일/DM | 초안과 받은/보낸 실제 메시지 기록 | 전용 발송/수신 동기화 미연결 |
| 플랫폼 통계 | 원본 API/제출 통계 관측값 저장 계약 | YouTube/Meta/TikTok 전용 인증/API 미연결 |
| 지급 | 비용·증빙·지급/환불 내역 대사 | 실제 송금 미연결 |
| 정기 Agent·Metabase | 공통 API/지표를 재사용할 수 있음 | 스케줄·별도 Metabase 설치 미설정 |

## 공통 API

대상: Harper Supabase의 `POST /rest/v1/rpc/gtm_api`. `apikey` 헤더에는 프로젝트 공개 anon 키, JSON 본문의 `p_token`에는 GTM 전용 접근 키를 쓴다. 서비스 역할 키/DB 비밀번호를 팀원이나 Sheets에 배포하지 않는다. 공개 키만으로는 GTM 데이터에 접근할 수 없다.

이 컴퓨터에서는 저장소의 `scripts/contents-engine/client.py`를 사용한다. 구성은 `~/.config/harper/contents-engine.json`이며 소유자만 읽을 수 있어야 한다. 클라이언트가 token을 주입하므로 요청 JSON에 키를 넣지 않는다. 다른 팀원에게는 별도 이름·만료일의 전용 키를 발급하고 같은 클라이언트/요청 계약을 사용한다. 키를 복사해 공동 사용하지 않는다.

```sh
python3 scripts/contents-engine/client.py --action list --entity gtm_creators
python3 scripts/contents-engine/client.py --action today
python3 scripts/contents-engine/client.py --action performance --data '{"start_at":"2026-09-01T00:00:00+09:00","end_at":"2026-09-16T00:00:00+09:00"}'
python3 scripts/contents-engine/client.py --request /absolute/path/request.json
```

아래는 클라이언트용 JSON이며 HTTP 직접 호출은 각 키에 `p_`를 붙인다. ID는 실제 조회 응답에서 얻고 request_id는 논리 변경마다 새 UUID를 만든다.

```json
{"action":"save","entity":"gtm_creators","data":{"name":"실제 확인한 이름","country":"KR"},"request_id":"새 UUID"}
```

기존 행 변경에는 `id`, `expected_version`(조회한 row_version), 바꿀 data만 넣는다. 같은 요청을 재시도할 때 동일 request_id·본문·키를 유지한다. 다른 내용으로 같은 request_id를 재사용하면 거절된다. API 성공 후 반환 record와 다시 읽은 값을 확인한다.

| action | 요청 및 반환 |
| --- | --- |
| list | entity + data={filters:{field:value},search:"문자",limit:50,offset:0}. rows,next_offset 반환. next_offset이 있으면 이어 읽는다. 최대 500개/호출. gtm_creators는 플랫폼/팔로워/최근 365일 게시 수/연락 상태/열린 업무/최신성까지 계산한 기본 운영 행 반환 |
| get | entity + id. record, 관련 활동/열린 업무 반환. 크리에이터 record는 기본 운영 행이며 related.accounts는 플랫폼별 수치·기준일·출처·갱신 필요 항목을 포함. 협업은 콘텐츠/비용, 콘텐츠는 관측/플랫폼 버전도 반환 |
| save | 실제 writable 칼럼만 생성/부분 수정. 기존 행은 expected_version 필수 |
| patch_item | 기존 행의 작은 목록 변경. data={field:"action_items",item:{id:"불변 UUID",text:"할 일",status:"open",owner_id:"담당",due_at:"ISO 시각"}}. 여러 비중 변경 등은 items 배열 사용 |
| issue_link | gtm_contents 기존 행과 버전. data={destination_url,source,medium,scope:"content",placement}. 발급 URL은 반환 record.tracking_links의 신규 항목 |
| archive | 기존 행과 버전. 명시적 보관. 시트 행 삭제와 다름 |
| batch | data={operations:[{action,entity,id?,expected_version?,data,request_id},...]}. 최대 50건 원자 처리; 하나 실패하면 모두 되돌림 |
| today | 부모 상태와 무관한 실제 open action_items. 최대 500개; 장기 업무는 원장에서 추가 조회 |
| performance / overview | data={start_at?,end_at?,plan_id?,content_id?}. 기본 최근 30일, 최대 93일. 제품 전체·일별·콘텐츠·공용 귀속·정의·한계 반환 |

`contacts/action_items/payments/allocations/asset_refs`는 patch_item, `tracking_links`는 issue_link만 사용한다. contact item은 불변 id, channel, address, source_ref, as_of를 필수로 가지며 party/status 같은 실제 확인 정보를 추가할 수 있다. activities는 append-only이며 correction_of_id로 정정한다. API 오류는 성공으로 바꾸지 말고 오류 메시지와 영향을 기록한다.

## 권한과 복구

시트: [Harper Contents Engine](https://docs.google.com/spreadsheets/d/1-3QpEN19fFEiP6acBqLWMCOD483bWvJtPwwQ9KUqgEI/edit). 연결 코드: [Harper Contents Engine Bridge](https://script.google.com/home/projects/1W_QjT0BkUfUU8sbhWMxWHST3daZaMs2fdnf3TyJywzlmNt9hBVMLmShX/edit). 소유자는 daniel@matchharper.com이며 chris@matchharper.com과 yoonkyoung@matchharper.com에 편집 권한을 부여했다.

팀원은 시트 편집 권한과 본인 이름의 GTM 전용 키가 필요하다. 첫 실행에서 Google이 요구하는 권한은 설치된 시트 읽기/쓰기, 외부 서비스 연결, 상세 창 표시다. 시트의 Contents Engine → 연결 설정에 전용 구성 JSON을 넣으면 Apps Script의 본인 UserProperties에 저장된다. 비밀값은 셀·스크립트 소스·Notion에 쓰지 않는다. 한 팀원의 키는 다른 팀원의 실행에 자동 공유되지 않는다.

2026-09-17에 Google 권한 승인, 전용 키 연결, 조회, 전체 새로고침, 임시 포맷 한 건 저장, 동일 ID 재조회, 정확한 검증 행·감사 기록 제거, 다시 새로고침까지 확인했다. 같은 날 Format Bank·Outreach Templates 추가, 기존 Creator Directory 30개 행의 새 칼럼 안전 이관, 5분/열기 trigger와 오류율 0%, 부분 새로고침을 실제 시트에서 다시 확인했다. 검증용 업무 행은 남아 있지 않고 승인된 포맷·템플릿 원본도 아직 0건이다. 입력 수정은 즉시 DB에 쓰지 않고 ‘미반영’으로 표시하며 선택행 저장 메뉴를 누른다. 서버 변경과 충돌하면 로컬 수정은 남기고 재확인을 요구한다. 새로고침은 미반영 수정이 있는 시트를 보존하고 나머지 시트를 계속 갱신한다. 통신 결과가 불명확한 쓰기는 같은 요청 ID로 재시도한다. 숨김 ID/버전 칼럼과 조회값은 수정 경고를 표시한다.

Creator Directory는 전체 후보의 조사 정보와 간단한 연락·연결 상태를 표시하고 허용된 크리에이터 원본 칼럼만 편집한다. Connected Creators는 실제 연락·협업 이력이 있는 크리에이터의 협업·콘텐츠·비용·성과·채택 방향을 모은 읽기 화면이다. Outreach Log는 메시지 초안·발송·수신 원문을 관계 정보와 함께 시간순으로 보여주는 읽기 화면이다. Format Bank는 hook·제작 흐름·필수 장면·캡션·반복/중단 기준·대상·연락 각도와 사용량을, Outreach Templates는 캠페인·채널·대상·본문·제안·후속 문구와 발송/회신 결과를 보여준다. 5분 주기와 파일 열기 trigger가 DB View/RPC를 다시 읽고, 미반영 편집이 있는 시트는 보존한 채 나머지 시트를 갱신한다. 이 구조는 자동 메일/DM 수신함을 뜻하지 않는다. 외부 메시지는 연결된 수집기나 Agent가 `gtm_activities`에 기록해야 표시된다.

`gtm_access_tokens`는 접근 관리용 내부 테이블이다. 원본 키 대신 SHA-256 해시·이름·읽기/쓰기·만료/폐기를 저장한다. 초기에 로컬 Agent와 Sheets용 키를 별도로 90일 만료로 발급했다. 현재 권한은 GTM 전체 읽기 또는 전체 읽기/쓰기 단위이며 팀원별 행/연락처 단위 권한까지 분리하지 않았다.

401/접근 오류이면 URL·공개 키·전용 키의 만료/폐기 여부를 확인한다. DB 관리자가 새 전용 키를 발급해 해당 비밀 저장소에서 교체한다. 40001/버전 충돌은 최신 행과 차이를 읽고 재적용한다. 타임아웃은 같은 논리 request_id로 결과를 확인/재시도한다. 인증 오류를 피하려고 RLS를 끄거나 서비스 역할 키로 바꾸지 않는다.

새 연결을 추가할 때 실제 계정·권한·지원 작업·비용·보존 제약·검증일·실패 복구를 이 표에 반영한다. 문서 작성, 초안 생성, 장부 기록만으로 외부 연결 완료라고 표시하지 않는다.
