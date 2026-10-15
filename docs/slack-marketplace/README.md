# Harper Slack Marketplace 제출 준비

확인일: 2026-10-12. 대상 앱: **Harper (`A0BLPDCB4LU`)**. Harper Local과 구분한다.

## 현재 상태

- 앱은 외부 배포 중이나 Marketplace에 제출·승인된 상태는 아니다. 등록 신청만으로 설치 화면의 미심사 경고가 없어지지는 않는다. 승인 후에도 요청 권한 동의와 워크스페이스 관리자 승인은 별개다.
- Slack 콘솔에서 최근 28일 활성 워크스페이스 12개, 사용자 15명을 확인했다. 집계는 일별 갱신되며 실제 제출 시 다시 확인한다.
- 사용자 승인으로 Chris (`chris@matchharper.com`)를 Daniel과 함께 공동 관리자로 추가했다.
- 소개 문구·HR & Team Culture 분류·한/영 언어·요금 분류·지원 이메일·심사 연락처를 Basic Information에 저장했다. 현재 공개된 `/en/company`와 문의 영역을 임시 URL로 사용하며, 전용 페이지 배포 후 교체한다.
- 기존 9개 봇 권한의 영문 사용 사유도 Slack 설정에 저장했다. 권한 자체는 변경하지 않았다.
- 설치·지원 페이지 `/slack?lang=en`과 한국어판을 구현하고 로컬에서 표시·언어 전환·지원 링크를 확인했다. 배포는 별도 명시적 승인을 기다린다.
- 심사 연락처 전화번호 및 화면 증거는 비공개 `.local/slack-marketplace-20261012/`에 보관한다. 저장소에 인증 정보나 개인정보를 넣지 않는다.

## 제출 완료 조건

**개인정보 측면의 제출 차단 항목:** [Jill 비교와 원본 Slack 접근·삭제 경계 검토](jill-reference-and-privacy-gates-ko.md). 비공개 원문의 웹/다른 채널 재사용, 원문 수정·삭제 반영, 보관 기간은 소개 문구만으로 해결되지 않는다. 한·영 [개인정보 고지 초안](privacy-notice-draft.md)은 발행 전 검토용이며 현재 정책이 아니다.

| 항목 | 준비된 내용 | 남은 작업 |
| --- | --- | --- |
| 관리자 | Daniel + Chris | 없음 |
| 소개·지원 | [영문 소개](listing-en.md)와 기본 정보 저장, 한·영 공개 페이지 코드 | 명시적 배포 승인 → 공개 URL 검증 → 전용 URL로 교체 |
| 권한 | [14개 권한의 사용 목적](scopes-en.md) | 콘솔 9개와 운영 OAuth 요청 14개 차이 해결, 새 설치 검증 |
| 개인정보·보안 | [운영 근거와 미확인 항목](security-evidence.md) | Slack 데이터 보관·삭제·처리업체·지역 고지 확정, 승인된 공개 정책 발행 |
| 테스트 접근 | [심사 실행 순서](reviewer-guide-en.md) | 다른 고객과 분리된 심사용 회사 계정, 검증된 로그인 방법, 합성 데이터 |
| 이미지·시연 | [촬영 구성](reviewer-guide-en.md#assets-to-capture) | 실제 production Harper 사용 화면 1600×1000, 설치부터 제거까지 시연 영상 |
| 제출 | 5단계 제출 화면 확인 | 위 자료 입력, 자동 점검, 최종 약관 동의 확인 후 제출 |

### 작업 위치

- 앱 설정: https://app.slack.com/app-settings/T09ASGLN207/A0BLPDCB4LU
- 배포: https://app.slack.com/app-settings/T09ASGLN207/A0BLPDCB4LU/distribute
- 제출: https://app.slack.com/app-settings/T09ASGLN207/A0BLPDCB4LU/submission
- 새 페이지: `src/pages/slack.tsx`
- 공통 문서 화면의 회사용 링크 지원: `src/components/landing/DocumentPageShell.tsx`
- 현재 공개 개인정보 처리방침: https://matchharper.com/privacy?lang=en (v1.1.0, 2026-08-03)
- 10월 8일의 이전 준비 자료: `.local/slack-marketplace-20261008/packet/`. 당시의 기본 모델 추정과 미확인 연락처는 이번 확인 내용으로 대체한다.

## 제출 진행 순서

1. 새 페이지를 명시적 승인 후 배포하고 설치·지원 URL을 로그인 없이 확인한다. 기존 고객 데이터나 정책 변경을 이 배포에 섞지 않는다.
2. 5개 추가 권한은 실제 기능에 필요하지만 콘솔에 없다. 목적과 접근 범위를 보여주고 변경 시점에 확인받은 뒤 설정한다. 심사용 Slack 워크스페이스에 새로 설치하여 실제 동작을 검증한다.
3. 보관·삭제와 처리업체 정책은 구현·계약·실제 계정 설정에 맞춰 확정한다. 기본 정책만 보고 ZDR, 인증, 삭제 보장 등을 확약하지 않는다.
4. 전용 회사 계정과 합성 데이터로 기능을 검증하고 실제 이미지와 영상을 촬영한다. 실제 후보자 자료를 심사 자료에 넣지 않는다.
5. Listing → Scopes → Security and compliance → Testing information → Automated checks 순서로 완료한다. 현재 Listing에 필수 이미지가 없어 이후 단계의 실제 질문을 확인하지 못했다. 아래 문서는 답변 준비 자료이지 완료된 보안 설문이 아니다.
6. 최종 약관과 제출 내용을 보여주고 필요한 동의를 받은 다음 제출 상태를 확인한다.

## 근거

- [배포와 미심사 앱](https://docs.slack.dev/app-management/distribution/)
- [Marketplace 요구사항](https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/)
- [심사 가이드](https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide/)
- [OpenAI API 데이터 정책](https://developers.openai.com/api/docs/guides/your-data)

새 설치·실사용 증거 없이 기능 심사를 통과했다고 기록하지 않는다. 공개 페이지 미리보기는 Marketplace의 실제 앱 사용 이미지로 대체할 수 없다.
