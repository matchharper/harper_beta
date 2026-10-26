# Natural input v2 — New Design 시나리오

2026-10-23 사용자가 기술적인 절차를 포함한 v1 입력을 지적했다. [New Design](https://app.notion.com/p/New-Design-4007277d26df8083a689cb9e8e50821b)의 상단 6개 시나리오를 짧은 자연어 입력으로 각각 한 번 실행한다. 원본 페이지 수정시각은 2026-10-22T03:07:42.142Z다. 하단의 이전 blur·요금제 메모는 이번 범위에서 제외한다.

- 입력·gold: `cases-natural-v2.json`, `gold-natural-v2.json`. 기존 v1은 변경하지 않는다. 호출 전에 `manifest-natural-v2.json`으로 hash를 고정한다.
- 평가 단위: 시나리오별 한 사용자 메시지와 그에 따른 전체 실제 도구 실행·최종 응답·저장 효과. 추가 힌트·후속 지시·좋은 답을 얻기 위한 재시도는 하지 않는다. 도구·provider의 원래 구조적 재시도는 원문 trace에 남긴다.
- 모델 입력: `turns`만 전달한다. 시나리오 설명·gold·예상 단계·보존 조건을 user/system에 주입하지 않는다. 실제 후보 이름은 동결 capture의 이름으로 연결한다.
- 정본 runner: beta `scripts/runCompanyAgenticRoleSearchMatrix.py` → `scripts/evalCompanyAgenticRoleSearch.ts`, 실제 Worker 경로는 기존 task README와 동일하다. 이름 binding만 평가 runner에 추가하며 제품 prompt/tool/runtime은 수정하지 않는다.
- 초기 상태: 1·2·3·5는 `bootstrap-v3`, 4·6은 실제 과거 `experiment-v3-sol-ars09/ARS09`의 완료 후 보존 DB를 복제·동결한 `natural-zero-source-v1`. 후자는 실제 추천 0명 실행과 엄격한 지역 조건이 있는 상태이며, 점수나 추천을 합성·삭제하지 않는다. 당시 평가 모델의 품질을 현재 모델 성능으로 재표기하지 않는다.
- `natural-zero-source-v1`은 기존 localhost 전용 평가 DB를 PostgreSQL template clone한 뒤 연결을 금지해 동결한다. 원본 실행 manifest·전후 상태·실제 Worker 결과와 hash를 ignored baseline에 보존한다. 원본 DB는 변경하지 않는다. 이것은 새 모델 호출이 아닌 실제 기록 상태의 재사용이다.
- 실행: `--dataset-manifest=manifest-natural-v2.json --baseline=bootstrap-v3 --only=ARSN01,ARSN02,ARSN03,ARSN05`와 별도 `--baseline=natural-zero-source-v1 --only=ARSN04,ARSN06`. 매 사례는 해당 baseline의 새 local DB에서 시작한다. 현재 로컬 history·inventory migration만 사본에 적용한다.
- 지표: 원문 의미, 실제 기준/목록/설명 변화, 기존 결정·연락 보호, 도구 선택, 호출 수·입력량·시간·가격표 추정. 성공 응답 존재를 시나리오 통과로 세지 않는다. 배포 gate가 아닌 관찰 실험이며 정성 실패와 전제 미충족을 구분한다.
- 모델/run 설정: 현재 제품 기본 모델을 그대로 사용하고 1·2차 Decisions 유지. source hash·model·reasoning·usage를 각 run manifest/trace에 보존한다. 시나리오당 1회만 실행한다.
- 데이터·privacy: 사용자가 승인한 실제 legacy 유료 권한 Role의 동결 capture와 실제 기존 실험 산출물만 사용한다. 원문 후보/회사 데이터·모델 출력은 ignored `runs/` 아래 owner-only로 보관한다. 운영 쓰기·외부 발송·배포는 없다.
- 한계: 이전 검색의 추천 0명은 전체 후보 소진과 다르다. 새 평가로 후보가 발견되면 그대로 보고한다. 수락자 전원 소개의 정기 실행과 미래 후보 질문 발송은 실제 해당 경로가 실행되지 않으면 미검증이다. 없는 전제를 만들기 위해 후보 상태를 조작하지 않는다.
