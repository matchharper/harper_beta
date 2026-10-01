# /org 응답 언어 연결 검증 — 2026-09-30

## 범위와 설정

- 목표: 웹에서 선택한 `ko`/`en`이 회사 채팅 모델에 전달되고, UI 단계명과 응답 문체가 해당 언어를 따르는지 확인한다. 기존 고정 사례의 상태 판단도 함께 검토한다.
- 고정 입력/정답: v8 `CSCQ801-web` 1발화와 v10 `CSCQ1012-accepted_prior` 2발화. 원본 입력과 gold는 수정하지 않았다. 각 대화가 평가 단위다.
- 실행: canonical `scripts/evalCompanyAgentCapabilities.ts`의 `--response-locale=ko|en` 옵션. 현재 production 대화 loop와 모델(`google/gemini-3.8-flash`, OpenRouter, medium, temperature 0.5, progressive), 격리된 합성 도구를 사용했다.
- 기록: 입력 hash, source snapshot/fingerprint, prompt fingerprint, 전체 모델 요청·응답, 결과는 ignored `runs/<run-id>/`에 owner-only 권한으로 보관한다. 합성 회사·후보자만 사용했고 운영 DB/발송은 호출하지 않았다.

## 원문 검토

| 실행 | 결과 | 원문 판정 |
| --- | --- | --- |
| `2026-09-30-org-en-web-role-entry-final` | v8 웹 1/1 완료 | 한국어 사용자 발화에도 영어로 답하고 실제 `New role` 버튼을 직접 안내했다. 불필요한 `please`가 없고 `role` 용어를 사용했다. |
| `2026-09-30-org-en-accepted-prior-final` | v10 2/2 완료 | `Suggested candidates`에서 빠진 이유를 기존 추천 수락과 `Ready to connect`로 설명했다. 중복 Intro를 요구하지 않고 회사의 연결 결정을 다음 단계로 제시했다. 저장된 한국어 Role 이름은 원문 그대로 표시했다. 첫 답변의 “outreach recommendation”은 다소 어색하지만 상태·행동을 바꾸는 오류는 아니다. |
| `2026-09-30-org-ko-accepted-prior-retry` | v10 2/2 완료 | 기존 한국어 명칭 `먼저 제안 가능한 후보`, `연결 대기`와 팀원 관점의 다음 결정을 유지했다. 중복 Intro 발송이나 임의 상태 변경은 없었다. |

초기 영어 웹 실행(`2026-09-30-org-en-web-role-entry`)에서 “please click”이 나와 영어의 직접적인 UI 안내 규칙을 명시했다. 재검증(`2026-09-30-org-en-web-role-entry-recheck`) 후 canonical `role` 용어를 추가했고, 위 `-final` 실행으로 최종 프롬프트를 확인했다. 한국어 첫 실행(`2026-09-30-org-ko-accepted-prior`)은 두 번째 발화의 모델 timeout으로 1/2만 완료됐다. 같은 고정 입력의 재실행은 2/2 완료했으며 최초 실패를 덮어쓰지 않았다. 영어 v10의 초기 실행(`2026-09-30-org-en-accepted-prior`)도 이전 프롬프트 기록으로 보존한다.

세 최종 대화의 필수 상태·행동 의미는 3/3, 발화는 5/5를 통과했고 critical 오류는 관찰하지 못했다. 이는 한 번씩 실행한 선택 사례의 수동 판정이다. 전체 회귀 세트, 역할 작성 모델의 실제 대화, 운영 데이터·전달 경로의 성공률을 뜻하지 않는다. 독립 팀원 gold 검토는 아직 없다.

별도 브라우저 확인: 로그인된 Chrome에서 로컬 `/org`에 들어가 프로필 메뉴로 English→한국어→English를 전환했다. 역할 대화의 기존 한국어 locale 버튼(`Pipeline summary`, `Pending intros`, `Run Search`)과 영어 locale 버튼(`Pipeline summary`, `Ready to connect`, `Run search`)의 표시를 확인했다. 클릭 시 실제 채팅 요청을 발송하는 동작은 운영 데이터에 영향을 줄 수 있어 브라우저에서는 실행하지 않았고, 전송 메시지 및 `responseLocale` 연결은 코드·hook 테스트로 확인했다. 같은 화면에서 영어 Calibration 안내 문장이 어순상 깨진 것을 발견해 전체 문장 번역으로 수정하고 브라우저에서 재확인했다. 기존 대화와 저장된 Hiring Brief는 선택 언어로 자동 번역되지 않는다.

## 팀원별 DB 언어를 읽는 Slack 경로

후속 변경에서 `/org` 언어를 `company_users.locale`에 저장하고, Slack에서 확인한 팀원 계정의 값을 일반 대화·Role 작성·등록 확인에 전달한다. DB 값이 없을 때만 기존 `auto` 대화 언어 지침을 사용한다. 같은 고정 v10 입력 `CSCQ1012-prior_exposure`를 설정만 바꿔 실행했다.

| 실행 | 결과 | 원문 판정 |
| --- | --- | --- |
| `2026-09-30-org-slack-saved-en` (`--response-locale=en`) | 1/1 완료 | 한국어 질문에도 영어로 답했다. `Suggested candidates`가 이전 추천의 미응답·거절을 포함할 수 있다는 상태 사실과 Intro 선택을 올바르게 설명했다. 단순 질문에 비해 답이 길고, 직접 제안이 재고의 설득력 있는 계기가 되는 경우가 많다는 표현은 근거보다 강해 문체·확신 경고로 남긴다. |
| `2026-09-30-org-slack-unset-auto` (언어 미지정) | 1/1 완료 | 한국어 질문에 기존 한국어 용어와 대화체로 답했다. 이전 추천 거절이 자동 제외가 아니라는 설명을 유지했다. |

두 run 모두 합성 도구를 썼다. Slack 사용자→팀원 연결과 DB 조회·저장은 코드 경로 및 단위 테스트로 확인했고, 실제 Slack 메시지 왕복이나 배포된 DB 스키마의 동작은 검증하지 않았다.
