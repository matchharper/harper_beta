# 추천 이력과 연결 대기 설명 — 2026-09-28

Frozen v10의 두 synthetic 대화(3발화)를 실제 production agent loop로 실행했다. Run은 `company-first-history-20260928`이며 모델은 Gemini 3.8 Flash / OpenRouter / medium / temperature 0.5다. 원문과 도구 trace를 구현 담당 Codex가 읽었으며 독립 팀원 검토는 하지 않았다.

| 대화 | 관찰한 결과 | 판정 |
| --- | --- | --- |
| 기존 추천을 못 받은 사람만 ready에 있는지 질문 | 이전 Harper 추천·거절이 있을 수 있고 아직 수락하지 않은 후보라는 의미를 설명함 | 1/1 |
| ready에서 사라진 후보에 대해 질문 | 이전 Harper 추천을 수락해 연결 대기로 이동했다는 실제 제공 사실을 설명함 | 1/1 |
| 이어서 다시 Intro를 보내야 하는지 질문 | 중복 Intro가 필요 없으며 현재 연결 대기에서 회사가 연결 여부를 결정하면 된다고 안내함 | 1/1 |

새로운 연락·수락·회사 의사·CC 연결 완료를 만들지 않았고 상태 사실에 관한 critical 오류는 관찰되지 않았다. 첫 답변의 일반적인 재검토 가능성 설명과 끝의 추가 도움 제안은 다소 길지만 특정 후보자의 의사 변경으로 서술하지 않았다.

`runs/company-first-history-20260928/manifest.json`에는 source fingerprint, input hash, 모델 설정, prompt fingerprint, 실행 시간을 남겼다. Production 도구 schema와 synthetic adapter를 연결한 loop이며, 이번 세 답변은 제공된 최신 context만으로 작성해 추가 도구를 호출하지 않았다. 따라서 tool executor나 DB/전송 검증으로 계산하지 않는다. 결과 serializer는 별도 unit test에서, DB의 경합·수락·supersession은 `scripts/test_company_first_history.py`의 격리된 PostgreSQL 검증에서 확인했다.

Raw output은 ignored run 폴더에만 보존한다. 이 3발화의 통과는 다른 회사 행동이나 전체 conversation dataset의 품질을 보장하지 않는다.
