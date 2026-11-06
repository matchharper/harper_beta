# 채용 공고 수집 및 업데이트

이 문서는 추천 후보가 되는 외부 채용 공고를 수집하고 최신화하는 현재 운영 구조를 설명한다.

## 책임 분리

채용 공고 수집은 별도 AWS collection 서비스가 담당한다. 실행·예약 정본은
[data_sc AWS 운영 문서](../../data_sc/deploy/README.md)다. 2026-11-06 확인한
운영 release는 `26e0303-collection-20261103-64a216585965`다.

`harper_worker/opportunity_worker.py`는 더 이상 다음 작업을 하지 않는다.

- 24시간마다 ingestion run 생성
- `opportunity_ingestion_run` claim 또는 처리
- 회사 career 페이지 직접 순회
- 수동 ingestion run 생성 또는 실행

opportunity worker는 `opportunity_discovery_run` 처리와 유저별 추천 스케줄링만 담당한다.

## 현재 수집 흐름

1. AWS의 Zighang, LinkedIn, VC 수집 timer가 정기 실행된다.
2. 각 수집기가 신규·변경 공고 또는 VC 포트폴리오 회사를 가져온다.
3. 공고를 Harper의 회사와 role 구조로 정규화한다.
4. 신규 공고는 `company_roles`에 추가하고 기존 공고는 갱신한다.
5. 실행 결과를 `opportunity_ingestion_run`에 기록한다.

GitHub 수집 workflow는 비활성화되어 있다. 옛 Zighang watchdog을 현재 수집
스케줄러로 사용하지 않는다.

### 2026-11-06 로컬 구현: 저장 전 급여 추정 (미배포)

수집한 최종 공고 데이터로 급여가 없는 신규·변경 공고를 묶음 추정하고,
같은 공고 저장에 연간 KRW 추정값을 포함한다. 기존 공개 급여와 변경되지
않은 추정값은 재사용한다. 회사 맥락은 묶음 안에서 한 번만 읽고 모델에
제공하며, 10개 공고씩 최대 4개 요청을 병렬 처리한다. 실패 시 원본 공고는
계속 저장한다. 상세 계약과 배포 선행 migration은
[수집 급여 추정 문서](../../data_sc/jobpostings/salary_estimation.md)에 있다.

Career 검색도 검색된 급여 미상 공고에 기존 `fillExternalRoleSalaries`를
호출하고 실행 metrics에 결과를 남기도록 연결했다. 검색 단계에서 채운 값은
이후 검색의 급여 가중치에 사용하며, 적합성 평가나 공개 카드에는 추정값을
노출하지 않는다. 이 문단의 코드·migration은 아직 운영에 적용하지 않았다.

## 핵심 테이블

### `company_roles`

추천 가능한 채용 공고의 최종 저장소다. 유저별 discovery는 이 테이블을 조회해 추천 후보를 만든다.

### `company_workspace`

공고가 속한 회사 정보다.

### `opportunity_ingestion_run`

수집기의 실행 상태와 결과를 기록한다. 대표적으로 다음 정보를 확인할 수 있다.

- 수집 provider (`zighang`, `linkedin_jobs`, `vc_portfolio`, `vc_jobs`)
- 실행 상태
- 확인·추가·갱신한 공고 수
- 부분 성공 또는 실패 사유
- 수집 범위와 checkpoint
- 실행 환경, revision, run ID와 실행 기록 (과거 GitHub workflow metadata 포함)

LinkedIn과 VC jobs는 상위 실행 행 하나 아래에 회사별 상세
`jobposting_crawl_log`를 연결한다. `vc_portfolio`는 VC 목록과 회사별 수집
소스를 갱신하는 주간 작업이고, `vc_jobs`는 선택된 소스에서 실제 공고를
가져와 추가·갱신·종료하는 일간 작업이다.

이 테이블은 opportunity worker가 소비하는 큐가 아니다.

## 수동 실행

수동 수집은 AWS 운영 문서의 collection 서비스와 공통 잠금을 따른다.
삭제된 Harper worker ingestion CLI나 내부 enqueue endpoint를 사용하지 않는다.

## 추천과의 관계

수집과 추천은 분리되어 있다.

```text
AWS collection 수집기
  -> company_roles 갱신
  -> opportunity_ingestion_run 결과 기록

opportunity worker
  -> opportunity_discovery_run 처리
  -> company_roles에서 유저에게 맞는 공고 선택
  -> 추천 전달
```

ingestion run 자체는 유저에게 메일을 보내거나 추천을 생성하지 않는다.
