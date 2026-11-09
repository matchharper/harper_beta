# Resume company resolution evaluation

`/career/onboarding`에서 이력서로 구성한 경력의 회사명을 기존 `company_db` 회사와 정확히 연결하는 resolver를 평가한다. 목표는 잘못된 자동 연결을 만들지 않으면서, 이름만으로 확정할 수 없는 회사도 내부 후보 검색과 저비용 LLM 검증으로 찾는 것이다.

이 평가는 프로필 보강, 경력 추출 품질, 직무명·기간 정확도, 회사 정보 생성 품질을 다루지 않는다. 이미 구조화된 경력의 `company_name`과 `company_location`만 입력으로 사용한다.

## 평가 단위와 frozen dataset

- 평가 단위: 이력서 보유 사용자 1명의 구조화된 회사 경력 최대 10개
- 현재 holdout dataset: `private-random20-v2`
- 표본: `resume_text`가 비어 있지 않고 삭제되지 않은 사용자 중, 회사명이 있는 경력을 가진 신규 사용자 20명·경력 125개
- 표본 추출: 전체 eligible 사용자 ID를 고정 seed와 ID의 SHA-256으로 정렬한 뒤 앞에서부터 20명을 선택한다.
- v2는 기존 pilot 5명의 ID를 추출 대상에서 제외했으며 사용자 중복이 없다.
- resolver 입력: 회사명과 회사 위치만 사용한다. 저장된 `company_id`, `company_link`, 이력서 원문은 resolver에서 제거한다.
- private fixture: `private/random20-v2.json`에 사용자 ID와 회사명·위치·기존 연결 근거를 owner-only로 보관한다.
- 공개 gold: `gold-v2.json`에는 익명 case/experience ID, 기대 `company_db.id`, 판정 상태만 둔다. 77개는 기존 회사 연결 가능, 48개는 기존 회사 없음으로 판정했다.

v2 gold는 GLM을 한 번도 실행하기 전에 확정한 blind manual gold다. 20명도 production 전체의 국가·산업별 성능을 대표하기에는 작지만, 같은 입력을 보며 구현을 보정한 v1보다 현재 방식의 실제 품질을 판단하는 우선 근거다.

최신 개선 결과는 [`reports/random20-v2-multicandidate-audit.md`](reports/random20-v2-multicandidate-audit.md)에 기록했다. 모든 이름 기반 연결에 후보 최대 8개 selector와 병렬 auditor 2개를 적용한 GLM 5.3 Flash high 설정을 3회 반복했으며, 다른 실제 회사로 연결한 경우는 3회 모두 0건이었다. 사후 real-company identity 기준 평균 precision 100%, recall 75.8%, exact accuracy 85.1%다. resolver 평균은 이력서당 8.898초, 비용은 20명당 $0.007212였으며 Exa는 호출하지 않았다.

frozen gold의 단일 exact ID와 비교하면 매회 4건의 차이가 남고 strict precision은 평균 93.1%다. 네 건은 모두 동일 실제 회사의 중복 `company_db` 행이며 선택된 행이 공식 identity 또는 workspace 연결을 가진 경우다. 이 identity 판정은 결과를 본 뒤 한 사후 검토이므로 blind release 지표가 아니다. gold-v2는 수정하지 않았으며 exact canonical-row gate는 계속 NO-GO다.

최초 v2 후보 1개 방식의 결과는 [`reports/random20-v2.md`](reports/random20-v2.md)에 보존한다. 당시 3회 평균 precision 88.1%, recall 76.6%, exact accuracy 84.5%, false link 실행당 8건이었다.

이전 5명 v1은 구현 방향과 오류 유형을 확인한 unblinded pilot로만 보존한다. 당시 정상 완료한 4회는 precision 100%, recall 78.6~100%였지만 독립 holdout 품질을 과대평가했다. GLM 결과는 [`reports/pilot-v1-glm53.md`](reports/pilot-v1-glm53.md), Exa 비교는 [`reports/pilot-v1.md`](reports/pilot-v1.md)에 있다.

## production resolver와 입력 계약

canonical implementation은 [`src/lib/talentOnboarding/companyResolution.ts`](../../../src/lib/talentOnboarding/companyResolution.ts)다. production 기본 경로는 다음 순서로만 자동 연결한다.

이 resolver는 profile ingestion에 정제된 이력서 본문이 전달된 경우에만 실행한다. 이력서와 LinkedIn을 함께 제출한 경우에는 실행하지만, LinkedIn만 제출한 경우에는 내부 후보 조회와 GLM 호출을 모두 건너뛴다.

1. 이미 검증 가능한 내부 `company_db.id`
2. LinkedIn actor의 별도 `linkedin_company_id`
3. 정확히 일치하는 LinkedIn 회사 URL 또는 공식 홈페이지 도메인
4. `company_db.name`, workspace 회사명·공개명에서 유일한 exact name
5. 아직 미해결이면 exact name, 순서가 있는 multi-token pattern, 개별 name token 검색으로 경력당 후보를 최대 8개 만든다. 정확한 이름 token이나 법인 접미사를 제거한 identity key가 겹치지 않는 substring-only 결과는 후보에서 제외한다.
6. 이름 기반 연결은 exact name이 유일해도 후보의 공식 URL·LinkedIn company identity·설명·workspace 연결명을 포함해 GLM 5.3 Flash high selector에 보낸다.
7. selector가 제안한 행만 별도 high auditor 2개가 병렬 검증하고, 둘 다 제안을 승인하며 정확한 조직과 canonical 행이 명확할 때만 연결한다. 애매하면 미연결한다.

GLM에는 회사명·위치와 후보 최대 8개의 identity metadata만 보낸다. 사용자 ID와 이력서 원문은 보내지 않는다. 모델이 후보에 없던 ID를 반환하거나 auditor가 승인하지 않으면 자동 연결하지 않는다. resolver는 회사 행이나 workspace를 새로 만들지 않고 기존 `company_db.id`만 경력에 기록한다. Exa 코드는 비교 평가용 선택 경로로 남아 있지만 production 기본값에서는 호출하지 않는다.

## canonical runner

실행기는 [`scripts/evalResumeCompanyResolution.ts`](../../../scripts/evalResumeCompanyResolution.ts)다. Supabase client의 `GET`/`HEAD` 이외 HTTP method를 차단해 production 데이터 capture와 회사 조회를 read-only로 제한한다.

```bash
node --env-file=.env.local --import tsx \
  scripts/evalResumeCompanyResolution.ts \
  --capture-count 20 \
  --dataset-version private-random20-v2 \
  --strategy glm \
  --seed resume-company-resolution-random20-v2 \
  --exclude-fixture docs/evaluation/resume-company-resolution/private/pilot-v1.json \
  --fixture docs/evaluation/resume-company-resolution/private/random20-v2.json \
  --gold docs/evaluation/resume-company-resolution/gold-v2.json \
  --output-dir docs/evaluation/resume-company-resolution/runs/<run-id>
```

`--strategy db-only|exa|glm`으로 같은 frozen fixture에서 구현만 비교한다. `candidate-only`는 GLM 호출 전 내부 후보를 blind label 검토에만 사용하는 진단 모드다. 입력 또는 manual label이 바뀌면 dataset/gold version을 올리고 이전 파일을 덮어쓰지 않는다.

## 실행 조건

- 내부 조회: Supabase read-only select
- 후보: 경력당 내부 후보 최대 8개
- LLM: OpenRouter `z-ai/glm-5.3-flash`, reasoning `high`
- 호출 방식: 이력서당 전체 후보를 batch한 selector 1회, 제안이 있으면 conservative auditor 2회 병렬 실행 후 만장일치 승인
- 외부 검색: production 기본 경로에서는 Exa 0회
- 외부 전송: 회사명·위치와 후보 회사의 identity metadata만
- 비용: 응답 token usage와 repository pricing registry로 계산
- raw fixture/output: gitignored `private/`, `runs/`, 디렉터리 `0700`, 파일 `0600`

## metric과 release gate

- `precision`: 자동 연결한 경력 중 gold 회사가 정확히 같은 비율
- `recall`: 내부 회사가 존재한다고 label한 경력 중 정확히 연결한 비율
- `exactAccuracy`: `no_company_db_match`를 포함해 match/unresolved가 gold와 같은 비율
- `falseLinks`: 다른 회사에 자동 연결한 수
- `coverage`: 전체 경력 중 자동 연결 비율
- latency: 이력서별 resolver wall time과 전체 wall time
- cost: GLM 호출·token·USD와 Exa 호출·USD 합계

잘못된 회사 연결은 이후 회사 정보와 workspace 관계를 오염시키므로 배포 전 핵심 gate는 `falseLinks=0`, precision 100%다. recall과 coverage는 함께 보고하되 precision을 낮춰 높이지 않는다. 최초 v2 방식은 매회 7~9개의 false link로 실패했다. multi-candidate + double-audit 방식은 사후 real-company identity 검토에서 다른 회사 false link가 0이었지만, 같은 holdout을 보며 개선했고 strict exact-ID 차이가 4건 남으므로 신규 blind holdout 전에는 release gate를 통과한 것으로 간주하지 않는다.

## gold 작성과 provenance

기존 저장 `company_link`와 실제 `company_db` URL은 reviewer 참고 근거일 뿐 자동 정답이 아니다. 회사명, 위치, 공식 사이트/LinkedIn과 내부 행을 사람이 확인해 label한다. resolver 결과를 본 뒤 label을 만든 경우 manifest에 unblinded adjudication이라고 기록한다.

`manifest-v2-multicandidate-audit.json`은 최신 selector/auditor 설정, strict frozen-gold 결과, 사후 identity adjudication, 비용과 지연을 기록한다. `manifest-v2.json`은 최초 v2 후보 1개 방식, `manifest-v1.json`은 최초 Exa pilot, `manifest-glm-v1.json`은 같은 v1 입력의 GLM 결과를 보존한다. 각 run의 실제 source fingerprint, 비용, 지연, metric은 gitignored `runs/<run-id>/manifest.json`에 둔다.

## 개인정보 경계

- runner는 이력서 보유 여부만 필터로 사용하고 `resume_text` 본문을 select하거나 외부로 보내지 않는다.
- 사용자 ID와 실제 회사 경력 조합은 local-only private fixture/run에만 둔다.
- 공개 gold에는 사용자 ID·회사명·역할·기간·이력서 원문을 넣지 않는다.
- API key는 어떤 artifact에도 기록하지 않는다.
- DB write, workspace 생성, 경력 업데이트, 메시지·이메일 발송은 하지 않는다.

## 알려진 한계

- 20명·125개 경력도 rare 동명사, 법인명/브랜드명 차이, 해외 지사 전체를 대표하지 않는다.
- 저장된 구조화 경력 자체가 이력서 추출 오류를 포함할 수 있다.
- `company_db`에 회사가 없으면 resolver는 의도적으로 미연결한다.
- GLM 응답은 같은 입력에서도 일부 달라질 수 있다. 그래서 두 응답 합의와 반복 실행 결과를 함께 본다.
- OpenRouter timeout이면 해당 batch는 fail-open으로 미연결 처리한다. timeout 호출의 실제 청구 여부는 성공 응답 metadata만으로 확인할 수 없다.
- 현재 exact-name 비교는 Unicode NFKC, 대소문자, 연속 공백만 정규화한다. 법인 접미사 제거·fuzzy string score로 강제 연결하지 않는다.
- 동일 실제 회사의 중복 `company_db` 행 중 어느 하나가 canonical인지 나타내는 durable DB 관계가 없다. workspace와 공식 URL이 서로 다른 행에 있거나 여러 workspace가 중복 행에 연결될 수 있다.
- multi-candidate 개선은 같은 v2 holdout 결과를 본 뒤 이루어졌고 identity-level 오류 검토도 사후 판정이므로, 신규 blind holdout에서 0 false link를 재확인해야 한다.
- v1은 resolver 출력을 본 뒤 작성한 unblinded pilot이므로 독립 accuracy 근거로 사용하지 않는다.
