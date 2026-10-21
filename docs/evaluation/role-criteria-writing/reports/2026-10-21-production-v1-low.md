# 실제 프로필 20개 재비교 — 세 모델 low

2026-10-21 09:30 KST 시작 · `production-v1` · `low-native`  
Run: `compare-20261021T003013.095113Z`

**이번에는 세 모델 모두 20/20건의 최종 답변을 완성했고, 길이 제한 종료는 0건이다.**
앞선 medium/8,192 비교에서 Mercury의 빈 답변을 성능 결론의 핵심으로 삼은 것은
설정 영향을 크게 받은 판단이었다. 이번 결과를 현재 비교 결과로 사용한다.

## 비용과 속도

| 모델 | 설정 | 20회 비용 USD | 평균 완료 | 중앙값 | p95 | 최종 답변 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| GPT-6 Luna | low | $0.013858 | 8.71초 | 8.68초 | 10.88초 | 20/20 |
| Claude Haiku 5.5 | adaptive/low | $0.031911 | 10.20초 | 10.72초 | 14.57초 | 20/20 |
| Mercury 3 / OpenRouter | low | $0.034998 | 11.01초 | 9.63초 | 23.26초 | 20/20 |

총 **$0.080767**. Luna는 Haiku보다 약 56.6%, Mercury보다 약 60.4% 저렴했다.
Mercury는 중앙값에서는 Haiku보다 빠르고, 일부 긴 호출 때문에 평균과 p95는 더 높았다.
모델별 20개 단회 관찰이며 p95는 19번째 값이다. 장기 안정성 지표는 아니다.

Luna·Haiku 비용은 raw usage × 공식 단가 추정, Mercury는 OpenRouter `usage.cost`다.
reasoning, cache write/read를 포함하며 최종 청구서·세금·크레딧 구매 수수료는 제외한다.
원래 medium 실행 및 합성 준비 비용과 합산한 평균이 아니다. 이번 재실행의 추가 비용이다.

## 형식과 내용 품질을 분리한 결과

- Luna: 원문 JSON 20/20 유효.
- Haiku: 원문 JSON 17/20 유효. P05/P13/P20에서 c3의 JSON 구문 오류와 fitness 누락.
  세 답변 모두 설명 텍스트는 끝까지 생성됐다. 자동 수정하지 않았다.
- Mercury: 원문 그대로는 19/20 유효. P05는 JSON을 Markdown 코드블록으로 감쌌다.
  코드블록 내부 JSON은 온전하고 필수 필드도 모두 있으므로 답변 미완료로 보지 않는다.
  원본 응답은 보존했고 집계 결과를 repair로 교체하지 않았다.

따라서 형식 성공률은 답변 완성률이나 내용 정확도와 다르다. 이번에는 길이 제한 때문에
내용을 읽지 못한 사례가 없다. 60개 최종 답변을 Codex가 직접 읽었으며 별도 gold,
자동 의미 점수, 다른 LLM judge는 만들지 않았다.

**Luna**는 짧은 기준 설명, 비용·속도, 형식 안정성의 균형이 가장 좋다. 다만 P09에서
한 기준에 직접 인용한 업무 언어 근거를 다른 기준에서는 없다고 서술했고, P13에서는
명시된 관련 도메인 경험을 없다고 서술했다. low에서도 해결되지 않은 중요한 근거 누락이다.
빠르고 간결하다는 이유만으로 가장 정확하다고 결론내리지는 않는다.

**Haiku**는 P09/P13/P16에서 Luna보다 필요한 근거를 잘 찾아 연결했다. 그러나 허용된
대안을 좁게 읽거나 확인되지 않은 조건을 생략하는 사례도 있었다. 이전 medium에서
잘 판단했던 P14의 대안 해석은 이번 low에서 재현되지 않았다. 3개 JSON 오류와 긴 설명도
있으므로 모든 관점에서 우세한 모델은 아니다.

**Mercury**는 이번에 모두 답변을 완성했으며 단순히 실패 모델로 취급할 이유가 없다.
다만 간접적인 학력·직무 신호로 언어 능력을 확정하거나(P07), 설명상 최소 기간에
미달한다고 쓰면서 good을 주거나(P12), 시스템 구축과 플랫폼 규모를 합쳐 실제
운영 배포가 확인된 것으로 서술한 사례(P17)가 있었다. 현재 표본에서는 근거 충실성이
다른 두 모델보다 좋다고 보기는 어려웠다. P05의 코드블록은 이 의미 문제와 별개다.

제 선택은 **비용·속도·간결한 기본 출력에는 Luna low**, 세부 근거를 더 꼼꼼히
찾는 보조 비교 대상으로는 Haiku low다. 이는 직접 읽은 20개 표본의 판단이며
후보자 적합성의 정답, 전체 production 정확도 또는 자동 운영 전환 승인이 아니다.
원문 대조의 상세는 private run의 `direct-review.md`에 남겼다.

## 바꾼 설정과 그대로 둔 입력

세 모델 모두 low로 맞췄다. Luna는 `reasoning.effort=low`, Haiku는 adaptive thinking과
`output_config.effort=low`, Mercury는 `reasoning.effort=low`다. 별도 reasoning token
budget은 지정하지 않았다. [Luna 공식 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)와
[Inception 모델 문서](https://docs.inceptionlabs.ai/get-started/models)에서 low 지원을 확인했다.

Luna와 Mercury 요청에는 `max_output_tokens`, `max_tokens`, `max_completion_tokens`를
모두 넣지 않았다. Haiku Messages는 `max_tokens`가 필수이므로 Models API에서 확인한
모델 최대값 **128,000**을 사용했다. 이는 임의로 낮춘 비교용 한도가 아니며 API 자체의
유한한 모델 한계는 여전히 존재한다.
[Anthropic Messages 계약](https://platform.claude.com/docs/en/api/messages/create),
[Haiku 모델 한계](https://platform.claude.com/docs/en/models/haiku-5-5/overview).

실제 프로필·역할·평가 기준·system/user prompt·기준 날짜는 이전 production-v1과
동일하다. API에 저장된 요청 60개의 문자열을 frozen hash와 직접 대조했다.
DB를 다시 조회하거나 표본을 바꾸지 않았다. 각 역할에 5명씩 연결한 20쌍, 80개 기준이다.

provider당 직렬 1개씩 세 lane, provider 기본 sampling, connect/read timeout 15/180초,
한국어 출력, 도구 없음, JSON 지시만 사용하고 강제 schema 없음, retry·repair·fallback 없음을
유지했다. 실제 model alias는 요청과 같았고 Mercury provider는 모두 Inception이었다.
응답 완료 시간은 네트워크를 포함하며 TTFT/순수 생성 속도는 측정하지 않았다.

## 토큰과 이전 실행 대비

| 모델 | Input | Output | 그중 reasoning | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna | 61,895 | 12,246 | 4,760 | 0 | 61,835 |
| Haiku | 107,379 | 42,346 | 25,930 | 0 | 0 |
| Mercury | 63,907 | 83,567 | 72,004 | 7,125 | 0 |

low라는 이름이 같아도 실제 reasoning 토큰은 같지 않았다. Mercury는 low에서도
reasoning 사용량이 가장 많았다. 모델별 tokenizer와 provider 집계 방식도 다르다.

앞선 medium/8,192 결과와 비교한 관측 변화:

| 모델 | 비용 감소 | 평균 완료 시간 감소 | 길이 제한 종료 변화 |
| --- | ---: | ---: | --- |
| Luna | 28.7% | 37.2% | 0 → 0 |
| Haiku | 25.5% | 30.7% | 0 → 0 |
| Mercury | 30.4% | 35.6% | 9 → 0 |

reasoning과 출력 한도를 동시에 바꿨고 실행 시간대·cache hit도 달라졌다.
따라서 감소율을 low 하나의 인과 효과로 해석하지 않는다. Mercury는 이번 cache read
7,125 tokens가 있었으며 cache 없는 일반 input 단가 환산 비용은 $0.035639다.
앞선 실행의 빈 답변 9개에 대해서는 내용 품질 전후 비교가 불가능하다.

## 파일과 재현

- [계약·canonical runner](../README.md)
- [변경 없는 frozen manifest](../manifest-production-v1.json)
- [이전 medium 비교](2026-10-21-production-v1.md)
- 새 run의 `review.txt`: 입력과 세 모델의 최종 출력 전문
- 새 run의 `direct-review.md`: 20개 사례별 원문 대조 관찰
- 새 run의 `metrics-reviewed.json`, `verification.json`: 비용·시간·요청 일치 확인
- 새 run의 `haiku-model.json`, `mercury-endpoints.json`: 공급자 capability snapshot
- 새 run의 `production-v1-low-text-pack.zip`: 동일 텍스트 20개와 low 설정 안내

```sh
cd harper_worker
PYTHONDONTWRITEBYTECODE=1 venv/bin/python llm_evals/role_criteria_writing/compare.py run \
  --configuration low-native \
  --manifest ../harper_beta/docs/evaluation/role-criteria-writing/private/production-v1/manifest.json
```

원문·요청·출력은 기존 개인정보 경계대로 ignored `private/` 및 `runs/`, owner-only
권한으로 보관했다. 공개 문서에는 비식별 관찰과 집계만 기록했다. 생산용 prompt·DB·
추천·연락·운영 모델·배포는 변경하지 않았다. 텍스트 입력 자체는 그대로 재사용하며,
새 압축 묶음의 README에만 low 설정을 반영했다. 기존 입력·압축본은 보존한다.
