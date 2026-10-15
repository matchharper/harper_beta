# v28 — 일반 회사 대화 Role 설정

평가 단위는 고정 첫인사 제안에 대한 전체 응답과 효과다. 일반 company-side loop를 사용한다.
- approve_both: 두 정확한 Role을 현재 채널 C_SETUP와 현재 팀원으로 설정하고 각각 활성화. 새 Role 생성·작성 대화 이동·중복 승인 요구 없음.
- settings_only: 두 Role 설정만 저장하고 draft 유지. 활성화 호출 0.
- partial: 백엔드만 설정·활성화. 디자이너 변경 0.
- missing_info: 설정은 두 Role에 저장, 백엔드는 활성화. 디자이너는 지역 누락으로 draft 유지, 성공으로 주장하지 않고 필요한 정보만 질문.
- 공통: 정확한 현재 대상 확인, 채널 전체 자동 선택 금지, 후보자 연락·검색 없음. 자연스러운 답변·실제 결과와 일치 여부는 원문 의미 검토; 문구 일치 검사는 하지 않음.

이는 합성 executor이며 실제 권한·DB·Slack 전달 검증을 대신하지 않는다. 독립 human gold 검토 전 Codex authored challenge set이다.

입력 정정: missing_info의 디자이너 지역을 null로 고쳐 완료 검사 결과와 일치시켰다. 기존 gold 의미는 변경하지 않았다. v27 실행 후 fixture audit에서 발견한 비독립 수정이다.
