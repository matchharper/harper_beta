# 실제 프로필 20개: criteria 작성 모델 비교

후속 사용자 정정에 따른 [low 재실행 결과](2026-10-21-production-v1-low.md)가 현재 비교 결과다.
이 문서는 기존 medium/8,192 설정의 관측을 보존한다.

실행일: 2026-10-21 KST  
Dataset: `production-v1` · Gold: 없음  
Run: `compare-20261020T165642.211405Z`

이번 조건에서는 **GPT-6 Luna를 우선 선택**한다. 가장 저렴하고 20개 모두 사용할
수 있는 JSON을 반환했다. Haiku와 응답 중앙값은 거의 같았다. 내용 정확도가 항상
더 좋았다는 뜻은 아니다. Haiku가 근거를 더 잘 찾은 사례도 있었다.
Mercury는 이번 medium/8,192-token 설정에서 최종 답변 없는 호출이 많았다.

## 비용·속도·출력

각 모델 20회이며 실패 비용과 시간도 포함한다.

| 모델 | Reasoning | 20회 비용 USD | 평균 완료 시간 | 중앙값 | p95 | 구조 성공 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| GPT-6 Luna | medium | $0.019424 | 13.86초 | 13.58초 | 19.96초 | 20/20 |
| Claude Haiku 5.5 | adaptive / medium | $0.042847 | 14.72초 | 13.64초 | 22.67초 | 19/20 |
| Mercury 3 / OpenRouter | medium | $0.050280 | 17.11초 | 18.00초 | 23.33초 | 11/20 |

실제 60회 비교 비용 합계는 **약 $0.11255**다. Luna 대비 Haiku는 2.21배,
Mercury는 2.59배였다. 구조 성공은 JSON·criterionRef·필수 필드의 적합성으로,
의미 정확도 점수가 아니다. 유효한 기준 설명 수는 각각 80/80, 77/80, 40/80이다.

Haiku는 P08에서 JSON 문법 오류 1건을 냈다. API는 정상 종료했으며 수정하지 않았다.
Mercury는 P01·P03·P04·P11·P12·P14·P15·P16·P18에서 `finish_reason=length`,
빈 최종 답변을 반환했다. 이 9건의 보고된 completion tokens는 모두 reasoning으로
분류되었다. 설정 한도는 8,192였으며 실제 보고 사용량은 건별 7,854–8,144 tokens다.
한도를 올리거나 effort를 낮추는 추가 실험은 하지 않았다. 다른 설정에서도
Mercury가 같은 실패율을 보인다고 일반화할 수 없다.

## 직접 읽은 내용 품질

Codex가 실제 입력 20개와 반환된 최종 답변 51개를 읽었다. 그중 1개는 JSON이
잘못된 Haiku 답변이다. 나머지 9개 빈 답변도 확인했다. 별도 정답 세트·LLM judge·
자동 의미 점수 없이 원문 근거와 역할 기준을 대조한 비맹검 정성 판단이다.

**Luna**는 짧은 tooltip용 설명에 가장 잘 맞았다. 실제로 한 일과 미확인 부분을
간결하게 구분했고, AI 직무 사례에서는 프로토타입과 운영 배포, 본인 기여와
이후 팀의 출시에 대체로 신중했다. 그러나 이미 입력에 있는 업무 언어 근거를
없다고 서술한 사례(P09), 기준이 허용한 인접 경험을 충분히 반영하지 않은 사례(P14)가
있었다. 종료일 미상을 현재까지의 확정 경력 기간으로 계산한 표현도 있었다(P04).

**Haiku**는 일부 긴 입력의 세부 근거와 한계를 더 잘 찾았다. P09에서 Luna가 놓친
업무 언어 근거를 사용했고, P14에서 허용된 인접 경험을 인정했다. 팀의 이후 출시와
본인의 당시 산출물을 구분한 P16, 중단된 프로토타입을 배포 성과로 보지 않은 P17도
좋았다. 다만 기준의 예시·선호 조건을 좁게 읽는 경우(P11 등), 종료일이 확정되지
않은 경력을 현재 재직처럼 서술하는 경우가 있었다. 설명이 길고 같은 미확인 사항을
반복하는 편이며, JSON 오류도 1건 있었다.

**Mercury**의 완성된 11개 답변에도 쓸 만한 근거 설명은 있었다. 프로토타입의 한계를
보존한 P20은 적절했다. 반면 언어 능력, 특정 광고 채널 직접 운영, AI 시스템의
운영 여부를 간접 근거에서 강하게 확정한 사례(P07·P13·P17)가 있었다.
완성된 답변의 내용만으로 Luna·Haiku를 앞선다고 보기는 어려웠다.
현재 설정에서 9개 답변이 비어 있어 이 단계의 기본 모델로 선택하기 어렵다.

공통으로 복합 기준의 일부만 확인됐을 때 good/uncertain을 나누는 경계가 달랐다.
평가 기준이 허용한 대안과 단순 예시를 더 정확히 읽는지는 중요한 차이였다.
이 관찰은 이번 입력·출력에 대한 판단이며, 후보자 적합성의 정답이나 모델 전체의
정확도 순위로 쓰지 않는다.

## 고정한 범위와 설정

실제 기존 역할 네 개(전략·운영, 커뮤니케이션, 퍼포먼스 마케팅, Applied AI)에
후보자 5명씩을 연결했다. 각 역할의 최근 검토 후보 중 현재 공유 허용 조건을
만족하는 서로 다른 20명을 읽기 전용으로 캡처했다. 과거 평가 결과는 선택 조건이나
모델 입력으로 사용하지 않았다. 역할별 criteria 수는 6/3/4/3개다.

운영 loader/formatter로 만든 회사 공유용 Profile, 역할 설명, criteria와 기준 날짜를
동결했다. 기존 presentation prompt에서 기준 설명·fitness·사실성 계약을 가져와
`criteriaEvaluations`만 출력하게 했다. 전체 presentation 호출보다 범위가 작다.
전체 prompt와 사례별 user text의 hash 일치를 60개 저장 요청에서 확인했다.

세 모델 모두 medium을 선택한 이유는 여러 조건을 긴 경력 근거와 대조하는 작업이기
때문이다. 명칭이 같아도 계산량이 동일하지 않으며, 모델별 최적 설정을 찾은 실험은 아니다.
Haiku는 adaptive thinking의 effort medium이다. 출력 한도는 모두 8,192 tokens,
sampling은 각 provider 기본값, tools와 강제 JSON schema는 없다.
모델별 직렬 1개씩 세 lane을 동시에 실행했다. 재시도·repair·fallback은 하지 않았다.
응답의 model은 요청 alias와 같았고 Mercury provider는 모두 Inception이었다.

## 토큰과 비용 근거

| 모델 | Input tokens | Output tokens | 그중 reasoning | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna | 61,895 | 23,377 | 16,030 | 0 | 61,835 |
| Haiku | 107,379 | 64,218 | 46,492 | 0 | 0 |
| Mercury | 64,325 | 125,285 | 120,033 | 20 | 0 |

토큰은 provider tokenizer와 집계 방식에 따라 다르다. 같은 텍스트라도 input count가
같지 않다. Mercury의 output 중 약 95.8%가 reasoning으로 보고되어, 낮은 출력 단가가
이번 호출 비용 절감으로 이어지지 않았다.

Luna와 Haiku는 raw usage에 공식 단가를 적용한 **추정 비용**이다.
Mercury는 OpenRouter의 **usage.cost 보고값**이다. 실패 호출과 reasoning을 포함하며
세금·크레딧 구매 수수료·최종 청구서 검증은 포함하지 않는다.
Luna는 관측된 cache write surcharge까지 반영했다.
cache 없는 일반 input 단가로만 환산하면 Luna $0.017878, Haiku $0.042847,
Mercury $0.050282지만, 비교 표에는 실제 usage 조건을 적용한 값을 사용했다.

실행일에 확인한 단가(USD / 백만 tokens):

- [OpenAI GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna):
  input $0.10 / output $0.50 / cached read $0.01 / cache write $0.125.
- [Anthropic Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview):
  이번 입력 길이 구간의 input $0.10 / output $0.50.
- [OpenRouter Mercury 3](https://openrouter.ai/inception/mercury-3):
  Inception input $0.10 / output $0.35 / cached read $0.01.
  실행 시 endpoint metadata 원문도 run 폴더에 저장했다.

## 준비 실행의 별도 비용

실제 프로필을 원한다는 답변 전에 시작한 합성 준비 실행은 중단했다.
그 실행의 기록된 완료 응답은 Luna 20, Haiku 19, Mercury 11회이며 재집계 비용은
각각 $0.008469, $0.0178131, $0.01827036, 합계 **$0.04455246**다.
중단 시 응답을 받지 못한 진행 중 요청은 최대 2건으로, 추가 청구 여부를 확인하지 못했다.
실제 비교와 준비 실행을 합친 기록상 비용은 **$0.157103685**이며 미확인 요청은 별도다.
합성 출력은 위 품질·속도·비용 비교에 포함하지 않았다.

## 파일과 재현

- [평가 계약 및 실행 방법](../README.md)
- [공개 reproducibility manifest](../manifest-production-v1.json)
- 텍스트 묶음: `../private/production-v1/production-v1-text-pack.zip`
- 입력/출력 전문: `../runs/compare-20261020T165642.211405Z/review.txt`
- 원문 대조 메모: 같은 run의 `direct-review.md`
- 재집계 수치: 같은 run의 `metrics-reviewed.json`
- 요청·raw response: 같은 run의 `P01-luna.json` 등 60개

실제 자료는 이름 필드만 alias로 바꾼 개인정보 포함 자료다.
원문과 출력은 ignored private/runs, owner-only 권한으로 보관했다.
공개 보고서에는 회사·후보자 식별자나 raw response를 넣지 않았다.
제품 코드·DB·운영 모델·배포는 변경하지 않았다.

네 역할의 최근 검토 후보로 구성한 20개 단회 관찰이다. 전체 후보자 분포를 대표하지
않으며, p95는 20개 중 19번째 값일 뿐 안정적인 장기 지연 추정치가 아니다.
일부 profile 원문의 필드별 잘림과 종료일 미상도 유지했다.
응답 시간은 네트워크를 포함한 전체 완료 시간으로 TTFT나 순수 생성 속도와 다르다.
