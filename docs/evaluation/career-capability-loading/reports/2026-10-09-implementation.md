# Career 지연 로딩 구현·검증 — 2026-10-09

> 후속 사용자 요청으로 모델을 6.1 Sol로 바꾼 결과는 [Sol 품질 보고서](2026-10-09-sol-quality.md)에 있다. 아래 Claude 수치는 최초 구현 당시 기록이다.

## 판단

로컬 main에 구현했고 로컬 환경은 `progressive`로 설정했다. 코드 기본값은 `full`이며 배포하지 않았다. **기능 분리와 로컬 회귀 검증은 완료했지만, 대표 사용 분포의 비용 절감이나 운영 품질 gate 통과를 선언하지 않는다.**

원본 대화 LLM, 기존 tool schema·executor, Memory/Brief와 이력서 revision 계약을 유지한다. 별도 분류 모델, 키워드 라우터, 사용자 의도 상태 머신, DB 테이블은 추가하지 않았다. 새 source metadata는 로딩 이력만 저장하며 동의를 대신하지 않는다.

## 최종 구성

- 기본 업무 도구 6개: `research_company`, `update_language_setting`, `update_setting`, `update_talent_profile`, `read_talent_context`, `write_talent_context`.
- 내부 loader 1개. 초기 입력에는 모든 eligible 기능의 개요와 중요한 실행 경계를 제공한다.
- 지연 로딩 8개: opportunities 3턴, company_contact 2턴, web_research 1턴, documents 2턴, resume_authoring 3턴, career_coaching 3턴, activity_history 1턴, connected_inbox 1턴.
- 기존 조건부 도구는 그 조건을 유지한다. 현재 계정·caller가 허용하지 않는 도구는 catalog/loader로 복구할 수 없다.
- Active 코칭은 유지 기간과 무관하게 해당 정책·도구를 제공한다. 실제 업로드·선택 카드만 preload하며 문장 의미로 preload하지 않는다.

초기 core 5개에서는 같은 회사 고민 사례에서 full이 직접 조사를 제안하는 반면 progressive는 사용자가 확인할 항목만 설명했다. Catalog를 명확히 해도 반복되어 `research_company`의 schema와 정책을 함께 core로 승격했다. 입력 약 600토큰 증가로 실제 조사 제안이 복구됐다. 기능 인식 보존이 기본 도구 개수보다 우선한다.

## 구현한 경계

| 경계 | 구현·확인 |
| --- | --- |
| 기능을 알지만 도구는 미로드 | Eligible catalog와 completion의 offered schema를 분리. 기능 설명만 할 때 로드·실행 불필요 |
| 이력서 동의 | 명시적 생성/수정/복사 요청 또는 구체적 제안 수락만 저장 허용. 잡담·경험 공유는 동의가 아니라고 짧게 명시 |
| 다음 모델 응답부터 사용 | 한 응답의 offered snapshot 고정. load와 미노출 write를 같이 내도 write 거부 |
| 유지·만료 | 같은 user/conversation의 완료된 대상 source 턴 N개. 미완료/full/잘못된 metadata/30분 공백에서 과거 유지 중단 |
| 실패·동시 수정 | CAS로 source payload의 다른 필드 보존. 실패하면 다음 턴 cold. 업무 부작용을 재실행하지 않음 |
| 권한 변경 | 현재 allowlist 우선. Gmail 연결 만료 receipt는 같은 요청의 이전 snapshot에도 즉시 반영 |
| 코칭·사용자 정보 | 도구 실행 후 실제 상태 재조회. 코칭 종료 receipt는 재조회 실패에도 유지. 종료 뒤 active 지침 제거 |
| Provider 복구 | Native/SSE/OpenAI/OpenRouter 공통 runtime. 실제 실행 후 장애는 결과를 보존한 tool-free 복구 |
| 실행 예산 | 기존 eligible 기준 domain 8회 또는 4회 유지. Loader는 별도 최대 2회 |
| UI·계측 | Loader는 업무 executor, Thinking 표시, 카드, domain charge로 보내지 않음. 실제 offered 집합과 source/request 식별자를 기존 로그에 기록 |

웹 route, 서버 text runner, debug preview가 같은 resolver/lease 계약을 사용한다. 온보딩·음성·명시적 tool-free 호출은 전환 대상에서 제외했다. Debug preview는 읽기만 한다.

## 프롬프트 변경 범위

추천 상세 6개 섹션을 원문 그대로 분리했다. 기존 raw 전체 지침을 다시 조립한 문자열은 작업 전 백업과 **byte-for-byte 동일**하다. 기존 schema를 축약하거나 재정의하지 않았다.

추가·소폭 수정한 부분은 기능 catalog/loader 계약, `Available`과 현재 `Callable` 구분, Gmail 연결과 미로드 구분, 미로드 코칭 상태 요약, 과거 도구 기록이 생략됐을 때 현재 상태만으로 과거 변경을 부정하지 말라는 근거 범위 안내다. 이력서를 가끔 제안하라는 빈도 지침은 추가하지 않았다. 로딩 뒤에는 기존 resume 상세 정책이 들어간다.

## 검증 결과

### 코드·프로토콜

- 관련 선택 회귀 46개: **45 pass, 0 fail, 1 skip**. Skip은 기존 실제 Chromium PDF 검사다.
- 마지막 공통 후속 지침 변경 뒤 provider/runtime 회귀 **29/29 pass**. 여기에는 native/plain/SSE/OpenAI/OpenRouter/fallback, 같은 응답의 숨은 도구 거부, 예산 보존, post-write 장애 복구가 포함된다. 위 46개와 중복되는 검사이며 합산하지 않는다.
- TypeScript 전체 검사와 변경 파일 대상 lint 통과.
- 별도 기존 `toolPolicyPrompt.test.ts`의 내부 역할 문구 assertion 1개는 작업 전 백업으로도 같은 실패를 재현했다. 현재 내부 역할 정책에 없는 예전 문구를 요구하는 테스트이며, 이 작업에서 그 제품 계약을 바꾸지 않았다.
- Import 환경변수 없이 실행한 중간 검사는 credential/Supabase URL 누락으로 시작하지 못했다. 최종 위 결과는 문서화한 dummy 환경과 mock API로 다시 실행한 결과다.

### 실제 모델

이 실행 당시 Career 설정의 `claude-sonnet-5-5`, temperature 0.7, max output 4096을 사용했다. 실제 prompt/selector/runtime/provider 경로에 합성 업무 결과를 공급했다. DB 저장·PDF 생성·회사 연락·Gmail 접근 자체는 실행하지 않았다. 모든 사례는 synthetic이며 원문 사용자를 재현한 것이 아니다.

| 실행 | 범위·해석 |
| --- | --- |
| `2026-10-09T07-34-33-107Z` 등 초기 v1 | Core 5개와 초기 근거 안내. 과거 이력서 변경을 근거 없이 부정하는 문제 발견 |
| `2026-10-09T07-41-34-038Z`, `07-58-01-563Z`, `08-00-53-815Z` | Core 5개 회사 조사 제안 누락 확인. 단순 catalog 보강만으로 충분하지 않음 |
| `2026-10-09T07-43-16-582Z` | Provider 90초 timeout 1건 및 초기 runner의 null fallback 설정 문제. 실패 run 보존; 실제 production fallback 설정을 쓰도록 runner 수정 |
| `2026-10-09T08-03-55-699Z` | Core 6개로 회사 조사 제안 복구, 거절 뒤 불필요한 작업 실행 없음 |
| **`2026-10-09T08-05-28-149Z`** | v2 18사례 × 2모드 = **36대화·48사용자 턴**, 구조적 실패 0. 아래 전체 비용 표의 원본 |
| `2026-10-09T08-14-07-055Z` | 누락된 production 코칭 후속 지침을 stub에 복원. 첫 suggest와 active 종료가 양쪽 모드에서 기존 계약대로 동작 |
| `2026-10-09T08-19-39-964Z` | v3 코칭 2턴과 이력서 6턴 양쪽 비교. Suggest→다음 턴 명시적 선택→start 확인. 과거 문구 정정 문제는 일부 잔존 |
| `2026-10-09T08-22-32-346Z`, `08-23-33-621Z` | 공통 tool-result 근거 안내 보완 뒤 같은 6턴 반복. **Progressive 2회 모두** 수정·조회·N 만료·재수정 성공, 불필요한 과거 정정 없음. 마지막 full 대조군의 잡담 턴에는 과거 문구를 잘못 정정하는 응답 1건 잔존 |

코칭 v1/v2 gold의 최초 즉시 시작 기대는 이미 존재하던 suggestion-card 제품 계약과 달랐다. 모델 결과를 정답으로 바꾼 것이 아니라 production prompt/executor 근거를 확인하고 v3로 version을 올렸다. 기존 입력·gold·raw 실행은 그대로 보존했다.

Codex가 전체 결과와 후속 대상 대화를 의미 단위로 검토했다. 명시적 수정·이름 있는 복사·짧은 수락·읽기 전용 검토·Brief+이력서 복합 요청·Gmail 권한 구분·직접 추천·URL 읽기·영문 생성이 해당 도구 결과와 연결됐다. 회사 연락은 동일 tool 호출에서 전달된 결과를 설명했고 별도 발송 대기 단계를 만들지 않았다. 잡담/거절에서 resume 쓰기는 없었다. 독립 human review나 실제 사용자의 만족도를 측정한 결과는 아니다.

### 토큰·비용·시간

전체 표는 위 **08:05 v2 단일 비교 run**의 `requests.json` 응답 usage로 계산했다. 초기 비동기 `logs.json`의 top-level 사례 라벨 지연과 누락 가능성 때문에 그것을 집계 원본으로 쓰지 않았다. 실제 원가 청구서는 아니며 repository 가격표의 input/cache-write/cache-read/output 단가 2/2.5/0.2/10 USD per million을 사용한 assistant 비용 추정이다. Tool attribution 행을 중복 합산하지 않았다.

| 수치 | full | progressive |
| --- | ---: | ---: |
| 최초 awareness 입력: cache 포함 실제 처리 토큰 | 36,016 | 14,690 |
| 같은 입력의 제공 도구 수 | 23 | 7 |
| 전체 사용자 턴 | 24 | 24 |
| 실제 completion 요청 | 51 | 65 |
| Loader 호출 | 0 | 12 |
| 일반 input tokens | 108,173 | 93,827 |
| Cache write tokens | 368,137 | 335,430 |
| Cache read tokens | 1,379,619 | 822,707 |
| 총 처리 input tokens | 1,855,929 | 1,251,964 |
| Output tokens | 20,843 | 17,741 |
| 해당 run의 assistant 추정 비용 | $1.6210 | $1.3682 |
| 사용자 턴 완료 시간 중앙값 | 8.98초 | 9.03초 |
| 사용자 턴 완료 시간 p95, nearest rank | 14.35초 | 14.51초 |

이 run에서 최초 입력 **59.2% 감소**, 전체 completion 합계 처리 입력 **32.5% 감소**, assistant 추정 비용 **15.6% 감소**가 관측됐다. Loader 때문에 completion 수는 증가했다. 이 표의 full에는 새 공통 catalog도 들어가므로, 수정 전 원본 runtime과 완전히 동일한 baseline이라고 표현하지 않는다. 마지막 근거 안내 소폭 수정 이후 전체 18사례 비용을 다시 측정한 표도 아니다.

여기서 서비스 전체 절감률을 추론하지 않는다. 표본은 기능 진입을 의도적으로 많이 포함하며 운영 사용 비율로 가중하지 않았다. 반복 실행의 cache 상태가 섞여 있고, 순서는 사례별로 교차했지만 완전히 통제된 cold/warm 실험은 아니다. 업무 하위 LLM·DB/CAS·실제 업로드/PDF·브라우저 streaming 시간도 이 stub 표에 포함되지 않는다. 특히 코칭 stub 수정 전의 전체 run에는 해당 1사례의 추가 start가 포함된다. 수정 뒤 partial run과 합쳐 유리한 총비용으로 재계산하지 않았다.

## 남은 한계와 운영 전 확인

1. **운영 활성화 gate는 별도다.** 대표 대화 분포, DB·실제 외부 효과, 첫 유의미한 응답 지연과 전체 p95, cache 조건을 포함한 비용 신뢰구간은 이 작업에서 검증하지 않았다. 변경한 API route에 대한 실제 브라우저 E2E도 미실행이다.
2. 일부 full 응답은 정보가 부족한 원인을 추측하거나 후속 제안을 반복하고, 과거 변경 근거가 생략되면 불필요하게 정정한다. Progressive 대상 회귀는 보완 뒤 2회 통과했지만, 공통 대화 품질 문제가 전부 사라졌다고 주장하지 않는다. 이를 문자열 필터·정규식·의도 상태 머신으로 감추지 않았다.
3. 기존 internal-role policy assertion 실패와 Chromium PDF skip은 별도로 남는다. 실제 외부 업무 성공이나 PDF 품질을 이 평가가 증명하지 않는다.
4. 로컬 `.env.local`의 progressive 값은 서버 시작/환경 재로딩부터 적용된다. 서버를 시작하거나 production 설정을 바꾸지 않았다. 운영 복귀는 `full`로 설정하고 새 요청부터 확인한다. 이미 실행된 업무를 되돌리거나 재시도하는 기능은 아니다.

Raw 요청/응답·source fingerprint·run manifest는 task의 ignored `runs/`에 owner-only로 보관했다. 공개 보고서는 합성 사례의 집계와 한계만 포함한다.
