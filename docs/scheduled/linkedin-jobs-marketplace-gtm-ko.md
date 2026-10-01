# LinkedIn Jobs 수요 기반 GTM — Codex 운영 계약

문서 기준: 2026-10-01. **DB 칼럼·트리거는 운영 DB에 적용되었고 웹 코드는 로컬 준비 상태다. 운영 자동화는 아직 켜지지 않았다.**

## 목적과 정본

매일 08:00 KST에 Codex가 홍보 가능한 모든 활성 internal Role에서 지금 LinkedIn에 올릴 Role을 판단하고, Harper `/jobs`의 공고를 최신 상태로 유지한다. LinkedIn Recruiter의 한정된 슬롯을 써서 **현재 회사들의 채용 수요에 실제로 맞는 새로운 talent 유입과 연결 가능성을 높이는 것**이 목적이다. 새 Role의 첫 노출, 여러 Role에 파급되는 공고, 공급이 부족한 Role, 기존 공고의 성과를 함께 살펴본다. 매일 슬롯을 교체하거나 새 공고를 올리는 것 자체가 목표는 아니다.

Scheduled task의 prompt에는 이 문서 경로와 실행 목표만 둔다. 매 실행 전에 이 문서 전체, [운영 학습](./linkedin-jobs-marketplace-learnings-ko.md), [Recruiter Jobs 화면 가이드](./linkedin-recruiter-jobs-ui-guide-ko.md), `harper_beta/AGENTS.md`, [테스트 Role 격리 계약](../test-internal-role-isolation-ko.md)을 읽는다. 상태와 성과는 현재 DB·LinkedIn 화면에서 다시 읽고, [Notion Linkedin Jobs Postings](https://app.notion.com/p/3ea7277d26df80f08414ea5ee89f2687)의 `Data & Logs`에서 과거 결정·공고 ID를 확인한다. 과거 문서는 현재 상태의 대체물이 아니다.

| 정보 | 정본 | 기록 방식 |
| --- | --- | --- |
| Role 공개 허용·익명 여부 | `company_internal_roles.is_promote`, `is_anonymous` | DB. 기본값 `true`, `false` |
| Role 채용 상태·테스트 격리 | `company_roles`와 `information.testOnly` | DB. 실행 직전 재확인 |
| Harper 공고와 내용 | `official_jobs` | DB. `role_id`로 연결, slug는 공개 후 안정적으로 유지 |
| LinkedIn 실제 Open/Closed·슬롯 수·조회·Apply starters | 로그인된 Recruiter 화면 | 브라우저에서 확인한 시각과 수치를 Notion에 기록 |
| 실행·판단·외부 작업 이력 | Notion `Data & Logs` | 행동마다 한 행. 후보자 개인정보·비공개 회사 사실은 기록하지 않음 |
| 지속적으로 확인된 작성·운영 교훈 | [운영 학습](./linkedin-jobs-marketplace-learnings-ko.md) | 근거와 날짜를 붙여 수정. 일별 수치는 넣지 않음 |
| 팀원 알림 | Harper Scouter → `C0B2TFPUS6P` | 실제 변화와 이유만 요약, Notion 행 링크 포함 |

## LinkedIn Project Owner 강제 조건

**LinkedIn Job을 Open하거나 Close할 때 연결된 Hiring Project의 Owner는 반드시 Hojin Kim(Recruiter UI 표기 `Hojin KIM`)이어야 한다.** Job poster, 프로젝트 생성자, 프로젝트 멤버 여부를 Owner 확인 대신 쓰지 않는다. 매 변경 직전에 해당 프로젝트의 `Project settings → Project members`에서 `Owner`를 확인한다. 다른 팀원 소유의 Open Job을 홍보 금지 상태 등의 이유로 닫아야 하면 UI에서 Owner를 Hojin Kim으로 변경하고 다시 확인한 뒤 Close한다. Owner 이전이 불가능하면 실제 노출을 긴급 문제로 기록·보고하고 추측 조작하지 않는다.

Chris 등 다른 팀원 소유의 Closed Job을 다시 Open하고 싶다면 원본의 `Copy job`으로 제목·본문·회사·위치·근무 방식·고용 형태·시니어리티·보상·지원 URL 등 공개 내용과 입력 metadata를 복사한다. **새 Hiring Project를 만들고 Owner가 Hojin Kim인지 확인한 후 새 Job만 Open한다. 원본을 Repost하거나 원본 프로젝트의 Owner만 바꿔서 재사용하지 않는다.** 복사 과정에서 자동으로 바뀌는 Profile 등은 원본과 대조하고, 공개 내용·지원 경로가 같아야 한다. 원본 Job ID와 새 Job ID, Owner, 검증 결과를 Notion에 연결해 기록한다.

2026-10-01에 사용자가 직접 지시한 Chris 소유 Mistral Open 원본 4건의 Close는 이 조건을 정착시키기 위한 일회성 예외였다. 이후 실행이나 예약 작업으로 확장하지 않는다.

## 노출과 작성 경계

1. 새 공고·LinkedIn 홍보 대상은 `source_type=internal`, `status=active`, 미만료, `information.testOnly`가 아닌 Role 중 `is_promote=true`인 것만이다. `draft`, `paused`, `ended`, `deleted` Role에는 새 공고나 새 LinkedIn 게시를 하지 않는다. 기존 `paused` Role의 `/jobs` 공개 여부는 현행 의미를 유지한다. 기존 공고라도 `ended`/`deleted`/만료/테스트 Role 또는 `is_promote=false`이면 `/jobs` 목록·상세·사이트맵에서 즉시 제외한다.
2. Role에 연결된 `official_jobs`가 하나라도 있으면 새 행을 만들기 전에 모든 변형을 비교한다. 실제로 사용할 공고가 모호하면 중복 생성하지 않고 `Works`에 조사 항목을 남긴다. LinkedIn Job ID를 `official_jobs.is_on_linkedin`만으로 추정하지 않는다.
3. 익명 공개가 아니라면 `company_workspace.published_name`이 의도한 대외 이름인지 확인하고, 없으면 `company_name`과 공식 사이트·기존 대외 표기를 대조한다. `is_anonymous=true`이면 회사가 특정되지 않는 **검증 가능한** 설명형 이름과 slug를 쓰고, `source_company_name`을 포함한 모든 공개 가능한 `official_jobs` 필드에 실제 회사명·도메인·로고·식별 단서를 넣지 않는다. Role ID는 웹 응답에서 숨기지만 공개 DB 행 자체도 안전한 문구여야 한다. 기존 실명 공고를 익명으로 바꾸면 migration trigger가 Harper 공고를 먼저 비공개로 돌리므로 문구를 검토·수정한 뒤에만 다시 게시한다. 기존 LinkedIn 공고는 DB flag만으로 숨겨지지 않으므로 실명→익명 전환은 해당 LinkedIn 게시를 먼저 닫거나 수정해 공개 화면에서 실명이 사라졌는지 확인하고 진행한다. 이 작업을 다음 08:00 실행까지 미루지 않는다. LinkedIn의 `Company` 필드는 공개 회사 페이지와 연결될 수 있으므로 익명 Role에 실제 채용 회사 페이지를 선택하지 않는다. Harper가 채용 중개 주체로 표시될 수 있는지 해당 Recruiter 작성 화면·미리보기에서 확인하고, 허용되는 정확한 표기 방식이 불명확하면 LinkedIn 게시를 보류해 `Works`에 남긴다.
4. `company_workspace`의 공개 가능 회사 설명·pitch, `company_roles`의 회사·역할 설명, JD, 위치·근무 방식·보상, 공식 회사 사이트의 검증된 사실만 공고 근거로 쓴다. Hiring Brief/Request, 후보자 fit·평가·비공개 메모와 company-side 대화는 공개 JD의 사실 근거가 아니다. 장점은 구체적 근거가 있을 때만 말하고 채용 조건·혜택·투자 사실을 추정하지 않는다.
5. `official_jobs`에는 회사 소개, 역할 범위, 필수·우대 조건, 위치·근무 방식·보상 등 해당 채용 공고에 필요한 내용을 쓴다. 회사가 제공한 면접 단계가 있다면 사실에 맞게 소개할 수 있다. **Harper의 내부 지원·공유·검토·연결 절차를 설명하는 `Process`, `How the Harper process works`, `Harper 지원 절차` 같은 섹션은 공고 본문에 넣지 않는다. Harper 팀원의 최종 확인 단계나 익명 회사명 공개 시점을 Harper의 소개 절차와 연결한 설명도 대외 공고에 언급하지 않는다.** 기존 공고의 이런 문구를 새 공고에 복제하지 않는다.
6. 회사·JD가 바뀐 기존 공고는 변경된 사실과 실제 공개 가능성을 비교한 뒤 필요한 부분만 고친다. 제목·위치·slug를 성급히 바꾸지 않는다. 공개 전후 `/jobs/{slug}` 렌더링, 목록, 링크, Apply 도착점과 익명성 검사를 한다.

## 매일 08:00 KST 실행 순서

1. **재조정:** DB의 eligible Role, 연결 공고, 현재 `is_on_linkedin` 표시와 Notion 마지막 기록을 읽는다. 로그인된 LinkedIn Recruiter의 `Open` 공고 전체와 `n of n job slots in use`를 브라우저로 읽고 URL의 Job ID를 매핑한다. 2026-09-30 조사에서는 실제 `21 of 21`에 비해 DB 표시가 처음에 23건이었고, Open 목록에 없는 두 행을 정정해 21건이 되었다. 건수가 맞아도 개별 공고 매핑은 별도로 검증한다. 표시값만 믿고 슬롯을 비우거나 기존 공고를 닫지 않는다. 매핑 불명·계정 미접속·슬롯 수 불명은 해당 LinkedIn 변경을 중단하고 조사 항목으로 남긴다.
2. **Harper 공고 보강:** 없는 공고 생성과 바뀐 공고 수정을 처리한다. 각 저장 뒤 DB readback 및 공개 URL을 확인한다. 실제 생성·수정된 건만 Notion `Data & Logs`에 기록한다.
3. **게시 대상 판단:** 홍보 가능한 모든 활성 Role에서 지금 LinkedIn에 올려야 할 Role을 판단한다. 아래 요소들을 종합해 현재 Open 공고를 유지·개선할 때와 새 공고를 게시·교체할 때 각각 어떤 인재 유입이 더 필요한지 살핀다. 그날은 아무 공고도 추가하지 않는 결론도 가능하다. 특정 요소 하나를 필수 우선순위나 할당량으로 삼지 않는다.
4. **성과와 실행 판단:** LinkedIn의 최근 조회·지원 시작 변화, 게시·재게시일, Harper 유입 이후의 결과를 해석해 유지·문구 수정·게시·교체 중 목적에 가장 도움이 되는 행동을 선택한다. `is_promote=false`, Role의 `paused`·`ended`·`deleted`·만료·테스트 전환은 성과 판단과 무관하게 LinkedIn 공고를 닫아야 하는 hard gate다. `ended`·`deleted`·만료·테스트 전환 또는 `is_promote=false`이면 해당 Harper 공고도 기존 Ops 저장 경로로 `is_published=false` 처리해 검색 엔진 갱신을 요청한다. 웹 공개 조건은 이 후속 작업 전에도 숨김을 적용한다. `paused` Role의 기존 Harper 공고는 현행 공개 의미를 유지한다.
5. **브라우저 실행:** LinkedIn 생성·수정·닫기는 로그인된 Recruiter의 브라우저 UI에서만 한다. Open·Close 전에는 위 **Project Owner 강제 조건**을 확인한다. 지원 링크는 해당 `/jobs/{slug}`로 연결하고 출처 식별용 UTM 또는 안정적인 job slug를 유지한다. Close 후 실제 Closed와 빈 슬롯을 확인하고, 새 게시 후 Job ID·Open 상태·지원 링크와 공개 미리보기를 확인한다. Recruiter에서는 같은 프로젝트에 공고를 여러 개 올려도 최신 공고만 구직자에게 보일 수 있으므로 프로젝트 연결과 공개 노출도 확인한다. 21/21 상태에서 교체하려면 새 공고 내용과 대상 URL을 먼저 준비한 뒤 기존 게시를 닫고 슬롯을 확인한다. 새 게시가 실패하면 종료된 Role이 아닌 한 기존 공고 복구 가능성을 확인하고 실패를 즉시 기록한다. CAPTCHA, 로그인, 권한, 화면 구조 변화는 추측 클릭으로 넘기지 않는다.
   한 번의 실행에서 Open과 Close는 합쳐 최대 6건으로 제한한다. 근거가 충분한 교체가 더 적으면 빈 한도를 채우기 위해 게시·종료하지 않는다.
6. **기록·알림:** 검증된 외부 행동 직후 `official_jobs.is_on_linkedin`을 실제 UI 상태와 맞추고, Notion에 하나의 행동 행을 기록한다. 같은 실행 키·행동·공고 ID를 재시도에서 먼저 조회해 중복 기록과 중복 게시를 막는다. 변경이 생긴 실행만 Harper Scouter로 `C0B2TFPUS6P`에 그날의 공고·행동·짧은 이유·근거 수치·링크를 **한 메시지로** 요약한다. Slack 실패는 LinkedIn 행동을 되돌리는 이유가 아니며 다음 실행의 전달 재시도 대상으로 남긴다. 아무 변경이 없으면 조용히 끝낸다.

## 슬롯 선택과 성과 판단

Codex는 **한정된 슬롯이 현재 채용 수요에 적합한 talent를 얼마나 더 데려올 수 있는지**를 판단한다. 아래는 함께 살필 요소이며, 순서·점수표·새 공고 할당량이 아니다. 직무 키워드나 단일 지표로 결론을 내리지 말고, 선택한 게시·유지·수정·종료가 목적에 어떻게 기여하는지와 판단의 불확실성을 간결하게 남긴다.

- **충족되지 않은 채용 수요:** 각 Role의 채용 시급성, 현재 유효하고 실제 추천 가능한 talent, 이미 소개되거나 검토 중인 인재, 추가 유입이 채용 가능성을 얼마나 높일지 본다. fit 행 개수만으로 공급이 충분하거나 부족하다고 단정하지 않는다.
- **한 공고가 담당할 수 있는 수요:** 비슷한 직무의 여러 Role에 유입 인재를 활용할 수 있는지 보되, 기술·시니어리티뿐 아니라 대상 시장·지역·근무 조건과 실제 talent 중복을 확인한다. 이름이 같은 직무라도 같은 인재 공급으로 해결되지 않을 수 있다.
- **새 게시의 기회:** 처음 올라가는 Role·직무·지역과 게시 직후 며칠의 노출 효과를 고려한다. 아직 게시되지 않았다는 사실만으로 우선하지 않고, 기존 Open 공고가 같은 수요를 얼마나 맡는지와 새 게시가 가져올 추가 인재의 가치를 함께 본다.
- **기존 공고의 기여와 개선 여지:** 지금 Open인 공고의 최근 조회·지원 시작 증가, 게시·재게시 경과, Harper 방문→가입→온보딩→추천 가능한 talent까지의 결과를 본다. 조회가 적으면 제목·위치·설명·직무 분류의 표현과 노출을, 조회 이후 이탈이 크면 지원 경로와 Harper 진입 경험을 검토한다. 기존 공고의 문구 수정이나 유지가 슬롯 교체보다 나을 수도 있다.
- **증거의 질과 운영 비용:** Recruiter Jobs 행·`See more`의 `Views`는 조회 신호이고 `Apply starters`는 지원 시작이다. `Views` 링크가 여는 프로젝트 리포트는 기본 `All jobs`일 수 있고 `Total apply clicks`는 `Apply starters`와 다르다. [화면 가이드](./linkedin-recruiter-jobs-ui-guide-ko.md)에 따라 공고와 기간을 좁혀서 읽는다. 둘 다 최종 지원·가입·온보딩·적합 인재가 아니다. 서로 다른 기간의 누적치나 출처가 불분명한 전환을 직접 비교하지 않고, 근거가 약하면 판단에 그 한계를 반영한다. 새 게시·수정 직후의 성과를 보기 전에 매일 바꾸는 비용도 고려한다.

`paused` 등 홍보 불가 상태의 LinkedIn 공고 종료는 위의 상대적 성과 판단과 별개로 처리한다. 실제 종료 전에 Job ID↔Role 매핑을 확인한다. 종료로 생긴 빈 슬롯에 무엇을 올릴지는 홍보 가능한 모든 활성 Role에서 다시 판단한다. 기존 공고와 대안의 추가 가치가 불분명하면 교체하지 않아도 된다. 정상 게시물은 보통 며칠 유지하며 초기 반응을 보되, 유지 기간이나 조회수에 일률적인 교체 기준을 두지 않는다. 잘못된 사실·링크·익명성 문제와 홍보 불가 상태는 즉시 바로잡는다.

**모든 Open LinkedIn Job ID에 대해 매일 한 개의 `metric_snapshot` 행을 남긴다.** `LinkedIn views`와 `Apply starters`는 그 Job ID의 누적 수치이며, `Occurred at`은 관측일이다. `Original posted at`과 `Reposted at`을 화면에서 확인할 수 있는 경우 기록한다. 직전 snapshot과의 차이가 관측 간 증가분이다. 별도 `Evidence and metrics`에는 실제 관측 시각, Open/Closed, Harper URL의 동일 출처 cohort별 방문·가입·온보딩 완료·적합 talent 수와 그 집계 기간을 명시한다. 서로 다른 사람이나 기간의 이벤트를 같은 퍼널 전환율로 나누지 않는다. 수치가 없으면 `확인 불가`로 기록한다. Snapshot만 쌓인 날에는 Slack을 보내지 않는다.

Harper 내부 지표는 기존 [Talent GTM Daily Slack Report](../talent-gtm-daily-slack-report-ko.md)의 `landing_logs`, `logs`, `talent_activity_events`, `official_job_events` 정의를 먼저 확인한다. 해당 직무의 공급은 `talent_opportunity_fit`과 실제 추천·회사 검토·연결 상태를 읽어 해석한다. 동일 인물이 여러 Role에 맞는 경우에는 중복을 제거한다. 소스가 다른 지표를 단순히 나누어 “전환율”로 표시하지 않는다.

## Notion과 Slack 계약

`Data & Logs`는 한 공고의 매 행동 및 매일의 LinkedIn 성과 스냅샷을 보존한다. Hojin 소유 새 공고를 Draft로 저장하면 `linkedin_draft_created`, 실제 Open은 `linkedin_opened`, Close는 `linkedin_closed`로 **서로 다른 행**에 기록한다. `Action`, `Occurred at`, `Official job ID`, `Role ID`, `LinkedIn job ID`, 두 URL, `Reason`, `Evidence and metrics`, `Verification`, `Run key`, `Slack URL`을 해당될 때 채운다. 원본과 복제본의 Job ID·Project ID·Owner와 본문·지원 링크 대조 결과를 두 행에 남긴다. Snapshot은 누적 조회·Apply starters 및 게시·재게시 날짜를 각각의 열에 넣는다. `Name`은 `YYYY-MM-DD · 행동 · 공고명` 형태다. Notion `Works`는 미해결 매핑, 익명성 검토, UI 장애처럼 다음 실행이 이어받을 작업만 쓴다. 원본 후보자 프로필·연락처·비공개 회사 정보는 두 DB와 Slack에 쓰지 않는다.

Slack 본문 예: `LinkedIn 공고 교체 · A 종료 → B 게시. B는 서울 디자인 Role 3건에 공통으로 필요한 인재 유입을 노리고, A는 7일 관측에서 가입 이후 적합 인재가 적었습니다. Recruiter 21/21, 두 Job ID와 Harper 링크 확인. [Notion 기록]`. 이 문장은 형식 예시일 뿐 실제 근거와 어조는 실행 시 Codex가 쓴다. 실제 게시·닫기 성공 전에는 성공형 알림을 보내지 않는다.

발송은 Codex가 실제 검증 결과를 요약해 권한 `0600`의 임시 UTF-8 파일에 저장한 뒤 `pnpm growth:linkedin-jobs-slack -- --message-file <절대 경로> --run-key <KST-실행일> --send`를 사용한다. `--send` 없이 실행하면 본문만 미리 볼 수 있다. 스크립트는 채널을 `C0B2TFPUS6P`로 고정하고 Slack `auth.test`의 발신 신원이 Harper Scouter인지 확인한다. 같은 run key의 발송 시도는 로컬 receipt로 차단한다. 실패가 모호하면 receipt와 실제 채널을 확인한 후 재시도하며 임시 본문 파일은 삭제한다. 성공 응답의 Slack URL을 해당 Notion 행동 행들에 쓴다.

## 시작 전 필수 작업과 실패 처리

- 2026-10-01 운영 DB에 schema migration을 적용하고 Indonesia/Thailand FDE, Deployment Strategist, Head of Partnerships 4개 Role의 `is_anonymous=true`를 확인했다. 웹 코드 배포 후 `/jobs` 공개 조건을 검증한다. 이 4개 공개 공고의 회사명·본문·로고·웹사이트·원본 회사명·공고 ID에 식별 단서가 없는지 웹 코드 배포 직후 다시 확인한다. `is_promote=false`, 실명→익명, Role 종료·테스트 전환 때 기존 공고가 자동 비공개되는지도 확인한다. Ops 저장 경로에서 테스트 Role·홍보 금지 Role의 게시를 막고, 익명 공고의 로고·회사 웹사이트·원본 회사명·외부 공고 ID를 허용하지 않는지도 확인한다. 익명 Role 표본의 원시 `official_jobs` 응답과 링크는 사람이 공개 문구까지 읽어 안전성을 확인한다. 이 문서만으로 배포·DB 적용을 대신하지 않는다.
- 첫 운영 run에서는 LinkedIn **게시·수정·종료 전에** inventory와 매핑을 끝낸다. 21개 Open Job ID, 대응 Harper 공고, 누락·중복, 대표적인 일별 성과 기준선을 확인해 Notion에 기록한 뒤에 교체한다. Harper 공고 준비는 독립적으로 진행할 수 있다. 현재 DB 표시와 Recruiter가 다르기 때문이다.
- Scheduled task는 08:00 KST, 중복 실행 방지용 날짜 run key로 한 번 실행하도록 구성한다. 작업이 완료되기 전 재실행되면 이미 검증된 행동을 다시 하지 않는다. UI 자동화가 막히면 Harper 공고 준비와 기록 등 독립 작업은 계속하고, LinkedIn 변경만 보류한다.
- Notion 또는 Slack 기록에 실패해도 실제 LinkedIn 상태가 우선이다. 다음 실행은 브라우저 상태를 먼저 재조회하고 누락된 로그·알림을 복구한다. 근거가 부족한 교체는 보류 사유와 필요한 데이터만 남긴다.

예약 prompt는 짧게 유지한다: “매일 08:00 KST에 `harper_beta/docs/scheduled/linkedin-jobs-marketplace-gtm-ko.md`와 그 문서가 지정한 필수 자료를 읽고, 현재 DB·LinkedIn Recruiter UI를 재조회한 뒤 런북의 GTM 작업을 수행한다. 실제 변경만 Notion과 Harper Scouter에 기록하고, 상태가 같으면 알리지 않는다. 실행 실패나 사용자 조치가 필요한 경우만 알려준다.” 이 prompt를 실제로 등록·활성화하기 전에 웹 코드가 배포되었는지 확인한다. DB migration은 2026-10-01 적용했다.

운영 판단을 바꾸려면 이 문서의 **슬롯 선택과 성과 판단** 및 필요하면 **매일 실행 순서**를 고친다. UI에서 확인한 사실과 반복적으로 쓸 작성법은 [운영 학습](./linkedin-jobs-marketplace-learnings-ko.md), Recruiter 클릭 경로는 [화면 가이드](./linkedin-recruiter-jobs-ui-guide-ko.md)에 쓴다. 개별 날짜의 수치·결정·철회는 Notion `Data & Logs`에 남긴다. 웹 노출·익명성의 강제 조건은 코드와 DB migration의 계약이므로 문서만 고쳐서 즉시 바뀌지 않는다.

## LinkedIn 근거

LinkedIn Recruiter는 Jobs 화면에서 게시·편집·종료·재게시와 성과 확인을 제공한다. LinkedIn은 Job Analytics의 조회·지원 관련 지표를 제공하지만, 계정별 화면의 `Apply starters`를 완료 지원으로 해석하면 안 된다. Recruiter 도움말에는 게시 후 30일 만료와 같은 프로젝트의 복수 공고 중 최신 공고만 노출될 수 있다는 제한이 있어 실행마다 실제 상태를 확인한다. 개인 계정 무료·유료 공고 규칙을 Harper Recruiter의 21개 계약 슬롯 규칙으로 혼용하지 않는다. [Recruiter 공고 관리](https://www.linkedin.com/help/recruiter/answer/a408338), [Recruiter 공고 작성](https://www.linkedin.com/help/linkedin/answer/a415043), [회사 페이지 연결](https://www.linkedin.com/help/recruiter/answer/a413257), [Recruiter Jobs 탭](https://www.linkedin.com/help/recruiter/answer/a407931), [Recruiter Job Analytics](https://www.linkedin.com/help/recruiter/answer/a520582).
