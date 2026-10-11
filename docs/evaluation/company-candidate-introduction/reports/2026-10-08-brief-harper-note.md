# Brief 기반 Harper Note · 로컬 모델 비교

동결 `presentation-v5` 12쌍에 실제 Worker의 입력 formatter·prompt·parser를 사용했다. 기준이 없는 사례, 빈 Brief, 역할보다 높은 보상, 범위 안의 보상, 비교 불가 보상, 사적인 맥락을 포함한 합성 challenge다. Gold는 모델 결과에 맞춰 수정하지 않았다. DB 연결·저장·실제 발송은 없다.

| Run | 모델 | 구조 | 기대 fit/기준 label | 원문 검토 |
| --- | --- | --- | --- | --- |
| `worker-presentation-20261008T081012.125972Z` | GLM 5.3 Flash high | 12/12 | 11/12 | Note의 추론·출처·공개 메타 설명으로 승인하지 않음 |
| `worker-presentation-20261008T081722.660782Z` | GLM 5.3 Flash high | 12/12 | 11/12 | 공개 동의 메타 설명이 남아 승인하지 않음 |
| `worker-presentation-20261008T083053.733191Z` | GLM 5.3 Flash high | 12/12 | 11/12 | Note privacy 개선; 요약의 출시 책임 확대와 기준 외 부연이 남음 |
| `worker-presentation-20261008T083437.739748Z` | GPT-6 Luna high | 12/12 | 10/12 | 동일 prompt에서 원문 충실도·간결성·Note privacy 개선. fit 해석 차이 2건 |
| `worker-presentation-20261008T085105.628877Z` | GPT-6 Luna high | 12/12 | 11/12 | 최종 로컬 계약 원문 검토 완료. fit 해석 차이 1건 |
| `worker-presentation-20261008T112720.409006Z` | GPT-6 Luna high | 12/12 | 11/12 | 한국어 직역 표현과 UCIP002 fit 차이 재확인 |
| `worker-presentation-20261008T113649.884082Z` | GPT-6 Luna high | 12/12 | 10/12 | UCIP002의 과도한 불확실, UCIP010의 명확한 업무 범위 부족을 미확인으로 평가 |
| `worker-presentation-20261008T114342.171135Z` | GPT-6 Luna high | 12/12 | 12/12 | 최종 수정 후 네 필드 전체 원문 검토 완료. 작은 challenge의 1회 결과 |

최종 writer는 pointwise scoring과 별개인 `company_candidate_presentation` 설정으로 GPT-6 Luna high / temperature 0.3 / 16384 tokens를 사용한다. 구조 오류는 같은 writer에 한 번 수정 요청하며 문장을 룰이나 키워드로 재작성하지 않는다. 최종 12쌍은 172.012초, 추정 API token 비용 $0.0084865다. actual model·source/prompt/input hash·usage·원문은 owner-only ignored run manifest에 보존했다.

Codex가 최종 12개 출력의 네 필드를 모두 읽었다. 기준 coverage와 언어 계약을 지켰으며, 보상 숫자·통화·비율·다른 회사 논의·민감한 사생활·공개 동의 메모 노출은 관측되지 않았다. 비교 가능한 높은 희망만 상대적인 차이로 설명했고 범위 안·비교 불가 보상은 생략했다. 빈 Brief는 빈 Note를 유지했다. 경력 기간 중첩·거래 총액과 개인 기여·협업과 관리·참여와 주도도 원문 경계를 지켰다.

남은 label 차이는 UCIP002의 PM 역할 최종 fit이다. frozen gold는 good/excellent, 모델은 borderline을 골랐다. 공식 직함을 바꾸지 않고 제품 우선순위 결정·고객 인터뷰·출시 범위 조율은 정확히 요약했지만, 실제 출시 책임을 어느 수준으로 요구할지 독립 label 검토가 필요하다. 이전 UCIP010의 인접 경험 허용 문구도 label 변동이 있었으므로 최종 1회 일치를 안정적인 정확도로 해석하지 않는다. 일부 Note의 직역 표현·불필요한 미확인 부연은 추가 문구 평가 과제다.

12쌍은 대표 운영 표본이 아니다. 독립 팀원 gold/정성 검토와 회사·직군 분포 평가가 미완료여서 전체 release gate 통과를 주장하지 않는다. 최종 코드는 로컬 변경이며 미배포다.

## 추가 점검 결과

마지막 run은 225.819초다. 평가 입력·gold를 그대로 유지하고, 정식 직함 대신 실제 업무로 판단하며 명시된 역할 책임 외에 새로운 요구를 만들지 않도록 계약을 보완했다. 기준별 `uncertain`은 미기재·모호한 근거에 사용하고, 특정 업무가 본인의 책임이 아니었다는 명시적 사실은 범위 부족으로 해석한다. 전체 역할에서 인접 경험을 허용하는 것과 특정 기준의 충족 여부는 구분한다. UCIP002는 good, UCIP010의 해당 기준은 bad·전체 fit은 borderline을 반환했다.

한국어 Note는 실제 맡고 싶은 일과 입사 전 필요한 기간을 설명하도록 보완했다. Notice interval을 오늘부터 계산한 확정 입사일로 바꾸지 않는다. 사용자가 준 영어 예시는 원문 그대로 유지했으며, 예시의 사실을 현재 후보자에 빌려 쓰지 않는다. 마지막 12건에서 보상 수치·민감 정보·공개 권한 메모의 노출은 관측되지 않았고, 빈 Brief는 빈 Note였다. 업무·수치의 귀속과 기간도 함께 검토했다. 표현과 label의 반복 안정성 및 독립 팀원 평가는 여전히 미검증이다.
