# Slack reply routing evaluation

## 목적과 평가 단위

공유 Slack 스레드의 최신 팀원 메시지에 Harper가 답할지 판단하는 경로만 검증한다. 평가 단위는 최근 대화와 최신 메시지 한 건이다. 답장 본문의 품질, 권한 검사, DB 상태 변경, Slack 전달 성공은 이 평가의 범위가 아니다.

## Frozen 입력과 정답

`cases-v1.json` / `gold-v1.json`은 기존 `scripts/evalSlackReplyRouterLive.ts`의 합성 8건과 라벨을 그대로 보존했다. SRR007의 `uncertain|ignore` 라벨은 현재 runtime의 `respond|ignore` 및 수신자가 모호하면 응답하는 계약과 어긋난다. 기존 입력/정답을 덮어쓰지 않는다.

`cases-v2.json` / `gold-v2.json`은 같은 8개 입력에 일정 답변·저장 요청·완료 감사·영어 후속 요청·다른 팀원에게 질문·짧은 실행 승인 6건을 더했다. SRR007 정답은 기존 conservative 계약에 맞춰 `respond`로 정정했다. 이 판단은 Jev 호출 전에 Codex가 수행했으며 독립 팀원 라벨 검토는 아니다. 버전별 `manifest-v1.json` / `manifest-v2.json`에 provenance, 입력/gold hash와 라벨 검토 한계를 기록한다. 새 사례나 라벨 수정은 새 버전을 만든다.

## Prompt/input 계약과 정본 runner

정본은 [`scripts/evalSlackReplyRouterLive.ts`](../../../scripts/evalSlackReplyRouterLive.ts)다. 실제 runtime의 request builder, 응답 schema, 호출 함수와 debug receipt를 import한다. 최근 10개 메시지를 메시지당 10,000자로 제한하고 팀원을 안정적인 Person label로 구분한다. Jev는 단일 Choice 질문에 `respond` 또는 `ignore`를 선택한다. runtime은 선택지/타입만 검증하며 의미를 키워드나 confidence threshold로 다시 판단하지 않는다.

```sh
node --env-file=.env.local --import tsx scripts/evalSlackReplyRouterLive.ts --dry-run
node --env-file=.env.local --import tsx scripts/evalSlackReplyRouterLive.ts --dataset=v2 --run=<new-run-id>
```

runner는 provider 호출만 허용하고 `logUsage=false`로 DB 기록을 끈다. 매 run에 입력/gold hash, 실제 request와 prompt fingerprint, 소스 revision/dirty diff fingerprint, 요청/응답, 모델과 비용/지연을 남긴다. HTTP/구조 오류의 runtime fail-open을 올바른 모델 판단으로 집계하지 않는다. raw 출력은 ignored `runs/<new-run-id>/`에 0700/0600으로 보존한다. 기존 run을 덮어쓰지 않는다.

## 모델과 실행 설정

- OpenRouter `typesafe/jev-1.13`, native `POST https://openrouter.ai/api/alpha/decisions`.
- 응답의 실제 dated 모델 ID를 별도 기록. 모델 fallback/retry 없음, `data_collection=deny`, `allow_fallbacks=false`.
- Jev는 reasoning/temperature/max completion tokens 설정을 사용하지 않는다. production 호출 timeout은 5초다.
- 도구/DB/Slack 호출 없음. 외부 전송은 합성 대화만 한다.
- provider `usage.cost`가 있으면 이를 사용하고 없으면 공통 pricing registry의 추정값을 사용한다. 비용을 알 수 없는 호출은 0으로 확정하지 않는다.

## 지표와 release gate

v2 기준 유효한 provider 응답 14/14, 정답 일치 14/14, Harper에게 필요한 후속 요청/승인 누락 0건, 팀원 간 대화/완료 감사에 끼어듦 0건을 gate로 둔다. 지연 평균/중앙값/p95와 확인된 총/평균 비용은 관측치로 기록한다. 취소 전파, 오류/timeout fail-open, typed choice 검증, 비용/시간 receipt는 별도 targeted unit tests로 확인한다.

## 개인정보 경계와 한계

실제 회사·후보자 원문, 계정, 역할을 캡처하거나 생성하지 않는다. API key를 artifact에 저장하지 않는다. 운영 원문을 추가할 때는 별도 provenance/privacy 계약과 ignored `private/`가 필요하다.

작은 synthetic challenge는 운영 평균 정확도나 확률 보정을 대표하지 않는다. v1의 모호한 라벨은 역사 보존용이며 v2가 현재 계약이다. 단일 run은 stochastic 안정성이나 Slack 전체 응답 시간 개선을 입증하지 않는다. 멘션/Role 작성/진행 중 후보자 workflow 우회는 기존 실행부가 유지하며 이 모델 평가에서 검증하지 않는다. runtime 오류 시 응답하는 처리는 모델의 의미 판단이 아니라 가용성 fallback이다. 배포는 별도 사용자 승인 대상이다.

## 검증 기록

2026-10-15 메시지 한도 확대(로컬·미배포): 메시지당 360자를 10,000자로 늘렸다. `20261015-10000-char-routing`에서 기존 frozen v2 14/14, 구조 유효 14/14, 응답 누락·끼어듦 0건을 확인했다. 평균 provider 호출 413ms이며 router unit tests 9/9를 통과했다. 기존 합성 세트는 긴 메시지의 판단 품질이나 최대 입력 지연을 검증하지 않으며, 10,000자 절단 경계는 unit test로 확인했다. Slack 동기화 순서·프롬프트·우회 조건은 변경하지 않았다.

[2026-10-15 Jev 전환 기록](reports/2026-10-15-jev.md): 최초 13/14 실패를 보존하고 수신자 판단의 일반 계약을 보강했다. 같은 frozen v2의 후속 두 run은 14/14였다. 마지막 호출 평균 402ms·$0.000023118, 변경 경로 unit tests 18/18을 확인했다. 운영 배포는 하지 않았다.
