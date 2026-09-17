# Creator outreach reply triage evaluation

## 목적과 범위

크리에이터 이메일 회신을 GLM 5.3 Flash가 `positive`, `negotiation`, `question`, `negative`, `published`, `other` 중 하나로 분류하고, 팀원이 Slack에서 읽을 짧은 한국어 요약과 회신에 실제로 적힌 게시 URL만 반환하는지 확인한다. 이 평가는 분류와 근거 URL 추출만 다룬다. 상업 조건의 수락, 답장 발송, 비용 확정, 게시 완료 확정의 품질이나 전체 크리에이터 모집단의 평균 정확도는 답하지 못한다.

## 평가 단위와 frozen dataset

평가 단위는 이전 발송 문맥과 새 회신 한 건이다. 현재 [gold-v2.json](gold-v2.json)은 개인정보가 없는 synthetic challenge 8건이며 각 유형, 혼합 의도, prompt injection 문구, URL 근거 경계를 포함한다. v1 live 결과를 본 뒤 일정·수정 조건을 `question`으로 둔 CORT007 정답이 frozen prompt의 `negotiation` 정의와 모순임을 확인해, 기존 v1을 보존하고 v2에서 unblinded adjudication했다. 이후 유형 또는 입력을 바꾸면 새 dataset version을 만들고 기존 파일을 덮어쓰지 않는다.

## 실행 계약

Canonical runner는 [`scripts/evalCreatorOutreachReplyTriage.ts`](../../../scripts/evalCreatorOutreachReplyTriage.ts)다. production의 `buildOutreachReplyTriageMessages`, 구조 검증, GLM 호출 함수를 직접 import한다. `--dry-run`은 fixture와 production input builder만 확인하고 외부 모델을 호출하지 않는다. 실제 run은 raw model output을 gitignored `runs/`에 저장하며 application table과 `llm_logs`를 포함해 DB를 쓰지 않는다.

```bash
node --env-file=.env.local --import tsx scripts/evalCreatorOutreachReplyTriage.ts --dry-run
node --env-file=.env.local --import tsx scripts/evalCreatorOutreachReplyTriage.ts
```

## 모델과 실행 조건

- model/provider: OpenRouter `z-ai/glm-5.3-flash`, Z.AI provider 고정, provider fallback 없음
- reasoning: low
- temperature: 0
- output: provider JSON mode + production parser/enum/URL evidence validation
- tool: 없음
- 외부 전송 데이터: synthetic fixture만 전송

## 지표와 release gate

- 구조 유효성 8/8
- primary type 정확도 8/8
- 명시 URL exact set 8/8
- 회신에 없는 URL 0건
- 한 줄 한국어 요약 누락 0건

`published` 오분류, 회신에 없는 URL 생성, 구조 실패는 critical failure다. 작은 synthetic challenge이므로 gate 통과를 production 평균 정확도로 해석하지 않는다. 실제 회신의 오분류가 확인되면 비식별 사례로 adjudication한 새 dataset version을 만든다.

## 개인정보와 재현성

Tracked fixture에는 실제 이름, 이메일, 메시지, 협업 조건을 넣지 않는다. Production 회신을 재현에 사용해야 하면 `private/`에 `0600`으로 보관하고 별도 승인을 기록한다. Raw output과 비용·latency는 `runs/`에만 저장한다. API key와 Supabase credential은 artifact에 넣지 않는다.

## 알려진 제한

- 이메일에서 인용된 과거 대화와 최신 본문이 복잡하게 섞이는 실제 Gmail 형태는 충분히 대표하지 않는다.
- 한국어·영어 중심이며 다른 언어와 에이전시 대리 회신의 표현 분포를 대표하지 않는다.
- 단일 primary type만 평가하므로 한 회신에 협상과 질문이 동시에 있는 세부 복합 의미는 요약 품질을 사람이 추가로 봐야 한다.
- 게시 URL이 실제 해당 크리에이터의 게시물인지 검증하지 않는다. Runtime도 이 결과만으로 게시 완료를 확정하지 않는다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-17 | v1 결과 확인 뒤 CORT007의 계약 모순을 unblinded adjudication하고 gold v2를 만들었다. |
| 2026-09-17 | synthetic v1 8건, production prompt/normalizer 재사용 runner와 blocking gate를 등록했다. |
