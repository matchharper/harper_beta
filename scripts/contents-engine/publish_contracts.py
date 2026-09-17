"""Archived one-time conversion used for the initial 2026-09-16 install."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / 'docs/contents-engine'

raise SystemExit(
    'Archived conversion: edit the current Contents Engine contracts directly.'
)

root = (D/'AGENTS.md').read_text()
root = root.replace('상태: 구조·문서 구성 검토안, 미구현 · 기준일: 2026-09-16','버전: 1.0 · 적용일: 2026-09-16 · 상태: GTM DB/API 연결 완료, Notion/Sheets 설치 진행')
root = root.replace('현재 아래 작업 파일들은 작성 범위를 기획한 상태이며 실행 본문·도구가 완성됐다고 보고하지 않는다.', '아래 작업 파일은 실제 작업 절차와 공통 API 계약을 담는다. 외부 발송·플랫폼 통계·송금·예약 Agent는 미연결이며 문서 작성 완료와 연결 완료를 구분한다.')
root = root.replace('현재 각 링크는 [문서 기획](Document_Plan.md)의 해당 작성 사양으로 연결된다. 실행 본문이 준비되면 실제 작업 파일 경로로 바꾸고 사용 가능 상태를 표시한다.', '각 문서는 현재 조회·판단·준비·기록 범위에서 사용할 수 있다. 외부 실행은 [Connections.md](Connections.md)의 실제 연결/권한을 확인한다. D14/D15는 2차 최적화 작업 지침이며 자동 최적화 엔진을 뜻하지 않는다.')
root = re.sub(r'\[([\w]+\.md)\]\(Document_Plan.md#d\d+\)',r'[\1](\1)',root)
root = root.replace('작성할 작업 문서와 책임 범위','작업 문서와 책임 범위').replace('작성 예정. 확인된 원본으로 채워야 함','실제 Career 운영 문서로 확인').replace('논리 설계 존재, DB 미구현','물리 DB와 공통 API 구현').replace('제안 정의 존재, 실제 집계 검증 전','관측 UTM 모델 연결·경계 검증').replace('작성 예정. 실제 연결 확인 필요','실제 호출 계약·지원/미연결 범위').replace('공통 계약 초안','공통 운영 계약')
root = root.replace('`Business_Context.md`','[Business_Context.md](Business_Context.md)').replace('`Connections.md`','[Connections.md](Connections.md)')
root = root.replace('현재 설계 원본은 이 디렉터리다.', '운영 지침 원본은 게시된 Notion 페이지다. 이 디렉터리는 최초 발행본/구현 검토용 사본이며 실행 시 Notion의 최신 버전과 수정일을 확인한다. DB 스키마·코드 원본은 저장소다. Notion에 접근할 수 없으면 사용한 로컬 버전을 밝힌다.')
root += '''
## 설치된 저장과 사람이 보는 화면

업무 테이블은 위 10개다. 여기에 GTM 제한 접근 키의 해시/만료를 보관하는 `gtm_access_tokens` 1개가 있다. 총 물리 테이블은 11개이며 모두 gtm_ 접두사다. 활동의 실제 변경 기록으로 감사·중복 실행 방지를 처리하며 별도 사고/판단 테이블은 만들지 않는다.

팀원은 Sheets의 전체 성과·Creator Directory·Connected Creators·Outreach Log·협업·콘텐츠·집행·캠페인·포맷에서 시작한다. Directory는 전체 후보와 허용된 편집 필드, Connected Creators는 연결 이후 누적 협업·콘텐츠·비용·성과, Outreach Log는 메시지 초안·발송·수신 원문을 보여준다. 두 조인 화면은 읽기 전용이고 5분·파일 열기·수동 새로고침으로 DB를 다시 읽는다. DB UUID 대신 원장별 짧은 ref를 사용하고 수정/충돌 상태를 확인한다. 계정·활동·관측·비용 원본은 Agent의 상세 조회와 기록으로 같은 대상을 이어 사용한다. Sheet의 기본 칼럼은 모든 DB 칼럼의 복제본이 아니다.
'''
(D/'AGENTS.md').write_text(root)

data = (D/'data-model.md').read_text()
data = data.replace('상태: 논리 설계, 미구현. [AGENTS.md](AGENTS.md)를 먼저 읽는다. 아래 이름은 구현 제안이며 실제 존재하는 테이블 목록이 아니다.', '버전: 1.0 · 적용일: 2026-09-16 · 상태: 업무 테이블 10개와 공통 API 구현. [AGENTS.md](AGENTS.md)를 먼저 읽는다. 아래는 저장 의미와 운영 계약이며 실제 칼럼은 마지막 물리 목록, 호출은 Connections를 따른다.')
data = data.replace('실행 인프라의 물리 저장은 8절의 재사용 확인 후 확정하며 이 10개에 포함됐다고 주장하지 않는다.', '접근 키 해시·권한·만료를 보관하는 내부 gtm_access_tokens 1개가 추가되어 물리 테이블은 총 11개다. 기존 공통 마케팅 접근 저장소가 없어 최소로 추가했다.')
data = data.replace('대화는 activities에서 같은 상세에 노출한다. 최신 메시지·최근 연락일·응답 지연·약정액·지급액·미지급액·콘텐츠 목록은 자동 제공한다.', '대화는 gtm_activities에서 같은 상세에 노출한다. get은 최근 활동·콘텐츠·비용 원본을 함께 제공하며 최근 연락일·응답 지연·미지급 해석은 이 원본으로 Agent가 계산한다.')
data = data.replace('성과, 배분 비용, CPA, 측정 상태, 최신 채택 방향·이유·기준일은 연결 기록에서 계산해 같은 행에 표시한다.', 'performance API는 성과·배분 비용·잠정 CPA·측정 상태를 반환한다. 최신 채택 방향·이유·기준일은 get의 review_adopted 활동을 읽어 같은 대상에 붙인다.')
data = data.replace('최신 방향은 해당 원장의 조회 칼럼으로 표시한다.', '최신 방향은 get의 최근 활동 또는 list gtm_activities의 해당 대상 필터로 읽어 표시한다. 독립 물리 칼럼으로 복제하지 않는다.')
data += '\n## 실제 물리 칼럼 목록\n\n공통: id(UUID), ref(원장별 짧은 번호), created_at/updated_at, created_by/updated_by, row_version, archived_at. 내부 접근 테이블은 별도 계약이다. 계산 칼럼은 편집 대상이 아니다.\n\n'
sql=(ROOT/'supabase/migrations/20260916130000_gtm_contents_engine.sql').read_text()
for match in re.finditer(r'create table public\.(gtm_\w+) \((.*?)\n\);',sql,re.S):
    fields=re.findall(r'(?:^|,|\n)\s*(\w+)\s+(?:uuid|bigint|text\[\]|text|jsonb|timestamptz|numeric|boolean)\b',match[2])
    data += f'- **{match[1]}**: '+', '.join('`'+f+'`' for f in fields)+'.\n'
data += '''

## 현재 조회 계약의 경계

list는 원장 행과 페이지네이션을 반환한다. plans만 비용 요약 뷰를 사용한다. get은 관련 요약을 붙이고 과거 이력이 더 필요하면 activities를 대상 필터로 추가 조회한다. performance는 제품 전체·일별·콘텐츠·공용 귀속을 반환한다. 기본 목록이 모든 관계를 무제한 조인한다고 가정하지 않는다.

activities의 system.mutation은 실제 변경의 before/result와 요청 해시를 보존하는 서버 감사 기록이다. 임시 모델 판단이 아니다. 일반 호출은 해당 kind/request_id를 위조할 수 없다. 모든 API 쓰기는 행 버전·허용 칼럼·관련 ID·약정 예산·지급 중복을 검사한다. 실제 외부 발송 중복을 막는 실행기는 아직 연결하지 않았다.
'''
(D/'data-model.md').write_text(data)

m=(D/'measurement.md').read_text()
m=m.replace('상태: 구조 검토안, 미구현.', '버전: gtm_observed_utm_v1 · 적용일: 2026-09-16 · 상태: 실제 제품 집계 API 연결 확인.')
m=m.replace('campaign=캠페인의 고정 ref', 'campaign=캠페인의 불변 UUID(하이픈 제외)')
m=m.replace('1차 제안 귀속은 가입 직전 7일 이내 마지막 non-direct 방문이다.', '장기 목표는 가입 직전 7일 이내 마지막 non-direct 방문이다. 현재 구현은 아래에 명시한 관측된 명시적 UTM 모델이며 두 정의를 혼동하지 않는다.')
intro='''
## 현재 API의 정확한 범위

`performance`는 기본 최근 30일(최대 93일)의 관측 결과를 반환한다. start_at 이상 end_at 미만이며 일별 표시는 Asia/Seoul이다. 제품 전체(product_overall)는 모든 획득 채널의 지표이고 콘텐츠 귀속 합계와 같지 않다. plan_id 필터도 제품 전체 숫자를 바꾸지 않는다.

- landing_visitors: 기존 new_visit/new_session 이벤트의 고유 local_id. 사람 수·총 방문 횟수와 다르다.
- signups: logs의 career_signup_completed 최초 시각. 로그가 없으면 talent_users.created_at으로 보완하고 fallback 수를 표시한다.
- signup_cohort_completed_7d: 기간 내 가입자 중 가입 시각 이상, 가입+7일 미만에 실제 onboarding_completed 이벤트가 있는 사용자. 아직 7일이 안 지난 가입자는 미성숙이다.
- onboarding_completion_events: 가입 기간과 무관하게 조회 기간 내 최초 완료 이벤트가 발생한 사용자. 위 가입 cohort 완료와 다른 지표다.
- identity: 가입 시 서버의 contact_queue.payload.landingLocalId를 우선한다. 없으면 같은 브라우저 ID에 이메일 하나가 확인된 login_email을 보완 사용하고 legacy_identity_signups를 표시한다. 내부/확인된 QA 계정을 제외하며 사용자 ID·이메일·브라우저 ID는 API가 반환하지 않는다.
- 콘텐츠 귀속: 가입 이전 7일 이내에 기록된 마지막 명시적 UTM. 다른 채널의 더 늦은 UTM이 있으면 이전 GTM에 귀속하지 않는다. 발급 링크 ID/source/campaign이 모두 일치해야 한다. 공용 링크는 shared_attribution에만 한 번 기록한다.
- actions: 실제 message_sent 활동, research_result 기록, published_at의 수다. 초안은 발송이 아니다. 이 수를 서로 나눠 협업 cohort 회신율/합의율로 쓰지 않는다.

현재 제품이 같은 UTM 재방문을 생략할 수 있고 source-only 방문과 연결되지 않은 기기가 있어 **정확한 전체 last-non-direct를 보장하지 않는다**. 제품 계측 보완 전 빈칸을 추측해서 채우지 않는다. 기존 비-GTM 링크를 새 콘텐츠 실적으로 임의 이관하지 않는다.

현재 콘텐츠 비용은 누적 배분 비용이다. CPA는 게시 시점이 조회 기간 안에 있고 비용/통화가 확인된 경우만 잠정 표시한다. 조회 기간 전환과 생애 비용을 맞춘 최종 수익성 지표가 아니다. D14 가입+D7 완료의 고정 게시 cohort, 연락 cohort 퍼널과 실험 비교는 아래 계약에 따라 별도 분석하며 현재 API에 자동 구현됐다고 주장하지 않는다.

'''
m=m.replace('## 성과는 같은 행에서 읽는다',intro+'## 성과는 같은 행에서 읽는다')
(D/'measurement.md').write_text(m)

o=(D/'operations.md').read_text().replace('상태: 공통 계약 초안, 미구현.', '버전: 1.0 · 적용일: 2026-09-16 · 상태: 공통 운영 계약.')
o=o.replace('작업별 책임·입출력은 [문서 기획](Document_Plan.md)에 있으며 해당 파일의 실행 본문을 작성할 때 그대로 이어간다.', '작업별 책임·입출력은 AGENTS에 연결된 15개 작업 문서가 소유한다.')
o=o.replace('앞으로 확인해서 작성할 Connections.md', '[Connections.md](Connections.md)')
o=o.replace('자동 수집·회신 동기화·집계는 백그라운드 실행기로 수행한다.', '제품 집계는 API 호출 시 계산한다. 플랫폼 자동 수집·회신 동기화·정기 Agent 실행기는 현재 미설정이다. 필요 시 실제 백그라운드 연결을 추가한다.')
o=o.replace('현재 설계는 저장소, 향후 Notion을 원본으로 쓰기로 하면 명시적으로 전환한다.', '운영 지침은 발행된 Notion이 편집 원본이고 저장소는 최초 발행본/구현용 사본이다. Agent는 Notion의 최신 지침과 수정일을 확인한다. DB 스키마/실행 코드의 원본은 저장소다.')
o=o.replace('민감한 연락·지급 정보와 분석에 필요한 값은 필요한 권한으로 구분한다.', '현재 키는 GTM 전체 읽기/쓰기 또는 읽기 단위다. 행/연락처별 세부 권한이 필요한 팀원에게 넓은 키를 임의 발급하지 않는다.')
(D/'operations.md').write_text(o)

for name in ['README.md','delivery-plan.md','Document_Plan.md']:
    p=D/name
    p.write_text('> 2026-09-16 보관된 설계 검토 자료. 현재 설치/사용 상태의 원본은 AGENTS.md, Connections.md와 실제 DB/API다. 아래의 미구현/작성 예정 표현은 검토 당시 상태이며 현재 지침을 덮어쓰지 않는다.\n\n'+p.read_text())
print('Updated the installed data, measurement, operations and entry contracts.')
