# GPT-6-luna 추가 실제 공고 10개 — 2026-10-23

배포된 Next 서버 + Browserbase에서 실행했다. 로컬 브라우저는 사용하지 않았다. 10개 중 3개는 화면상 필수 입력과 첨부를 완료했고, 1개는 입력·첨부는 됐지만 테스트 문서에 필수 사진이 없었다. 나머지는 후보자 정보 부족 1개, 브라우저 조작 미완료 2개, 정보 부족과 테스트 장치 제한이 함께 있는 1개, 공고 페이지 사용 불가 2개다. 실제 지원서는 제출하지 않았다.

## 최종 실행별 결과

아래 시간·비용은 각 공고의 마지막 실행 한 번이다. 최초 실패와 재실행 비용은 아래 별도 합계에 전부 포함한다. ‘완료’는 화면·필수값·파일 응답을 확인했다는 뜻이며, 최종 제출 뒤 서버의 검증 통과·채용 담당자 접수·지원 자격 충족을 뜻하지 않는다. 문서 내용과 실제 후보자 답변의 품질은 이 실험의 금본위 평가가 아니다.

| 회사 / 채용 시스템 | 판단 | 시간 | 비용 | 확인한 내용과 남은 것 |
|---|---|---:|---:|---|
| 이그나이트 / Ninehire | 필수 입력·첨부 완료 | 48.8초 | $0.0106 | 이름·이메일·전화·지원경로·경력기술서. 파일 저장소 HTTP 204, 파일명과 최종 제출 버튼 확인. 선택 동의는 체크하지 않음. |
| Affirm / Greenhouse | 필수 입력·첨부 완료 | 132.7초 | $0.0603 | 연락처·선호 이름·대명사·현재/향후 비자 지원·거주 주·유입 경로·과거 근무 여부. 파일 저장소 201. 커스텀 선택란의 input.value는 빈 값이지만 화면에 선택값이 있고 validity 오류 없음. |
| 360Learning / Lever | 필수 입력·첨부 완료 | 80.6초 | $0.0324 | 연락처·근로 자격·비자 지원·희망 보수. 이력서 파싱 요청 200, 화면 Success 확인. 모델이 언급한 hCaptcha 오류는 최종 본문/화면에서 재현되지 않음. 제출 시 CAPTCHA는 미검증. |
| 브릴스 / Ninehire | 입력·첨부 완료, 문서 내용 조건 미충족 | 37.7초 | $0.0104 | 연락처·지원경로·이력서 첨부 및 저장소 204 확인. 공고는 사진 포함 이력서를 요구하지만 고정 테스트 PDF에 사진이 없음. 실제 지원 준비 완료로 세지 않음. |
| MarqVision / Greenhouse | 후보자 정보 부족 | 69.6초 | $0.0297 | 연락처·국적·근무 도시·근로 자격과 이력서 업로드 201 확인. 필수 영어 수준은 고정 후보자 정보에 없어 공란. 브라우저가 조작하지 못했다는 증거는 아님. |
| Appnovation / Greenhouse | 입력 미완료 | 89.8초 | $0.0269 | 연락처·희망 연봉·BC 거주 여부·출근 가능 여부·이력서 업로드 201 확인. 도시 전체 이름을 검색한 뒤 결과 0개에서 멈춰 필수 도시 선택이 확정되지 않음. |
| Palantir / Lever | 입력 미완료 | 209.8초 | $0.4254 | 연락처·학력 일부·근로 자격·서술 답변·이력서 파싱 200 확인. 학교/졸업연도 목록을 반복 조작하다 55단계 소진. 필수 졸업연도·지원경로 등 공란. 기존 고교 졸업연도 2020 입력과 별도 대학 졸업연도 공란을 구분. |
| Wayve / Ashby | 정보 부족 + 테스트 장치 제한 | 76.8초 | $0.0319 | 이름·법적 이름·이메일·희망 연봉·위치 일부 입력. 필수 Notice Period가 프로필에 없어 공란. 최종 시도에서 파일 업로드 티켓은 200이나 S3 전송을 테스트 장치가 막아 첨부 실패. 입력값 자동 저장도 차단. Ashby 자체가 자동화를 못 받는다는 결론은 불가. |
| FuriosaAI / Ashby | 공고 페이지 사용 불가 | 11.1초 | $0.0017 | 정확한 공고 URL에서 Page not found. 다른 공고로 바꾸지 않음. 로그인 필요로 단정하지 않음. |
| NICE인베스팅 / Greeting | 공고 페이지 사용 불가 | 13.5초 | $0.0019 | 정확한 공고 URL에서 페이지 없음 또는 접근 권한 없음 안내. 지원서 없음. 로그인 필요 또는 채용 종료로 단정하지 않음. |

## 비용과 시간 해석

- 추가 공고 10개, 총 실행 14회. Lever 2건 각 1회, Wayve 2회 재실행을 포함해 **$1.179107**. 전송 연결 smoke $0.0000167 별도.
- LLM **$1.138097**, Browserbase 시간 사용량 **$0.041010**. 이번 사용량 비용의 약 96.5%가 LLM이다.
- 마지막 실행 10개 합계 $0.631106. 보통 입력 가능한 건은 약 $0.01~0.06, 38~133초. Palantir는 210초·$0.4254를 쓰고도 미완료였다. 공고 없음 2건은 11~13초·각 약 $0.002.
- 금액은 344개 실제 provider 응답의 토큰/캐시 사용량과 Browserbase 세션 시간을 공개 요율로 환산한 값이다. 모든 응답 모델은 gpt-6-luna, provider/SDK 호출 수 일치, 누락 usage 0. 최종 답변·중첩 호출도 포함한다. 프록시 사용량 0.
- [OpenAI 가격](https://developers.openai.com/api/docs/pricing): 백만 토큰당 입력 $0.10, 출력 $0.50, 캐시 읽기 $0.01, 쓰기 $0.125. 입력 전체에서 캐시 읽기/쓰기를 빼고 중복 없이 계산했다. 장문 할증 기준인 호출당 272k 입력을 넘은 호출은 없다. [Browserbase 가격](https://www.browserbase.com/pricing): $0.12/browser-hour 기준. 월 정액·무료 크레딧·Vercel 실행/배포 비용·세금은 제외하며 청구서 정산액은 아니다.
- Palantir는 큰 학교 목록과 반복 조작으로 마지막 시도 누적 입력 약 381만 토큰을 사용했다. 저렴한 모델이어도 긴 화면을 반복 읽으면 비용이 증가한다. 정확한 토큰 합계는 아래 원본/summary를 따른다.

## 테스트 장치 영향과 재실행

초기 Lever 이력서 처리는 지원서 제출과 별개인 파일 파싱 요청인데도 테스트 장치가 차단했다. 파일만 포함하는 정확한 파싱 요청을 허용하고 재실행하자 360Learning과 Palantir 모두 업로드/파싱 Success가 확인됐다. 360Learning은 필수 입력까지 끝냈지만 Palantir는 긴 선택 목록에서 시간을 소진했다.

Wayve는 파일만을 위한 GraphQL 업로드 티켓을 추가로 허용했다. 첫 수정에는 GraphQL의 생략 가능한 쉼표 차이를 엄격히 비교하는 오류가 있어 다시 고쳤고, 최종 시도에서는 티켓 200이 확인됐다. 이후 별도 S3 저장소 전송은 아직 테스트 장치에 막혔다. 따라서 이 건의 첨부 실패를 Browserbase 또는 Ashby의 불가능 판정으로 사용하지 않는다. 입력값 자동 저장 ApiSetFormValue도 계속 차단되므로, 이 실험은 Ashby의 전체 제출 준비 가능성을 확정하지 못했다. 차단을 해제해 실제 지원 데이터를 만들지는 않았다.

실제 지원서 전송은 계속 막았다. 합성 자료 외 개인정보 사용, 계정 생성, 이메일/SMS 인증 요청, 최종 제출은 없었다. 21개 전송 권한 경계 확인을 통과했다. 모든 실험 종료 뒤 실행 중 Browserbase 세션은 0개였고 테스트 서버 health 200을 확인했다.

## 비교와 일반화의 한계

이번 공고는 이전 5개와 다른 10개이며, 모두 기존 방식 실패가 확인된 표본은 아니다. 같은 공고를 기존 방법·Sonnet·Luna로 동시에 돌린 비교가 아니므로 기존 대비 성공률 향상이나 Luna와 Sonnet의 상대 성공률을 계산할 수 없다. HTTP 200 사전 확인만으로 공고가 열려 있다는 보장도 없었다. 닫히거나 접근 불가한 공고를 실행 후 다른 공고로 바꾸지 않았다.

실무적으로 확인한 것은 Luna가 실제 배포 서버에서 여러 채용 시스템의 입력과 파일 첨부를 수행할 수 있다는 점이다. 복잡한 선택란의 완수 능력, 누락 후보자 정보 처리, 제출 시 추가 검증까지 모두 해결됐다는 증거는 아니다.

## 실행 환경과 배포 범위

Next 16.4.2 / Vercel Node 24 iad1 / Browserbase us-east-1 / Stagehand 3.7.3 hybrid / OpenAI Responses exact gpt-6-luna medium. 최대 55단계, agent 450초, 브라우저 600초, 동시 3개, 프록시 없음. 원본 후보자·문서는 기존 합성 fixture를 유지했다. 파일은 675-byte PDF로 사진이 없다.

사용자가 승인한 격리 테스트 프로젝트 harper-apply-browser-lab-20261022만 네 번 갱신 배포했다. 배포별 URL/ID와 소스 해시는 [manifest](manifest-public-pre-submit-v4.json)에 보존했다. 최종 배포 dpl_9qrz9wqiefy5G5LHHS4TzpXoP7LC는 READY. Harper 운영 코드·DB·배포는 변경하지 않았다. 배포 문서 점검 결과 운영 제품 동작 변경이 없어 Notion 갱신 대상 없음.

재현 runner: scripts/experiments/application-browser-lab/invoke.mjs. 오프라인 비용 합산: scripts/experiments/application-browser-lab/summarize-luna.mjs. Frozen inputs/gold v4는 변경하지 않았다. Raw/screenshot은 ignored runs 안에 owner-only로 저장했다.

## 원본 근거

- 이그나이트: [최종 원본](runs/2026-10-22T16-53-04.746Z-preflight-ignite.json), 화면 `runs/luna-ignite-final-0.png`
- Affirm: [최종 원본](runs/2026-10-22T17-00-03.875Z-preflight-affirm.json), 화면 `runs/luna-affirm-final-0.png`
- 360Learning: [최종 원본](runs/2026-10-22T16-59-14.025Z-preflight-learning360.json), 화면 `runs/luna-learning360-final-0.png`
- 브릴스: [최종 원본](runs/2026-10-22T16-56-42.571Z-preflight-brils.json), 화면 `runs/luna-brils-final-0.png`
- MarqVision: [최종 원본](runs/2026-10-22T16-55-20.106Z-preflight-marqvision.json), 화면 `runs/luna-marqvision-final-0.png`
- Appnovation: [최종 원본](runs/2026-10-22T16-53-09.867Z-preflight-appnovation.json), 화면 `runs/luna-appnovation-final-0.png`
- Palantir: [최종 원본](runs/2026-10-22T17-02-02.543Z-preflight-palantir.json), 화면 `runs/luna-palantir-final-0.png`
- Wayve: [최종 원본](runs/2026-10-22T17-06-53.119Z-preflight-wayve.json), 화면 `runs/luna-wayve-final-0.png`
- FuriosaAI: [최종 원본](runs/2026-10-22T16-54-21.362Z-preflight-furiosa.json), 화면 `runs/luna-furiosa-final-0.png`
- NICE인베스팅: [최종 원본](runs/2026-10-22T16-57-15.577Z-preflight-nice.json), 화면 `runs/luna-nice-final-0.png`

합산 원본: runs/luna-v4-summary.json. 각 원본에는 실제 배포 URL, 모델 응답 usage, 페이지 필드, 요청 허용/차단과 업로드 응답, 화면이 포함된다. 정성적 모델 종료 문구를 그대로 성공 판정에 쓰지 않았으며, Affirm 선택값과 360Learning CAPTCHA 관련 모델 서술은 독립적으로 재검토했다.

## 전체 시도 비용

| 회사 | 원본 | 초 | LLM | 브라우저 | 합계 |
|---|---|---:|---:|---:|---:|
| 이그나이트 | 2026-10-22T16-53-04.746Z-preflight-ignite.json | 48.8 | $0.008998 | $0.001605 | $0.010603 |
| Appnovation | 2026-10-22T16-53-09.867Z-preflight-appnovation.json | 89.8 | $0.023959 | $0.002969 | $0.026929 |
| 360Learning | 2026-10-22T16-53-20.345Z-preflight-learning360.json | 63.3 | $0.032205 | $0.002096 | $0.034301 |
| FuriosaAI | 2026-10-22T16-54-21.362Z-preflight-furiosa.json | 11.1 | $0.001299 | $0.000354 | $0.001652 |
| MarqVision | 2026-10-22T16-55-20.106Z-preflight-marqvision.json | 69.6 | $0.027415 | $0.002297 | $0.029711 |
| 브릴스 | 2026-10-22T16-56-42.571Z-preflight-brils.json | 37.7 | $0.009136 | $0.001236 | $0.010371 |
| NICE인베스팅 | 2026-10-22T16-57-15.577Z-preflight-nice.json | 13.5 | $0.001470 | $0.000427 | $0.001897 |
| Wayve | 2026-10-22T16-57-20.349Z-preflight-wayve.json | 77.2 | $0.021479 | $0.002554 | $0.024033 |
| Palantir | 2026-10-22T16-58-06.826Z-preflight-palantir.json | 234.3 | $0.453716 | $0.007784 | $0.461500 |
| 360Learning | 2026-10-22T16-59-14.025Z-preflight-learning360.json | 80.6 | $0.029727 | $0.002664 | $0.032391 |
| Affirm | 2026-10-22T17-00-03.875Z-preflight-affirm.json | 132.7 | $0.055887 | $0.004397 | $0.060284 |
| Palantir | 2026-10-22T17-02-02.543Z-preflight-palantir.json | 209.8 | $0.418442 | $0.006971 | $0.425413 |
| Wayve | 2026-10-22T17-04-22.707Z-preflight-wayve.json | 94.4 | $0.025046 | $0.003120 | $0.028166 |
| Wayve | 2026-10-22T17-06-53.119Z-preflight-wayve.json | 76.8 | $0.029318 | $0.002537 | $0.031855 |
