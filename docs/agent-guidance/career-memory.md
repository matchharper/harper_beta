# Career Memory·Search Brief 작업 계약

Career 사용자 정보 저장·조회·추천을 설계·수정·리뷰할 때 적용한다. 코드·문서 경로는 `harper_beta/` 기준이며, workspace 접두사가 있는 경로는 workspace 기준이다.

## Career Memory / Search Brief design contract

- Career 사용자 정보 저장·조회·추천 설계를 다룰 때는 `harper_beta/docs/talent-unified-memory-implementation-plan-ko.md`를 먼저 읽는다. 이 문서는 목표 설계이며, 실제 구현·배포 여부는 코드로 별도 확인한다.
- 온보딩 이후에는 사용자와 대화하는 원본 LLM이 공통 read/write tool로 Brief와 Memory 사실을 관리한다. 별도 intent classifier, turn별 extractor, 숨은 write-tool 내부 LLM을 추가하지 않는다. 채팅·음성 온보딩의 별도 extraction은 사용자가 말한 사실을 저장하는 예외다. 질문 선택·답변 충분성·완료 판단은 대화 모델이 실제 대화와 저장된 사실로 결정하며, extraction이나 Brief 존재 여부로 coverage를 만들거나 완료를 판정하지 않는다.
- Memory는 사용자에 대해 알아두고 다음 대화·작업에 재사용할 사실과 맥락의 기본 저장소다. 사용자의 자연스러운 대화·폼 답변이나 확인된 원본에서 얻은 정보를 재사용에 필요한 정확도·범위·불확실성과 함께 보존하며 명시적인 보존 제한을 따른다. 기존 Profile·Documents·설정 등에서 소유하는 정보는 그 원본을 수정하고 복제하지 않는다. 여러 추천·지원·대화 행동을 종합해 도출한 잠정적 선호를 Memory 사실로 쓰지 않는다. 추천 Worker에 한해 이런 반복 추론을 줄이는 `talent_behavior_contexts`를 재생성 가능한 파생 cache로 유지한다. builder는 Brief·Memory와 기존 행동 원본을 증거로 읽지만 추론을 Memory에 되쓰지 않는다.
- 추천 Worker의 모든 production V2 run은 Profile + 전체 Search Brief + 같은 version의 Behavior Context를 단계별 LLM에 재사용한다. Worker prompt에는 Memory 행, 과거 대화·추천·지원 이력을 기본으로 직접 반복 주입하지 않는다. Behavior Context는 soft ranking/해석 신호일 뿐 Brief를 덮어쓰거나 hard constraint·권한·동의를 만들 수 없다. 50:50 legacy/behavior cohort는 두지 않는다.
- 무엇을 기억할지, Brief/Memory 구분, 중요성, 선호의 강도, 기존 내용과의 관계, 추천에 어떻게 적용할지는 LLM이 대화 의미로 판단한다. 이를 정규식·키워드·단어 목록·휴리스틱 점수·시나리오별 분기로 대신하지 않는다. 품질 문제는 prompt, 제공 context, tool 계약과 검증으로 개선한다. 인증·식별자·타입·동시 수정·동의·공유 권한 등 구조적 계약과 안전 경계는 코드가 책임진다.
- Brief와 Memory는 모두 행 기반이며 공통 변경 계약을 쓴다. 일반 Brief 추가는 자유 형식 label·content, 수정·삭제는 짧은 숫자 ref로 처리한다. Brief 주제·label·호환 key를 enum으로 제한하지 않는다. 기존 key는 온보딩·이관·reader 호환에 필요한 선택적 text metadata로 보존하되 일반 대화 tool에는 key 작성 요구를 두지 않는다. 과거 coverage는 채팅·음성의 질문 제한이나 완료 근거가 아니다. 사례별 timeline·별도 기억 원본·필수 복제/동기화 구조·중간 판단 상태 머신을 추가하지 않는다.

## 웹 reader·writer의 추가 계약

- 호환 key가 없는 Brief도 사용자측 채팅·검색·추천·UI에 포함한다. label을 식별자나 의미 분류 규칙으로 사용하지 않는다.
- Memory add에는 원본 LLM이 매칭·판단 중요도 1·2·3을 정한다. Brief에는 importance를 두지 않는다. 새 발화로 기존 행이 더 이상 사실이 아니게 되면 상충 행을 추가하지 말고 기존 행을 수정하거나 삭제한다. 중요도나 stale 여부를 키워드·휴리스틱으로 정하지 않는다.
