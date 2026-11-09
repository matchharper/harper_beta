# Criteria 작성 reasoning 비교 결과

실행일: 2026-10-23. [동일 입력 비교 계약](CRITERIA-REASONING-V1.md)에 따라 `gpt-6-luna`의 low·medium·high를 각각 한 번 실행했다. 운영 설정 변경·배포·DB 저장·추천 발송은 없다.

## 실행 범위

기존 실제 Designer·FDE 역할의 frozen 평가에서 점수 Top 10씩을 그대로 사용했다. 후보별 호출 하나가 criteria 5개와 TL;DR·Harper Note·추천 이유를 함께 작성한다. 총 20명 × 3종 = 60회 호출, criteria 설명 300개다. 조회·1차·2차·reranking을 새로 실행하지 않았다.

역할별 concurrency 설정은 64지만 대상이 10명이라 실제 요청은 역할별 10개다. 두 역할을 동시에 실행해 그룹 최대 20요청이며, reasoning 그룹은 low → medium → high 순서다. 모든 출력은 한국어를 요청했다. 모델·prompt·입력·출력 예산은 같고 reasoning만 달랐다.

## 비용과 경과 시간

| 역할 | reasoning | 10명 작성 경과 시간 | 개별 호출 평균 | 추정 USD | 입력 토큰 | 출력 토큰 | 그중 추론 토큰 |
|---|---|---:|---:|---:|---:|---:|---:|
| Designer | low | 12.7초 | 10.9초 | 0.01034–0.01690 | 69,060 | 7,212 | 0 |
| Designer | medium | 42.7초 | 29.9초 | 0.01891–0.02548 | 69,060 | 24,364 | 17,432 |
| Designer | high | 60.5초 | 41.6초 | 0.02610–0.03240 | 69,060 | 39,199 | 31,550 |
| FDE | low | 15.2초 | 12.2초 | 0.01020–0.01602 | 67,268 | 8,328 | 317 |
| FDE | medium | 37.5초 | 31.0초 | 0.01847–0.02429 | 67,268 | 24,872 | 16,798 |
| FDE | high | 65.1초 | 49.1초 | 0.02978–0.03561 | 67,268 | 47,496 | 38,631 |

전체 세 그룹 실행 경과 시간은 프로세스 시작·입력 로드·파일 저장까지 포함해 **134.3초**다. 합계 추정 비용은 **$0.11380–$0.15071**다. 역할별 표의 시간은 설명 작성 단계만 포함한다. 동시에 실행한 역할의 시간을 합산해 전체 경과 시간으로 표시하지 않는다.

비용은 실제 응답 usage에 [OpenAI Standard/global 공개 가격](https://developers.openai.com/api/docs/pricing)을 적용한 추정치이며 실제 청구 내역이 아니다. 모든 요청은 272K 이하 입력 구간이다. 입력 $0.10/M, 출력 $0.50/M, cache read $0.01/M, cache write는 30분 $0.125/M 또는 12시간 $0.25/M을 적용했다. 응답에 write TTL이 없어 범위로 기록했다. 출력에는 추론 토큰이 포함되므로 별도로 더하지 않는다. 비용은 criteria뿐 아니라 함께 생성한 세 종류의 설명도 포함한다.

## 구조 확인과 원문 검토

- 60회 모두 첫 시도에 정상 종료했다. 재시도·재실행·출력 잘림은 없었다. 실제 응답 모델은 모두 `gpt-6-luna`였다.
- 실행 전 기록한 두 역할의 capture/evaluation/selection-input 파일 hash가 실행 후에도 동일했다.
- 역할별 세 설정의 system/input hash 집합이 같고 선정한 10명의 순서도 같았다. 모든 criteria의 기존 점수·라벨 300개가 보존됐다.
- 각 역할의 선정 첫 후보 1명씩, criteria 5개 × 3종 = 30개 설명을 직접 읽었다. 이는 300개 전체에 대한 사실 정확성 평가가 아니다.
- 읽은 예시에서는 세 설정 모두 구체적 이력과 미확인 영역을 설명했다. high에는 개인의 기여와 시스템 전체 규모를 더 명확히 구분한 문장이 있었지만, 영어 직책·전문 용어가 더 남은 경우도 있었다. medium에도 어색한 전문 용어 번역이 있었다. 원문은 수정하지 않았다.
- 이번 결과는 속도·비용·출력 비교이며 품질 우열의 확정 근거가 아니다. 각 조건 1회이고 순서·공유 provider 부하·cache 상태를 통제한 반복 측정이 아니다. low를 포함한 어떤 설정도 이번 결과만으로 운영 기본값에 채택하지 않았다.

## 비공개 원문과 재현 자료

개인정보가 포함된 원문은 ignored `runs/criteria-reasoning-v1/`에만 owner-only로 저장했다.

- `comparison.html`: 20명 전체의 동일 기준별 low·medium·high를 나란히 보는 문서. TL;DR·Harper Note·추천 이유도 포함한다.
- `outputs.md`: 같은 원문을 Markdown으로 보존한 문서.
- `baseline-manifest.json`: 실행 전 동결한 원본 hash와 선정 후보.
- `<role>-<reasoning>/`: 실제 system/input/output/usage/attempt trace, 후보별 결과, 실행 manifest와 summary.
- `metrics.json`, `verification.json`, `execution-summary.json`: 사용량·비용·시간과 구조 확인 근거.

Canonical runner와 frozen dataset/gold 계약은 [CRITERIA-REASONING-V1.md](CRITERIA-REASONING-V1.md)를 따른다. 이번 변경은 replay runner에 평가 전용 model/reasoning 인자를 추가한 것이며 production writer 설정을 바꾸지 않았다.
