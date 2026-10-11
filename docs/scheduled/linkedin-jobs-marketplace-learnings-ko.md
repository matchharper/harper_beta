# LinkedIn Jobs 운영 학습

문서 기준: 2026-10-07. 이 파일은 Scheduled Codex가 매번 읽는 **검증된 운영 메모**다. 사실·가설·아직 모르는 것을 구분하고, 새 관측을 추가할 때 날짜·근거·적용 범위를 쓴다. 일일 숫자와 개별 행동은 [Notion Data & Logs](https://app.notion.com/p/3eb7277d26df80f7924adf6a59ad6d66)에 둔다.

## 현재 확인된 사실

- 2026-09-30 로그인된 Harper-Recruiter의 Jobs 화면은 `21 of 21 job slots in use`, Open 21건, Closed 36건을 표시했다. 현재 계약 슬롯 수는 매 실행에 화면에서 다시 확인한다.
- 같은 날 DB의 `official_jobs.is_on_linkedin=true`는 처음에 23건이었다. Recruiter Open 21건에 없는 Agent Strategist와 Enterprise Sales Engineer 두 행을 `false`로 정정해 21건으로 맞췄다. 건수 일치만으로 개별 Job ID 매핑이 검증된 것은 아니다. 실제 Open 상태의 정본은 계속 Recruiter 화면이다.
- 2026-09-30 수동 실행에서 채용 중인 Role 6건에 Harper 공고를 처음 게시했다. NARWHAL PROJECT의 Junior/Senior Product Engineer 2건과 익명 회사의 Indonesia/Thailand FDE, Deployment Strategist, Head of Partnerships 4건이다. 공개 URL·익명성을 확인했고 LinkedIn 게시물은 변경하지 않았다. 개별 기록은 Notion에 있다. 당시 추가한 Harper 절차 설명은 2026-10-01 사용자 지시에 따라 제거했다.
- 2026-10-01 `is_promote` 기본 `true`, `is_anonymous` 기본 `false`인 운영 DB migration을 적용했다. 위 익명 Role 4건은 `is_anonymous=true`로 이관했고 두 트리거와 공개 익명 공고 4건의 외부 식별 필드 부재를 확인했다. 웹 코드와 예약 실행은 아직 배포·활성화되지 않았다.
- 같은 실행에서 회사·Role 원본보다 오래된 공개 공고 14건의 역할·위치·회사 설명을 고쳤다. 당시 추가한 Harper 연결 절차 설명은 2026-10-01 사용자 지시에 따라 제거했다. `ended` Role의 기존 공개 공고 1건은 DB에서 비공개로 바꾸고 상세 URL의 404를 확인했다. 날짜 비교는 검토 대상 선정에만 사용했고, 사실 변경 여부는 원본 JD·회사 설명과 공개 문구를 직접 비교했다. 과거 slug는 기존 유입 링크 보존을 위해 유지했다.
- 같은 날 현재 Open인 Korea FDE 공고 두 건(Job ID `4469419542`, `4468706677`)은 원 게시일과 별개로 **9/30 재게시**된 상태였다. 누적 조회·Apply starters만 보고 당일 교체하면 재게시 효과를 관찰할 기회를 잃는다.
- Harper Founding Engineer의 LinkedIn Job ID `4465498451`도 원 게시일은 9/14, 재게시일은 9/30이었다. 10/1 상세 화면에서 이를 재확인했다. 기존 교체안은 이 직후 관측 기간까지 대조하지 못했다.
- Thailand FDE의 추천 fit은 2명(온보딩 완료 1명), Indonesia FDE는 3명(온보딩 완료 2명)이었다. 각 지역의 Site CTO fit과 겹치는 talent는 0명이었다. fit 행은 실제 소개 가능 인재 수가 아니므로 채용 공급의 확정 수치로 쓰지 않는다.
- 2026-10-01 `Harper Founding Engineer 종료 → Thailand FDE 게시`라는 초안은 사용자 피드백으로 철회했다. `paused` Role의 LinkedIn 공고를 종료 대상으로 본 규칙은 맞다. 문제는 그 빈 슬롯의 게시 대상을 적은 fit 행과 일부 공고만 보고 정한 것이다. 21개 Open 공고의 정확한 Role 매핑·최근 같은 기간 유입·대체 게시의 추가 효과도 충분히 대조하지 못했다. 철회 기록과 정정 알림은 Notion에 남겼다. 이 초안을 다음 실행의 추천으로 재사용하지 않는다.
- 이 초안은 9/22 새로 등록된 NARWHAL PROJECT의 Junior/Senior Product Engineer 두 Role을 LinkedIn 후보로 올리지 않았고, 다른 신규 Harper 공고와 서울 Marketing Manager·퍼포먼스 마케터도 전체 후보로 비교하지 않았다. Thailand FDE 한 건만 새 게시 대상으로 제안했다. 일부 FDE와 종료 후보만 살펴봐서 전체 활성 Role 중 어떤 게시가 현재 채용 수요에 가장 도움이 되는지 판단하지 못한 것이 원인이다. 새 게시의 초기 효과와 Marketer 공급 문제도 놓쳤다. 이후 실행은 홍보 가능한 모든 활성 Role에서 올릴 Role을 판단하고, 새 공고의 효과를 여러 요소 중 하나로 다룬다.
- NARWHAL PROJECT의 Junior/Senior Product Engineer는 둘 다 2026-09-22 등록된 active Role이고 9/30 Harper 공고를 공개했지만 LinkedIn에는 아직 없다. 추천 fit은 각각 23명(온보딩 완료 18명), 29명(24명)이고 두 Role의 fit 교집합은 0명이다. 따라서 한 직함만 노출해도 두 역할에 같은 talent가 유입된다고 가정할 근거가 없다.
- 2026-10-01 Marketing Manager는 Harper 공고가 있지만 LinkedIn Open은 없고 추천 fit 20명 중 온보딩 완료는 13명이다. 퍼포먼스 마케터는 LinkedIn Open이 있지만 추천 fit 3명 중 온보딩 완료는 2명이며, 2026-09-30 스냅샷은 123 Views·2 Apply starters였다. 두 Role의 추천 fit 인재 교집합은 1명뿐이다. 전자는 북미 대상 정규직·현장 근무, 후자는 한국 대상 파트타임·하이브리드여서 기존 한 공고가 두 수요를 모두 맡는다고 가정할 수 없다. fit 행은 실제 소개 가능 인재 수나 채용 성과를 보증하지 않는다.
- Recruiter 목록은 공고별 누적 `Views`, `Apply starters`, 원 게시일을 보여준다. `See more`의 Job details에는 Job ID와 현재 게시물만의 조회·지원 시작 수가 나오며 이전 게시물 수치는 포함하지 않는다고 적혀 있다. 공고 상세 화면은 재게시일도 보여줄 수 있다. 목록에서 `(N new)`를 일별 Apply 수로 단정하지 않는다.
- 2026-10-01 `Views`에서 연 프로젝트 리포트는 기본 `All jobs (2)`로 현재 Open과 과거 Closed 게시물을 합쳤다. `Job data in view`를 현재 Open 공고 하나로 바꾸면 기간도 그 공고에 맞게 달라졌다. `Total apply clicks`는 Jobs의 `Apply starters`와 다른 지표다. 같은 공고를 고른 뒤에도 `See more`와 리포트의 조회 숫자가 달랐으므로 화면·기간·관측 시각을 구분하고 차이 원인을 추정하지 않는다. [화면 가이드](./linkedin-recruiter-jobs-ui-guide-ko.md)를 따른다.
- 같은 Recruiter 상세 화면에서 공고의 `Apply starters`는 6, 프로젝트 사이드바의 수는 14로 달랐다. 공고 성과 판단에는 해당 **Job ID의 지표**만 쓰고 프로젝트 합계를 섞지 않는다. 원 게시일과 재게시일이 다를 수도 있어 게시 경과일 계산에 둘 다 보존한다.
- 2026-10-01 사용자 지시: 공개 채용 공고에는 Harper의 내부 지원·공유·검토·연결 절차를 설명하는 섹션을 넣지 않는다. 특히 Harper 팀원의 최종 확인을 언급하지 않는다. 회사가 실제로 제공한 면접 단계는 채용 정보로 남길 수 있다. 이날 새로 만든 공고 6건과 이전 실행에서 수정한 공고 14건에서 해당 Harper 절차 섹션을 제거했다. 익명 회사 공고 4건의 회사 소개와 역할 설명에 있던, 회사명 공개 시점을 Harper의 소개 절차와 연결한 문장도 제거했다. 예전 공고의 `Process` 문구는 새 공고 작성의 참고 양식으로 사용하지 않는다.
- 2026-10-01 Recruiter의 `Copy job`은 원본 Job의 제목·본문·본문 링크·주요 입력 필드를 채운 새 작성 화면을 열었다. `Save to new project`에서 원본과 같은 프로젝트 이름을 쓰고 `Save a draft`를 누르면 **새 Project ID와 Job ID**가 만들어지며 슬롯은 차지하지 않았다. Mistral 4건에서 원본과 Draft의 본문 텍스트·본문 링크 URL, 프로젝트 이름·설명·제목·위치·시니어리티가 각각 일치했다. 새 프로젝트의 Owner는 모두 `Hojin KIM`이고 Job 작성 화면의 Profile도 현재 계정으로 자동 바뀌었다. 원본 Chris 소유 4건은 사용자의 직접 지시에 따른 일회성 예외로 종료했으며 Recruiter는 Open 17/21·Draft 4·Closed 40으로 표시했다. 이후 Owner 조건은 [운영 계약](./linkedin-jobs-marketplace-gtm-ko.md)의 강제 조건을 따른다. 개별 원본·복제 ID와 행동은 Notion에 기록했다.
- 2026-10-03 재검토에서 앞서 추천했던 서울 Marketing Manager는 10/2 `paused`로 바뀐 것이 확인되어 게시 후보에서 제외했다. 같은 기간 새로운 활성 Role 3건이 등록되었다. 과거 추천을 다음 실행에 그대로 넘기지 말고 Role 상태와 새 수요를 다시 읽어야 한다. Recruiter는 다시 슬롯이 모두 사용 중이었다. 이때 Open 대상 4건을 정하더라도 한 실행의 Open·Close 합계 최대 6건을 지키려면 게시 작업을 나눠야 한다.
- 2026-10-03 새 `official_jobs` 3건의 공개 상세를 확인했을 때 `company_description_markdown`만으로는 회사 소개가 공고의 본문에 보이지 않았다. 회사 소개를 `role_description_markdown`에도 넣은 뒤 `/jobs` 목록·상세와 지원 링크에서 노출을 확인했다. 두 필드에 같은 사실을 넣더라도 공개 본문에 Harper 내부 절차를 복제하지 않는다.
- LinkedIn의 [Recruiter 작성 도움말](https://www.linkedin.com/help/linkedin/answer/a415043)은 같은 프로젝트에 공고를 여러 개 올려도 최신 공고만 구직자에게 보일 수 있고 공고가 30일 후 만료된다고 설명한다. 실제 Harper 계정의 프로젝트 관계·만료일·공개 화면은 매번 확인해야 한다.
- LinkedIn의 [회사 페이지 연결 안내](https://www.linkedin.com/help/recruiter/answer/a413257)에 따르면 `Company` 자동완성에서 회사를 선택하면 해당 회사 페이지에 공고가 연결된다. 익명 Role에 실제 채용 회사 페이지를 선택하면 익명성이 깨질 수 있다. 2026-10-06 작성 화면에서 Harper를 선택한 세 공고는 미리보기와 실제 Open 화면에서 Company가 Harper로 표시되었다. 이는 해당 계정 UI에서의 게시 결과이며 정책 해석까지 검증한 것은 아니다.
- 2026-10-06에는 익명 역할 3건을 Recruiter의 새 Hojin KIM 소유 프로젝트에서 Draft로 저장한 뒤 Open했다. `Company` 자동완성에서 Harper를 고르고 공개 미리보기·Open 상세에서 모두 Harper 표기를 확인했다. 프로젝트 Owner는 게시 전 `Project settings → Project members`에서 각각 확인했다. 회사명을 감추는 범위는 LinkedIn 제목·본문·Company뿐 아니라 Harper 공고의 회사명·본문·slug·로고·회사 URL·원본 회사명 및 관심 표시 링크까지다. 기존 실명 Harper 공고를 익명으로 바꿀 때 `is_anonymous=true`가 먼저 공고를 비공개로 돌리므로, 문구와 링크를 고친 뒤 공개 상태를 재확인했다. 회사명이 들어 있던 slug는 익명 slug로 바꾸고 LinkedIn 지원 URL은 안정적인 `/jobs/{official_job_id}`를 사용했다. 개별 ID와 행동은 Notion에 있다.
- 같은 날 LinkedIn 작성 화면에서 표준 직함 제안에 `Junior Product Engineer`가 없어 `Product Engineer`를 선택하고 본문 첫 줄에 Junior와 경력 1–3년을 명시했다. `AI Researcher`는 `Artificial Intelligence Researcher`로 제안되었다. 한국어 JD에서 자동 생성된 targeting criteria 2개는 일본어·한국어가 뒤섞여 의미가 잘못되어, 게시 전 모델 학습·평가와 AI 실험 기준으로 고치고 에이전트 의사결정 모델 기준을 추가했다. 이 기준은 지원자에게 보이지 않아도 실제 타겟팅에 영향을 줄 수 있으므로 생성 결과를 항상 읽고 고친다.
- 2026-10-06 사용자 피드백에 따라 위 익명 LinkedIn 공고 3건의 본문 끝에 넣었던 Harper 이동 안내 문구와 `/jobs/{id}` URL을 제거했다. 지원 목적 URL은 별도 `External application URL` 필드에 그대로 두었다. 앞으로 LinkedIn description에는 이런 중복 안내와 URL을 넣지 않고, 저장 후 공개 본문을 확인한다. 개별 편집 이력은 Notion에 기록한다.
- 2026-10-07 사용자 지시로 LinkedIn 공고 제목은 항상 `Role title at {company name}` 형식을 쓴다. 실제 회사명이 공개 허용된 Role은 대외 회사명을, 익명 Role은 회사를 식별하지 않는 검증된 공개용 이름을 넣는다. Recruiter에서 제목 전체를 새 입력란에 바로 쓰면 표준 직함 선택을 요구할 수 있고, 자동완성 직함을 선택한 뒤 입력란 전체를 `fill`로 바꾸면 저장 시 표준 직함만 남은 사례가 있었다. 표준 직함을 선택한 다음 **키보드 입력으로** 제목을 완성하고, Preview보다 `Jobs → Draft`의 저장된 제목과 Open 상세의 제목을 정본으로 확인한다. 가우디오랩·vooy·NARWHAL PROJECT에서 이 방식으로 정확한 전체 제목을 저장·게시했다.
- 2026-10-07 사용자가 vooy 프로덕트 디자이너와 NARWHAL PROJECT 주니어 엔지니어의 회사명 공개 및 익명 설정 해제를 명시했다. 두 Role의 `is_anonymous=false`와 Harper 공고의 실제 회사명·웹사이트·로고를 운영 DB에서 확인했다. vooy의 `published_name`은 설명형 별칭이므로 실명 공개 시 제목에 자동 사용하면 사용자의 지시와 달라진다. LinkedIn에서는 과거 익명 Closed 원본을 재게시하지 않고, Hojin KIM 소유 새 프로젝트에 각각 실명 제목의 Job을 만들어 Open했다. 가우디오랩도 새 Hojin KIM 소유 프로젝트에서 게시했다. 세 Open Job ID와 이유는 Notion `Data & Logs`에 남겼다.
- 2026-10-07 익명 로보틱스 Role은 `is_anonymous=true`로 바꾸고 Harper 공고의 회사명·설명·slug·로고·회사 URL·원본 회사명을 공개용 비식별 정보로 고친 후 공개 상세에 회사 식별 단서가 없는지 확인했다. LinkedIn 새 Job의 제목은 `Head of Robotics Systems at Robotics AI Company`, Company는 Harper, 프로젝트명도 비식별 이름이다. Project settings에서 `Hojin KIM · Owner`를 확인하고, Preview에서 제목·회사·본문을 대조한 뒤 Job ID `4475409503`을 Open했다. 게시 후 Recruiter Jobs는 Open 21/21 슬롯으로 표시했다. 입력 패킷은 `.local/linkedin-jobs-gtm/posting-packets/`에, 행동 ID와 이유는 Notion `Data & Logs`에 남겼다.

## 검증할 가설

- 새 게시의 첫 며칠에 유입이 늘 수 있다는 운영 경험은 유용한 판단 요소다. 날짜별 조회와 후속 전환을 직무·지역·요일별로 관찰하되, 게시 여부는 현재 수요·기존 공고의 기여·여러 Role로의 파급과 함께 판단한다.
- 비슷한 직무의 한 공고가 여러 Role의 인재 부족을 해결할 수 있다. 실제 온보딩 talent가 여러 Role에 추천 가능한지 확인해야 하며, 조회수만으로 파급을 주장하지 않는다.
- 제목·위치·설명 조정은 낮은 조회 또는 낮은 지원 시작률을 개선할 수 있다. 변경 전후를 비교할 수 있을 만큼 관찰하고, 바뀐 요소가 여러 개라면 효과의 원인을 단정하지 않는다.

## 처음 운영할 때 채울 내용

- 21개 Open LinkedIn Job ID ↔ `official_jobs.id` ↔ `company_roles.role_id`의 검증된 매핑과 누락/중복. 개별 ID는 Notion에 보관한다.
- 직무·지역·게시 경과일별 일일 조회 증가와 Apply starters 증가 기준선. 표본이 적으면 정량 기준을 만들지 않는다.
- Harper 유입에서 onboarding 및 추천 가능 talent까지의 동일 cohort 정의와 attribution 누락률.
- 익명 공고의 대외 회사명·제목·설명에서 실제 회사를 추정할 수 있는 단서 점검 결과.
