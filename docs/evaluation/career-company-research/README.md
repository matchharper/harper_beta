# Career company research evaluation

`/career`의 `research_company`가 이직 판단에 필요한 회사 정보를 먼저 충분히 보여주고, 그 근거 위에서 Harper의 관점과 팀원별 의미를 빠르게 설명하는지 확인하는 평가다.

## 평가가 답하는 것과 답하지 못하는 것

이 평가는 production `runCompanySnapshotResearch`와 `buildCompanySnapshotMarkdown`를 그대로 호출해 다음을 사람이 원문으로 검토한다.

- 회사를 정확히 식별하고 규모·상장 여부·국가·정보 가용성에 맞는 조사 축을 선택하는가
- 스타트업은 투자·시장·창업자와 팀원·제품 및 고객 traction·인원 변화, 상장사는 재무·사업부 성장·수익성·전략과 조직 변화, 인수된 회사는 소유구조·통합·자율성과 글로벌 경험처럼 단계별 핵심 정보를 우선하는가
- 회사의 변화·성장·제품·고객·소유구조·팀 신호 중 커리어 판단을 실제로 바꾸는 소수의 신호를 고르는가
- 기본 사실과 비교 가능한 변화 수치를 간결한 문장·표로 이해할 수 있게 만드는가
- 단순 사실 나열을 넘어, 지금 합류했을 때 생길 수 있는 커리어 레버리지를 근거와 함께 설명하는가
- 공시·IR·공식 페이지·정부 자료와 보도·리뷰·소셜 프로필 표본의 증거 강도를 구분하는가
- 중요한 판단을 인용문·강조·인라인 코드·밑줄로 구분하고 장식적인 그래프를 만들지 않는가
- 합성 talent context의 명시적 사실만 이용해 마지막 개인화 관점을 만드는가
- 실제 사용에서 기다릴 수 있는 시간 안에 끝나는가

검색 결과의 장기적 안정성, 실제 사용자의 최종 지원 행동, 회사 내부 비공개 정보의 정확성, 모든 국가·산업의 대표 성능은 답하지 못한다. 보상·복지·근무강도·팀원 후기는 기본 조사 범위에 포함하되, 직무·직급·지역에 맞는 근거가 있어야 추정한다. 개인별 실제 오퍼와 팀 내부의 근무 조건을 보장하지 않는다. 면접 질문 목록은 별도 요청이 있을 때만 다룬다.

## 2026-09-21 커리어 판단 개선 계약

현재 개선 검증은 `cases-v2.json` / `gold-v4.json` / `manifest-v4.json`을 사용한다. 기존 v1의 5개 입력은 그대로 보존하고, 합성 ML 직무 전환·장기 영업 리더십 사례 2개를 추가했다. 과거 v1/v3 결과와는 별도 버전이다. 평가 단위, canonical runner, 개인정보 경계는 아래와 같으며 `--fixture docs/evaluation/career-company-research/cases-v2.json`으로 실행한다.

개선된 기준은 2~3년 후 이력서의 시장 인식, 도메인 경로 의존성, 역량 전이 가능성, 더 쉬워지거나 어려워지는 다음 직무, 내부 성장 경로, 선택지의 교환 관계를 실제 개인 방향에 맞춰 판단하는 것이다. 경력 재진술·학습 가능성·당연한 지역 일치만으로 좋은 기회라고 평가하지 않는다. 숫자는 맥락 속 문장이나 표로 표현하고 별도 블록 그래프는 생성·렌더링하지 않는다. Markdown 인용문·인라인 코드·밑줄·강조를 의미에 맞게 사용한다.

gold v4도 8개 차원, 평균 13/16·사례별 11/16·critical 0의 전체 gate를 사용한다. 이번 진단은 새 2개 사례로 개선 방향을 확인하며 전체 7개 gate를 대신하지 않는다. 공개 회사 보고서와 개인화는 기존처럼 별도 호출하고, 검색에는 개인 context를 전달하지 않는다. 공개 조사는 Luna low(오류 fallback Terra), 개인화는 Terra high(오류 fallback Luna)이다. 공개 검색의 속도와 별개로 개인화 판단의 품질을 다룬다.

## 평가 단위와 frozen dataset

- 평가 단위: 회사명 하나와 합성 의사결정 문맥·talent context 하나
- dataset: `cases-v2.json` (이전 `cases-v1.json` 보존)
- rubric/gold: `gold-v4.json` (이전 `gold-v3.json` 보존)
- 사례 수: 7개
- capture 기준: 2026-09-17 production `company_snapshot`의 최근 완료 행에서 회사명과 생성 시각만 REST `GET`으로 읽고, 한국/해외·정보 풍부/희소·성장 단계가 겹치지 않도록 선택
- 포함: 기존 구다이글로벌(조선미녀), 고수플러스, Moss (PearX W26), Cognite, Speechify 5개 입력과 합성 AITRICS ML 직무 전환·Cognite 장기 영업 리더십 2개 입력
- 제외: 사용자 ID, 대화 원문, 프로필, Search Brief, Memory, 기존 모델 출력, 회사 내부 식별자
- 성격: 최근 실제 요청 회사로 만든 작은 진단 표본이며 production 분포의 대표 추정치는 아니다

회사명과 공개 웹 정보만 외부 provider에 전송한다. 개인화 검증은 모든 사례에서 합성 talent context를 사용한다.

## canonical runner

실행기는 [`scripts/evalCareerCompanyResearch.ts`](../../../scripts/evalCareerCompanyResearch.ts)다. 다음 production 코드를 직접 import한다.

- `runCompanySnapshotResearch`
- `runCompanySnapshotPersonalization`
- `buildCompanySnapshotMarkdown`
- `CAREER_LLM_CONFIG.companySnapshotResearch`와 `companySnapshotPersonalization`

예시 실행:

```bash
node --env-file=.env.local --import tsx \
  scripts/evalCareerCompanyResearch.ts \
  --fixture docs/evaluation/career-company-research/cases-v2.json \
  --output-dir docs/evaluation/career-company-research/runs/<new-run-id>
```

회사 하나를 production 경로로 진단할 때는 `--company-name`, `--reason`, `--talent-context`를 함께 쓴다. 이 경우 runner는 `ad-hoc-v1` 입력 하나만 실행한다.

`--case-id`로 frozen 사례 하나를 선택할 수 있다. `--dossier-run <기존 run 경로>`는 같은 frozen 입력인지 확인한 뒤 공개 dossier를 재사용하여 production 개인화만 실행한다. 검색 변동성을 제외한 prompt/model 비교이며 전체 조사 지연으로 해석하지 않는다. 재사용 원문의 hash와 이번 호출 비용을 별도로 남긴다.

runner는 DB를 조회하거나 쓰지 않는다. frozen case를 순차 실행하고 raw structured output, 실제 렌더링된 Markdown, 지연과 재현 manifest를 지정한 `runs/` 아래에 저장한다. 디렉터리는 `0700`, 파일은 `0600`으로 만든다.

## 실행 조건

- 공개 조사: OpenAI `gpt-5.6-luna` Responses, reasoning `low`
- 개인화: OpenAI `gpt-5.6-terra`, reasoning `high`
- initial search: Exa `deep` 1회, 결과 최대 10개, 10개 회사 판단 질문에 대한 구조화된 synthesis와 원문 highlight를 함께 수집
- repair search: Luna가 초기 결과의 결정적 공백·충돌만 판단해 Exa `auto` 또는 `deep`을 0~3회 호출한다. 같은 turn의 호출은 병렬 실행하고, 각 검색은 결과 최대 10개와 필요한 만큼의 보조 query를 사용할 수 있다.
- freshness/timeout: 고정 최근 며칠 필터와 애플리케이션 12초 timeout을 두지 않는다. 최신 사건은 query와 Exa ranking으로 찾고 오래된 설립·투자·재무 이력도 함께 보존한다.
- synthesis: 공개 회사 보고서는 초기 조사로 충분하면 바로 반환하고, repair가 있을 때만 최종 synthesis round를 한 번 더 실행한다. 실제 개인 context가 있으면 이후 별도 개인화 호출이 최종 세 섹션을 작성한다. 공개 조사에는 reason과 개인 context를 전달하지 않는다.
- output budget: 공개 조사 판단과 구조화 보고서는 최대 128,000 output token, 별도 개인화는 추론을 포함해 12,000 output token을 사용한다. 본문의 길이는 prompt에서 별도로 제한한다.
- fallback: 공개 조사 Terra, 개인화 Luna; provider 오류에 대한 기존 공통 fallback 정책을 사용한다.
- output language: Korean
- sampling: 별도 temperature 없음
- talent context: 합성 문맥만 사용
- provider 전송: 회사명, 합성 reason/context, 공개 웹 검색 결과

## 프롬프트 설계 근거

2026-09-18에 [OpenAI 공식 model guidance](https://developers.openai.com/api/docs/guides/latest-model)를 다시 확인했다. 이 경로는 outcome-first prompt, 최소한의 tool loop, 명시적인 stop rule, structured output, 의도적인 verbosity 설정을 권한다. 검색 계획만을 위한 별도 LLM 호출은 없애고, Exa deep의 question-specific output을 첫 조사에 사용한 뒤 같은 synthesis LLM이 공백만 판단하게 했다.

새 prompt는 다음 순서의 결과를 요구한다.

- 회사 단계·국가·소유구조에 맞춘 `어떤 회사인가요?` 핵심 사실 3~8개
- 투자·실적·팀원/채용·제품/고객·소유구조·시장 진출 중 실제 회사 상태를 바꾼 사건을 날짜순으로 보여주는 `최근 어떻게 달라지고 있나요?`
- 성장·팀원·예상 보상·일하는 방식 등 합류할 사람이 궁금해할 질문형 상세 섹션 3~6개와 각 주장을 뒷받침하는 출처. 제목과 강조점은 회사의 증거에 따라 달라진다.
- 의미 있는 수치 변화는 날짜·단위와 함께 문장이나 작은 표로 표현한다. 별도 그래프 필드는 생성·렌더링하지 않는다.
- 사실을 되풀이하지 않고 합류 타이밍·팀원 수준·시장 및 사업의 미래를 해석하는 Harper의 생각
- Profile·전체 Search Brief·확인된 Memory의 명시적 사실을 회사의 구체적 기회와 연결한 `Harper의 생각`, `커리어 가치`, `Risks & Fit`. 개인 context가 없으면 일반 Harper 관점만 표시하고 나머지 개인화 섹션은 생략한다.

면접 질문, 질문 목록, 포괄적 실사 체크리스트는 생성하지 않는다. 모든 회사에 같은 항목을 강제로 채우지 않는다. 근거가 약한 단정은 생략하되 합류 판단을 바꾸는 구체적인 미확인 사항은 표시한다. 출처 ID와 신뢰도 경고도 화면에 노출하지 않는다. 개인화는 프로필의 각 사실을 회사와 기계적으로 짝짓는 작업이 아니다. 현재 경력과 현실적인 대안에 비해 무엇이 추가되거나 약해지는지를 판단하며, 당연한 지역·언어 일치와 기존 역량 재진술은 장점으로 쓰지 않는다.

## human-review rubric와 release gate

`gold-v4.json`의 공통 rubric을 사례별 원문에 적용한다. 질적 점수는 keyword나 문장 길이로 자동 판정하지 않는다. runner는 응답 존재, 오류, latency, section/source 수 같은 구조적 사실만 기록한다.

각 항목은 `gold-v4.json`에서 0~2점이다.

1. identity와 조사 범위 적합성
2. 사실 레이어의 충분성·가독성
3. 회사 단계·국가·소유구조에 맞는 신호 선택
4. 출처의 신뢰도·최신성·주장 연결
5. 사실·추정·일화·추론의 구분
6. 의사결정에서의 중요도와 Markdown 가독성
7. Harper의 관점·합류 타이밍·생각지 못한 커리어 레버리지
8. 경로 의존성·역량 전이 가능성·현실적인 다음 선택지의 구체성·정직성

배포 전 gate는 평균 13/16 이상, 모든 사례 11/16 이상, critical failure 0건을 기본으로 한다. latency는 계속 기록하되 30초 초과만으로 질적 실패 처리하지 않는다. critical failure에는 회사 오식별, 출처에 없는 핵심 수치·사실 단정, 개인 정보 외부 전송, 빈/깨진 출력, 출처 URL과 보고서 인용의 구조적 불일치, 면접 질문 또는 포괄적 체크리스트 렌더링이 포함된다.

## 이전 v1 출력 계약의 진단 결과

`20260917-luna-exa-v3`은 이전 출력 계약에서 질적 평균 14.0/16, 사례별 최저 10/16, critical failure 0건이었다. 평균 wall time은 42.953초였지만 구다이글로벌 45.427초와 Moss 45.873초가 당시 45초 제한을 넘어 전체 gate는 실패했다.

구다이글로벌·고수플러스·Moss·Speechify는 지원 판단, 불확실성, 개인화 질문이 실용적이었다. Cognite는 공식 제품 자료와 SEC 고객 근거를 찾았으나 같은 날 이전 실행이 찾은 Schneider Electric 인수 발표를 최종 실행에서 놓쳐 10/16으로 평가했다. 이는 검색 결과의 실행 간 변동성과 최신 핵심 사건 coverage가 아직 안정적이지 않음을 보여준다.

수정하지 않은 실제 렌더링 원문, 구조화 출력, manifest와 human review는 gitignored `runs/20260917-luna-exa-v3/`에 owner-only 파일로 보관한다.

## v2 prompt diagnostic

새 출력 계약의 Cognite 단일 진단은 24.940초에 완료됐다. 면접 질문이나 포괄적 실사 목록 없이 산업 AI 실행 플랫폼으로의 확장이 엔터프라이즈 세일즈 커리어에 만드는 레버리지를 3개의 근거 연결 문장으로 설명했다. 이후 같은 output contract를 더 짧게 만들기 위해 insight를 정확히 2개, 개인화 적합 신호와 consideration을 각각 1개로 제한했다. 이 마지막 길이 제한 뒤에는 사용자의 요청에 따라 추가 live run을 반복하지 않았다. 따라서 v2의 5-case release gate는 아직 판정하지 않는다.

## v4 MakinaRocks 단일 diagnostic

2026-09-18 `20260918-makinarocks-v4-128k-single`은 41.124초, Exa 2회, Luna 2회에 완료됐다. API 비용은 Exa $0.024, Luna 추정 $0.0119543, 합계 $0.0359543이었다. 출력 길이 문제는 128,000 token budget으로 해소됐고 사실→시각화→Harper 관점→개인화 순서는 지켰다.

그러나 질적 gate는 실패다. 투자금·투자자와 창업자·팀원 정보가 빠졌고, 연도·비율·모델 수처럼 단위가 다른 값을 한 상대 막대에 놓았으며, 한국 마키나락스와 무관한 미국 SEC 문서를 상장 여부 근거로 인용했다. 이에 private/growth 회사의 투자·최근 성장과 뉴스·리더십·팀원 및 채용 변화 증거를 명시적으로 점검하고, 동일 지표의 변화나 동일 단위의 크기 비교만 시각화하며, 국가·법인이 다른 동명이인 출처를 폐기하도록 prompt와 output contract를 보강했다. 출처 ID·검색 충돌·데이터 신선도 경고는 사용자 화면에서 숨기고, 확신할 수 없는 주장은 생략한다. 이 보강 뒤 live run은 반복하지 않았으므로 5-case release gate는 여전히 미실행이다.

## v5 변화 흐름 3개 회사 diagnostic

2026-09-18에 한국 비상장 성장기업 리벨리온, 글로벌 비상장 성장기업 Canva, 미국 상장사 Cloudflare를 병렬로 한 번씩 실행했다. 세 결과 모두 `회사 한눈에 보기` 다음에 `회사의 변화 흐름`을 렌더링했고 출처 ID는 화면에 노출하지 않았다.

| 회사 | 시간 | Exa | Luna 추정 | 합계 | 변화 흐름 평가 |
| --- | ---: | ---: | ---: | ---: | --- |
| 리벨리온 | 38.237초 | $0.031 | $0.01438551 | $0.04538551 | 합병·프리IPO 투자·매출 성장·팀원 확대·일본 법인과 공급 확대가 연결됨 |
| Canva | 38.985초 | $0.024 | $0.01482641 | $0.03882641 | 투자·Visual Suite·ARR/B2B 성장·AI 경제성·IPO 대응 채용이 연결됨 |
| Cloudflare | 38.381초 | $0.031 | $0.01790750 | $0.04890750 | 상장·분기/연간 매출 성장·AI 제품 확장·약 20% 인력 재편이 연결됨 |

총비용은 Exa $0.086, Luna 추정 $0.04711942, 합계 $0.13311942다. 리벨리온과 Canva는 동일 단위 비교 수치가 충분하지 않아 차트를 만들지 않았고, Cloudflare만 2025년 2분기~2026년 2분기 분기 매출 추이를 표시했다. 이는 단일값이나 혼합 단위를 억지로 그리지 않는 계약과 일치한다.

타임라인 자체는 세 회사 모두 유용했지만 Canva가 상장 대응 채용 사건 뒤에 “상장 시점은 확정되지 않았다”는 불필요한 단서를 붙였고, 세 보고서의 Harper 관점 일부에 추상적인 불확실성 표현이 남았다. 발표된 계획은 계획으로만 적고 확정 여부 단서를 덧붙이지 않으며, 근거 있는 구체적 운영 과제 외에는 일반적인 불확실성 문구를 쓰지 않도록 prompt를 추가 보강했다. 이 보강 뒤 같은 회사들을 재실행하지 않았다.

세 ad-hoc 실행은 실제 개인 context 대신 “별도의 개인 경력 정보는 제공되지 않았다”는 문장을 talent context로 전달했기 때문에, 모델이 이 문장을 근거처럼 취급해 일반적인 지원 조언과 정보 부재 안내를 개인화 섹션에 만들었다. 이는 유효한 개인화가 아니다. production 경로는 Profile, 전체 Search Brief와 관련 confirmed Memory를 개인화 전용 context로 전달하도록 유지하고, context가 비어 있으면 개인화 object를 완전히 비우고 섹션을 렌더링하지 않도록 계약과 검증을 변경했다. context가 있을 때는 각 문장이 팀원의 명시적 사실과 회사의 구체적 사실을 연결해야 한다.

## 2026-09-21 schema v6 로컬 진단

이번 변경은 질문형 제목, 다양한 Markdown, 세 개인화 섹션과 문서 저장·열기·복사·내보내기를 대상으로 했다. 고정 `cases-v1.json`과 `gold-v3.json`은 수정하지 않았다. 기존 8개 질적 지표의 전체 gate를 다시 평가한 실행은 아니며, 다음은 특정 동작을 확인한 진단이다.

- `runs/20260921-question-sections-v6-speechify/`: 초기 검색 schema의 11개 property가 Exa의 최대 10개 제한으로 거절됐다. 중복된 검색 항목을 제거했다.
- `runs/20260921-question-sections-v6b-speechify/`: frozen CCR005 단일 실행, 66.952초, 추정 $0.04024835. 질문형 제목과 세 개인화 섹션을 확인했지만 공용 회사 필드에 개인 역할 문맥이 섞여, 공개 조사와 개인화 입력을 분리했다.
- `runs/20260921-question-sections-v6c-named/`: 합성 이름·경력·선호기준을 추가한 Cognite ad-hoc 실행, 72.936초. 실제 선호기준이 아닌 가정에 ❌를 쓰는 문제를 확인해, 명시적 선호와 반대 근거가 모두 있을 때만 ❌를 쓰도록 보강했다.
- `runs/20260921-question-sections-v6d-named/`: 같은 합성 입력으로 재실행, 78.775초, 추정 $0.04134090. 질문형 회사 설명, 이름을 사용한 세 개인화 섹션, ✅와 ⚠️의 근거 연결을 확인했다. 해당 사례에는 억지로 ❌를 만들지 않았다. 공개 보고서의 복지 설명 한 곳에는 팀원 대신 다른 호칭이 남아, 용어 준수는 여전히 생성 변동성의 한계가 있다.
- 로컬 브라우저에서 실제 채팅 카드·문서 모달을 사용하되 문서 GET 응답만 합성 fixture로 대체했다. 데스크톱과 390px 모바일의 열기, 복사, 원문과 동일한 `.md` export, 실패 시 재시도/비활성 버튼, Escape 닫기를 확인했다. 표 셀과 제목은 같은 primary 색상이었다. 원문과 화면 artifact는 위 마지막 run 폴더에 두었으며, 브라우저 본문은 Speechify 실행 결과다.
- 저장은 fake store 테스트로 사용자 격리·동일 결과 재사용·동시 저장·삭제 유지·변경된 결과의 별도 보존을 확인했다. 인증 없는 실제 로컬 GET은 401이었다. 실제 사용자 계정의 Documents 저장 E2E나 배포는 하지 않았다.

공유 회사 cache에는 개인화 본문을 넣지 않는다. 최종 개인화 보고서는 기존 Documents에 비공개 Markdown으로 저장하며, 저장된 ID만 채팅 문서 카드로 연결한다. 저장이 실패하면 보고서는 유지하고 저장 실패를 알린다.

## 2026-09-21 schema v7 로컬 진단

`cases-v2`/`gold-v4`를 출력 생성 전에 동결했다. CCR006은 기존 SaaS ML 경력의 범용성·의료 도메인 경로 의존성, CCR007은 장기 아시아 영업 리더십을 다룬다. 둘 다 합성 개인 문맥이며 DB 조회·쓰기는 없다. source와 prompt fingerprint는 각 run manifest에 기록했다.

- `20260921-v7-ml` / `20260921-v7-sales`: Luna low 전체 조사 각 119.476초 / 109.290초. 경로 비교가 생겼지만 역할 미확인 조건의 반복과 가정에 붙인 ❌를 확인했다.
- `20260921-v7b-ml-terra` / `20260921-v7b-sales-terra`: 동일 dossier, Terra medium 개인화 각 33.459초 / 31.233초. 구체성은 개선됐으나 조건부 판단 반복이 남았다. 이 두 run의 비용 metadata는 재사용 dossier에서 복사된 값이므로 이번 호출 비용으로 해석하지 않는다. 이후 runner는 개인화 호출의 실제 usage만 기록하도록 수정했다.
- `20260921-v7c-ml-final`: 공개 조사와 Terra medium 전체 경로 105.264초, 추정 $0.073836. 회사 섹션의 본문/사실 중복이 줄고 자연스러운 제목과 Markdown을 확인했지만, 서울 근무를 ✅로 평가해 중요도 기준은 미달했다. `20260921-v7c-sales-final`은 개인화만 30.817초, $0.039894.
- `20260921-v7d-ml` / `20260921-v7d-sales`: 같은 dossier에서 개인화만 36.086초 / 27.401초, $0.046532 / $0.0356596. 당연한 지역 일치가 장점에서 빠지고, 현재 경력에 대한 추가 가치와 다음 직무의 차이를 설명했다. 영업 사례에서 넓은 리더십 목표를 독립 조직 선호로 좁혀 해석하는 문제가 남아 이를 보강했다.
- `20260921-v7e-sales`: 같은 영업 입력, Terra medium 26.205초, $0.037545. 목표 해석은 개선됐지만 조건부 기회를 ✅로 쓰는 변동성이 남아 high reasoning도 비교했다.
- `20260921-v7f-ml-high` / `20260921-v7f-sales-high`: high에서 기존 4,000 token 예산으로 primary와 fallback 모두 출력 계약을 충족하지 못해 개인화가 비었다(각 113.521초 / 97.303초). 실패 run으로 보존하고 개인화의 추론 포함 예산을 12,000으로 늘렸다. usage는 성공 호출만 수집하므로 이 실패 run의 0 비용 metadata는 실제 무료 실행을 뜻하지 않는다.


- 최종 `20260921-v7g-ml-high` / `20260921-v7g-sales-high`: 같은 dossier를 재사용한 Terra high 개인화가 각각 53.416초 / 54.036초, 추정 $0.0442552 / $0.0425112에 완료됐다. fallback 없이 세 본문을 반환했다. 두 출력 모두 일반적인 지역 일치와 가정에 붙인 ✅/❌ 없이, 기존 경력 대비 추가 자산·전이 가능한 성과·다음 직무 차이를 설명했다. ML 사례는 초기 제품 0→1 경력과 상용 의료 AI 운영 경력의 차이를, 영업 사례는 장기 내부 리더십과 인수 통합의 관계를 구분했다. 이름·인용문·코드·밑줄을 사용했다. 다만 역할 불확실성의 반복과 다음 채용시장에 대한 강한 추론은 여전히 사람이 검토해야 하며, 두 건만으로 생성 품질이 보장되지는 않는다. high 개인화 지연은 medium의 약 27~36초보다 길었다. 이는 공개 조사를 제외한 시간이며 비용은 provider 사용량 기반 추정이다.

브라우저에서는 실제 `DocumentPreviewCards`·`CareerProfileWorkspace`·`CareerDocumentDetail`을 사용하고, 문서 GET만 합성 fixture로 대체했다. 카드/목록에서 본문 화면 열기, breadcrumb 복귀, 문서 ID가 있는 URL로 직접 열기, 복사로 전달된 원문, 원문과 같은 Markdown export, 접근 실패 안내와 비활성 버튼을 확인했다. 390px 모바일과 데스크톱에서 dialog가 없고 가로 overflow가 없었다. 실제 v7d ML 보고서에서 인용문·코드·밑줄이 렌더링되며 표 셀과 제목의 색상은 모두 primary였다. 임시 미리보기 페이지와 서버는 검증 후 제거했다.

관련 19개 테스트와 변경 파일 lint, Career 번역 체크가 통과했다. 전체 TypeScript 검사는 이번 변경 밖의 company-side QA fixture와 GTM report test 오류로 실패했다. 실제 사용자 계정의 저장·권한 E2E와 전체 7개 질적 release gate는 실행하지 않았다. 반복 진단은 학습에 사용한 동일 입력에 대한 확인이며 독립적인 일반화 성능 근거가 아니다. 공개 보고서의 모든 웹 주장을 재감사한 실행도 아니다. 별도 그래프 필드/렌더러는 제거했고, 기존 공유 cache를 재사용하지 않도록 schema version을 7로 올렸다. 이미 저장된 과거 Markdown 문서는 변경하지 않는다.

## provenance와 버전 규칙

`cases-v1.json`의 회사명은 2026-09-17 최근 production 완료 snapshot에서 뽑았지만 사용자 데이터는 포함하지 않는다. 합성 reason/context나 회사 목록을 바꾸면 dataset version을 올린다. prompt, 모델, reasoning만 바꿀 때는 같은 dataset version에 새 run을 추가한다.

`manifest-v1.json`은 frozen 파일 hash와 capture 범위를 기록한다. `gold-v2.json`은 2026-09-17에 바뀐 concise insight 출력 계약의 reviewer 기준이다. 각 run manifest는 git revision, dirty diff fingerprint, production prompt 파일 hash, model/provider, 검색 제한, latency와 raw artifact 경로를 기록한다.

`manifest-v3.json`과 `gold-v3.json`은 2026-09-18 fact-first v4 계약을 고정한다. frozen 회사 목록은 바꾸지 않았으며, ad-hoc 단일 실행은 입력 자체의 hash를 run manifest에 별도로 기록한다.

## 개인정보와 외부 전송

- production 캡처는 Supabase REST `GET`으로 `company_snapshot.company_name`, `created_at`, `status`만 읽었다.
- 사용자 ID, 대화, 이력, Brief, Memory, 기존 LLM 출력은 조회·저장·전송하지 않았다.
- 외부 전송 대상은 공개 회사명, 합성 talent context, 공개 웹 검색 결과뿐이다.
- API key는 artifact에 기록하지 않는다.
- raw model output과 원문 보고서는 gitignored `runs/`에만 두고 owner-only 권한을 사용한다.

## 알려진 한계

- 7개 입력이며 국가·산업·상장사 전체를 대표하지 않는다. 새 입력 2개는 사용자 피드백을 바탕으로 만든 challenge 사례이지 독립 holdout은 아니다.
- 최근 요청에는 대기업·상장사가 없어 private/startup 쪽으로 치우쳐 있다.
- Exa 검색 결과와 공개 페이지는 실행 시점에 따라 달라질 수 있다.
- 합성 talent context는 실제 개인화의 맥락 복잡도를 재현하지 못한다.
- 공개 정보가 적은 회사에서 낮은 coverage는 모델 실패와 실제 정보 부재가 섞여 있다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-21 | schema v7: 미래 경력·전이 가능성·선택지 중심 판단, 개인화 Terra high, 장식 그래프 제거, 문서 본문 화면과 밑줄 지원; 합성 challenge 2건 진단 |
| 2026-09-21 | 합류 판단 질문형 구성·세 개인화 섹션·비공개 문서 저장과 미리보기 추가; Speechify/Cognite 진단 및 로컬 브라우저 동작 확인, 전체 5건 gate는 미재평가 |
| 2026-09-18 | 개인 context가 없으면 개인화 섹션을 생략하고, context가 있으면 Profile·전체 Search Brief·confirmed Memory의 명시적 사실과 회사 기회를 직접 연결하도록 계약·검증 보강 |
| 2026-09-18 | 리벨리온·Canva·Cloudflare v5 단일 실행 3건에서 변화 흐름과 선택적 차트를 확인; 발표 계획 뒤 확정 여부 단서와 추상적 불확실성 문구를 제거하도록 prompt 보강 |
| 2026-09-18 | 투자·실적·팀원/채용·제품/고객·인수/상장·시장 진출 중 중요한 사건을 날짜순으로 묶는 `회사의 변화 흐름` 섹션 추가 |
| 2026-09-18 | 출처 ID와 검색 충돌·신선도 경고를 화면에서 제거하고, 차트를 동일 지표의 변화 또는 동일 단위 크기 비교로 제한; 비상장 성장기업은 투자·최근 성장/뉴스·팀원/채용 변화를 우선 탐색 |
| 2026-09-18 | MakinaRocks 128K 단일 실행은 길이 문제를 해소했지만 핵심 정보 누락·혼합 단위 차트·무관 SEC 인용으로 질적 gate 실패; 동일 단위 시각화와 정확한 법인 출처, private-company 핵심 증거 점검을 보강 |
| 2026-09-18 | fact-first v4: Exa deep 10개 결과와 question-specific output을 기본 조사로 사용하고, Luna가 0~3개 근거 공백만 병렬 보완한 뒤 단계별 사실·시각화·Harper 관점·개인화 순서로 출력하도록 재설계 |
| 2026-09-17 | Cognite 단일 v2 diagnostic 24.940초: 질문 없이 산업 AI 확장→엔터프라이즈 세일즈 레버리지 관점 확인; 이후 길이 제한을 더 줄이고 반복 live run 중단 |
| 2026-09-17 | Harper 관점 중심 v2 gold 등록: 면접 질문·포괄적 체크리스트 제거, 1회 Exa 검색·2~3개 insight·25초 gate로 출력 계약 재설계 |
| 2026-09-17 | 최근 요청 회사 5곳 v3에서 질적 평균 14.0/16·critical 0을 확인했으나 2건 latency 초과와 Cognite 최신 인수 누락으로 release gate 실패 기록 |
| 2026-09-17 | 고정 identity 검색 1개와 LLM 계획 검색 2개를 병렬화하고 Exa 자체 디렉터리·미인용 출처를 결과에서 제외; Speechify 동명이인 검색 실패 수정 |
| 2026-09-17 | tool 계획만 Responses로 유지하고 보고서·개인화는 Chat Completions로 전환; Exa를 공식/재무·팀/채용·최신 리스크 최대 3개 병렬 검색으로 보강 |
| 2026-09-17 | Luna 첫 진단의 구조 탈락·네트워크 재시도 장기화를 계기로 필드 길이와 전체 출력을 제한하고 reasoning을 low로 낮춤 |
| 2026-09-17 | GLM 진단 1건도 76.2초가 걸리고 strict schema를 무시해 Luna Responses 단일 최종 구조화와 구조 검증으로 전환 |
| 2026-09-17 | DeepSeek 진단 1건이 101.9초·영어 출력·개인화 누락·시각화/질문 공백으로 gate 미달이라 회사 dossier와 개인화를 분리해 비교 |
| 2026-09-17 | Exa SDK에서 `livecrawl`과 `maxAgeHours` 동시 사용이 400을 내는 것을 확인해 최신 `maxAgeHours` 계약만 사용하도록 수정 |
| 2026-09-17 | Muse Spark 1.3의 계정 attestation 403과 Luna Chat Completions tool 400을 확인해 DeepSeek V4 Flash primary + Luna Responses fallback으로 수정 |
| 2026-09-17 | 최근 실제 요청 회사 5곳, 합성 개인화 context, OpenRouter + Exa 평가 계약 등록 |
