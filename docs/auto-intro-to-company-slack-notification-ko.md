# 연결대기 후보자 Slack 추천 — Codex scheduled 운영 계약

문서 상태: 사용자 확정 계약 구현됨. Codex scheduled task는 비활성화 상태

## 1. 실행 주체와 현재 상태

이 작업은 Vercel cron이 아니라 Codex scheduled task가 매일 오전 9시(Asia/Seoul)에 직접 실행한다. `vercel.json`에는 이 작업을 위한 cron이 없으며, Harper 애플리케이션도 추천 문구를 만들기 위해 Anthropic·OpenAI·Gemini 등 별도 LLM을 호출하지 않는다.

Codex가 후보 자료를 읽고 이 문서와 `scripts/internal-company-role-talent-matching-manual-ko.md`를 근거로 `kind=null`의 상세 추천 이유와 별도의 Slack 요약 문구를 직접 작성한다. 애플리케이션 코드는 후보 조회, 입력 형식·재자격 검증, 상세 reason 저장, Slack 본문 조립·발송, 메시지 DB 저장, 중복 방지만 담당한다.

scheduled task는 처음부터 비활성 상태로 둔다. 사용자가 Codex 앱에서 해당 작업을 활성화하기 전에는 오전 9시가 되어도 조회·작성·발송이 실행되지 않는다.

## 2. 빠른 후보 조회 방식

처음 구현에서는 role 전체를 읽은 뒤 모든 role의 `talent_opportunity_tag` 이력을 가져왔다. 실제 데이터에서 이 방식은 2분 이상 걸릴 수 있어 scheduled 작업에 부적합했다.

현재는 다음 순서로 조회한다.

1. `talent_opportunity_tag`에서 `tag=내부:연결대기`이면서 `updated_at > 현재-14일`인 행만 먼저 읽는다.
2. 여기서 발견한 소수의 `(role_id, talent_id)`와 관련된 role 및 stage tag 이력만 읽는다.
3. 각 쌍의 최신 내부 단계가 여전히 `내부:연결대기`인지 확인한다. 이후 연결됨·거절·custom 내부 단계 등으로 옮겨졌으면 제외한다.
4. 남은 쌍에 대해서만 fit, 기존 발송 progress, recommendation, workspace, talent 자료를 읽는다.
5. `kind=null` 후보자에 대해서만 전문 경력 자료를 추가로 읽는다.

따라서 14일 이상 지난 연결대기 행은 첫 쿼리에서부터 읽지 않는다. 오래 걸렸던 “모든 role → 모든 tag” 방식으로 되돌리지 않는다.

## 3. 후보자 선정 계약

대상은 모든 workspace-role이며 `is_expired=true`, `status=ended`, `status=deleted`인 role만 제외한다. 각 `(role_id, talent_id)`는 다음 조건을 모두 만족해야 한다.

1. 가장 최신 내부 단계가 `내부:연결대기`다. `내부단계:*` custom stage도 내부 단계 변경으로 간주한다.
2. 최신 연결대기 전환 시각이 실행 시각 기준 14일 미만이다. 정확히 14일인 경우도 제외한다.
3. 같은 role·후보자에 대해 `talent_progress.kind=intro_to_company`이면서 `metadata.deliveryStatus=sent` 또는 `metadata.slackSent=true`인 기록이 없어야 한다. 이 성공 기록이 하나라도 있으면 이미 발송된 후보자로 보고 제외한다. `company_messages`의 Slack 메시지와 mention은 중복 판정에 사용하지 않는다.

   pending·failed progress는 발송 완료로 보지 않아 재시도할 수 있다.
4. 최신 `talent_opportunity_fit` 행이 있고 fit `kind`가 `codex` 또는 `null`이다.
5. `kind=codex`라면 비어 있지 않은 `talent_opportunity_fit.reason`이 있다.
6. workspace에 메시지를 받을 수 있는 활성 Slack integration과 channel이 있다.

scheduled 기본 실행에는 후보자 수 상한을 두지 않는다. 오래 기다린 후보자부터 처리한다. `--limit`은 사람이 특정 범위만 진단할 때 명시적으로 지정하는 수동 필터일 뿐 scheduled 기본값이 아니다. 발송 단위는 role이 아니라 workspace다. 같은 workspace에 여러 role의 연결대기 후보자가 있으면 **Slack 메시지는 workspace당 한 번만 보내고**, 그 메시지 안을 role별 section으로 나눈다. role별로 별도 top-level Slack 메시지를 보내지 않는다.

## 4. Codex가 직접 적용하는 작성 계약

아래 내용이 scheduled task가 매 실행마다 적용해야 하는 **Slack 후보자 소개문 작성 프롬프트의 정본**이다. 후보자는 이미 `내부:연결대기`로 선정된 상태이므로 Codex는 선발 여부나 점수를 다시 판단하지 않는다. 해야 할 일은 회사가 짧은 메시지만 읽고도 “왜 이 사람과 대화해볼 만한가”를 이해하고 연결 여부를 답할 수 있게 만드는 것이다.

### 4.1 입력 필드와 사실 근거의 경계

`pnpm ops:auto-intro:list`가 반환하는 그룹에는 `companyContext`, `roleContext`, 후보자별 `reasonMode`, `storedReason`, `professionalProfile`이 있다. 다음 경계를 절대 넘지 않는다.

| `reasonMode` | 실제 fit `kind` | 후보자 소개문에 사용할 수 있는 사실 | 사용하면 안 되는 사실 |
| --- | --- | --- | --- |
| `codex` | `codex` | 해당 후보자의 `storedReason`에 명시된 사실과 그 사실을 과장하지 않는 자연스러운 재서술 | `professionalProfile`, 기억하고 있는 후보자 정보, 외부 검색, 다른 DB·문서의 후보자 사실 |
| `author` | `null` | 해당 role의 `companyContext`, `roleContext`, 해당 후보자의 `professionalProfile`, 매뉴얼 14장이 허용하는 전문 경력 근거 | 외부 검색, 다른 후보자 정보, dossier에 없는 사실, 사적·민감 정보 |

`companyContext`와 `roleContext`는 `author` 후보자에게 어떤 전문 경력 근거를 우선 선택할지 판단하고 역할과의 의미를 설명할 때 사용한다. `codex` 후보자의 Slack 문구에는 두 context의 새로운 후보자 사실을 섞지 않는다. workspace 메시지의 role section 제목에는 애플리케이션이 제공한 role title을 그대로 사용한다.

### 4.2 후보자별 4~6문장 설계

각 후보자 소개문은 한국어 존댓말 4~6문장으로 쓴다. `sentences` 배열 한 항목에는 문장부호로 끝나는 완결된 한 문장만 둔다. 한 후보자에게 핵심 강점이 하나라면 4문장을 우선하고, 서로 다른 강한 근거가 실제로 두 개 이상일 때만 5~6문장으로 늘린다. 문장 수를 채우기 위한 반복이나 일반론은 금지한다.

문장은 다음 역할을 수행해야 한다.

1. **첫 문장 — 추천의 hook:** 이 후보자를 기억하게 만드는 가장 강한 객관적 성취, 희소한 경력 맥락 또는 직접 ownership을 먼저 말한다. “다양한 경험이 있습니다”처럼 누구에게나 붙일 수 있는 소개로 시작하지 않는다.
2. **두 번째 문장 — 맥락과 규모:** 첫 사실이 어느 회사·제품·조직 단계·기간·문제에서 나온 것인지, 입력에 확인된 범위에서 구체화한다.
3. **세 번째 문장 — 본인의 직접 기여:** 회사나 팀의 성과와 후보자 자신의 행동·책임·결과를 분리해 설명한다. 입력에 직접 기여가 없으면 만들어내지 않고 확인된 경력 범위만 쓴다.
4. **역할 의미 문장 — 왜 지금 이 역할에서 볼 가치가 있는가:** 앞의 사실이 이번 역할의 실제 업무나 환경에서 왜 유의미한지 한 문장으로 연결한다. JD keyword를 복사하거나 “핏이 좋습니다”라고 판정만 반복하지 않는다.
5. **선택적 보강 문장:** 독립적인 두 번째 성취, 중요한 전문적 선호, relocation·근무 방식 같은 합법적 제약 또는 확인이 필요한 caveat가 의사결정을 실제로 바꿀 때만 넣는다.
6. **마지막 문장 — 판단 정보 마무리:** 앞선 근거의 역할상 의미, 실제 의사결정에 필요한 caveat 또는 확인 사항으로 후보자 설명을 마무리한다. 후보자마다 대화·연결을 제안하거나 질문하지 않는다.

4문장인 경우 `hook → 맥락 → 직접 기여 → 역할 의미·caveat`로 압축한다. 5~6문장인 경우에도 가장 강한 근거를 앞에 두며, 후보자별 소개는 모두 완결된 설명문으로 끝낸다. 연결 수락·거절 안내는 모든 후보자 section이 끝난 뒤 workspace당 한 번만 애플리케이션이 붙인다.

### 4.3 Slack 가독성 형식과 표현의 다양성

후보자 소개는 매번 같은 네 문장을 평문으로 붙이는 고정 template가 아니다. Codex는 각 후보자의 근거와 한 workspace 메시지의 전체 길이에 맞춰 다음 Slack `mrkdwn` 표현 중 가장 읽기 좋은 것을 선택한다.

- **짧은 문단형:** 하나의 강한 이야기 흐름이 있을 때 4~6문장을 짧은 문단으로 연결한다.
- **TL;DR형:** 첫 1~2문장이 후보자의 핵심을 가장 잘 요약할 때 `*TL;DR* —`로 시작하고, 뒤에 근거와 역할 의미를 짧은 문단으로 붙인다.
- **bullet형:** 서로 독립적인 성취나 판단 포인트가 2개 이상일 때 `•` bullet로 나눈다. 각 bullet도 완결된 존댓말 문장이어야 한다.
- **혼합형:** 한 문장 hook 또는 TL;DR 뒤에 2~3개의 핵심 bullet을 두고 역할 의미나 중요한 caveat를 별도 문장으로 마무리한다.

같은 workspace 메시지에서도 모든 후보자와 role에 기계적으로 같은 형식을 반복하지 않는다. 강한 근거가 하나면 문단형, 독립적인 근거가 여러 개면 bullet형처럼 **내용에 따라 형식을 바꾼다**. 다양성 자체를 위해 읽기 어려운 장식을 넣거나 사실 순서를 흔들지는 않는다.

Slack 본문에서는 `*굵게*`, `•` bullet, 짧은 문단 간 공백을 선택적으로 사용할 수 있다. 표, 중첩 bullet, 긴 code block, 장식용 emoji의 반복은 모바일 가독성을 떨어뜨리므로 사용하지 않는다. 후보자 이름 링크와 role section heading은 애플리케이션이 조립하므로 Codex가 `sentences` 안에 후보자 이름 heading이나 URL을 반복하지 않는다.

### 4.4 정보 선택과 표현 원칙

- 프로필 전체를 요약하지 않는다. 회사가 연결 여부를 결정하는 데 실제로 영향을 주는 강한 사실 1~2개만 남긴다.
- 학교·유명 회사·기술 이름은 그 자체로 추천 이유가 아니다. 문제의 난이도, 당시 맥락, 후보자의 직접 기여가 확인될 때만 쓴다.
- 여러 경력이 같은 강점을 반복하면 가장 최근 항목이 아니라 **가장 구체적이고 강한 증거**를 선택한다.
- 객관적 성취 → 당시 맥락 → 본인의 직접 기여 → 역할에서의 의미가 자연스럽게 이어지게 한다.
- 수치, 기간, 합류 순서, 투자, 매출, 사용자, 팀 규모는 입력에 명시된 경우에만 그대로 사용한다. 서로 다른 필드의 수치를 임의로 결합해 인과관계를 만들지 않는다.
- 회사가 이미 후보자의 전체 프로필을 볼 수 있다는 전제로, 이력서처럼 학교·회사·직책·기술을 순서대로 나열하지 않는다.
- `internal_reason`, `storedReason`, `professionalProfile`, `dossier`, `kind`, `score`, `label`, `confidence`, DB/source ID 같은 내부 용어를 회사에 노출하지 않는다.
- 다른 후보자와 비교하거나 과거 후보자의 거절 이유를 언급하지 않는다.
- 나이, 성별, 국적, 가족관계, 건강, 종교 등 보호 특성과 대리변수를 사용하지 않는다. 직무상 합법적으로 필요한 location·work authorization·근무 방식은 입력에 있고 역할 판단에 필요할 때만 다룬다.
- 근거 없는 성격·능력 평가, 최상급, 수락 가능성 보장, “반드시 좋아하실 겁니다”, “완벽한 핏입니다” 같은 광고 문구를 쓰지 않는다.
- 존댓말을 사용하되 평가 보고서처럼 딱딱하게 쓰지 않는다. 한 문장은 짧고 자연스럽게 쓰며, 같은 주어와 종결어미를 연속해서 반복하지 않는다.
- 후보자 이름은 애플리케이션이 별도 heading으로 붙이므로 모든 문장에서 이름이나 “후보자분”을 반복하지 않는다.
- 후보자 소개문에는 source 표기, 내부용 `Note`, DB URL을 넣지 않는다. `TL;DR`, bullet, 굵은 강조와 줄바꿈은 4.3의 계약 안에서만 사용한다.

### 4.5 `reasonMode=codex` 작성법

`reasonMode=codex`는 실제 `talent_opportunity_fit.kind=codex`를 뜻한다. 다음 순서로 `storedReason`을 Slack용 4~6문장으로 편집한다.

1. `storedReason`에서 확인 가능한 사실 주장만 목록화한다.
2. 그중 가장 강한 성취·맥락·직접 기여를 1~2개 고른다.
3. 중복, 내부 평가 용어, 긴 서론을 제거한다.
4. 저장된 문장을 그대로 복사할 필요는 없지만 의미와 강도를 바꾸지 않는다.
5. `storedReason`에 없는 회사명, 직책, 기술, 수치, 선호, 역할 요건을 profile이나 context에서 보충하지 않는다.
6. 후보자별 연결 제안이나 질문을 붙이지 않고, 역할 의미 또는 중요한 caveat까지 포함한 4~6개의 설명문으로 끝낸다.

저장된 reason이 장문이어도 전체를 축약 요약하지 말고 연결 결정에 가장 중요한 근거를 선택한다. 근거가 짧을 때는 같은 사실을 표현만 바꿔 반복하거나 profile로 빈칸을 채우지 않는다.

### 4.6 `reasonMode=author`: 상세 reason과 Slack 요약을 분리

`reasonMode=author`는 실제 `talent_opportunity_fit.kind=null`을 뜻한다. 이 경우 **상세 추천 이유 작성·저장**과 **Slack 소개문 작성**을 서로 다른 두 단계로 수행한다. 두 결과물은 동일한 문구가 아니며, Slack용 4~6문장을 `talent_opportunity_fit.reason`에 저장해서는 안 된다.

#### 4.6.1 1단계: 상세 추천 이유 작성·저장

1. `roleContext`에서 회사가 실제로 원하는 책임, seniority, 제품·조직 단계와 필수 제약을 파악한다.
2. `professionalProfile` 전체를 검토하고 `scripts/internal-company-role-talent-matching-manual-ko.md` 14장의 회사용 `internal_reason` 계약을 그대로 적용한다.
3. 매뉴얼이 요구하는 `TL;DR`, 후보자의 특별한 점, 간과하기 쉬운 경력 맥락, 후보자 본인의 직접 기여, profile 밖의 중요한 전문 정보, 사실의 의미, 선발 전제와 남은 caveat를 근거가 있는 범위에서 충분히 작성한다.
4. 이 상세 reason에는 Slack의 4~6문장 제한을 적용하지 않는다. 회사와 Harper 운영자가 추천 판단을 다시 이해할 수 있을 만큼 구체적이고 길게 쓴다.
5. 회사나 제품의 성과와 후보자 본인의 ownership을 분리하고, 직접 기여가 명시되지 않았다면 추론하지 않는다.
6. 완성된 상세 reason을 해당 `talent_opportunity_fit.reason`에 저장한다. `kind`는 `null`로 유지하고 `score`, `label`, `last_evaluated_at` 등 다른 fit 필드는 바꾸지 않는다.

#### 4.6.2 2단계: 저장할 reason과 별도의 Slack 요약 작성

1. 방금 완성한 상세 reason을 Slack 소개문의 사실 근거로 삼는다.
2. 상세 reason 전체를 다시 붙여 넣지 않고, 회사가 연결 여부를 결정하는 데 가장 중요한 hook·맥락·직접 기여·역할 의미만 고른다.
3. 4.2의 계약에 따라 별도의 4~6문장으로 요약하고, 4.3의 문단형·TL;DR형·bullet형·혼합형 중 적합한 형식을 고른다.
4. Slack 요약에서 상세 reason에 없는 후보자 사실을 새로 추가하지 않는다.
5. 이 Slack 요약은 Slack 본문과 발송 기록에만 사용한다. `talent_opportunity_fit.reason`에는 1단계의 긴 상세 reason이 남아야 한다.

즉, 저장 관계는 다음과 같다.

```text
companyContext + roleContext + professionalProfile + 매뉴얼 14장
  → 긴 상세 추천 이유
  → talent_opportunity_fit.reason에 저장

긴 상세 추천 이유
  → 핵심만 다시 선별한 4~6문장 Slack 소개문
  → Slack 본문과 발송 metadata에 사용
```

### 4.7 작성 예시

아래 예시는 `reasonMode=author`의 2단계 결과와 Slack 문장 구조를 보여주는 가상 예시다. 실제 실행에서 예시의 회사명·수치·표현을 재사용하지 않고 반드시 해당 dossier의 사실로 다시 작성한다.

가상의 입력 근거:

> B2B SaaS 회사의 첫 데이터 엔지니어로 합류해 고객 사용량 집계를 수작업 배치에서 실시간 파이프라인으로 전환했습니다. 데이터 처리 지연이 하루에서 10분 이내로 줄었다고 확인되어 있습니다. 이번 역할은 초기 데이터 기반을 직접 설계하고 제품팀과 함께 운영할 엔지니어를 찾습니다.

1단계에서 저장할 상세 reason 예시:

```markdown
**TL;DR** - 초기 B2B SaaS 조직의 첫 데이터 엔지니어로 합류해 데이터 기반을 처음부터
구축한 경험이 있습니다. 고객 사용량 집계를 실시간 파이프라인으로 전환해 처리 지연을
하루에서 10분 이내로 줄인 구체적인 결과가 있습니다.

합류 당시에는 고객 사용량 집계가 수작업 배치에 의존하고 있었으며, 후보자는 파이프라인의
설계와 전환을 직접 담당했습니다. 단순히 성장한 회사에 재직한 것이 아니라 데이터 수집과
처리 구조를 제품 운영에 사용할 수 있는 형태로 바꾼 ownership이 확인됩니다.

이번 역할도 초기 데이터 구조를 설계하면서 제품팀과 가까이 협업해야 하므로, 이미 비슷한
제품 단계에서 기반을 만들고 운영 결과까지 낸 경험이 중요한 판단 근거입니다.

**Note** - 현재 입력에서는 이후 팀 규모와 장기 운영 범위까지는 확인되지 않으므로 이 부분은
첫 대화에서 확인할 필요가 있습니다. 다만 0→1 데이터 기반 구축과 제품팀 협업 경험만으로도
우선 대화를 제안할 가치가 있습니다.
```

2단계의 별도 Slack 4문장 출력 예시:

```json
{
  "presentation": "tldr",
  "sentences": [
    "초기 B2B SaaS 조직의 첫 데이터 엔지니어로 합류해 데이터 기반을 처음부터 구축한 경험이 있습니다.",
    "고객 사용량 집계를 수작업 배치에서 실시간 파이프라인으로 전환했고, 입력에 확인된 처리 지연을 하루에서 10분 이내로 줄였습니다.",
    "제품팀과 가까이 협업하며 초기 데이터 구조를 직접 설계하고 운영해야 하는 이번 역할에서 특히 살펴볼 만한 경험입니다.",
    "현재 입력에서는 이후 팀 규모와 장기 운영 범위가 확인되지 않아 첫 검토에서 이 부분을 확인할 필요가 있습니다."
  ]
}
```

위 두 결과가 비슷한 사실을 사용하더라도 같은 문구는 아니다. 상세 reason은 추천 판단을 보존하고 caveat까지 설명하며, Slack 문구는 연결 결정에 필요한 핵심만 짧고 읽기 쉽게 보여준다.

나쁜 출력과 이유:

- “유명한 회사에서 다양한 기술을 경험한 뛰어난 후보자입니다.” — 구체적인 근거와 직접 기여가 없다.
- “회사 성장에 크게 기여했습니다.” — 입력에 후보자에게 귀속되는 성과가 없으면 쓸 수 없다.
- “JD의 핵심 항목과 완벽하게 일치합니다.” — 선발 판정을 반복하며 과장한다.
- “다른 후보자보다 더 적합합니다.” — 후보자 비교를 노출한다.

### 4.8 발송 전 후보자 문구 편집 체크

각 후보자마다 다음 질문에 모두 `예`라고 답할 수 있어야 한다.

1. `reasonMode=author`라면 매뉴얼 14장을 충족하는 긴 상세 reason을 먼저 완성했는가?
2. `reasonMode=author`의 상세 reason과 Slack 소개문이 서로 다른 목적과 길이의 결과물인가?
3. Slack 소개문은 정확히 4~6개의 완결된 존댓말 문장인가?
4. 첫 문장만 읽어도 이 후보자의 가장 강한 차별점을 알 수 있는가?
5. 모든 사실·수치·인과관계가 허용된 입력 근거 안에 있는가?
6. 회사·팀의 성과와 후보자 본인의 직접 기여를 혼동하지 않았는가?
7. 프로필 전체 요약, keyword 나열, 내부 평가 용어를 제거했는가?
8. 같은 의미를 문장 수를 채우기 위해 반복하지 않았는가?
9. 역할과의 의미가 일반론이 아니라 앞의 근거에서 자연스럽게 이어지는가?
10. 내용에 맞는 문단·TL;DR·bullet 형식을 선택했는가?
11. 후보자마다 연결 제안이나 질문을 반복하지 않고 역할 의미 또는 중요한 caveat로 마무리했는가?

## 5. 최종 Slack 본문 형식

Codex는 workspace별로 role section, 후보자별 `presentation`과 `sentences`, workspace 전체의 `followUpQuestion`을 작성한다. 애플리케이션은 **한 workspace의 모든 role section을 하나의 top-level Slack 메시지로 조립해 한 번만 발송**한다. 월요일과 목요일에는 5.3의 현재 Role 현황 표도 같은 메시지에 붙인다.

1. workspace 공통 제목과 인사말을 한 번만 쓴다.
2. 연결대기 후보자가 있는 각 role을 `*{roleTitle}*` heading으로 분리한다.
3. 각 role 아래에 후보자의 링크된 이름과 4~6문장 소개를 둔다.
4. 모든 role section이 끝난 뒤 아래 고정 안내를 한 번만 붙인다.
5. workspace의 `/org/jobs` 링크와 사이트 안에서 연결을 수락·거절할 수 있다는 안내를 한 번만 붙인다.
6. 유용한 추가 질문이 있을 때만 workspace 메시지 끝에 P.S.를 한 번 붙인다.

### 5.1 후보자 이름 링크 계약

모든 후보자 이름은 예외 없이 클릭 가능한 Slack 링크여야 한다. 텍스트 이름만 출력하거나 URL을 별도 줄에 노출하지 않는다. Slack `mrkdwn` 문법은 다음과 같다.

```text
<{absoluteProfileUrl}|{candidateName}>
```

애플리케이션이 각 후보자에 대해 `/org/jobs` 상세 URL을 조립한다. origin은 `NEXT_PUBLIC_SITE_URL`을 사용하고, 값이 없으면 `https://matchharper.com`을 사용한다. 운영 Slack 메시지에 `localhost`를 하드코딩하지 않는다. 로컬 실행에서만 `NEXT_PUBLIC_SITE_URL=http://localhost:3000`을 명시적으로 설정할 수 있다.

필수 query parameter:

- `orgId={workspaceId}`
- `roleId={roleId}`
- `view=pipeline`
- `talentId={talentId}`
- `detailRoleId={roleId}`
- `detailWorkspaceId={workspaceId}`

해당 role의 `recommendationId`가 있으면 `recommendationId={recommendationId}`도 반드시 포함한다. recommendation row가 없어도 나머지 detail parameter만으로 프로필을 열 수 있으므로 이름 링크 자체는 항상 만든다.

형태 예시:

```text
<https://matchharper.com/org/jobs?orgId={workspaceId}&roleId={roleId}&view=pipeline&talentId={talentId}&recommendationId={recommendationId}&detailRoleId={roleId}&detailWorkspaceId={workspaceId}|홍길동>
```

후보자 이름에 `<`, `>`, `&`, `|`가 있으면 Slack link label을 깨뜨리지 않도록 escape한다. URL 생성과 escape는 애플리케이션이 담당하며 Codex 입력 JSON에는 URL을 받지 않는다.

모든 후보자 section 뒤에는 workspace 전체 후보를 다시 확인할 수 있는 링크를 한 번만 붙인다. 이 링크는 `NEXT_PUBLIC_SITE_URL`과 `/org/jobs?orgId={workspaceId}&roleId=all`로 조립하며, 후보자별 소개문 안에서는 반복하지 않는다.

```text
후보자별 자세한 정보는 <https://matchharper.com/org/jobs?orgId={workspaceId}&roleId=all|Harper에서 확인>하신 뒤, 해당 화면에서 연결을 수락하거나 거절하실 수 있습니다.
```

### 5.2 고정 안내와 workspace 단위 P.S.

고정 안내:

> 어떤 후보자를 연결받고 싶으시거나, 혹은 연결을 원하지 않으시나요? 추천드린 후보자들이 회사와 잘 맞지 않는다면 다음부터 어떤 기준을 적용해 연결드리면 좋을지도 알려주세요. 그 기준을 바탕으로 다음 추천에 반영해볼게요.

P.S.는 **후보자 평가 질문이 아니라 다음 매칭 기준을 보완하는 질문**이다. 한 workspace 메시지 전체에 최대 하나만 작성한다.

1. 먼저 `companyContext`와 메시지에 포함된 모든 role의 `roleContext`를 읽고, 다음 후보를 찾을 때 실제 hard filter나 우선순위를 바꿀 수 있는 미확정 기준이 있는지 확인한다.
2. must-have 기술·경험, seniority, hands-on IC와 people management의 비중, 제품·산업 경험, 근무 방식·지역, 보상 범위처럼 합법적이고 직무 관련성이 있는 기준만 묻는다.
3. 이미 context에 답이 있는 질문, 단순한 호기심, 특정 후보자의 합격·불합격 판단, 보호 특성이나 대리변수에 관한 질문은 금지한다.
4. 여러 role과 여러 정보가 비어 있어도 가장 영향이 큰 질문 하나만 고른다. 여러 role이 포함된 메시지에서 특정 role 질문이라면 role 이름을 질문 안에 명시한다.
5. 회사가 답하지 않아도 압박을 느끼지 않도록 “아직 정하지 않으셨다면 상관없다”는 선택지를 애플리케이션이 붙인다.
6. 유용한 질문이 없으면 억지로 만들지 않고 `followUpQuestion`을 `null`로 둔다.

입력 JSON의 `followUpQuestion`에는 `P.S.`나 정해진 안내 문장을 직접 넣지 말고 핵심 질문 한 문장만 넣는다. 예: `이 역할에서는 hands-on IC 경험을 people management보다 더 우선하시나요?`

애플리케이션은 값이 있을 때만 다음 형태로 P.S.를 만들며 메시지 전체가 질문으로 끝나게 한다.

> P.S. 더 좋은 매칭을 위해 한 가지만 여쭤볼게요. 혹시 이 역할에서 hands-on IC 경험을 people management보다 더 우선하시나요? 답변해주시면 더 적합한 분을 찾는 데 반영하겠습니다. 아직 정하지 않으셨다면 “상관없어요”라고 알려주시겠어요?

최종 본문 형태는 다음과 같다. 후보자 A는 TL;DR형, 후보자 B는 bullet형을 사용한 예시이며 매번 이 조합을 고정해서 반복하지 않는다.

```text
*새로운 후보자 연결 제안*

안녕하세요, Harper입니다. 연결을 제안드리고 싶은 후보자를 공유드립니다.

*{roleTitle A}*

*<{profileUrl A}|{후보자 A 이름}>*
*TL;DR* — {가장 강한 hook 문장}
{맥락·직접 기여 문장}
{역할 의미 문장}
{중요한 caveat 또는 확인 사항}

*<{profileUrl B}|{후보자 B 이름}>*
• {첫 번째 핵심 성취 문장}
• {두 번째 핵심 성취나 맥락 문장}
• {역할 의미 문장}
{중요한 caveat 또는 확인 사항}

*{roleTitle B}*

*<{profileUrl C}|{후보자 C 이름}>*
{내용에 맞게 선택한 4~6문장 형식}

어떤 후보자를 연결받고 싶으시거나, 혹은 연결을 원하지 않으시나요? 추천드린 후보자들이 회사와 잘 맞지 않는다면 다음부터 어떤 기준을 적용해 연결드리면 좋을지도 알려주세요. 그 기준을 바탕으로 다음 추천에 반영해볼게요.

후보자별 자세한 정보는 <{workspaceJobsUrl}|Harper에서 확인>하신 뒤, 해당 화면에서 연결을 수락하거나 거절하실 수 있습니다.

{필요할 때만 P.S. 질문}
```

### 5.3 월·목 현재 Role 현황 표

Asia/Seoul 기준 월요일과 목요일 오전 9시 실행에는 workspace별 현재 Role 현황을 Slack Block Kit의 native `table` block으로 함께 보낸다.

1. 표의 대상은 `company_roles.source_type=internal`, `is_expired=false`이고 종료 lifecycle(`ended`, `deleted`, `closed`, `expired`, `inactive`, `archived`)이 아닌 모든 Role이다. 후보자 소개 대상이 없는 Role과 연결 결정 대기 인원이 0명인 Role도 표에 포함한다.
2. 열은 `Role | 상태 | 연결 결정 대기` 세 개만 둔다. `active`는 `진행중`, `top_priority`는 `최우선`, `paused`·`on_hold`는 `일시중지`로 표시한다.
3. `연결 결정 대기`는 해당 Role·후보자의 최신 내부 단계가 현재 `내부:연결대기`인 사람 수다. 14일 제한, fit kind, Slack 발송 progress와 무관하게 회사가 지금 수락·거절을 결정해야 하는 전체 인원을 센다.
4. Role 이름 셀은 rich-text link로 만들며 URL은 정확히 `NEXT_PUBLIC_SITE_URL(없으면 https://matchharper.com) + /org/jobs?orgId={workspaceId}&roleId={roleId}` 형식이다.
5. 같은 workspace에 새 후보자 소개가 있으면 후보자 본문과 표를 하나의 top-level Slack 메시지로 보낸다. 새 후보자 소개가 없어도 월·목에는 표만 top-level 메시지로 보낸다.
6. text fallback과 `company_messages.content`에는 각 행을 `<roleUrl|roleTitle> | 상태 | N명` 형태로 저장한다. 표 발송은 workspace와 KST 날짜로 만든 deterministic idempotency key를 사용해 같은 날 재실행 중복을 막는다.

표 예시:

```text
Role                              | 상태   | 연결 결정 대기
FDE (Forward Deployed Engineer)   | 진행중 | 5명
```

## 6. scheduled task 실행 과정

Codex는 `/Users/gimhojin/Desktop/harper/harper_beta`에서 다음 과정을 수행한다.

1. 작업 디렉터리를 repository root로 설정하고 `AGENTS.md`, 이 문서 전체, `scripts/internal-company-role-talent-matching-manual-ko.md` 14장을 읽는다.
2. `pnpm ops:auto-intro:list`를 한 번 실행해 빠른 후보 dossier, Slack channel 여부, `roleSummaryDue`, `roleSummaries`를 읽는다. 이 결과 대신 모든 role·tag를 전체 스캔하는 별도 쿼리를 만들지 않는다.
3. `eligibleCandidateCount=0`이고 `roleSummaryDue=false`이면 어떤 DB write나 Slack 발송도 하지 않고 0건 요약을 남긴다. `eligibleCandidateCount=0`이어도 `roleSummaryDue=true`이고 Role 현황 workspace가 있으면 `groups: []` 입력으로 send를 실행해 표만 발송한다.
4. 후보자 group의 `slackConnected=false` workspace는 후보자 문구를 작성하거나 발송하지 않고 channel 없음 생략 수에 포함한다. Role 현황의 `slackConnected=false` workspace도 표를 발송하지 않고 별도의 Role 현황 channel 없음 수에 포함한다.
5. 발송 가능한 후보자를 workspace별로 모두 모은다. 후보자 수를 이유로 5명씩 자르거나 role별 top-level 메시지로 쪼개지 않는다.
6. 한 workspace 안에서 후보자를 role별 section으로 나누고, role마다 `roleContext`와 해당 후보자들을 함께 유지한다.
7. `reasonMode=author` 후보자는 먼저 4.6.1의 긴 상세 reason을 작성하고, 그 reason에서 4.6.2의 별도 Slack 4~6문장을 만든다. `reasonMode=codex` 후보자는 4.5에 따라 `storedReason`에서 Slack 문구를 만든다.
8. 각 후보자 내용에 맞는 `presentation`을 선택하고, workspace 전체에 대해 5.2의 `followUpQuestion` 하나 또는 `null`을 결정한다.
9. 4.8의 편집 체크를 마친 뒤 다음 workspace 단위 구조의 JSON을 임시 파일에 만든다. 월·목 Role 현황만 발송하고 후보자 group이 없으면 `{"groups": []}`를 만든다.

```json
{
  "groups": [
    {
      "workspaceId": "...",
      "roles": [
        {
          "roleId": "...",
          "candidates": [
            {
              "talentId": "...",
              "internalReason": "reasonMode=author일 때만 매뉴얼 14장에 따라 작성한 긴 상세 reason; codex이면 null",
              "presentation": "paragraph | tldr | bullets | tldr_bullets",
              "sentences": ["Slack 문장 1.", "Slack 문장 2.", "Slack 문장 3.", "Slack 문장 4."]
            }
          ]
        }
      ],
      "followUpQuestion": "필요한 경우 질문, 아니면 null"
    }
  ]
}
```

10. `pnpm ops:auto-intro:send -- --input <임시 JSON 절대경로>`를 정확히 한 번 실행한다. 사람이 내용을 검토하기 전 단계에서 시험 삼아 일부를 먼저 발송하지 않는다.
11. send 단계가 현재 eligibility와 Slack channel을 다시 조회한다. 작성 중 14일 경계를 넘었거나, stage·fit kind가 바뀌었거나, 이미 성공 발송된 후보자는 우회하지 않고 제외·오류 결과를 그대로 보고한다.
12. send 단계는 candidate count에 임의의 5명 제한을 두지 않는다. 4~6개 Slack 문장, 문장부호, 허용된 presentation, author 상세 reason 존재, 후보자 누락·중복, workspace-role 일치도를 검증한 뒤 deterministic progress ID로 발송 claim을 만든다.
13. `reasonMode=author` 후보자의 **긴 상세 reason**을 해당 `talent_opportunity_fit.reason`에 먼저 저장하고 `kind=null`을 유지한다. Slack 4~6문장 요약을 reason에 저장하지 않는다.
14. 애플리케이션이 후보자 이름에 5.1의 상세 `/org/jobs` 링크를 붙이고 한 workspace의 모든 role section을 하나의 Slack 본문으로 조립한다. 모든 후보자 설명 뒤에는 workspace의 `/org/jobs?orgId={workspaceId}&roleId=all` 링크와 사이트 안에서 연결을 수락·거절할 수 있다는 안내를 한 번만 붙이며, 후보자별 연결 제안은 넣지 않는다. 월·목에는 5.3의 native table을 같은 message blocks 뒤에 붙인다.
15. workspace에 연결된 활성 Slack channel로 top-level 메시지를 한 번 보낸다. 월·목에 후보자 소개가 없는 workspace는 Role 현황 표만 한 번 보낸다. deterministic `client_msg_id`를 사용해 재시도 중복 발송을 막는다.
16. Slack 성공 후 `company_slack_threads`, `company_messages`, `talent_progress`에 본문, 모든 role·후보자 mention, reason source와 발송 결과를 저장한다. 실패하면 progress를 `failed`로 남겨 다음 실행에서 재시도할 수 있게 한다.
17. 임시 입력 파일 외에 repository 파일을 만들거나 source code를 수정하지 않는다.

## 7. 실행 완료 보고 계약

scheduled task의 최종 응답에는 다음을 빠짐없이 적는다.

- recent pending 후보자 수
- eligible 후보자 수
- 이미 발송됨, 후속 stage, fit 없음, `kind=codex` reason 없음, 지원하지 않는 fit kind로 각각 생략된 수
- Slack channel 없음으로 생략된 수
- 처리 후보자 수, Slack 성공 메시지 수, 성공 후보자 수, 실패 후보자 수
- 월·목 Role 현황 대상 workspace 수, 성공·실패·channel 없음 workspace 수
- 실제 send 결과의 `groups[].message.body`를 workspace별로 **전문 그대로** 출력
- Role 현황을 보낸 경우 실제 `roleSummaries[].body`도 workspace별로 **전문 그대로** 출력

발송하지 않은 후보자의 전체 dossier, 이력서, 이메일, 내부 ID, 토큰, 환경변수 또는 비밀값은 최종 응답에 출력하지 않는다. 검증 오류나 eligibility 변경으로 발송하지 못한 경우 임의로 우회하거나 수동 DB write를 하지 말고 오류와 영향을 받은 그룹만 보고한다.

인증된 HTTP 방식이 필요하면 `GET/POST /api/internal/matching/auto-intro-to-company`도 같은 deterministic 조회·발송 함수를 사용한다. 이 endpoint 역시 LLM을 호출하지 않는다. 로컬 Codex scheduled task는 별도 서버나 API secret 없이 위 CLI를 사용한다.

## 8. 어디를 고치면 되는가

- 메시지 문체·문장별 역할·선별 기준·P.S. 규칙: 이 문서 4~5장
- 고정 안내 문장: `src/lib/ops/autoIntroToCompanyPolicy.ts`
- 본문 조립·검증·후보 조회·저장: `src/lib/ops/autoIntroToCompanyNotifications.ts`
- Codex용 list/send 진입점: `scripts/autoIntroToCompanyCodexScheduled.ts`
- 실행 시각·활성 상태·작업 지시문: Codex 앱의 scheduled task 설정

문구를 바꾸고 싶다면 이 문서의 계약을 수정해달라고 Codex에 요청하면 된다. scheduled task는 실행할 때마다 이 문서를 읽도록 설정하므로 애플리케이션 LLM 프롬프트를 별도로 찾을 필요가 없다.
