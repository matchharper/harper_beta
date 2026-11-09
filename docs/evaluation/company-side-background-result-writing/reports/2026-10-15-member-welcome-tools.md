# 환영 안내의 일반 company-side 도구 사용

- 로컬 구현·미배포. 기존 company_update 사건 실행 경로를 재사용하고, 전달 대상 채널과 실제 환영 스레드를 일반 company-side tool loop에 연결했다. 기존 Slack 모델을 사용하며 기능 로딩·조회·복수 메시지 확정이 가능하다.
- 같은 hidden event anchor, 기존 job과 batch receipt를 재사용한다. 사건은 팀원의 채팅이나 작업 승인이 아니며, 역할별 접근 권한과 기존 tool 동의 계약을 유지한다. 일반 응답은 기존 스레드, batch는 지정한 새/기존 스레드에 전달한다.
- frozen `member-welcome-v1` 입력·gold 유지, run `welcome-tools-20261015-1`. 네 건 모두 실제 Gemini loop로 생성됐으며 세 기능 bullet, Calendar 저장/미연결 구분, 역할 상태 범위, 미실행 작업 미주장을 원문 검토했다. 모델은 네 건 모두 추가 도구 없이 일반 답변을 선택했다.
- 합성 draft 사례에서 담당자·채널 설정을 제안했으나 작업 실행은 없었다. 안내의 제안 타당성은 실제 권한·설정 맥락에 따라 달라진다. 이 작은 표본으로 전체 품질을 일반화하지 않는다.
- 추가 조회는 합성 unavailable adapter, 메시지 확정은 합성 capture다. 실제 DB·Slack·가입·배포를 실행하지 않았다. 동적 role 링크는 production 전달 경계가 렌더링하며, 이 runner의 합성 캡처는 그 조회 경계까지 증명하지 않는다.
- focused 단위 검사: 기존 온보딩/부분 발송 복구/권한/발송 순서 11건 통과. 추가 tool-loop 검사 1건에서 첫 completion에 messaging tool이 없고, load_capabilities 다음 completion에 노출되며 3개 메시지(기존 스레드·새 root·답글)를 확정한 뒤 추가 최종 답변 없이 끝남을 확인했다.
- 타입 검사 통과. 독립 검토 및 운영 Slack 전달은 검증하지 않았다.
