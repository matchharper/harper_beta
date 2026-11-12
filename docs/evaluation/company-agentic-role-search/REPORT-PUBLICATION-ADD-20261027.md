# Run Search 추가·교체 계약 로컬 확인

2026-10-27 로컬 변경 확인이다. 웹·Worker 배포, 운영 DB 변경, 실제 후보 연락은 하지 않았다.

## 변경과 검증 범위

Run Search 발화와 candidate_search 기능 소개·정책에 현재 추천 목록 밖의 적합한 후보를 실제로 추가하는 목적을 명시했다. 기존 평가를 재사용하되 기존 카드 재설명을 새 발굴로 취급하지 않는다. 공개 publication 입력은 `roleId`, `kind`, `talentIds`이며 추가는 delta ID, 교체는 최종 전체 ID다. Brief와 교체 대상 목록의 동시 수정 검사는 서버·Worker가 담당한다.

- 웹 대상 테스트 42개: enqueue 인자·동일 요청 재접수·버전 없는 schema·추가/교체 receipt 텍스트·버튼 발화·selection projection.
- Worker 대상 테스트 65개: 추가/교체 분리, 기존 후보 소개문 보존, 빈 추가, 서버 목록 snapshot, 기존 접수 명령 호환.
- 별도 임시 PostgreSQL 테스트 7개: 실제 저장 SQL, 기존 카드 전체 행 보존, 동시 변경 거부, 교체 rollback. 운영 DB를 사용하지 않았다.
- 실제 formatter를 실행해 모델용 receipt의 kind·정확한 요청 ID·실행 ID와 미완료 사실을 확인했다. 내부 options와 version 객체는 모델용 receipt에 포함되지 않는다.

## 실제 모델 평가: 완료 경로 미검증

기존 `cases-v1.json`, `gold-v1.json`, `manifest-v1.json`과 `bootstrap-v3`를 바꾸지 않고 ARS05만 새 run `20261027-publication-add-v1`로 실행했다. 정본 runner는 `scripts/evalCompanyAgenticRoleSearch.ts`이며 `--only=ARS05`로 범위를 제한했다. 원본 사용자 입력은 지난 결과에서 5명을 더 추천해 달라는 기존 동결 사례다. 새 Run Search 버튼 문구 자체를 실행한 사례는 아니다.

모델은 `google/gemini-3.8-flash`, 2턴·3 completions·약 66.9초였다. 전체 provider 요청/응답·설정·source manifest·전후 DB snapshot은 ignored owner-only `runs/20261027-publication-add-v1/`에 보존했다. 원본 개인정보와 응답은 이 문서에 복사하지 않는다.

첫 호출 `get_more_data(matching.view=selection)`이 평가용 DB의 `company_role_candidate_evaluations.discovery_run_id` 컬럼 부재로 실패했다. 이후 모델은 `read_talent`로 기존 후보를 읽고 5명을 설명했으며 publication을 호출하지 않았다. 따라서 **후보 추가 목적을 달성하지 못했고, 새 계약의 모델 실행 성공을 확인하지 못했다.** 평가 환경 오류가 최초 장애이며, 이후 응답이 실제 추가 없이 기존 후보 설명으로 끝난 점도 별도로 남긴다. 모델이 조회를 시도했다는 사실만으로 정책 개선이 검증됐다고 판단하지 않는다.

실행 중 공유 checkout의 `promptFormat.ts`, `roleCalibration.ts`, `roleCreationChat.ts` 변경도 감지됐다. 시작 시 source와 변경 내역을 모두 보존했으며, 통제된 전후 모델 품질 비교나 release gate 통과로 사용하지 않는다. 고정 데이터·gold와 평가 runner를 이 결과에 맞춰 수정하거나 재실행하지 않았다.

이와 별도로 기존 `tools.test.ts`의 세 schema 기대값 불일치(candidateConsentRelayId, draft, profileSections/profileView)는 이번 변경 밖의 실패로 남겼다. 전체 테스트 통과를 주장하지 않는다.
