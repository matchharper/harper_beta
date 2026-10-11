# LinkedIn Job 입력 패킷 양식

이 파일은 **양식**이다. 게시·수정 대상마다 `harper_beta/.local/linkedin-jobs-gtm/posting-packets/<KST 실행일>-<행동>-<official_job_id>.md`에 복사해 실제 값을 채운다. `.local/`은 Git에서 제외된다. 같은 실행을 재시도할 때는 기존 패킷을 읽고 최신 출처와 대조한다. 입력값을 새로 생각해야 할 일이 없도록 **LinkedIn Recruiter 작성 화면을 열기 전에 모든 입력란과 본문 전문을 확정**한다. 소스와 판단 근거는 짧게, 실제 붙여 넣을 값은 정확히 쓴다.

## 출처와 게시 결정

- KST 실행일·run key:
- 행동: `new` / `copy` / `edit` / `reopen`
- Role ID / official job ID:
- 현재 Role 상태 / `is_promote` / `is_anonymous` / 테스트 여부:
- Role 및 official job의 `updated_at` 확인값:
- Harper 공개 공고 URL 및 상세·관심 표시 도착점 확인 결과:
- LinkedIn에 올리는 이유: 한두 문장. 공급 부족, 다른 Role에 미치는 효과, 기존 게시 성과 등의 실제 판단 근거만 적는다.
- 기존 LinkedIn Job ID·Project ID·상태(있으면):
- 같은 실행의 Close 대상·슬롯 계획(있으면):

## Recruiter에 입력할 확정값

| Recruiter 입력란 | 준비한 값 |
| --- | --- |
| Company 자동완성 결과 | Harper |
| Job title 전체 | `<Role title> at <공개가 허용된 회사명>` |
| Job title 자동완성에서 먼저 선택할 표준 직함 |  |
| Seniority level |  |
| Employment type |  |
| Workplace type |  |
| Job location 자동완성 선택값 |  |
| Compensation: 통화·금액·주기 | 검증된 금액이 없으면 `비움` |
| Additional compensation | 검증된 항목이 없으면 `비움` |
| Profile 선택 | Hojin KIM |
| Show profile on the job post | `표시` / `숨김` |
| Application method | External application URL |
| External application URL | 검증된 `https://matchharper.com/jobs/<official_job_id>` |
| Employer job ID | official job ID. 필요하지 않다면 `비움` |
| Project | `새 프로젝트` / `기존 Hojin KIM 소유 프로젝트` |
| 새 Project 이름 또는 기존 Project ID |  |
| Screening questions | External URL 방식이면 `해당 없음` |

`Job title`은 표준 직함을 자동완성에서 선택한 뒤 키보드로 전체 제목을 완성한다. `Company`는 Harper를 검색해 실제 자동완성 결과를 선택한다. 기존 Job의 `Copy job`이라면 원본·새 입력값의 차이와 이유를 이 패킷에 적는다. **Open·Close 직전 Project settings의 Owner `Hojin KIM`을 UI에서 다시 확인한다.**

## LinkedIn Job description — 아래 본문 전체를 그대로 입력

```text
회사 소개, 역할, 주요 업무, 자격 요건, 우대 사항, 근무 조건 등을 검증된 사실에 맞게 완성한다.
```

본문에 Harper 내부 지원·공유·검토 절차나 Harper 팀원의 최종 확인을 쓰지 않는다. `matchharper.com/jobs` 링크와 Harper로 이동하라는 문구는 본문에서 빼고 위 `External application URL`에만 둔다. 익명 Role은 **이 문서 자체에도** 실제 회사명·도메인·로고·식별 단서를 쓰지 않는다. 각 선택 필드의 빈칸은 게시 전 실제 값 또는 `비움`으로 바꾼다.

## 타깃 기준과 화면 검증

- LinkedIn `Enhance your job`에서 기대하는 핵심 기준: 게시 전 미리 2~5개 작성한다. 자동 생성 결과를 그대로 따르지 않고 의미가 맞는지 비교·수정한다.
  1.
  2.
- 브라우저에서 확인할 것: 현재 Open/슬롯, Draft 저장 제목 전체, Project Owner, Company·본문·근무지·지원 URL 미리보기, Open 후 Job ID·실제 상태. 익명이라면 공개 화면과 Harper 도착점의 식별 단서 부재.

## 실행 결과 — 브라우저 작업 후 기록

- Draft Job ID / Project ID / 저장 제목:
- Project Owner 확인 시각·표시:
- Open 또는 수정 결과 / 실제 LinkedIn URL / 슬롯:
- 패킷과 달라져 **브라우저 입력 전에 문서에서 먼저 수정한 값**:
- Notion `Data & Logs` 행동 행 URL / Harper Scouter Slack URL:
- 막힌 경우 남은 단계와 현재 Recruiter 상태:
