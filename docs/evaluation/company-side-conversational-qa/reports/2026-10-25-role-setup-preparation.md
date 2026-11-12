# 웹 역할 Setup 준비 — 로컬 확인

2026-10-25. 로컬 변경이며 배포·운영 Role 생성·메시지 발송은 하지 않았다.

첫 웹 작성은 기존 company-side 역할 작성 경로에서 공개 역할 필드와 Description만 준비한다. 최초 Setup의 기본 모델은 Sol, reasoning은 low이며 이후 역할 편집의 기존 모델 설정은 유지한다. 회사의 다른 Description을 먼저 읽고 없을 때 공개 검색을 수행한다. 회사 위치와 기존 역할의 근무 조건도 근거로 전달한다. 기존 marker 출력 지시와 첫 화면의 질문 카드 생성 지시를 제거했다.

클라이언트는 기존 draft UUID로 즉시 역할 화면을 열고, 실제 도구 진행 로그를 양쪽 폼 대신 표시한다. 저장 결과 갱신이 끝나면 Setup을 표시하며 요청 실패는 오류 화면에 남긴다. 기존 `/dev/role-start#preparing`에서 합성 진행 이벤트와 같은 운영 UI를 확인했다. 프리뷰는 네트워크·저장·발송을 차단한다.

## 검증

- 변경 경로 테스트 28개 중 27개 통과. 즉시 이동, 동일 draft ID, 중복 이동 방지, 갱신까지 로딩 유지, 생성 전 조회 방지, 실패 표시, Setup 참고 입력 보존을 포함한다.
- 실패 1개는 일반 Role prompt의 기존 17,000자 상한이다. 현재 공유 계약을 사용한 변경 전 builder도 25,190자로 실패한다. 첫 Setup은 불필요한 서비스 설명을 빼 13,816자이며 별도 크기 검사를 통과한다. 기존 상한을 완화하지 않았다.
- frozen `role-criteria-v1`의 RC04를 canonical `scripts/evalRoleNotificationConsent.ts`로 재실행했다. Run `20261025-setup-source-rc04`, view `role_details`, Sol/high. 원본 input/gold는 변경하지 않았다. 실제 모델의 도구 호출·저장 필드·답변을 읽어 요청한 지역 변경만 수행하고 기존 criteria를 보존함을 확인했다. 알림·등록·외부 효과 0.
- 실행 설정·source hash·원문은 해당 ignored owner-only run에 보존한다. 변경 production 파일 lint 오류 0. 전체 타입 검사에는 변경 범위 밖의 기존 오류 3개가 남아 있다.

## 한계

RC04는 기존 편집 회귀 확인이며 새 Setup의 Description 품질과 low reasoning의 대표 성능 검증은 아니다. 새 운영 Role을 만들어 종단 지연을 재측정하지 않았다. 화면 프리뷰의 합성 6초는 실제 생성 시간의 추정치가 아니다. 별도 Brief 생성과 후보 풀 보충의 대기 시간은 이 변경에서 최적화하지 않았다.

## 같은 날 후속 모델 변경

사용자 요청으로 첫 웹 역할 작성 모델을 `google/gemini-3.8-flash` / low로 고정했다. 브라우저에 저장된 모델 선택보다 우선한다. 별도 Brief 생성 모델은 이 변경의 대상이 아니다.

기존 canonical runner에 `role_setup` 입력 화면을 추가하고 frozen RC04를 같은 gold로 재실행했다. 최종 run `20261025-setup-gemini-low-rc04-r2`는 OpenRouter의 실제 Gemini/low 응답·공개 필드 저장을 사용했다. 요청한 지역만 부산으로 변경했고 criteria 보존·등록 요청 0·외부 효과 0을 확인했다. 답변은 변경 사실과 선택적인 추가 수정 안내였으며, 새 역할 작성 품질이나 처리 시간 검증으로 일반화하지 않는다. 앞선 r1은 모델 결과가 같았지만 runtime 소스 정정 전 hash이므로 최종 근거로 쓰지 않는다. 설정·input/gold/source hash·원문은 각각의 ignored owner-only run에 보존했다. 관련 비모델 검사 20개 통과, 변경 runtime lint 오류 0. 배포하지 않았다.
