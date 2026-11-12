# web_search Exa 실행 기록

공통 `runWebSearch`가 처리하는 Exa 검색마다 기존 `public.logs`에
`type = 'web_search_exa'` 행을 기록한다. 이 문서는 구현 계약이며 운영 배포 완료 기록이 아니다.
별도 migration은 필요하지 않다. `open_url`, 회사 snapshot 등 `web_search` 밖의 Exa 호출은 대상이 아니다.

`meta_data`의 주요 필드:

- `parameters`: 정규화한 query, numResults, type, contents, 선택적 outputSchema를 포함한 Exa 요청 본문. SDK에 넘기는 동일한 값을 저장하며 API 키/헤더는 저장하지 않는다.
- `attribution`: 서버가 제공한 source, channel, 사용자/대화/원문 메시지 ID, requestId, 정기·백그라운드 run ID와 trigger, reply/work ID, 회사 workspace/Role/run ID. 호출 경로에 존재하는 값만 기록한다.
- `providerRequestId`, `costUsd`, `costDollars`: Exa 응답의 requestId, 총비용과 원본 비용 내역. `costStatus = 'provider_reported'`이면 응답에 수치가 있었고, 없으면 `unknown`/NULL이다. 실패나 누락을 무료 호출로 간주하지 않는다.
- `executionId`, `startedAt`, `completedAt`, `durationMs`, `status`, `resultCount`, `resolvedSearchType`, `error`, `environment`, `deploymentId`: 실행 및 배포 사실. 비용 기록은 문서 캐시 저장 전에 남기므로 이후 캐시 저장 실패와 분리된다.

경로는 `career/tool`, `career/background`, `career/simulation`, `org/agent`,
`org/role-research-preview`, `org/role-research-delivery`다. Career 대화·음성의 세부 경로는
channel과 sourceMessageId로, 정기 실행은 backgroundTrigger로 구분한다.
예전 실행을 이어받아 trigger가 없는 경우에도 backgroundRunId로 `opportunity_discovery_run`을 조회할 수 있다.

검색이 끝나면 DB 쓰기를 즉시 비동기로 시작한다. 검색 도구는 이를 await하지 않고,
Next `after`에 같은 promise를 등록해 정상적인 응답 종료 후에도 완료까지 실행한다.
DB 실패는 `[web-search-log]`와 executionId로 서버에 남기며 검색을 실패 처리하거나 재호출하지 않는다.
프로세스 강제 종료·DB 장애까지 보장하는 별도 durable queue는 아니며, 기록 없는 호출을 무료로 해석하면 안 된다.

## 조회

쿼리와 실제 파라미터:

```sql
select id, created_at, user_id,
       meta_data->>'executionId' as execution_id,
       meta_data->'attribution' as attribution,
       meta_data->'parameters' as exa_parameters,
       meta_data->>'status' as status,
       meta_data->>'providerRequestId' as exa_request_id,
       meta_data->>'costStatus' as cost_status,
       (meta_data->>'costUsd')::numeric as cost_usd,
       meta_data->'costDollars' as cost_breakdown
from public.logs
where type = 'web_search_exa'
  and created_at >= now() - interval '7 days'
order by created_at desc, id desc;
```

경로·정기 실행 종류별 비용(미확인 건수를 함께 표시):

```sql
select meta_data#>>'{attribution,source}' as source,
       meta_data#>>'{attribution,backgroundTrigger}' as background_trigger,
       meta_data->>'environment' as environment,
       count(*) as attempts,
       count(*) filter (where meta_data->>'status' = 'failed') as failures,
       sum((meta_data->>'costUsd')::numeric) as reported_cost_usd,
       count(*) filter (where meta_data->>'costStatus' = 'unknown') as unknown_cost_count
from public.logs
where type = 'web_search_exa'
  and created_at >= now() - interval '7 days'
group by 1, 2, 3
order by reported_cost_usd desc nulls last;
```

이 값은 Exa가 요청 응답에 보고한 비용이다. 청구 API의 전체 금액에는 이 경로 밖의 호출도 포함되므로 구분해서 비교한다.
