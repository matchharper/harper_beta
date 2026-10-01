# LinkedIn Recruiter Jobs 화면 읽기

문서 기준: 2026-10-01. Harper-Recruiter 계정에서 직접 확인한 화면 기준이다. UI가 달라지면 화면을 다시 확인하고 이 문서를 고친다.

1. LinkedIn Recruiter의 **Jobs**를 연다. 위쪽의 `n of n job slots in use`와 왼쪽 `Job status → Open` 건수를 확인한다. `Open` 필터를 선택하고 모든 페이지를 넘겨 실제 사용 중인 공고를 센다. 2026-10-01에는 21/21 슬롯, Open 21건이 보였다.
2. 각 행에는 공고명·상태·원 게시일·`Views`·`Apply starters`가 보인다. 공고명을 열면 URL의 `jobId`로 LinkedIn 공고를 식별할 수 있다. 동일 직무의 재게시 공고가 있을 수 있으므로 제목만으로 매핑하지 않는다.
3. 행의 **See more**를 누르면 `Job details` 패널이 열린다. 여기서 LinkedIn Job ID와 해당 **현재 공고**의 조회·지원 시작 수를 확인한다. 패널은 이전에 게시했던 공고의 성과를 포함하지 않는다고 명시한다. 이 수치를 현재 공고의 일일 스냅샷 정본으로 쓴다.
4. 행의 **Views** 숫자 또는 패널의 **View reporting**을 누르면 별도 프로젝트 리포트가 열린다. 기본 `Job data in view`가 `All jobs`일 수 있어 과거 Closed 공고의 수치까지 합쳐진다. 해당 공고를 선택하고 `Date range`도 확인한 후 날짜별 조회 흐름을 읽는다. 리포트의 `Total apply clicks`는 Jobs 행의 `Apply starters`와 다른 지표다. 합치거나 같은 전환율의 분자로 쓰지 않는다. 같은 공고를 선택해도 패널과 리포트 수치가 다를 수 있으므로 화면·기간·관측 시각을 함께 적고 원인을 추정하지 않는다.
5. Notion [Linkedin Jobs Postings](https://app.notion.com/p/3ea7277d26df80f08414ea5ee89f2687)의 `Data & Logs`에 **Open Job ID마다 하루 한 행**의 `metric_snapshot`을 남긴다. 관측 시각, Job ID, 현재 공고의 누적 `Views`·`Apply starters`, 확인 가능한 원 게시일·재게시일, Harper 공고 ID/URL을 채운다. 리포트의 날짜별 조회·apply click을 판단 근거로 썼다면 선택한 공고와 기간, 그 수치를 `Evidence and metrics`에 별도로 적는다. 전일과 같은 Job ID·같은 화면 정의의 수치만 빼서 증가분을 계산한다.

`(N new)`의 의미와 새 게시·재게시 후 지표 집계 범위는 화면 표시만으로 단정하지 않는다. 후보자 이름·프로필·연락처는 Notion에 옮기지 않는다.

## Project Owner 확인과 기존 공고 복사

- Job 행의 `Project`를 열어 `Project settings → Project members`로 간다. 이름 옆의 **Owner** 표시를 읽는다. Job poster 또는 Hiring Project Creator 표시만으로 Owner를 추정하지 않는다. **Open·Close는 Owner가 Hojin Kim(UI에서는 `Hojin KIM`)인 프로젝트의 Job에만 수행한다.** 다른 팀원 소유의 Open Job을 닫아야 하면 `Reassign owner`로 Hojin Kim에게 이전하고 Owner 표시를 다시 확인한 후 Close한다. 2026-10-01 Chris 소유 Mistral 원본 4건 종료는 사용자의 직접 지시로 수행한 일회성 예외다.
- 다른 팀원 소유의 Closed Job을 다시 쓰려면 Jobs 행의 점 세 개 메뉴에서 `Copy job`을 누른다. LinkedIn은 원본 제목·본문·위치·근무 방식·고용 형태·시니어리티·지원 URL 등을 채운 새 작성 화면을 연다. `Save to new project`로 새 프로젝트를 만들고 `Save a draft`를 누른다. 새 Job ID와 Project ID가 생긴 뒤 프로젝트 설정의 Owner가 Hojin KIM인지 확인한다. 원본과 복사본의 내용·metadata·지원 링크를 대조한 후, 실제 게시가 결정된 경우에만 **새 복사본**을 Open한다. 복사 양식의 Profile은 현재 계정으로 자동 바뀔 수 있으므로 표시 설정도 확인한다. 원본의 `Repost`를 사용하지 않는다.
- Draft는 Open 슬롯을 차지하지 않는다. Draft 저장 후 Jobs의 `Draft` 필터와 새 공고 편집 URL을 확인한다. 닫은 원본은 Job 상세의 `Closed` 상태와 날짜를 확인하고, 새 복사본은 `Draft`를 유지한다.
