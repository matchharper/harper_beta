# Creator content performance conclusion evaluation

## 목적과 범위

콘텐츠의 측정일 지표와 확정 지급 예정액을 GLM 5.3 Flash가 같은 비교 집합 안에서 읽고, Slack에 쓸 `good`, `mixed`, `low`, `insufficient` 한 가지와 80자 이내 한국어 이유를 만드는지 확인한다. 이 평가는 플랫폼 반응과 비용의 상대적 해석만 다룬다. 가입·매출·인과적 ROI, 실제 지급 완료, 다음 협업 결정의 정확성은 평가하지 않는다.

## 평가 단위와 frozen dataset

평가 단위는 콘텐츠 한 건의 조회수·좋아요·작성자 제외 댓글·지급 예정액과 최대 50건의 비교 지표다. [gold-v1.json](gold-v1.json)은 개인정보가 없는 synthetic challenge 4건이며 강한 결과, 약한 결과, 엇갈린 신호, 근거 부족을 포함한다. 입력이나 gold 의미가 바뀌면 새 버전을 만든다.

## 실행 계약

Canonical runner는 [`scripts/evalCreatorContentPerformanceConclusion.ts`](../../../scripts/evalCreatorContentPerformanceConclusion.ts)다. Production prompt builder, normalizer, 모델 호출을 직접 재사용한다.

```bash
node --env-file=.env.local --import tsx scripts/evalCreatorContentPerformanceConclusion.ts --dry-run
node --env-file=.env.local --import tsx scripts/evalCreatorContentPerformanceConclusion.ts
```

`--dry-run`은 fixture와 실제 input builder만 확인한다. Live run은 synthetic 데이터만 외부 모델에 전송하며 raw 결과는 gitignored `runs/`에 저장하고 application DB에는 쓰지 않는다.

2026-09-18 GLM live v1 실행에서 구조 4/4, primary rating 4/4를 통과했다.

## 모델과 실행 조건

- model/provider: OpenRouter `z-ai/glm-5.3-flash`, provider fallback 없음
- reasoning: low
- temperature: 0
- output: JSON mode와 production enum·길이 검증
- tool: 없음

## 지표와 release gate

- 구조 유효성 4/4
- primary rating 4/4
- 한 줄 이유 누락 0건
- 가입·매출·인과적 ROI를 지표 없이 주장 0건

구조 실패, 고정 숫자 임계값을 근거로 한 판정, 근거 없는 제품 성과 주장은 critical failure다. 작은 synthetic challenge이므로 production 평균 정확도로 해석하지 않는다.

## 개인정보와 재현성

Tracked fixture에는 실제 크리에이터·콘텐츠·비용을 넣지 않는다. Production 사례가 필요하면 비식별화하고 `private/`에 `0600`으로 보관한다. Raw output, 비용, latency는 `runs/`에만 둔다. API key와 Supabase credential은 artifact에 넣지 않는다.

## 알려진 제한

- 플랫폼마다 반응 형태가 다른 실제 분포를 대표하지 않는다.
- 동일 캠페인·포맷·시기의 완전한 대조군을 보장하지 않는다.
- 상대 비교 결론이며 제품 가입이나 수익의 실제 ROI를 판정하지 않는다.
- `insufficient` fallback은 알림을 막지 않지만 팀원의 추가 검토가 필요하다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-18 | synthetic v1 4건과 production prompt/normalizer 재사용 runner를 등록했다. |
