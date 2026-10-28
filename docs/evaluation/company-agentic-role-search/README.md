# 회사 대화 기반 Role 검색 평가

[Run Search 추가·교체 계약 로컬 확인](REPORT-PUBLICATION-ADD-20261027.md): 기존 ARS05를 변경 없이 실행했으나 평가용 DB 컬럼 부재와 공유 checkout source drift로 모델의 실제 추가 완료는 검증하지 못했다. 별도 웹·Worker·임시 PostgreSQL 대상 검증과 구분한다.

[운영 원본 정기 선정·메시지 저장 검증](LIVE-SCHEDULED-PREVIEW-V1.md): 2026-10-24 vooy·가우디오랩 현재 원본으로 재현한다. 사용자가 허용한 DB 쓰기는 평가·선정 명단·메시지 원문이며 실제 추천·연결 상태 변경과 외부 발송은 제외한다.

[정기 compact-selection-v2](SCHEDULED-SELECTION-V2.md)는 Top 50 + 수락 전원 입력에서 회사 LLM이 바로 선정하는 새 계약이다. v1 원문 전체 비교 방식과 결과를 보존하고 별도 run으로 검증한다.

[JOURNEY-V3](JOURNEY-V3.md)는 2026-10-24 요청한 회사 LLM의 명시적 후보 선정과 현재 회사 연속 20년 조건을 검증한다. 앞선 Top N 자동 발행 계약을 대체하는 로컬 구현이며 운영 배포를 뜻하지 않는다.

## 2026-10-23 기존 역할의 연속 화면 검증

[JOURNEY-V1](JOURNEY-V1.md)은 사용자 지정 기존 역할의 전체 검색, 웹 Criteria 삭제·추가, 정기 실행 시작 경계, 강한 조건과 후속 승인 전후를 로컬 사본에서 관찰한다. 운영 서비스 검증이나 배포 완료를 뜻하지 않는다. 실행 원문·후보별 집합·화면 증거는 ignored `runs/journey-*`에 보존한다.

[JOURNEY-V2](JOURNEY-V2.md)는 사용자의 예시 정정에 따라 3번을 직무 관련 조건으로 검증한다. 2번 완료 직후의 10명 상태에서 현재 토론토 거주·주 5일 출근 조건을 대화로 입력하고 전체 목록 변화와 집계를 확인한다.


## 정기 검색의 실제 회사 3곳 검증

[별도 평가 계약 SCHEDULED-READONLY-V1](SCHEDULED-READONLY-V1.md)은 정기 회사 LLM → Worker → 소개문 → 후속 판단을 검증한다. 위임·판단 계약과 입력은 수동 Top N 검색 실험과 구분한다. 실제 회사·후보·출력 원문은 ignored runs에만 보존하고, DB 쓰기·외부 발송은 금지한다. 시간은 실측값으로 보고하며 임의 시간 상한을 품질 실패로 취급하지 않는다.

## 현재 판정과 앞으로의 자연어 평가 범위

[원래 요청 전체 감사·Top N 목록 교체](AUDIT-2026-10-23.md)가 이전의 포괄적인 ‘구조 마무리’ 표현보다 우선한다. 전체 재평가 뒤 기존 미응답 목록을 새 Top N으로 교체하도록 수정했고, 로컬 저장·조회 경계를 검사했다. 최신 코드의 전체 자연어 대화 재실행까지 완료한 것은 아니다.

사용자가 제외한 ‘미추천 후보 이름 검색’과 ‘수락한 사람 전부 표시’는 앞으로의 평가/완료 판정에서 제외한다. **현재 자연어 평가 목록은 [natural-v3의 4개](NATURAL-V3.md)**이며 `manifest-natural-v3.json`을 사용한다. 이전 v1/v2와 원문 로그는 역사 자료로 보존한다. ID 기반 미추천 프로필 열람, 평가 이력·Memory 등 원래 일반 기능 점검은 유지한다.

## 2026-10-23 criteria 작성 reasoning 비교

[동일 입력 low·medium·high 비교 계약](CRITERIA-REASONING-V1.md): 기존 두 실제 역할 Top 10씩을 유지하고 `gpt-6-luna` reasoning만 바꿔 각 한 번 실행한다. 후보별 출력 원문, 토큰·비용, 병렬 경과 시간을 보존한다. production 모델 설정 변경·DB 저장·추천 발송은 없다.

[실행 결과](REPORT-CRITERIA-REASONING-V1.md): 60회 모두 첫 시도 성공, criteria 설명 300개와 기존 점수·라벨 보존을 확인했다. 전체 실행 134.3초, 공개 요율 기준 합계 추정 $0.11380–$0.15071. 각 조건 1회이며 품질 우열이나 운영 설정 채택을 확정하지 않는다. 전체 비교 원문은 ignored run에 저장했다.

## 2026-10-23 대화 검색 Top N·3차 설명 재검증

당시 결과: [조회·Top N·설명 작성 재검증 보고](REPORT-TOPN-WRITING-V1.md). 두 실제 역할의 기존 평가를 유지해 각각 10명·50개 criteria 설명을 작성했다. 선정 LLM 호출은 0이며 100개 점수·라벨을 보존했다. 당시 남았던 기존 추천 제거는 위 후속 감사에서 수정했으며 조회 누락은 남아 있다.

사용자의 정정에 따라 대화 검색의 LLM tournament/reranking을 제거한다. [실험 계약](SELECTION-REPLAY-V1.md)에 따라 기존 두 실제 역할 capture·v61 평가값을 그대로 재사용하고, 점수 Top N과 실제 3차 설명을 새 run에 기록한다. [구조 gold](selection-gold-v1.json)를 사용하며 이전 결과와 gold는 덮어쓰지 않는다. 별도의 조회 SQL 진단은 read-only 현재 DB 관찰이며 동결 모집단의 선정 결과와 섞지 않는다. 정기 검색은 변경하지 않는다.

## 실제 역할 읽기 전용 관찰 (2026-10-23)

[완료 집계·한계](REPORT-READONLY-ROLES-V1.md): 최종 Designer 3,503명 → 139명 → 선정 5명, FDE 3,554명 → 2,051명 → 선정 10명. 운영 DB 쓰기·발송 0, 평가 실패 0이며 개별 원문은 ignored run에만 보존한다.

[READONLY-ROLES-V1.md](READONLY-ROLES-V1.md): 사용자가 지정한 실제 Designer/FDE 두 역할의 검색·1차·2차·선정. DB 변경 없이 실제 모델을 호출하고 원문·분포·선정·시간을 ignored run에 보존한다. v60은 1차의 상세평가 보존 목적을 명시하고, 1·2차 공통 정책/원문을 한 번만 전달한다. 첫 실행에서 발견한 과도한 업무 통과를 v61의 일반 업무 질문으로 보완하고 동일 capture로 재확인한다. 기존 frozen 평가와 결과는 변경하지 않는다. [동결 manifest·gold](read-only-roles-manifest-v1.json), canonical runner `harper_worker/llm_evals/company_agentic_role_search/read_only_role.py`, 입력 비교 `audit_read_only_inputs.py`를 따른다.

## 2026-10-23 후속 개선 계약과 결과

결과: [전체 요청 대조표와 구조 마무리 보고](REPORT-2026-10-22.md). 기존 6개 대화를 같은 초기 상태로 재확인했고, 중단 1건의 명시적 복구와 원본 비용도 분리 보존했다. 관련 구조 검증 152개 통과. 의미 판단 오류는 별도 평가 과제로 남겼으며 웹·Worker는 미배포다.

후속 구조 점검은 평가의 완벽한 정답률을 완료 조건으로 삼지 않는다. 현재 가장 안정적인 Decisions
질문을 기준으로 원문 중복 배치만 분리한 한 번의 비교를 기존 2차 11건에 수행한다. 1차 34건의 요청은 바꾸지 않으므로 이 비교에서는 추가 호출하지 않는다. 모든 실패는
보존하고 회귀가 있으면 채택하지 않는다. 제품 구조는 후보별 1차 저장 후 2차로 이어지는 공통
병렬 실행, provider 질문 수 경계의 무손실 분할, 평가 전용 요청의 추천 변경 금지, 부분 평가
실패의 실제 완료 범위·usage 보존을 점검한다. 의미 분기·새 평가 모델·정답 보정은 추가하지 않는다.
변경 뒤 원래 대화 eval 중 영향받는 기존 사례를 같은 baseline으로 실행하고 원문·시간·사용량을
검토한다. 가격표 추정 비용과 provider가 보고한 실제 비용은 구분한다.

2026-10-23 사용자 재확인: 비용과 실행 시간 때문에 **1·2차 모두 Decisions API를 유지한다.**
일반 Luna/Sol 추론 API 비교는 과거 원인 진단 기록이며 제품 교체나 fallback 채택의 승인이 아니다.
이후 개선과 채택 판단은 Decisions의 prompt·context·질문/출력 계약 안에서 진행하고 정확도와
실제 호출 수·입력량·지연을 함께 확인한다. 아래 11건 결과는 선택된 근무 조건 사례의 의미 검토이며
전체 2차 평가 정확도, 모든 criteria·fit 축의 통과 또는 운영 전환 근거로 해석하지 않는다.

사용자 요청에 따라 남은 1·2차 의미 오류와 대량 조회 입력량을 개선한다. 원래 `cases-v1`·`gold-v1`·
`bootstrap-v3` 및 기존 pointwise 진단 자료는 변경하지 않는다. 먼저 동일 `screen-api-policy-contract-v1`과
`fit-api-policy-contract-v1` 원문에 대해 질문 계약을 비교한다. 기준별 상태는 순서가 있는 능력 수준과
동일하지 않으므로, `choice`의 명시적 의미와 확률을 사용한 대안도 검토한다. 1차에는 미확인 상태에서도
평가를 계속하는 명령을 명시하며, 코드가 입력 문장의 의미를 판정하거나 점수를 보정하지 않는다.
전체 원문은 공통 input에 한 번 보존하고 질문마다 같은 Brief·Memory를 복제하지 않는 방식을 비교한다.

v41은 현재상태 조건을 놓치는 회귀가 있어 채택하지 않았다. 이어지는 v42 비교는 위 두 동일 dataset의
원본 요청에 공식 policy 배치만 적용한 v40 근거·질문을 보존하고, 1차 미확인 continue 선택지와
2차 choice 형식만 바꾼다. 근거 중복 제거와 선택지 변경의 효과를 분리하기 위한 비교이며 원문을
추출·요약하지 않는다. 실제 입력 hash로 원본 요청을 연결하는 코드는 진단 전용이고 runtime 분기가 아니다.

v43은 기존 binary/score 계약을 유지하면서 질문 근처의 원문을 세 출처로 분리한다. 기회가 제공하는
근무지·형태·회사 사실, 회사가 검토하려는 후보 조건, 후보자의 현재 사실·Brief·Memory를 명확히
구분한다. 현재 원문의 필드를 그대로 옮기며 파생 사실·조건 분류·정답 문구를 생성하지 않는다.
이전 role-actor 배치 진단은 비지원 developer policy를 사용했으므로 공식 계약 상태에서 별도로
재비교한다. v41/v42 실패와 원래 gold는 그대로 유지하며 해당 효과를 확정된 원인으로 주장하지 않는다.

v44는 같은 세 출처를 모든 질문에 복제하는 대신 named assessment의 필요한 원문 근처에 둔다.
회사측 질문은 현재 Hiring Brief와 후보 사실, 후보측 질문은 기회의 실제 제공 조건과 후보 사실을
보며 전체 공통 원문은 유지한다. 2차는 기회 제공 조건·후보 사실을 함께 보여 준다. 회사 Brief의
변경 우선순위는 기존 공통 계약이며, 코드가 문장의 의미나 적용 조건을 추출하지 않는다.

v45는 공통 input을 후보 원문·회사 Memory로 구성하고 역할 근거를 질문 쪽으로 옮기는 projection이다.
1차와 2차 전체 fit 질문은 현재 Hiring Brief·모든 criteria·기회 설명/사실을 유지한다. 기준별 2차
질문은 해당 기준 원문과 기회의 구조적 사실·회사 설명을 사용하며, 다른 기준이나 구 공고의 다른
자격조건이 이 기준의 판단을 대신하지 않게 한다. 원문 source hash와 변환 후 요청 hash를 모두
남기며 조건을 추출하거나 임의로 요약하지 않는다. binary/score 답 계약은 v40 그대로다.

v46은 후보 실질 조건 질문을 실제 Brief 행 단위로 구성한다. 각각 같은 기회·전체 원문을 보며 명시적 중단 명령만 기존 executor가 합친다. 별도 의미 분류·키워드 routing·새 저장 상태를 만들지 않는다. 파생 Behavior 해석을 빼고 원본 Memory를 보존한 입력도 비교한다. 기준별 2차는 해당 문장만 판단하는 간결한 choice 계약을 비교하며 원본 점수/정답은 보존한다. 이 대안도 진단 통과 전 제품에 채택하지 않는다.

v47은 기존 세 질문과 score 계약을 유지한 채 practical 판단을 직업 역량과 분리하고, 후보의 실제 의무·가능 범위도 조건이라는 일반 의미를 명시한다. 기준별 질문에서는 다른 기준을 섞지 않으며 원문의 배타성·예외를 읽도록 한다. 특정 장소·후보·기대 결과는 prompt에 넣지 않는다.

v48은 질문별 근거 입력을 별도 Decisions 요청으로 분리하는 비교다. 1차 practical 입력은 현재 조건·프로필 신원·전체 Brief/Memory, 업무 질문은 전체 원문을 본다. 2차 기준 질문은 해당 기준 원문·구조적 기회 사실·전체 후보 원문을 보고 다른 기준을 복제하지 않는다. 전체 fit은 원문을 유지한다. 후보 한 명 원칙·기존 판정 계약은 같으며 호출 수 증가와 입력량을 함께 기록한다. Canonical 진단 runner의 선택적 contract.evaluate hook이 실제 요청별 payload/응답을 기록한다. 실제 제품의 호출·캐시 구조 변경은 채택 전에는 하지 않는다.

v49는 같은 동결 34+11건으로 Decisions의 짧은 결정 방식과 일반 gpt-6-luna low 추론 호출을 진단 비교한다. 제품 변경이 아니라 원인 분리이며 기존 1·2차 Decisions 요구를 대체하지 않는다. 실제 endpoint·전체 응답·근거·usage를 기록한다. 이 비교의 level 값은 단일 판단이며 Decisions 확률가중 점수와 비교하지 않는다.

v50은 현재 사실·원문 조건을 근거 가까이에 유지하고, 자유 topic label이 조건 강도를 대신하지 않도록 content를 먼저 표시한다. label·원문·수정시각은 보존하고 문자열 의미를 분류하지 않는다. 명시 제한과 희망 방향의 차이를 일반 질문에 명확히 하며, 기존 binary/score 계약을 유지한다.

v51은 현재 사실과 원문을 유지하고 조건문의 적용 범위·주체·시점·술어를 보존하는 일반 질문으로 비교한다. 조건부 요구를 전제가 다른 상황의 금지로 확대하지 않으며, 선호 topic 아래의 실제 의무도 원문 뜻으로 읽는다. 기존 3개 명령·score 형식과 source/gold를 유지한다.

v52는 v49와 동일한 원문·질문·일반 API에서 reasoning만 high로 바꾼 진단이다. 1·2차 production은 계속 Decisions이며, 추론 유무와 prompt 문제를 구분하기 위한 비교다.

v53은 일반적인 불확실성 유지 규칙보다 원문이 정한 검토 전제와 실제 제약이 우선임을 명확히 한다. 명시적 확인 전제, 임시 의무, 조건문의 적용 범위를 읽되 선호를 금지로 바꾸지 않는다. formal 비협상 용어를 요구하지 않고, 2차 기준의 술어(능력/현재 사실/수용 의사 등)를 다른 요구로 바꾸지 않는 공통 계약을 비교한다. 원문·평가 gold·실행 명령 계약은 유지한다.

v54는 v53의 practical 질문에 선호 차이로 계속·미확인으로 계속하는 명시 선택지를 제공한다. 모두 기존 continue 명령이며 확률/키워드로 판정을 바꾸지 않는다. 2차에서는 검토 전 확인 요구를 일반화하는 문장을 제거해 기준의 확인 필요를 곧 실패로 오독하지 않는지 비교한다.

v55는 같은 stage1 34건에서 v53의 원문 우선 계약을 일반 Luna high 추론 API로 비교한다. 1차 source 읽기·prompt와 무추론 결정 방식의 영향을 분리하며, production API 변경은 아직 하지 않는다. v52 stage2 11건은 각 원문을 확인한 뒤 별도로 검토한다.

v56은 같은 동결 34+11건에서 일반 gpt-6.1-sol high를 독립 진단으로 비교한다. 1차는 v53의 원문 우선 질문, 2차는 v52의 원래 기준 질문이며 실제 model/endpoint는 각 payload에 기록한다. runner의 baseline model 필드가 이 비교의 실제 model을 대신하지 않는다. production Decisions 계약은 아직 변경하지 않는다.

v57은 가장 보존율이 높았던 v40의 실제 요청 원문·정책 배치·선택지·score 형식을 그대로 유지하고, 후보 의무의 의미 및 조건문의 논리 범위를 명시하는 짧은 문장만 추가한다. 앞선 여러 변경의 효과를 분리하기 위한 동일 payload 기반 비교이며 source hash lookup은 진단 전용이다.

v58은 v40 질문·명령·score 계약을 바꾸지 않고 candidate practical 질문 근처에 기회의 구조적 제공 조건과 후보 원문을 짝지어 놓는다. v44와 달리 근처에 구 공고의 전체 직무 설명을 반복하지 않는다. 회사 practical 질문은 현재 회사 기준과 후보 사실을 보며, 전체 공통 원문은 그대로 유지한다. 2차에도 동일한 구조적 기회 사실을 후보 원문 근처에 둔다.

Canonical `screen_diagnostic.py --contract-file=<ignored runs의 versioned module>`은 해당 모듈의
`build_request`·`parse_assessment`만 평가 프로세스에서 사용한다. 다른 역사적 변환 옵션과 혼용하지
않으며, 원문/gold hash·실제 payload·모듈 hash·전체 출력·usage를 새 run에 보존한다. v41 대안은
세 개의 1차 명령(두 continue 명령과 exclude) 및 2차의 기존 다섯 의미 범주를 유지한 choice다.
범주 확률로 계산한 기존 표시 척도는 ordinal 기대값이며 새로운 합격선이나 의미 보정은 아니다.
이 비교는 기존 실패를 반복 관찰한 작은 진단이다. 전체 성능으로 확대하지 않으며 채택 후 같은 원래
대화 eval과 실제 전달 입력을 다시 확인한다. 실제 호출 전 원문·정답·현재 소스를 고정한다.

`read-projection-v1` 실제 ARS14에 이어 `read-projection-v2`는 같은 입력/초기 DB에서 일반 profileSections 선택을 비교한다. 선택한 원문 구획은 자르지 않으며, 누락된 구획을 명시한다. 각 run의 답변·대상·관계·입력량을 별도로 검토한다.

대량 조회는 일반 후보 reader에서 경력/학력의 구조적 개요와 상세 원문을 선택할 수 있도록 한다.
필요한 상세 수준은 원본 LLM이 선택한다. 후보 수 제한·본문 길이 절단·숨은 요약 모델로 해결하지 않는다.
같은 ARS14의 대상·누락·관계 표시·근거 정확도와 실제 completion별 input tokens를 함께 비교하고,
입력량 감소만으로 품질 통과를 판정하지 않는다. 운영 배포나 기존 실험 결과 수정은 포함하지 않는다.

문서 기준: 2026-10-22. 이 문서는 새 실험의 실행 계약이다. 결과·운영 반영·배포 완료를 뜻하지 않는다.

## 목적과 평가 단위

회사와 대화하는 원본 LLM이 실제 Role·후보자·평가 이력을 읽고, 남은 결과 재사용, 미평가 후보 탐색,
기준 변경 후 재평가, 특정 후보 추천, 범위별 Memory를 일반 도구로 이어가는지 검증한다.
단위는 `cases-v1.json`의 독립 대화 전체다. 같은 대화의 후속 발화에는 직전 실제 출력과 저장 효과가 이어진다.
다른 대화·새 실험은 동일한 동결 snapshot에서 다시 시작한다. 후보자 프로필이나 가짜 fit 결과를 만들지 않는다.

선택 조건은 **실제 활성 유료 Slot이 연결된 기존 Role**이다. 조회한 운영 DB에 그 Role이 없으면
조건 미충족으로 기록하고 임의로 무료·legacy를 유료 Slot으로 바꾸지 않는다. 명시적인 별도 동의가
있으면 legacy snapshot으로 관찰할 수 있지만 paid-Slot 기준 통과라고 보고하지 않는다.

2026-10-22 사용자가 기존 계약의 유료 권한 Role로 실험하는 것을 명시적으로 승인했다. 이후 run은
`sourceConditionAcknowledgment=legacy-approved-by-user`를 기록하며 실제 Slot 존재 여부를 바꾸지 않는다.
운영 저장 구조도 별도 승인으로 적용했지만 실험의 대화·검색·추천·Memory 변경은 계속 로컬 사본에만 쓴다.

## 동결 자료와 변경 규칙

- 입력: `cases-v1.json`. 인물·회사·역할 이름은 포함하지 않으며 실제 snapshot 참조만 실행 전에 연결한다.
- 의미 gold: `gold-v1.json`. 첫 모델 호출 전에 고정한 기대 행동·상태·실패 경계다. 모델에게 제공하지 않는다.
- 재현 manifest: `manifest-v1.json`. 공개 입력/gold의 hash와 canonical runner를 기록한다.
- 실제 자료: `private/<capture-id>/tables.json`, `schema.json`, `manifest.json`. 실제 role/talent 원문을 그대로 캡처한다.
- 실행: `runs/<run-id>/`. 이전 실패·비용·출력을 덮어쓰지 않고 새 run을 만든다.

모델·prompt·제품 코드 변경은 같은 입력/gold/snapshot에 대한 새 run이다. 입력이나 실제 snapshot이 바뀌면
새 capture/version으로 분리한다. 새로운 후보 가입에 따른 차이는 허용하지만 같은 입력 비교로 표기하지 않는다.
실험용 DB에서 대화·run·fit·추천·메모리를 초기화하더라도 지난 실험의 원본 artifact는 보존한다.

## Canonical runner와 입력 계약

- 캡처: `harper_worker/llm_evals/company_agentic_role_search/capture.py`.
  `opp.utils.new_runtime.connect_read_only()`만 사용하며 모든 트랜잭션의 read-only barrier를 확인한다.
  운영 Slot/Role/회사 공개 범위/프로필/전체 Brief·Memory/Behavior·기존 평가 및 회사 대화만 읽는다.
  후보자 원문 채팅·메일과 auth/provider/Slack credential은 캡처하지 않는다.
- 회사 대화: `harper_beta/scripts/evalCompanyAgenticRoleSearch.ts`.
  현재 `runOrgAgentToolLoop`, prompt/input builder, capability loader, schema, result formatter를 재사용한다.
  별도 정답 프롬프트나 시나리오 router로 도구 선택을 대신하지 않는다.
- Scoring: Worker의 `opp.matching.company_requested`와 Decisions adapter를 사용한다.
  가짜 점수/통과자/성공 응답은 만들지 않는다. 실제 I/O를 격리 adapter로 대체한 부분은 결과마다 명시한다.
- DB 준비: Worker `llm_evals/company_agentic_role_search/local_database.py`가 같은 read-only 연결로
  실제 schema를 캡처하고, 새 `harper_agentic_*` PostgreSQL에 복원한다. 기존 DB는 덮어쓰지 않는다.
  `companyAgenticSearchSandbox.mjs`는 매 대화마다 baseline을 새 DB로 clone하고 실제 PostgREST를 띄운다.
- 최초 평가: Worker `prepare_baseline.py`가 실제 `enqueue_company_agentic_search_v1`와
  `run_scoring.py` → `run_claimed` → `run_requested`를 한 번 실행한다. 실제 실패 상태 확정 경계도
  제품 Worker와 공유한다. 1·2차 Decisions와 실제 3차 설명을 모두 보존한
  뒤 DB 연결을 금지하고 template로 동결한다. 과거 legacy fit을 새 stage2 기록으로 바꾸지 않는다.
  회사 대화 실험의 `--baseline=<bootstrap-run-id>`는 이 동결 DB를 선택한다.
  평가가 실제로 끝났지만 선택 단계에서 성능 결함이 발견된 run은 성공으로 바꾸지 않는다. 해당 run을
  중단 상태로 기록한 `partial-baseline.json`과 실제 ledger·원문·source hash를 별도로 동결할 수 있다.
  `prepare_baseline.py --scope evaluated --raw-database <해당-동결-DB> --evaluation-provenance
  <partial-baseline.json>`는 일반 도구와 동일한 evaluated 범위의 새 run으로 선택·3차만 수행한다.
  최종 baseline manifest는 두 실행을 연결하며 과거 점수를 새 prompt의 점수로 표기하지 않는다.
- 구조 smoke: `smoke_contract.py`는 실제 PostgreSQL에서 Memory batch replay·revision·소유권·원자성,
  concurrent replay와 검색 요청 멱등성·Brief version만 짧게 검증한다. 모델 성능 결과와 분리한다.
- 호출 집계: Worker `metrics.py`는 저장된 실제 Decisions와 일반 LLM trace를 읽어 모델·단계별
  호출 수, 토큰, 캐시, 지연과 provider가 실제 보고한 비용을 계산한다. 비용이 없는 호출은 미확인으로
  남기고, 같은 요청의 하위 HTTP log를 이중 합산하지 않는다. 의미 품질은 이 집계로 채점하지 않는다.
- 가격표 추정: Worker `pricing.py`의 `openai-standard-global-2026-10-23`은 당시 공식 Decisions/가격 문서를 근거로 성공 응답의 토큰을 환산한다. Decisions 출력은 무료이며 캐시 읽기·쓰기 토큰을 일반 입력과 이중 계산하지 않는다. 쓰기 TTL이 미보고이면 30분~12시간 요율의 범위를 제공한다. 표준/global 가정의 추정이며 지역·priority·할인·usage 없는 실패 청구액을 포함하지 않는다. 지원하지 않는 모델은 추정하지 않고 provider 보고 비용이 있으면 별도로 남긴다. 새 가격 비교는 이 version을 덮어쓰지 않는다. 여러 질문 요청으로 나눈 후보 평가는 평가 1건·실제 요청 여러 건으로 구분한다.
- 전체 실험 집계: beta `scripts/reportCompanyAgenticRoleSearch.py --run=<상위-run-id>`는
  상위 manifest의 독립 실행들을 모아 같은 입력·source·clock 여부, 사례 누락·중복, 실제 도구 오류,
  저장 상태의 변경 건수와 회사/Worker usage를 `runs/<상위-run-id>/aggregate.json`에 기록한다.
  실행 중 집계는 중간 결과이며 `executed`는 의미 통과가 아니다. 실제 원문과 별도 검토 기록으로
  품질을 판정하고 실패한 provider 응답·미보고 비용은 성공 usage와 구분한다.
  실제 response의 `tool_calls`에서 loader를 포함한 모델 호출 수를 세고, executor trace 호출 수는
  따로 기록한다. 화면용 `toolResults` 요약은 실제 호출이나 비용으로 세지 않으며 같은 call ID의
  중복 요약은 원문을 보존한 채 별도로 보고한다.
- 비동기 결과 전달 보충 검증: beta `scripts/evalCompanyMatchingResultNotice.ts`가 완료된 실제
  baseline을 새 DB로 복제한 뒤 원래 `result-notice` route → `enqueueCompanyUpdate` → 회사 agent
  → 저장된 메시지 경로를 실행한다. `--baseline=<동결-bootstrap-id> --run=<새-id>`를 사용한다.
  단위는 실제 완료 검색 한 건과 동일 요청 재전달이며, 기대 상태는 사실에 맞는 결과 메시지,
  원래 검색 ID 연결, 재전달 시 메시지·작업 중복 없음, 후보 연락·Intro·명시 결정 변경 없음이다.
  정답 메시지나 callback을 합성하지 않는다. 실제 provider 입력·응답과 전후 DB, source hash를
  owner-only run에 저장한다. 인증만 실제 캡처된 actor에 한정한 local transport로 대체하며,
  외부 Slack·메일·queue 네트워크는 차단한다. 모델은 제품 기본 설정을 그대로 쓰고 결과의
  의미를 직접 읽어 판정한다. 이는 async queue 시간·운영 인증·외부 전달의 부하 검증은 아니다.
- 1차 진단: Worker `llm_evals/company_agentic_role_search/screen_diagnostic.py`는
  `screen-diagnostic-v1.json`의 실제 입력 hash와 수동 기대 분류를 고정하고 production Decisions adapter로
  같은 입력을 재실행한다. bootstrap-v2 결과를 본 뒤 선정한 7건의 비독립 진단이며 전체 정확도나
  회사 대화 gold를 대체하지 않는다. 원문은 지정된 `runs/`에만 저장하고 DB·추천·외부 연락은 변경하지 않는다.
  실행은 `--dataset=<registry>/screen-diagnostic-v1.json --source-worker=<registry>/runs/bootstrap-v2/worker
  --output=<registry>/runs/<새-diagnostic-id>`를 사용한다. 모델·prompt hash·실제 원문·오류·지연을 보존하며,
  gross-work 불일치와 실제 인접 업무 양쪽의 예상 분류를 검토한다. 동일 자료의 다음 prompt는 새 run이다.
  `screen-location-diagnostic-v1.json`은 실제 exclusive 지역 충돌과 이동 가능·허용 지역 대조군 3건을
  별도로 동결한 진단이다. 앞 7건이나 회사 대화 gold를 바꾸지 않는다. `--prompt-override`는 ignored
  run 안에 저장한 완전한 POLICY·SCREEN·PROMPT_VERSION만 평가 프로세스에 적용하며, production
  소스가 동결된 동안 후보 prompt를 비교하기 위한 옵션이다. 입력 hash와 override hash를 함께 보존한다.
  같은 runner의 `fit-practical-context-diagnostic-v1.json`은 위 3건의 실제 2차 입력과 기존 응답을
  별도로 동결한다. 공통 policy 변경 후 배타 조건·이동 의사·허용 지역을 각 criteria와 양측 fit에서
  어떻게 구분하는지 전체 분포를 직접 읽는다. 숫자 cutoff나 특정 점수 일치로 통과를 판정하지 않는다.
  이 진단은 retrieval·회사 대화·발행 상태나 전체 후보 정확도를 검증하지 않는다.
  `screen-present-state-diagnostic-v1.json`은 후속 실제 대화 ARS09에서 관찰한 3개의 현재상태 조건 충돌 입력을 별도로 고정한다. 원래 v4 입력·응답을 보존하고 같은 runner와 ignored prompt override로 재실행한다. 현재 자격 조건과 미래 근무지·이동 의사의 구분을 보며, 기존 이동 가능·불확실성 대조군도 별도 기존 dataset 그대로 확인한다. 사후 선정 진단이며 전체 성능이나 회사 대화 gold를 대체하지 않는다.
  `screen-present-state-diagnostic-v2.json`은 같은 사용 발화를 새 회사 모델이 작성한 실제 v3 Hiring Brief와 평가 입력으로 별도 동결한 버전이다. `--input-projection=current_brief_first`는 원래 직렬화된 request·criteria 원문 필드 두 개를 다른 역할 설명 앞에 옮기며, 필드 내용은 삭제·요약·재분류하지 않는다. source hash와 변환 후 실제 요청 hash, 변환 runner hash를 모두 남긴다. 이 비교는 원문 사실을 유지한 입력 표현 실험이며 순수 모델 비교가 아니다.
- 1차 입력 배치 후속 진단(2026-10-22): 현재 거주 조건을 놓친 실제 v3 입력은 같은
  `screen-present-state-diagnostic-v2.json`으로 유지한다. `--brief-question-context`는 현재 Hiring Brief와
  후보 Search Brief 원문을 각각 해당 practical 질문의 source evidence에도 제공한다. 전체 입력에도
  같은 원문이 있어 의도적으로 중복된다. 분리된 원문 근거를 질문에 배치한 효과를 비교하는 실험이며,
  별도 의미 추출기나 조건별 키워드 분류가 아니다. 실제 1차는 업무, 회사 실질 조건, 후보 실질 조건
  세 가지 명시 명령을 **한 후보 한 API 호출**에서 받으며, 어느 명령이든 exclude이면 2차를 실행하지 않는다.
  이전 단일 screen 이력은 그대로 보존한다. 질문/설정/원문 hash와 실패한 중간 prompt도 runs에 남긴다.
  `screen-v14-{current,mobility,work}`는 3+3+7건의 같은 원문 진단이며, 사후 선정·반복 조정의
  한계가 있다. 작은 진단 통과는 전체 recall·생산 정확도를 입증하지 않는다.
  `screen_repository_diagnostic.py --dataset=<동결-dataset> --case-source=<실제-case-dir>
  --source-worker=<원래-worker-dir> --output=<새-run-dir>`는 보존된 전용 local DB를 read-only로 읽어
  실제 repository 입력이 frozen 원문과 byte 단위로 같은지 확인한 뒤 공통 evaluator를 호출한다.
  v3 ARS09의 `screen-v14-repository`는 이 경로의 3건이며 평가/추천 DB 저장과 외부 연락은 없다.
  identity 조회는 원래 직렬화의 이름을 정확히 찾은 뒤 전체 입력 일치로 검증하며, 불일치나 중복은
  API 호출 전 중단한다. 다른 데이터로 대체하거나 원래 gold를 바꾸지 않는다.
  이전 v8~v13에서는 입력 표현에 따라 일부 조건 판정이 다시 뒤집혔다는 사실도 보존한다.
- `screen-soft-preference-diagnostic-v1.json`은 v4 실제 첫 평가에서 회사·업무 축은 continue였으나
  후보 practical 축만 exclude였던 사례를 읽고, 비배타적 선호가 과도한 제외로 이어졌는지 확인하는
  별도 2건 진단이다. 기대치는 `candidatePracticalScreen=continue`라는 해당 축에 한정하며, 업무 적합성이나
  최종 추천 여부를 정답으로 고정하지 않는다. 실제 Profile·Brief·Memory·Behavior 전체를 읽은 사후 선정이고,
  기존 회사 대화 gold와 앞선 hard-condition/이동 가능성 대조군은 변경하지 않는다.
- Retrieval 구조 보충 확인: `runs/retrieval-unnest-structural-v1/verification.json`은 실제 ARS10의
  실패한 SELECT를 새로운 manual 전용 pure `unnest` capability로 검사하고, 실제 local snapshot의
  read-only PostgreSQL EXPLAIN이 성공했음을 기록한다. 원래 쿼리의 잘못된 모집단 의미를 자동 수정하지
  않았으며, 의미 정확성은 다음 전체 실험의 실제 새 query로 확인해야 한다. 일반 planner는 허용 함수,
  실제 타입, source_cutoff의 snapshot 상한 의미, executor의 scope 소유권을 받고, 구조 오류에도
  직전 SQL과 정확한 오류를 되돌려 받는다. 정기 검색의 function allowlist는 바뀌지 않는다.
- 선택 추론량 진단: Worker `selector_diagnostic.py`는 `selector-reasoning-diagnostic-v1.json`에
  고정한 bootstrap-v3의 compact 비교 한 건과 최종 전체 프로필 확인 한 건을 재생한다. 원래 xhigh
  응답을 보존하고 동일 모델·system·전체 입력·출력 예산에서 reasoning만 medium으로 바꾼다.
  `--dataset=<registry>/selector-reasoning-diagnostic-v1.json --source-worker=<registry>/runs/bootstrap-v3/worker
  --output=<registry>/runs/<새-id> --reasoning=medium`으로 실행한다. 선택·제외·근거의 의미는 직접
  읽고 비교하며 exact-set 일치율을 정답으로 쓰지 않는다. 두 건의 사후 선정 진단이고 동시성·캐시가
  다른 실행이라 대표 품질·운영 지연 개선을 입증하지 않는다. DB나 연락 효과 없이 원문과 usage를
  owner-only로 저장하며 provider가 보고하지 않은 비용은 미확인으로 남긴다.
- 별도 local DB를 쓰면 loopback hostname·전용 DB 이름·capture hash를 검증한다. 기존 로컬 개발 DB,
  운영 DB, 기존 `.local/full-stack` fixture를 reset하지 않는다.
- Memory 전달 보충 진단: Worker `memory_scoring_diagnostic.py`는
  `memory-scoring-diagnostic-v1.json`의 실제 ARS11 전후 상태·도구 원문 hash를 확인하고, 동일 baseline의
  일회성 local clone에 실제 저장된 Memory 행을 그대로 복원한다. 해당 대화에서 실제 조회한 후보만
  공통 repository reader와 pointwise evaluator로 1차·통과 시 2차를 호출한다. 실행은
  `--dataset=<registry>/memory-scoring-diagnostic-v1.json --case-source=<registry>/runs/experiment-v1-c/ARS11
  --output=<registry>/runs/<새-id>`다. 원문·API 요청에 실제 Memory가 전달됐는지 확인하는 계약 진단이며
  점수 개선·일반 추천 품질을 입증하지 않는다. 실제 팀 자료를 만들어 채우지 않고, 2차 미호출은
  미관찰로 기록한다. DB·추천·연락의 운영 효과 없이 evidence를 보존한 뒤 local clone은 삭제한다.

`request_matching_search`의 mode/start stage/평가 범위는 원본 LLM이 선택한다. 평가 장치는 그 선택을
기록하며 다른 호출로 바꾸지 않는다. 도구가 아직 구현되지 않았거나 조회 자료가 없으면 그 사실을 남긴다.
검색 결과 도착 뒤 이어지는 대화는 실제 저장 결과를 다시 읽는다. 새 검색을 실제로 완료하지 않고
완료 결과를 합성해 후속 발화를 시험하지 않는다.

`private/<capture-id>`는 원본 운영 snapshot이며 `runs/<bootstrap-id>/baseline.json`은 실제 모델이 만든
초기 평가 상태다. 두 단계의 manifest·hash·provenance를 별도로 보존한다. 모든 대화 분기는 같은
bootstrap DB에서 clone하므로 앞 사례의 Memory·검색·추천·Brief 변경이 다음 사례로 넘어가지 않는다.
다음 prompt/제품 실험도 같은 `--baseline`으로 시작한다. bootstrap을 다시 돌리면 새로운 실제 결과가
생기므로 새 baseline으로 기록하며 이전 모델 비교와 섞지 않는다.
첫 두 회사 실험의 현재 시각은 baseline 동결 시각(이전 manifest는 Worker 완료 시각)으로 고정했다.
그 뒤 실제로 저장한 대화·검색이 모델의 현재 시각보다 미래가 되는 문제가 있어, `experiment-v3-sol`부터는
각 user turn의 실제 시작 시각을 `requestTime`으로 사용한다. `turn-*-clock.json`과 출력에 실제 시각을
기록하고 manifest의 `requestClockPolicy`로 구분한다. baseline과 capture 시각은 별도 provenance로
보존하며 기존 DB·시간·실행 범위를 수정하지 않는다. 후속 실험은 같은 초기 DB와 시계 정책을 사용하지만
현재 시각까지 동일한 모델 비교라고 주장하지 않는다.

초기 bootstrap-v2/v3와 첫 대화 실험은 로컬 DB의 `Asia/Seoul` 설정에서 실행되었다. 운영의 실제
설정은 read-only 조회로 `UTC`임을 확인했다. timezone 없는 UTC 표현을 timestamptz에 넣던 기존
기본값 때문에 일부 로컬 생성 시각이 9시간 앞선 instant로 저장되었다. 원본 baseline과 데이터 검색에
실제로 쓰인 `source_cutoff`는 수정하지 않는다. 후속 실험은 같은 baseline을 복제한 **새 DB만 UTC**로
설정한다. 신규 가입 범위는 직전 실행의 벽시계 시간이 아니라 저장된 데이터 cutoff 이후다. 원본 JSON의
timezone 표현은 달라질 수 있으므로 실험 간 비교는 baseline identity/hash와 이 환경 변경을 함께 기록한다.

첫 실험의 실패 Worker는 durable 실패 확정 wrapper를 빠뜨렸고 오류를 queued 도구 응답 대신 돌려준
한계가 있다. 후속 runner는 실제 `run_claimed`를 실행하고, Worker 성공·실패와 관계없이 원래 queued
receipt를 그대로 반환한다. 실제 실패는 별도 trace와 저장된 검색 상태로 확인한다. Worker가 실패 상태조차
저장하지 못하면 `invalid_harness`로 분리한다. 도구 반환 시각, Worker 실행 구간, 회사 API 지연과 전체
실험 지연을 따로 기록하며 동기 실행 barrier를 운영 첫 답변 지연으로 보고하지 않는다.

회사 runner는 beta 폴더에서 `pnpm exec tsx --tsconfig scripts/tsconfig.json
scripts/evalCompanyAgenticRoleSearch.ts --mode=prepare --run=<새-id>`로 실제 context·기존 pair·미추천
profile reader를 먼저 확인한다. `--mode=run --baseline=<동결-bootstrap-id>`가 실제 모델 실행이다.
유료 Slot 조건이 미충족이면 실행은 실패한다. `--acknowledge-source-condition=legacy-approved-by-user`는
사용자가 그 source 변경을 명시적으로 승인한 경우에만 사용하며 paid-Slot 통과 표시는 바뀌지 않는다.
평가에서만 모델을 바꾸려면 `--model`과 새 `--run`을 사용한다. 옵션 생략 시 실제 제품 기본 모델
선택 경로를 사용하고 `modelResolution`을 기록한다. 선택 실행 `--only=ARS01,...`은 부분 실행이다.
`--preserve-cases=ARS05`는 해당 사례의 종료 상태 DB를 실제 답변의 후속 브라우저 검증용으로만 남긴다.
다음 사례의 초기 상태는 여전히 동결 baseline이며, 보존 DB도 검증을 마친 뒤 제거한다.
브라우저 검증은 `node scripts/companyAgenticSearchSandbox.mjs <새 ignored run 경로>
--baseline=<보존된 사례 DB> --gateway-port=<localhost 포트>`로 보존 DB의 새 복제본을 연결한다.
같은 포트에서 사례를 순차 확인하려면 앞 launcher를 정상 종료한 뒤 다음 DB로 다시 시작한다.
종료 시 브라우저 복제본만 제거하고 원본 사례 DB·실제 메시지는 보존한다. `browser-auth.json`은
캡처한 정확한 팀원 신원을 사용하는 local auth transport이며 운영 인증·RLS 검증이 아니다.
브라우저를 확인한 뒤 launcher를 종료하기 전에 `python3 scripts/auditCompanyAgenticSearchBrowser.py
--run=<브라우저-run-id>`로 원본 사례 DB와 브라우저 복제본의 15개 업무 표를 read-only로 비교한다.
추가·삭제·변경 행의 원문은 해당 ignored run에만 보존한다. 기존 후보 카드의 첫 열람 관측 행은
실제 UI 방문 및 행의 kind를 확인해 추천·결정·연락 변경과 구분한다. 미추천 preview만 확인하려면
처음부터 해당 talentId URL로 진입하며, 기본 선택된 기존 카드의 열람 효과를 섞지 않는다.
동일 후보의 실제 여러 Brief version이 있는 사례는 `pnpm exec tsx --tsconfig scripts/tsconfig.json
scripts/auditCompanyRoleSearchHistory.ts --run=<브라우저-run-id>`로 제품 공통 reader와 formatter를
호출해 확인한다. 실제 저장된 다중 버전 후보를 선택하고, 전체 버전의 작은 페이지를 끝까지 읽어
원본 row ID와 대조한 뒤 각 version 필터도 확인한다. 새 점수·후보·답변을 만들지 않으며 모델 호출은 없다.
전체 16개를 독립 OS process 네 개로 나누어 실행하려면 beta에서
`python3 scripts/runCompanyAgenticRoleSearchMatrix.py --run=<새-id> --baseline=<동결-bootstrap-id>
--acknowledge-source-condition=legacy-approved-by-user`를 사용한다. 이 승인 인수는 앞서 설명한
실제 사용자 승인 조건일 때만 제공한다. scheduler는 원래 회사 runner를 사례당 한 번 호출하며,
모든 자식 실행의 source·clock·초기 상태 일치를 별도 집계로 확인한다. 긴 사례를 기다리는 동안
빈 process에서 다음 독립 사례를 실행할 뿐 사례의 내용·도구 선택·출력을 바꾸지 않는다.

로컬 runtime은 별도 `private/runtime/pgdata`와 `127.0.0.1:55461`을 사용한다. 현 머신의 PostgreSQL17
실행 경로는 `COMPANY_EVAL_PG_BIN`, PostgREST의 libpq 경로는 `COMPANY_EVAL_LIBPQ`로 바꿀 수 있다.
PostgREST14.18은 [공식 release](https://github.com/PostgREST/postgrest/releases/tag/v14.18)의 머신에 맞는
binary를 `private/runtime/bin/postgrest`에 둔다. 새 DB schema 복원 후 표준 launcher는 이 전용 cluster만
시작하며 기존 development stack을 시작하거나 reset하지 않는다. 대화가 끝나면 실제 전후 상태와
trace를 파일로 보존하고 해당 일회성 DB를 제거한다. 원본·scored baseline과 지난 run artifact는 남긴다.

## 모델과 실행 기록

현재 제품 기본 company-side 모델/provider/reasoning을 사용하고, 1·2차는 실제 Decisions API를 사용한다.
모델 override는 별도 run 설정에만 남기며 fallback으로 품질 결과를 바꾸지 않는다.
각 run은 source revision·dirty diff hash·실행 파일 hash, prompt hash, dataset/gold/capture hash,
모델·provider·reasoning·sampling·실제 출력 한도·동시성·timeout, 호출별 입력/원문/usage/지연,
도구 결과 및 전후 상태를 기록한다. 응답 실패·빈 실행·부분 실행은 성공으로 처리하지 않는다.

후속 source inventory는 beta 회사 runner와 제품 web chat route의 local import graph 및 dependency/config 파일,
Worker 제품 Python 및 실제 scoring harness를 고정한다. UI-only helper·테스트·별도 진단 runner는
auxiliary hash/snapshot으로 따로 보존한다. 첫 실험의 넓은 inventory는 실행 중 UI helper와 진단 파일
변경을 감지했으며 원본 drift flag를 보존한다. 이를 실제 회사 모델에 사용된 소스 변경이라고 추정하지
않고 파일별 audit와 원문 실행 근거를 함께 확인한다.
web chat route는 HTTP/SSE 시간 계약을 source에 보존하기 위한 포함이다. canonical 모델 실험은
회사 tool loop를 직접 실행하므로 운영 HTTP 연결 유지나 hosting 제한을 실증했다고 주장하지 않는다.

한 turn의 임의로 작은 도구 개수 제한을 평가에 새로 넣지 않는다. 종료는 실제 제품 loop의 조건과
실험 실행 제한을 구분해 기록한다. 긴 chain의 입력 압축이 대상·현재 기준·실제 효과·불확실성을
보존하는지는 원문 입력과 후속 조회를 보고 판단한다. API usage가 없으면 비용을 0으로 적지 않는다.

## Metrics와 gate

### 명시적 미평가 탐색 보충 자료

`unassessed-cases-v1.json`, `unassessed-gold-v1.json`, `unassessed-manifest-v1.json`은 ARSU01 한 대화의
별도 동결 자료다. 원래 ARS06는 기존 결과에 더 추천할 사람이 없을 때만 새 평가를 요구하므로,
실제 기존 후보가 남아 있던 실행에서는 그 분기가 관찰되지 않았다. 이 보충 대화는 같은 실제
bootstrap-v3에서 기준 변경 없이 미평가 후보 최대 50명을 평가만 하고 추천·연락은 하지 말라고
명시한다. 원래 16개 입력/gold를 바꾸거나 기존 결과를 소진된 상태로 조작하지 않는다.
canonical 회사 runner의 일반 dataset-manifest 선택으로 별도 run을 실행하며, 현재 전체 실험의
source 동결이 끝나기 전에는 runner를 수정하거나 이 보충 모델 실행을 시작하지 않는다.
선택 인자는 `--dataset-manifest=unassessed-manifest-v1.json`이다. runner와 matrix scheduler는 선택한
manifest에 기록된 입력/gold hash를 확인하며, 기존 16개 자료를 대체하지 않는다. 보고서는 실행에
기록된 dataset과 선택 사례를 사용한다. 웹/Slack action은 일반 채팅 runner로 실행한 척하지 않고
해당 surface의 실제 저장·전송 adapter가 필요하다.
평가 단위는 요청과 실제 완료 확인의 두 발화이며, 일반 도구가 고른 scope·stage·budget·추천0,
새로 평가한 실제 ID와 수, 기존 기준·추천·연락 상태 보존을 원문으로 확인한다. 실제 retrieval이
50명보다 작으면 관측 수와 그 범위를 기록하고 허위로 채우지 않는다. 모델·reasoning·동시성은
그 시점의 제품 설정을 새 manifest에 보존하며, 사후 선택된 보충 결과를 원래 16개 통과율에 섞지 않는다.

### Brief·criteria 변경 이력과 웹 자동 대화 확장

`brief-history-cases-v1.json`, `brief-history-gold-v1.json`, `brief-history-manifest-v1.json`은 추가 사용자
요청의 사전 정의이며 아직 실행 결과가 아니다. 여섯 단위는 웹 criteria 수정, 웹 Hiring Brief 수정,
회사 대화 수정, Slack 경로 수정, 동일 값 재저장 no-op, 실제 생성된 버전 이력의 일반 도구 조회다.
실제 저장 전후 snapshot과 출처·시각, background Luna-low 요약의 원본 입력 범위, 웹에서만 한 번
발생하는 자동 사용자 메시지, 중복 저장의 무효과를 검증한다. 요약의 허용 source는 변경 criteria
전후만 또는 수정한 Brief 전체 전후만이며, 무관한 후보·대화·Memory를 추가하지 않는다.
원래 16개 gold와 실제 baseline은 바꾸지 않는다. 새 schema가 필요하면 새 사본에만 적용하고
migration hash를 남기며, 버전 이력은 제품의 실제 저장 경로가 생성한다. 현재 전체 실행이 끝나기
전에는 harness나 runtime을 수정하지 않는다. 실제 web/save/summary 계약에 연결한 canonical
runner의 경로·hash를 manifest에 추가하고 부모의 사전 gold 검토를 기록한 뒤 첫 호출을 시작한다.
Slack은 외부 전달을 차단한 실제 저장 경로의 local transport 검증으로 운영 Slack 전달과 구분한다.
이 별도 확장의 결과는 기존 16개 통과율에 합산하지 않는다.
Canonical 확장 runner는 `scripts/evalCompanyHiringBriefHistory.ts`이며 `--only=ARSB01`처럼 한
사례마다 독립 process를 사용한다. 실제 Role 저장 service·요약 processor·회사 작업 processor와
일반 대화 tool loop를 호출한다. Queue 전송은 로컬 소비로 대체하며 HTTP/PATCH 자체의 검증이라고
주장하지 않는다. 웹 화면에서 저장한 실제 PATCH와 History 표시는 별도 브라우저 근거로 대조한다.
예를 들어 `caffeinate -i env COMPANY_EVAL_HOST_AWAKE_GUARD=caffeinate-i pnpm exec tsx
--tsconfig scripts/tsconfig.json scripts/evalCompanyHiringBriefHistory.ts --mode=run --only=ARSB01
--run=<fresh-run> --baseline=bootstrap-v3 --acknowledge-source-condition=legacy-approved-by-user
--local-migrations=<explicit-sql-files>`로 실행하며 실제 명령·source·provider 원문은 각 run에 기록한다.
집계는 `scripts/reportCompanyHiringBriefHistory.py --run=<상위-run-id>`가 담당한다. 실제 저장된
전후 차이와 요약 API 입력의 완전 일치, 웹 전용 메시지·멱등 재전달, 17개 표 변경, 원본 provider
usage를 읽는다. 문장 의미·언어 품질은 자동 판정하지 않으며 별도 원문 검토가 필요하다.
`hiring-history-v1/v2`는 실제 시각을 사용했지만 상위 scheduler의 기본 metadata가
`frozen_baseline_clock`으로 표시된 한계가 있다. 실제 호출 코드와 저장 시각을 근거로 해석하며
원본 manifest는 수정하지 않는다. 이후 확장 runner는 `actual_turn_start`를 명시한다.

요약 출력 계약 진단은 `hiring-brief-summary-structure-manifest-v1.json`과 연결된 비식별 gold를
사용한다. `hiring-history-v3`의 실제 Luna 입력 7개와 원래 응답을 private 입력으로 동결하고,
`scripts/evalCompanyHiringBriefSummary.ts`에서 같은 Luna-low·128,000 출력 예산·원문을 재사용한다.
비교 대상은 하나의 `summary: string`만 받는 strict JSON 구조 계약이다. 문장 내용이나 언어를
정규식·키워드로 판정하거나 고치지 않으며 실제 변경 원문과 출력을 사람이 읽는다. 이는 반복 자료의
사후 선정 진단으로 독립 정확도나 전체 웹 흐름의 통과율에 포함하지 않는다. 호출·토큰·실제 보고
비용·지연·완전한 원문은 새 owner-only run에 남기며 원본 자유서술 출력은 덮어쓰지 않는다.

`hiring-brief-summary-delta-manifest-v2.json`은 이전 7개 원문·gold를 그대로 유지하고, 실제 history-v4에서 기존 원칙을 반대로 서술한 변경 요약 1개를 호출 전에 추가 동결한 진단이다. 같은 canonical runner의 `--dataset-manifest`와 `--system-prompt-file`로 공통 변경 비교 지침만 바꾼다. 원래 전체 before/after 사용자 입력, Luna-low와 단일 summary 구조는 유지한다. 기존 원칙의 재강조와 실제 정책 반전을 구분하는지 사람이 읽으며 정규식·단어 검사로 의미를 교정하지 않는다. 반복 선정 진단의 한계를 유지하고 전체 제품 검증과 합산하지 않는다.

신규 로컬 schema는 `--local-migrations=supabase/migrations/<file>.sql`로 명시한다. 이 인자는
새 사본에만 적용하며 기존 baseline·운영 DB를 수정하지 않는다. 적용 SQL의 hash와 출력은 사본별
`local-migrations.json`에 보존한다. `--state-tables=<table>,<table>`로 추가 durable 원장을 전후
상태 감사에 포함할 수 있다. 이는 schema/상태 수집 설정이며 모델의 업무 판단을 바꾸지 않는다.

v5의 ARS05/06/08/09 중 호스트가 clamshell/maintenance sleep에 들어갔고, 일부 provider 호출은
실제 600초 timeout 후 성공했다. 이 실행의 wall-clock 지연은 로컬 절전 영향을 포함하므로
운영 성능으로 해석하지 않는다. `runs/experiment-v5/host-sleep-events.txt`와 해당 감사 파일에
원본을 보존하며 임의로 수면 시간을 빼지 않는다. 후속 macOS 실행은 `caffeinate -i`로 canonical
runner를 감싸 실행 중 idle sleep만 억제하고 종료 시 함께 해제한다. 이는 영구 설정 변경이 아니며
덮개 닫힘·수동 절전·네트워크 단절을 막는 보장은 아니다. 실제 명령과 관측 시각을 manifest에 남긴다.

각 대화의 실제 전체 답변, tool trace, 전후 상태를 Codex가 직접 읽고 다음을 표로 정리한다.

| 평가 축 | 통과 근거 |
| --- | --- |
| 자율적인 업무 선택 | 목적에 맞는 일반 조회/검색/추천/메모리 실행을 고르고 불필요한 재확인 없이 계속함 |
| 이력과 누적 통계 | 조회 범위·Brief version·단계별 모집단·중복/미확인 상태를 정확히 구분함 |
| 결과 재사용 | 같은 기준의 기존 적합 후보를 먼저 활용하고 불필요한 1·2차 재평가를 하지 않음 |
| 기준 변경 | 실제 version 변화와 재평가 범위가 맞고 feedback 없는 ready만 갱신 대상이 됨 |
| 설명·근거 | 기존 평가와 현재 설명을 구분하고 프로필 근거·tradeoff·불확실성을 정직하게 전달함 |
| Memory | 확인된 사실을 요청한 Role/팀/회사 범위에만 저장·수정하고 다른 범위에 누출하지 않음 |
| UI | 후보 UUID/링크가 같은 badge로 렌더링되고 기존 pair 또는 조회 전용 프로필로 열림 |
| 상태·권한 | 미승인 연락/공유/Intro/결제/파이프라인 변화, 개인정보 누출, 중복 효과가 없음 |
| 긴 업무 연속성 | 20회 초과 호출이 필요한 경우 실제 loop가 이어지고 이전 상세 결과를 무한 누적하지 않음 |

전체 gate는 실행한 모든 필수 대화의 의미·필요 상태 통과와 critical 0이다. 미실행/환경 오류/부족한
실제 source 자료는 pass가 아니다. `invalid_harness`, `execution_error`, `product_failure`,
`not_observed`를 구분한다. API 종료나 단어·어미·길이 일치로 의미 품질을 채점하지 않는다.
수정 뒤 선택 사례만 재시험한 결과를 최종 소스의 전체 통과율로 합산하지 않는다.

## 개인정보·격리·한계

이번 사용자 요청이 실제 데이터 기반 로컬 평가의 근거다. 원문은 ignored `private/`와 `runs/`에만
보존하며 폴더 0700, 파일 0600을 적용한다. 외부 provider에는 실제 제품 입력 계약에 필요한 자료만
보낸다. 현재 provider 계정의 별도 데이터 보관 설정은 확인되지 않았으며 API의 store 설정과 구분한다.
헤더·API key·비밀번호·OAuth/Slack token·세션 cookie는 artifact에 기록하지 않는다.

운영 읽기와 로컬 실험 쓰기를 분리한다. 메일·Slack·Calendar·결제·운영 queue 네트워크는 차단한다.
검색 요청과 회사 추천은 격리 저장소에서만 실행하며 candidate-facing consumer를 시작하지 않는다.
브라우저 검증은 로컬 화면과 이 snapshot에만 연결한다. Jack & Jill의 실제 로그를 확보하지 못하면
그 제품과 동등한 성능이라고 주장하지 않고 사용자가 제시한 이상 동작과 로컬 실행을 비교한다.

작은 단일 Role challenge는 운영 평균, 추천 정확도, 후보 반응률, 다른 회사·직군 전체 품질,
독립 팀원 검토 또는 운영 배포를 입증하지 않는다. I/O adapter, 부분 DB schema, 제외한 network 경계는
해당 실행 manifest와 최종 표에 명시한다. 5,000명 지원과 5,000명 실제 실행도 구분한다.

초기 snapshot의 실제 Role에는 팀 배정과 신규 stage ledger가 없다. 팀 Memory 사례는 실제 팀이 있는
source가 마련되기 전까지 `not_observed`다. version history·추가 추천 재사용은 실제 bootstrap 이후에만
평가한다. local auth는 캡처된 팀원 ID를 사용한 전송 대체이며 실제 인증·RLS 검증이 아니다.
vector/halfvec column을 사용하지 않는 domain으로 복원했으므로 벡터 검색 품질은 관찰되지 않는다.
기존 함수·view·constraint·trigger 복원과 실행한 RPC의 범위는 raw restore report로 확인한다.


## 2026-10-22 모델 비교

Stage1 후속 입력 계약 진단은 `screen-v16-*`로 구분한다. 기존 frozen 실사례 13개와
`screen-soft-preference-diagnostic-v1.json`의 실제 2개 입력·gold는 그대로 유지하며, 양쪽
실용 조건 질문에 현재 회사 Hiring Brief와 후보 Search Brief 원본을 함께 재제공하는
`screen_diagnostic.py --paired-brief-question-context`를 비교한다. 두 질문의 방향을 구분하고
명시적 배타 제약, 긍정적 선호, 미확인 조건을 혼동하지 않는 짧은 정책을 ignored override로
전달한다. 질문별 실제 명령을 읽으며 overall decision만으로 개선을 판정하지 않는다.
v15는 후보 축이 개선된 2명에서 회사 축이 뒤집혔고 US-only 대조군도 통과해 채택하지 않았다.
사후 실패 사례 선정·반복 prompt 실험의 편향을 기록하며 작은 진단을 전체 recall로 주장하지 않는다.
`screen-soft-preference-diagnostic-v2.json`은 독립적인 후반 20명 원문 검토에서 고른 실제 2명을
추가한 4건 버전이다. v1은 덮어쓰지 않는다. `screen-v17-*`은 v16 정책을 유지하면서 질문의
두 Brief 표기를 production과 진단이 동일한 `paired_brief_context`로 생성하도록 맞춘다.
v16의 aux 진단과 달리 공통 repository 실행에서 soft 1명의 회사 축이 제외로 바뀐 결과도
보존했다. 원문 재직렬화만 바뀌며 source 사실·gold·단계별 machine command는 변경하지 않는다.
`fit-present-state-diagnostic-v1.json`은 v4의 실제 추천 3명에 대해 현재 거주 충족과 미래 근무 조건
미확인을 구별하는 2차 진단이다. 점수 cutoff나 정확한 숫자 gold는 두지 않으며 실제 분포·원문을
수동 검토한다. `fit-v18-*`은 이 세 입력과 기존 `fit-practical-context-diagnostic-v1.json`의
명시적 배타 조건/허용 이동 3개를 같은 설정으로 비교한다. Stage1 v17은 유지하고 공통 2차 정책만
짧게 정리한다. 원본 후보·회사 정보와 기존 점수를 덮어쓰지 않는다.
`fit-v19-*`는 같은 6건에서 후보의 Profile 기본 사실과 전체 Brief·Memory 원문을 각 점수 질문에도
가까이 제공하는 `--score-source-context` 입력 배치 진단이다. 전체 경험은 공통 입력에 한 번 유지하며
새 요약·판정·조건 추출을 만들지 않는다. v18에서 기존 이동 대조는 구별했지만 현재 상태 조건이 섞인
3건은 여전히 conflict로 남은 실패를 보존한다.
`fit-v20-*`는 같은 자료에서 현재 검토 자격과 미래 근무 조건의 시간 범위를 각 실제 점수 질문에도
명시하는 입력 계약 비교다. 지역 이름·후보 이름·특정 기준 이름에 따른 분기 없이 모든 점수 질문에
같은 계약을 제공하며 숫자나 라벨을 사후 변경하지 않는다.
`fit-v21-*`은 동일 input hash의 실제 직전 1차 명령을 이전 모델 판단이라고 표시해 함께 제공하는
단계 연결 진단이다. 과거 판단을 정답으로 강제하지 않는다. 기존 bootstrap의 단일 축 결과도 원래
형태로 유지하며, raw source hash와 함께 보존한다. 진단에서 효과를 확인하기 전 runtime에 넣지 않는다.
`llm_evals/company_agentic_role_search/score_fact_probe.py`는 같은 frozen 2차 원문에서 지정한
criterion 하나를 직접 질문하는 진단 전용 runner다. `--minimal-source`는 실제 Profile 기본 사실과
Brief·Memory만 원문 그대로 제공한다. 현재 거주 불일치/후보 명시 제약/원래 criterion 점수를
분리해 입력 인식 문제를 관찰하며, 이 질문·결과를 production 판단 상태나 후처리 규칙으로 쓰지 않는다.
`fit-probe-{current,mobility}-{full,minimal}`는 같은 6건, 모델, provider를 사용하며 정확한 숫자 gold는 없다.
`fit-v22-*`는 전체 원문을 유지하면서 Profile의 저장된 현재 거주와 고용주 위치·과거 근무지·희망 지역을
구별하는 공통 질문 계약을 비교한다. 최소 원문에서 현재 거주를 올바르게 읽지만 전체 이력에서 달라진
관찰에 따른 진단이며, 내부 모델의 실패 원인을 확정했다고 주장하지 않는다. 1차 anchor는 사용하지 않는다.
`fit-v23-*`은 같은 실제 값의 role.location과 Profile.location 표시만 각각 role_work_location과
recorded_current_residence로 구분하는 직렬화 비교다. 지역·조건의 의미를 코드로 판정하지 않으며
원본 source hash와 투영 종류를 기록한다. stage1이나 저장 원본을 변경하지 않는다.

수정된 runtime의 전체 v2에서 도구가 반환한 실제 프로필과 평가 원문을 무시하는 답변이 반복돼,
같은 source·baseline·cases-v1·gold-v1에서 지원 모델만 바꾼 진단을 진행했다.
`model-diagnostic-sol-v1`(ARS04), `model-diagnostic-sol-preview-v1`(ARS03)는
canonical 회사 runner의 `--only`·`--model=gpt-6.1-sol` 옵션을 사용한 사후 선정 진단이다.
두 사례 결과를 전체 성능이나 독립 검증으로 계산하지 않는다. 최종 모델 선택은 동일 전체16개를
`experiment-v3-sol`로 실행해 응답·상태·호출·지연·보고 비용을 읽은 뒤 판단한다.
입력·gold·baseline·기존 점수는 바꾸지 않는다. v2의 ARS08에서 기존1차 통과 집합을 새 retrieval이 축소하는 별도 결함을 발견했으므로 v3 전체 실행에는 그 공통 runtime 수정도 포함한다. 따라서 v3를 순수 모델만의 비교로 해석하지 않으며, 위 ARS03/04 진단만 동일 source 모델 비교다. 모델별 도구 선택·retrieval 결과 차이는
실제 행동 차이이며 강제로 맞추지 않는다. 새 전체 실행은 별도 cloned DB와 원본 trace로 보존한다.


v3는 공통 코드 기본 모델을 Sol/high로 설정한 후 `--model`을 생략하여 실제 기본 선택 경로로
실행한다. 기존 명시 모델 선택과 환경 override는 그대로 보존하며 운영 환경은 변경하지 않는다.
각 대화의 초기 DB는 같은 bootstrap-v3로 유지하되, v1/v2의 고정된 LLM 현재시각이 새 DB 사건보다
과거가 되는 문제를 제거하기 위해 requestTime은 실제 turn 시작 시각을 쓴다. baselineClock은
자료 출처로 보존하고 requestClockPolicy 및 각 turn의 실제 시각을 기록한다. 이 환경 차이를
숨기거나 v3와 v2가 완전히 동일한 시계 조건이라고 주장하지 않는다.


### V5 원문 근거 배치 진단

`screen-source-facts-diagnostic-v1.json`은 v5 실제 후보측 단독 제외 중 수동 검토한 선호/미확인 5건과 현재 거주 조건의 축 오류 2건을 호출 전에 고정하고, 기존 17개 대조군을 원래 입력·기대와 함께 재사용한다. canonical `screen_diagnostic.py --screen-source-context --input-projection location_provenance`는 원문 Profile 기초 사실과 전체 Brief/Memory를 실무조건 질문 가까이 제공한다. 원문 값은 바꾸지 않고 근무지와 현재 거주지의 필드 의미를 명확히 한다. 별도 추출모델·키워드 판정·점수 보정·DB 변경은 없다. 비교 manifest에 투영과 중복 원문 전달을 기록한다. 실패를 본 뒤 고른 진단이며 전체 재현율 또는 독립 검증으로 일반화하지 않는다.

`fit-source-facts-diagnostic-v1.json`은 v5 실무조건의 conflict 판정 2건을 원문 수동 검토 후 고정하고 기존 6개 current-state/mobility 대조군을 재사용한다. `screen_diagnostic.py`의 원문 필드 투영·문맥 배치 옵션만 비교하며 점수의 수치 목표나 후처리 보정은 없다. 같은 원문을 여러 번 관찰한 사후 진단이라는 한계를 유지한다. `provenance_current_brief_first` 투영은 현재 request/criteria를 먼저 배치하고 역할 근무지와 후보 현재 거주지 표기를 명확히 하며 원문 값은 보존한다.

`fit-positive-work-mode-diagnostic-v1.json`은 v28을 이미 선택한 뒤 v5 ARS08의 추가 원문 1건을 읽고 호출 전에 별도로 고정했다. 명시적 현 거주권역 제한과 긍정적 근무방식 목록을 구별하는지 동일 v28 계약으로 확인한다. 이 사례를 위해 prompt를 수정하지 않으며, 실패를 보고 선정한 작은 후속 진단임을 유지한다. 원문과 결과는 `runs/fit-v28-positive-work-mode/`에 보존한다.

`fit-evidence-contract-diagnostic-v2.json`은 이전 원문 8건과 별도로 고정한 추가 1건을 합치되 기대·원문 hash를 바꾸지 않는다. 질문 근처의 공통 근거 읽기 계약을 간결하게 바꾸어 행 label과 실제 문장의 강도, 양립 가능한 현재·미래 사실, 미확인을 구별하는지 확인한다. 실제 실패를 반복 관찰한 사후 비교이며 독립 성능 검증이 아니다.

추가 근무방식 사례는 기존 canonical `score_fact_probe.py`로 전체 원문과 Profile 기초 사실·전체 Brief/Memory만 제공한 원문을 비교한다(`fit-v28-work-mode-probe-{full,minimal}`). 원래 실무조건 criterion은 두 경우에 그대로 제공하며, 진단의 현재상태·후보 제한 choice는 운영 상태·분류기로 채택하지 않는다. 관측한 provider 답변은 숨은 원인의 설명이 아니다.

`fit-v30-source-first`는 같은 v28 문구와 원문을 유지하면서 질문 내 순서만 바꾼다. `--score-source-context --score-source-first --score-question-policy`는 긴 후보 사실을 앞에 두고 공통 rubric과 실제 평가할 기준을 뒤에 제공한다. 새 사실 추출·판정 단계는 없고 원문 중복량도 동일하다. 추가 사례의 별도 사실 읽기 진단은 충돌 없음/uncertain이었으나 본 scoring은 conflict였다는 관찰로 등록한 비교이며 숨은 원인을 단정하지 않는다.

선택한 runtime `company_requested_decisions_v30`은 stage1의 원본 근거 투영과 간결한 후보 조건 질문(v28), stage2의 같은 다섯 label 설명(v28), 질문 안의 근거→rubric→기준 순서(v30)를 사용한다. `screen-v28-short-question`의 24개 목표 축, `fit-v30-source-first`의 9개 실무조건 관찰은 사후 선정·반복 튜닝 진단으로 한정한다. v29의 간결한 별도 정책은 추가 사례를 고치지 못하고 명시 제한 대조군도 약화해 채택하지 않았다. 공통 정책을 질문으로 옮기기·현재 Brief 먼저 정렬·역할 정보를 질문에 더 복제한 비교도 원문과 함께 보존하며, 단순히 마지막 성공만 보고하지 않는다.

실제 `screen_repository_diagnostic.py`는 원래 로컬 case 사본에서 구조화 원본을 읽어 canonical evaluator가 만드는 HTTP 요청을 진단 요청과 대조한다. 필요하면 `--database-url`에 원본 case DB의 별도 localhost clone을 지정한다. 원문/projection 전체 일치 확인과 읽기 전용 transaction을 유지하며 manifest에 실제 DB와 override를 기록한다. v28의 stage1 7건·stage2 2건 payload/판정 일치와 v30의 stage2 검증은 별도 run으로 보존한다. v5 ARS08 원본 DB는 정상 정리됐으므로 추가 1건에 대해 repository 재실행을 주장하지 않는다.

v6 source 감사는 shared profile loader와 3차 serializer의 무음 절단을 실제 API 입력·저장 원본과
대조했다(`runs/worker-manual-review-v6/silent-truncation-source-audit.json`). v31은 manual에서만
전체 공개 Profile과 전체 Behavior Context를 보존하고 3차에 동일 Profile을 전달한다. 원본 33명과
실제 3차 대상 15명의 읽기 전용 전달 검증은 `v31-source-verification.json`에 기록한다. 새 모델 호출이나
새 점수는 없으며 v6 출력·기존 진단 hash는 바꾸지 않는다. v31의 전체 실험은 같은 cases/gold/baseline을
다시 사용하지만 입력 계약이 바뀌므로 순수 모델 비교가 아니다. 이전 failure-selected 진단의 전체 원문
재현 검증과 v31의 확장된 원문 검증을 혼동하지 않는다.

`screen-question-order-diagnostic-v1.json`은 v6 후보측 단독 제외 앞 20개 원문에서 명확한 과잉제외
5개·명시 제한 10개를 호출 전에 고정하고, 기존 업무/지역/이동성 대조 17개를 변경 없이 재사용한다.
애매한 5개는 성공이나 실패로 계산하지 않는다. canonical `screen_diagnostic.py`의
`--screen-source-context` 기본 순서와 `--screen-source-first`만 비교한다. 질문·source·choices·모델은
같고 원문 뒤에 질문을 배치하는 순서만 바뀐다. 원문 입력 hash/API payload와 축별 결과를 두 별도
run으로 보존한다. 이 비교는 기존 v6의 잘린 Profile도 그대로 유지하여 순서만 분리하고, v31의 전체
source 변경을 동시에 적용한 비교로 주장하지 않는다. 사후 선정·반복 튜닝의 한계를 유지한다.

동일 32개에 대한 `screen-candidate-gate-v33`은 source 순서를 원래대로 두고 후보 질문만 간결한
‘상세평가 대상으로 남길 수 있는가’ 계약으로 비교한다. 후보 관심·선호 순위를 예측하는 질문과
명시적 불가능/수용 불가 경계를 구별하며, 예외와 범위를 원문에서 읽는다. 이전 순서 비교는 실제
제한을 놓치고 축을 바꾸는 오판이 생겨 채택하지 않았다. 새 질문은 별도 ignored override/hash로
기록하고 동일 기대와 대조군을 유지한다.

`screen-role-facts-v34`는 같은 질문·순서에서 기존 `--screen-role-facts-context`를 사용한다. 질문
근처에 request/criteria뿐 아니라 원래 구조화 role의 실제 근무지·고용형태·보상·회사 사실을 함께
제공하고 전체 JD는 기존 공통 input에 보존한다. 의미 추출이나 새 사실 생성은 없으며, 각 질문이
실제 역할 조건과 상대방의 요구조건을 분리해서 읽을 수 있는지 같은 32개로 비교한다.

`screen-candidate-choices-v35`는 같은 원래 질문·source·순서에서 후보축의 두 choice 설명만 비교한다.
기존의 공통 `conflict on this axis` 대신 상세평가 계속/명시적 경계에 따른 중단의 실행 의미를 각
선택지에 둔다. 반환값 continue/exclude, 다른 축, executor, 원문·gold는 바꾸지 않는다. 이는 모델의
선택 계약이며 probability cutoff나 키워드 재분류가 아니다. 공식 Decisions 문서의 지원 모델은
2026-10-22 재확인 시 gpt-6-luna만이므로 다른 모델이 지원된다고 가정하지 않는다.

`screen-candidate-korean-v36`은 후보축의 같은 상세평가 계속/명시적 충돌 중단 계약을 간결한
한국어 질문과 choice 설명으로 제공한다. 모든 언어의 입력에 같은 문구를 사용하며 언어·지역 router나
특정 사례의 조건을 넣지 않는다. 나머지 두 축·source·gold는 동일하고, 기존 영어 원문 대조도 함께
포함한다. 비교 대상이 사후 선정된 32개임을 유지하며 전체 v7의 독립적 검토를 대신하지 않는다.

## 실제 팀 Memory 보충 실험

`team-memory-cases-v1.json`·`team-memory-gold-v1.json`·`team-memory-manifest-v1.json`은 실제 팀과
조직 권한 팀원으로 저장→같은 행 정정→최신 원문·범위·시각 조회를 확인하는 별도 3턴 사례다.
원래 16개 대화와 유료 Role 매칭 통과율에 합산하지 않는다. 2026-10-22 최신 read-only 조회에서
활성 팀 1개, 실제 배정 팀원 0명이므로 팀 제한 사용자 경계는 여전히 미관찰이다.

Canonical capture는 beta `scripts/captureCompanyTeamMemory.py capture --directory=<ignored private>
--team-id=<실제팀>`이며 Worker의 `connect_read_only()`만 사용한다. 실제 회사·팀·팀원·기존 대화·
메모리·Role 행을 캡처하고 연락처/인증정보는 제외한다. 선택 ID와 원문은 private 파일에만 둔다.
`restore`는 `127.0.0.1:55461/harper_agentic_run_*` 새 복제 DB에만 실제 행을 복원하며, 원본 팀
배정이나 권한을 새로 만들지 않는다. 원래 baseline은 수정하지 않는다.

Canonical runner는 beta `scripts/evalCompanyTeamMemory.ts --mode=prepare|run --run=<새-id>`이다.
원래 company-side LLM·loader·공통 read/write tool·실제 PostgreSQL/PostgREST를 사용한다.
실행 전에 원본 snapshot/gold/hash를 확인하고, 원본 대화의 새 사용자 발화와 모델 답변을 로컬에
저장한다. API payload·output·도구 transcript·범위·revision·전후 업무 상태·지연/usage를 owner-only
runs에 보존한다. 외부 발송은 차단하며 provider 비용 미보고는 `null`이다. 새 실제 source를 추가한
보충 실험이므로 원래16과 동일 초기 상태의 비교라고 주장하지 않는다. 의미와 수정 범위는 원문을
직접 읽어 평가하며, 팀 제한 actor·유료 매칭·운영 Auth/RLS 성능은 이 사례의 release gate가 아니다.


`screen-role-actors-v37`은 동일 frozen 32개 원문에서 역할의 구조화 사실, 회사가 찾는 후보 요건, 후보 본인의 사실·조건을 질문 가까이 별도 출처 제목으로 전달한다. 원래 필드를 그대로 사용하고 새 의미 추출이나 지역별 규칙은 없다. 후보축 질문도 회사의 선별 요건을 회사가 제공하는 근무 조건으로 옮겨 읽지 않도록 출처 역할만 명확히 한다. 같은 v36 한국어 choice 설명과 다른 두 질문을 유지한다. 사후 튜닝과 실패 선정 한계, historical Profile 절단 유지 조건은 같다. Runtime 미반영 진단이며 전체 v7을 대체하지 않는다.

`screen-role-actors-only-v38`은 v36의 질문·choice 문구를 바꾸지 않고 v37의 출처 구분 projection만 적용한다. v37이 질문 문구도 함께 바꾼 결합 비교였으므로 같은 32개를 사용해 입력 구성 효과를 분리한다. Gold·원문·다른 축·모델은 그대로다.

이 보충 실험의 집계는 `python3 scripts/reportCompanyTeamMemory.py --run=<실행-id>`가 정본이다.
실제 provider payload에서 usage·비용·실패를 집계하고, 전체 캡처/보호 표의 전후 행을 순서와 무관하게
대조한다. Memory 각 턴의 원문·ref·revision·scope를 보존하며, `executed_review_pending`를 의미
통과로 간주하지 않는다. 팀 이름은 실제 DB에 있어도 도구에 ID가 제공되지 않아 실패할 수 있으므로
해당 발견 경로와 불필요한 반복 조회도 수동 리뷰에 포함한다.


### v7를 위한 Worker v39 동결

`company_requested_decisions_v39`는 v31의 manual 전체 근거 전달을 유지하고, 동일32 진단 v36의
후보측 질문·두 choice 설명을 그대로 사용한다. 모든 언어 입력에 동일한 한국어 계약을 적용한다.
조건부 가능성·미확인은 상세 평가로 남기고 원문에 명시된 필수조건 충돌만 제외한다. 업무/회사조건
질문, 두 단계의 실행 명령, 2차 점수·분포 및 정기 경로는 그대로다. actor 구분 v37/v38은 안정적인
개선이 없어 채택하지 않았다. 각 축 원문 비교는 ignored
`runs/worker-manual-review-v6/screen-contract-diagnostic-comparison.json`에 보존한다.

선택 이유는 초기 단계에서 선호를 확정 거절로 바꾸어 후보를 잃는 오류를 줄이기 위해서다. v36은
사후 선정된 명백한 선호 5/5와 기존 대조의 목표 판정 17/17을 유지했지만, 명시적 제한 10건 중
후보축 3건을 continue로 잘못 판단했다. 이 3건은 업무축·회사축도 continue여서 전체 1차도 통과했다.
따라서 ‘1차 정확도 통과’가 아니며, 전체 v7에서 실제 원문과 2차/최종선정 결과를 별도로 검토한다.
2차나 최종 단계에서 잡더라도 1차 오류 자체를 성공으로 바꾸지 않는다. 반복 튜닝·표본 선정 편향과
historical Profile 절단을 유지한 진단이라는 한계도 보존한다.

새 runtime builder가 v36 실제 API payload 32개와 정확히 일치함을 추가 모델 호출 없이 확인했고,
변경 경로의 기존 27개 focused tests를 통과했다. 전체 근거 전달은 v31의 실제 33명/3차15명 검증을
별도로 참조한다. 원래 16개 입력/gold와 snapshot은 변경하지 않으며 v7은 같은 baseline의 새 run이다.

환경 장애 뒤 복구는 matrix scheduler의 `--only=<기존 case ID 목록> --recovery-of=<실패 run>`으로
별도 새 run에서 실행할 수 있다. 이전 manifest의 실제 execution_error만 허용하며 frozen dataset과
baseline이 같아야 한다. 성공한 사례를 다시 선택하거나 원래 실패를 덮어쓰지 않는다. 실제 provider
DNS/연결 실패, 호스트 절전 구간, 실패 당시 부분 상태와 재실행 연결을 모두 보존한다. 절전 구간이
포함된 latency에서 임의로 시간을 빼서 정상 응답 시간을 추정하지 않는다.
복구 결과 집계는 `python3 scripts/reportCompanyAgenticRoleSearch.py --run=<원래 run>
--recovery=<복구 run>`으로 실행하며 여러 복구 run에는 `--recovery`를 반복한다. 원래 aggregate와
실패 원문은 보존하고 별도 `recovery-aggregate.json`에 사례별 원래 시도와 선택한 복구 결과를 연결한다.
선택한 결과의 usage와 실패를 포함한 모든 시도의 usage를 구분하며, 원본 성공 사례를 새 결과로
교체하지 않는다. `executed` 표시는 실행 완료만 뜻하고 의미 통과 여부는 실제 원문 검토에 남긴다.


### Decisions 입력 역할 계약 진단 (실행 전 동결)

공식 Decisions guide와 OpenAI Python SDK3.26.0은 input을 user evidence로 정의하고, SDK는 non-user role 미지원을 명시한다. 기존 실제 요청은 developer policy와 user evidence를 보냈으며200응답이 있었다. 이 사실은 해당 정책 우선순위가 공식 지원된다는 증거가 아니고, 기존 오판의 원인이라고 단정하지도 않는다. 지원모델은 guide상 gpt-6-luna이며 reasoning 설정은 공식create계약에 없다.

`screen-api-policy-contract-v1.json`은 기존32개 gold를 그대로 두고 v36의 실제 요청/응답을 대조원문으로 동결하며, 실제v7 ARS06의 명백한 과잉제외2건을 새34개 버전에 추가한다. `fit-api-policy-contract-v1.json`은 기존2차9개 기대와 실제v30원문을 유지하고 실제v6잔존오판2개를 별도11개 버전에 더한다. 모든 private source는 ignored `runs/policy-contract-v1-config/`에 원본출처와hash로 보존한다. 원래dataset/gold/artifact는 바꾸지 않는다.

Canonical `screen_diagnostic.py --exact-source-request --policy-in-questions`는 실제 과거payload를 복사해 developer메시지의 동일 정책문만 각question.instructions로 옮기고 user evidence만 input에 남긴다. 원문·모델·질문·choice/level은 그대로이며 기존정책을 더 길게 고치거나 새사례 문구를 넣지 않는다. 각 축/전체1차, 신규soft5·hard10·기존17·새2를 분리하고2차는 ordinal분포/label을 원문과 함께 읽는다. 작은 사후회귀 범위이며 전체v7의 성능검증을 대신하지 않는다. Runtime은v7완료/결과검토 전 동결한다.

같은 34+11개에 대한 마지막 최소 대안 `--exact-source-request --minimal-evidence-policy`는
비지원 developer 메시지를 제거하고, 기존 question·choice·level·근거 순서를 그대로 둔다.
각 질문 앞에는 원문 근거/지시 구분, Brief·Memory의 시점·범위·강도·예외·수정 보존,
Behavior의 추론성만 설명하는 동일한 짧은 근거 계약을 둔다. 기존 전체 정책은 복제하지 않는다.
`screen-api-minimal-contract-v1`, `fit-api-minimal-contract-v1`은 새 run이며 기존 입력/gold는
불변이다. 비교 전 `runs/policy-contract-minimal-v1-config/manifest.json`에 문구·hash·대상
데이터와 판정 범위를 동결한다. 목표 축과 전체 1차를 따로 읽고, 2차 unknown/conflict의 원문
정합성도 별도로 검토한다. 이 한 번의 일반 API 형식 비교 뒤 개별 사례용 문구 조정은 하지 않는다.

### v8을 위한 Worker v40 동결

`company_requested_decisions_v40`은 기존 `SCREEN_POLICY`/`POLICY` 문구를 바꾸지 않고 각각의
`question.instructions` 앞에 옮기며, `input`에는 원본 user evidence만 전달한다. 원래 질문·choice·
level·원문·근거 순서·한 후보당 한 호출과 정기 경로는 유지한다. 공식 지원 형식의 기존 정책 이동안은
동결 진단에서 후보축 soft5/5·hard8/10·기존 대조 목표17/17·새 soft2/2였지만 회사축 오판2건과
2차의 명시적 제한 오판이 남았다. 최소 근거 문구안은 hard 후보축2/10, 기존 대조16/17로 퇴행해
채택하지 않았다. 이 수치는 목표 축의 판정이며 전체 진행 여부와 구분한다.

현재 builder와 실제 지원형식 진단 payload 34+11개가 모두 일치함을 모델 재호출 없이 검증했고,
관련 구조 검사 29개를 통과했다. 증거는 `runs/policy-contract-minimal-v1-config/`의
`comparison-review.json`, `v40-payload-parity.json`이다. 이는 API 계약 수정과 제한된 회귀 확인이며
scoring 품질 통과나 완료 선언이 아니다. v8은 같은16개 입력/gold와 baseline에서 전체 경로를 다시
실행하고, 과잉 제외·명시적 제한 누락·미확인/conflict 오판을 별도로 보고한다.

### v8 이후 3차 추천 설명 보충

`presentation-reason-v1`은 원래 `cases-v1.json`/`gold-v1.json`의 ARS15를 그대로 선택하고 같은
`bootstrap-v3`를 새로 복제하는 단일 사례다. Matrix runner에 `--only=ARS15 --preserve-cases=ARS15`를
주며, 전체 v8 결과와 합산하지 않는다. 새 입력·정답·후보를 만들지 않는다. 수동 검색의 기존 3차
호출에 추가된 공개 근거와 tradeoff의 통합 설명이 실제 생성·저장·일반 조회·카드 표시로 이어지는지
확인한다. 기존 1·2차 재평가 0, 요청한 두 후보의 3차와 추천 2건, 저장된 criteria 점수 12개 보존,
연락·나머지 업무 상태 불변을 별도로 대조한다. 설명의 사실성은 원문을 읽어 판단하며 키워드나
정형 성공 문구로 채점하지 않는다. 보존된 종료 DB의 새 브라우저 복제본만 UI 검증에 사용하고,
원래 실행 source·전후 상태·provider 원문은 owner-only로 남긴다.


### v8 후속: 1차만 새로 평가된 유지 후보의 3차 갱신

[`retained-stage-one-presentation-v1.json`](retained-stage-one-presentation-v1.json)은 실제 v8 ARS09에서
새 1차만 기록되고 최종 제외 명령이 없어 유지됐지만, 3차 설명은 구 Brief에 남은 1명을 호출 전에
동결한다. Canonical runner는 Worker
`llm_evals/company_agentic_role_search/presentation_refresh_diagnostic.py`이며,
`--dataset=<이 JSON> --case-source=<ignored 실제 ARS09> --output=<새 ignored run>`으로 실행한다.

실제 보존 case의 별도 localhost clone에서 같은 Role/Profile/전체 Brief를 읽고 실제 1차 input
fingerprint와 대조한다. 기존 stage3 writer 1회만 호출하여 새 기준 6개의 설명·fitness와 공개 가능한
통합 추천 근거·tradeoff를 작성한다. 현 2차 기록이 없으므로 score/label/distribution은 만들지 않는다.
refresh 대상의 fresh+기존 ready+명시적 제외 없음 경계를 그대로 확인하며, 원래 1차 판정을 수정하거나
재평가하지 않는다. 별도 선정·연락·업무 표 저장도 하지 않는다. 원문, source/hash, prompt/config,
usage·응답·새 presentation fingerprint를 owner-only runs에 보존하고 전체 문장을 직접 검토한다.
사후 선정한 1개 구조·서술 보충이므로 원래16 또는 scoring 정확도의 통과율에 합산하지 않는다.

실제 보충은 `runs/retained-stage-one-presentation-v1-attempt2/`에 보존했다. 원본의 UTC 세션과
같은 방식으로 읽은 input fingerprint가 v8 평가와 정확히 일치했고, 3차 1회로 현재 기준 6개와
통합 추천 근거·tradeoff를 작성했다. 점수·라벨·확률은 6개 모두 미기록이며 공개 원문과 전체
출력을 대조한 검토는 `manual-review.json`에 있다. 81.096초, 입력 6,856/출력 7,961 tokens이며
USD는 응답에 없어 미확인이다. 첫 시도는 clone이 원본 DB의 UTC 설정을 복제하지 않아 원본
일치 검사에서 호출 전 종료했고, 그 0-call 실패도 별도 보존했다. 원래 1차 판정과 업무 표는
변경하지 않았으며, 이 보충이 publication transaction이나 1차 정확도를 검증한 것은 아니다.
# 자연어 시나리오 재검증 (2026-10-23)

사용자 정정에 따라 Notion New Design의 상단 6개 시나리오를 짧은 실제 사용자 입력으로 각각 한 번 실행한다. 기존 v1과 출력은 보존하며 새 입력·gold는 [Natural v2 실행 계약](NATURAL-V2.md), `cases-natural-v2.json`, `gold-natural-v2.json`, `manifest-natural-v2.json`에 별도 등록한다. 제품 prompt/tool은 이 실험에 맞춰 수정하지 않는다.

실행 기록은 ignored `runs/natural-scenarios-v2/`와 `runs/natural-scenarios-zero-v2/`에 보존했다. 전자의 `verbatim-outputs.md`는 6개 응답 전체 원문, `observed-results.md`는 실제 상태 변화와 미검증 범위다. 각각 한 번만 실행했으며 전체 시나리오 통과로 표기하지 않는다. 공유 checkout의 Career·번역 파일 변경이 감지되어 전체 소스 hash 통제의 한계도 기록했다.


- [과거 실행 조회와 재검색 없는 목록 교체 — journey-v4](JOURNEY-V4.md): 고정 평가 참조·당시 목록·현재 풀 비교 및 8명 유지/2명 교체 실제 대화 검증.
