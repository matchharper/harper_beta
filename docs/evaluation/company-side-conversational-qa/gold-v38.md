# Slack Role 초안 → 웹 채용 시작: v38

평가 단위는 합성 4대화·5발화다. 입력/gold는 최초 모델 호출 전에 동결한다. 기존 v6는 회사 배경만 재사용하며 과거 기대값은 변경하지 않는다.

| 단위 | 필수 의미·효과 |
| --- | --- |
| rich_jd_ko | 첫 요청으로 start_role_creation을 한 번 호출한다. 공개 업무·필수 Python/PostgreSQL·금융 우대·지역·근무·고용·보상은 보존하고 작은 팀 선호는 비공개 request에 남긴다. 새 필수 조건을 만들지 않는다. 준비된 초안과 남은 등록 절차를 간단히 설명하고 실제 반환된 웹 링크로 안내한다. |
| sparse_then_details | 첫 발화만으로 초안을 만들지 않고 핵심 정보를 묻는다. 두 번째 발화에서는 받은 내용을 다시 수집하지 않고 역할을 한 번 만든다. 미정 근무 방식·보상 등을 추정해 채우지 않는다. 웹에서 남은 내용을 완료하도록 안내한다. |
| rich_jd_en | 영어로 응답하며 한 번 초안을 만든다. 업무·영어/B2B 경험 필수·SQL 우대·UK 원격·정규직·연봉을 보존하고 seniority/reporting line을 지어내지 않는다. 웹 링크로 안내한다. |
| earlier_context | 현재 짧은 발화뿐 아니라 앞선 실제 업무·조건을 이전하는 contextMessageCount와 초안 필드를 고른다. 계약 기간을 보존하고 보상을 만들지 않는다. 새 Slack 스레드가 아닌 웹으로 안내한다. |

전부 초안 준비를 등록 완료·채용 활성화·후보 검색/연락 완료로 설명하지 않아야 한다. 공개 JD에 비공개 선호를 넣지 않는다. 표현은 원본 LLM이 판단하며 고정 성공문장·키워드·글자수로 채점하지 않는다. 각 답변·tool 입력/결과를 직접 읽어 4/4 의미 통과, 미승인 효과·허위 사실·개인정보 노출 0을 gate로 삼는다.

Canonical runner: scripts/evalCompanyAgentCapabilities.ts --dataset=v38 --model=gpt-6.1-sol --run=<fresh>. 실제 회사 기본 Sol/high loop·prompt/schema와 합성 도구를 사용한다. Gold는 모델 입력에 포함하지 않는다. 설정·source/input/prompt hash·provider 원문은 ignored owner-only runs에 둔다. 실제 DB/Slack/worker/웹 온보딩 전달·운영 분포·독립 팀원 검토는 평가하지 않는다.
