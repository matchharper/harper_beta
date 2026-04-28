# Career Prompt 편집 가이드

이 폴더의 `.md` 파일을 수정하면 Harper 인터뷰 프롬프트가 변경됩니다.
TypeScript 코드를 건드릴 필요 없습니다.

단, 인사이트 추출 프롬프트는 이 폴더가 아니라 `src/lib/career/insights.md`에 있습니다.

## 파일 구조

| 파일 | 역할 | 자주 수정하는 내용 |
|------|------|------------------|
| `interview-steps.md` | 인터뷰 6단계의 질문 가이드 | 질문 문구, 전환 조건, 스텝 목표 |
| `system.md` | Harper 페르소나와 기본 지시 | 말투, 톤, relief nudge 문구 |
| `../career/insights.md` | LLM 응답 포맷 및 인사이트 추출 룰 | 추출 규칙, JSON 포맷 지시 |
| `misc.md` | 첫 방문 안내, 인터럽트 처리, 통화 종료 | 첫 인사말, 음성 안내 문구 |

## 편집 방법

### 1. 질문 가이드 수정 (가장 흔한 케이스)

`interview-steps.md`를 열고 수정할 스텝을 찾습니다:

```markdown
## Step 1: Ice-breaking & Context Setting

### nameKo
도입 및 라포 형성

### goal
지원자를 환영하고...        <-- 이 텍스트를 자유롭게 수정

### questionGuide
질문 가이드:
- 안녕하세요! 오늘 인터뷰는...  <-- 질문 추가/삭제/수정 가능

### transitionCondition
사용자가 자연스럽게...       <-- 전환 조건 수정
```

각 스텝은 `## Step N:` 으로 시작하고, 안에 4개 서브섹션이 있습니다:
- `### nameKo` — 한국어 스텝 이름
- `### goal` — 이 단계의 목표
- `### questionGuide` — LLM에게 주는 질문 가이드
- `### transitionCondition` — 다음 단계로 넘어가는 조건

### 2. Harper 성격/톤 수정

`system.md`의 `## persona` 섹션을 수정합니다:

```markdown
## persona
You are Harper, a Korean AI talent agent for candidate onboarding.

Always answer in Korean.
Be concise, clear, and warm.       <-- 톤 변경 가능
...
```

### 3. Relief Nudge 문구 수정

`system.md`의 `## reliefNudge` 섹션:

```markdown
## reliefNudge
IMPORTANT: Include this exact nudge once in your response:
지금은 여기까지 해도 됩니다.          <-- 이 문구를 수정
지금 정보만으로도 매칭을 시작할 수 있습니다.   <-- 이 문구를 수정
```

### 4. 첫 방문 안내 수정

`misc.md`의 `## firstVisitText` 섹션:

```markdown
## firstVisitText
안녕하세요. 하퍼에 처음 방문해주셔서 감사합니다.   <-- 수정 가능
...
```

## 절대 하지 말아야 할 것

1. **`## ` 헤딩을 섹션 본문 안에 쓰지 마세요**
   - `## `으로 시작하는 줄은 파서가 섹션 구분자로 인식합니다
   - 본문에서 강조가 필요하면 `### ` (샵 3개) 또는 **볼드**를 쓰세요
   - `## Step 1:` 같은 기존 헤딩 이름을 바꾸면 서버가 시작되지 않습니다

2. **섹션 헤딩 이름을 변경하지 마세요**
   - `## persona`, `## Step 1:`, `## firstVisitText` 등의 이름은 코드와 연결되어 있습니다
   - 이름을 바꾸면 서버 시작 시 에러가 발생합니다 (fail-fast 검증)

3. **섹션을 삭제하지 마세요**
   - 빈 섹션도 에러를 발생시킵니다 — 내용이 필요 없으면 placeholder 텍스트를 남겨두세요

## 플레이스홀더 ({{변수명}})

일부 파일에 `{{변수명}}` 형태의 플레이스홀더가 있습니다.
이것은 코드에서 런타임에 실제 값으로 치환됩니다. **삭제하지 마세요.**

| 파일 | 플레이스홀더 | 설명 |
|------|------------|------|
| `interview-steps.md` | `{{stepNumber}}`, `{{stepNameKo}}`, `{{stepGoal}}` | 현재 스텝 정보 |
| | `{{stepQuestionGuide}}`, `{{stepTransitionCondition}}` | 스텝의 가이드/조건 |
| | `{{nextStepNumber}}` | 다음 스텝 번호 |
| | `{{currentStep}}`, `{{stepSummaries}}` | Realtime 모드용 |
| `system.md` | `{{userTurnCount}}` | 사용자 발화 횟수 |
| | `{{resumeFileName}}`, `{{resumeLinks}}` | 이력서 정보 |
| | `{{structuredProfileText}}` | 구조화된 프로필 |
| `../career/insights.md` | `{{coveredCount}}`, `{{totalCount}}` | 인사이트 커버리지 |
| | `{{checklistLines}}`, `{{topUncovered}}` | 체크리스트 항목 |
| | `{{existingInsightsSection}}` | 기존 인사이트 목록 |
| `misc.md` | `{{CALL_END_MARKER}}` | 통화 종료 마커 (##END##) |

## 수정 후 테스트

1. **dev 서버 실행 중이면 바로 테스트 가능**
   - `.md` 파일 저장 → 다음 API 요청부터 변경 반영 (서버 재시작 불필요)

2. **테스트 순서**
   - Career 페이지 (`/career`) 접속
   - 프로필 입력 후 "대화 시작하기"
   - 채팅 1~2턴 진행 → 변경한 질문/톤이 반영되는지 확인

3. **빌드 확인** (PR 올리기 전)
   ```bash
   pnpm build
   ```
   - 섹션 헤딩 오타가 있으면 빌드 단계에서 에러가 납니다
   - 에러 메시지: `Missing or empty required section "섹션이름" in prompts/파일명.md`

## PR 올리기

1. `.md` 파일만 수정했는지 확인
2. `pnpm build` 통과 확인
3. PR 생성 — 리뷰어는 `.md` diff만 확인하면 됩니다
