# 운영 Workspace 선제 점검 · GPT-6.1 Sol

- 기준일: 2026-10-15. [사전 관찰·gold 계약](../production-proactive-v1.md).
- 사용자 지정 3곳과 최근 실제 company-side 발화·활성 채용이 있는 2곳, 총 5개 internal Workspace를 읽기 전용으로 관찰했다. 익명 단위는 P01–P05이며 실제 회사·후보 원문과 출력은 ignored owner-only runs에만 보존한다.
- 모델: `gpt-6.1-sol`, reasoning `high`, OpenAI Responses `default`/Standard. 실제 provider 요청·응답에서 모델·effort·usage를 확인했다. 모든 정상 schema/policy와 기존 loop를 사용하고 모델 fallback은 끈다. 운영 기본 모델은 바꾸지 않았다.
- DB migration·데이터 변경·실제 연락·Slack 발송·검색 job·배포는 수행하지 않았다. 이 변경에 새 DB 상태는 필요하지 않으며 사용한 읽기 함수도 운영에 존재했다.

## 발견한 오류와 보완

1. **기본 Role reader의 잘못된 탐색 상태**: DB의 `is_company_first_search`가 true인데 reader가 해당 필드를 조회·매핑하지 않아 기본 context에 false로 표시했다. `is_promote`·`is_anonymous`도 같은 canonical projection으로 읽도록 고쳤다. DB 값은 정상이라 수정하지 않았다. 반대 값·날짜·권한을 유지하는 targeted 검사를 추가했고 관련 검사 46/46 통과다.
2. **실행 계정과 회사 담당자 혼동**: P04에서 읽기용 Owner의 기본 이메일을 소개 메일 참조자로 제안했다. 실제 회사 발화에서 확인된 수신자와 기술적 실행 actor를 구분하도록 기존 proactive prompt를 보완했다. 같은 최초 입력의 P04 재실행은 회사 팀원 이메일을 묻고 미확인 기본값을 제안하지 않았다. 실제 발송은 두 실행 모두 없었다.
3. **Slack 가독성·지원 범위**: 공통 Slack prompt에 첫 판단·짧은 문단·필요한 비교만 bullet로 전달하도록 보완했다. 본문과 지원 버튼은 기존 Block Kit renderer가 처리하며 JSON·임의 action ID·없는 스레드 기능을 본문에 만들지 않는다. 열린 질문에 버튼을 강제하지 않는다.

실험 장치의 오류는 제품·모델 품질과 분리했다. 최초 capture는 운영 custom domain을 잘못 거절했고, 다음 capture에서는 정상 STABLE 읽기 RPC를 막았다. 이후 실제 읽기에서 팔로업 RPC·읽기 전용 연결 준비·페이지 읽기까지 막는 범위 오류를 발견했다. 함수 본문을 확인해 read를 허용하고 effect는 계속 차단했다. 웹 문서의 새 cache는 로컬 run에만 기록한다. 모델이 읽을 수 없던 실행을 정상 품질 실패나 성공으로 바꾸지 않는다.

## 실행과 결과

Run prefix는 모두 `20261015-production-proactive-sol-`이다. Canonical runner는 `scripts/evalCompanyProactiveProduction.ts`의 `capture`, `fork`, `run`이다. Fork는 동일 최초 입력 hash를 보존하고 새 runtime source snapshot을 만든다. 추가 도구 읽기는 요청별 실제 응답·시각을 보존하므로 동일 시점 transaction snapshot이나 blind benchmark가 아니다.

| Run | 범위·실행 | 원문·도구 효과 직접 검토 |
| --- | --- | --- |
| r1 | Custom domain preflight 실패, 모델 0회 | 장치 오류로 보존 |
| r2 | 최초 5곳 capture, 모델 0회 | 읽기 RPC 제한으로 input 불완전 |
| r3 | 5곳 capture, 모델 0회 | 실제 default reader의 false 탐색 상태 발견; 수정 후 새 capture |
| r4 | 유효 최초 입력 고정, 5곳·모델 15회 | 읽기 경계가 추가 RPC·준비·페이지 읽기를 막음. 전체 raw와 비용 보존, 품질 판단에서 제외 |
| r5 | 같은 최초 입력의 5곳·모델 14회, 실행 오류·네트워크 차단 0 | P01/P02/P03/P05의 필수 의미는 수용. P04는 실행 actor의 기본 수신자를 회사 의사처럼 제안해 미통과 |
| r6 | 같은 최초 입력 P04만·모델 4회, 실행 오류·네트워크 차단 0 | 수신자 prompt 보완 후 해당 사례 1/1 수용. 최종 source의 전체 5/5 재검증은 아님 |

최종 제시 출력은 r5의 네 곳과 r6의 P04다. 3곳은 메시지, 2곳은 침묵이다. 공개 진행 문장은 모두 0개였고 실제 도구 status·요청·결과·시간을 working log로 보존했다. 숨은 추론을 사용자용 로그로 노출하지 않는다.

| 단위 | 최종 제시 run | 모델+도구 시간 | 모델 / 도구 호출 | 관측 토큰 기준 비용 추정 | 캐시 할인 없이 같은 토큰 재계산 |
| --- | --- | ---: | ---: | ---: | ---: |
| P01 | r5 | 32.1초 | 3 / 2 | $0.0361 | $0.2496 |
| P02 | r5 | 21.2초 | 2 / 3 | $0.0269 | $0.1344 |
| P03 | r5 | 52.4초 | 3 / 4 | $0.0414 | $0.2191 |
| P04 | r6 | 73.4초 | 4 / 5 | $0.1451 | $0.4910 |
| P05 | r5 | 39.4초 | 3 / 3 | $0.0350 | $0.2042 |

제시한 출력들의 비용 추정 합은 **$0.2845**, 캐시 할인이 없다고 재계산하면 **$1.2982**다. 초기 모델 실행 r4와 수정 검증 r5/r6까지 포함한 전체 추정 비용은 **$0.7831**, 모델 요청 33회다. 재실행으로 캐시가 따뜻했던 조건이며 매일 같은 비용을 보장하지 않는다. 요청별 실제 input/cached-read/cache-write/output usage와 [공식 Standard 단가](https://developers.openai.com/api/docs/models/gpt-6.1-sol)를 사용한 추정치로, 청구서 실측이 아니다. Reasoning token은 output에 포함했다. Exa API 요청은 0회다. 최초 context 준비·마지막 링크 렌더링·DB 인프라·이 Codex 작업 비용은 이 시간/비용에서 구분한다.

## 직접 품질 판단

주관적으로 약 **4/5**다. 유용한 현재 업무를 고르고, 근거를 읽고, 필요한 결정 하나로 끝나는 경향이 좋았다. 파이프라인 보고서·가상 시장 분포·임의 기준 완화 없이 오래 열린 일정, 실제 보상 관련 피드백, 구체적 포트폴리오에 맞는 제안을 했다. 침묵한 두 곳은 최근 소개·안내를 다시 읽고 반복 메시지를 생략했다. 서로 다른 입력의 이전 모델 결과와 모델 우열을 비교한 실험은 아니다.

다만 다음 한계를 남긴다.

- P03의 Role thread 2개를 General conversation 범위에서 읽어 `missingThreadIds`가 반환됐다. 기본 참고 문맥이 이번 주장을 뒷받침했지만, 자세한 교차 Role 대화 조회가 필요하면 일반 read tool에 접근 가능한 Role을 선택하는 필터가 필요하다.
- P04 포트폴리오는 9월 20일 저장된 캐시다. 나중에 공유한 URL의 최신 수정까지 검증한 것이 아니다. 후보자가 직접 기재한 수행·성과도 독립 검증된 회사 사실과 구분한다.
- 임의 역할 스레드·다중 메시지·시장 분포 reader·홍보 consumer·scheduler는 아직 구현되지 않았다. 정상 회사 연락·Calendar·DB write 효과와 실제 Slack transport도 이번 preview에서는 실행하지 않았다.
- 실제 발송 뒤 다음 wake의 반복 방지, 회사의 후속 답변부터 승인 업무 완료까지, 채널/팀 수신 범위, 운영 대표 표본·독립 팀원 검토는 미검증이다.

출력이 괜찮아 보인다는 관찰과 무인 자동 발송의 출시 판정을 구분한다. 최종 소스의 전체 5/5 gate를 통과했다고 주장하지 않는다. 실제 출력·회사별 근거·작업 로그·Block Kit payload·캐시와 가격 세부는 r6의 private `report-ko.md`와 `review-summary.json`, r5/r6의 `review.json`에 보존했다. 원본 답변은 사람이 수정하지 않았다.
