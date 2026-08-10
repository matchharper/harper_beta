# 채용 공고 수집 및 업데이트

이 문서는 추천 후보가 되는 외부 채용 공고를 수집하고 최신화하는 현재 운영 구조를 설명한다.

## 책임 분리

채용 공고 수집은 별도 GitHub Actions 수집기만 담당한다.

`harper_worker/opportunity_worker.py`는 더 이상 다음 작업을 하지 않는다.

- 24시간마다 ingestion run 생성
- `opportunity_ingestion_run` claim 또는 처리
- 회사 career 페이지 직접 순회
- 수동 ingestion run 생성 또는 실행

opportunity worker는 `opportunity_discovery_run` 처리와 유저별 추천 스케줄링만 담당한다.

## 현재 수집 흐름

1. GitHub Actions의 Zighang, LinkedIn, VC 수집 workflow가 정기 실행된다.
2. 각 수집기가 신규·변경 공고 또는 VC 포트폴리오 회사를 가져온다.
3. 공고를 Harper의 회사와 role 구조로 정규화한다.
4. 신규 공고는 `company_roles`에 추가하고 기존 공고는 갱신한다.
5. 실행 결과를 `opportunity_ingestion_run`에 기록한다.

`harper_beta`의 Zighang watchdog은 예정된 수집 실행이 보이지 않거나 실패한 경우 GitHub workflow를 다시 dispatch하는 안전장치다.

## 핵심 테이블

### `company_roles`

추천 가능한 채용 공고의 최종 저장소다. 유저별 discovery는 이 테이블을 조회해 추천 후보를 만든다.

### `company_workspace`

공고가 속한 회사 정보다.

### `opportunity_ingestion_run`

GitHub Actions 수집기의 실행 상태와 결과를 기록한다. 대표적으로 다음 정보를 확인할 수 있다.

- 수집 provider (`zighang`, `linkedin_jobs`, `vc_portfolio`, `vc_jobs`)
- 실행 상태
- 확인·추가·갱신한 공고 수
- 부분 성공 또는 실패 사유
- 수집 범위와 checkpoint
- GitHub workflow 이름, run ID, attempt, 실행 링크

LinkedIn과 VC jobs는 상위 실행 행 하나 아래에 회사별 상세
`jobposting_crawl_log`를 연결한다. `vc_portfolio`는 VC 목록과 회사별 수집
소스를 갱신하는 주간 작업이고, `vc_jobs`는 선택된 소스에서 실제 공고를
가져와 추가·갱신·종료하는 일간 작업이다.

이 테이블은 opportunity worker가 소비하는 큐가 아니다.

## 수동 실행

수동 수집이 필요하면 GitHub Actions의 Zighang workflow를 `workflow_dispatch`로 실행한다. 삭제된 Harper worker ingestion CLI나 내부 enqueue endpoint를 사용하지 않는다.

## 추천과의 관계

수집과 추천은 분리되어 있다.

```text
GitHub Actions 수집기
  -> company_roles 갱신
  -> opportunity_ingestion_run 결과 기록

opportunity worker
  -> opportunity_discovery_run 처리
  -> company_roles에서 유저에게 맞는 공고 선택
  -> 추천 전달
```

ingestion run 자체는 유저에게 메일을 보내거나 추천을 생성하지 않는다.
