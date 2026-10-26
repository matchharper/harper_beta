# Supabase Postgres Best Practices

## UI 문구 절제와 참조 디자인 준수 — 필수

- 사용자에게 새로운 정보나 판단 근거를 주지 않는 UI 문구는 넣지 않는다. 화면에 이미 보이는 제목·버튼·대화·배치를 다시 설명하는 라벨, 당연한 이용 조건, 장식용 슬로건, 관성적인 helper text와 버튼 아래 꼬리말은 금지한다. 빈 공간을 채우거나 친절해 보이게 하려는 이유로 추가하지 않는다.
- 문구를 지워도 사용자가 기능의 가치·현재 상태·다음 행동을 똑같이 이해할 수 있다면 삭제한다. `슬롯이 연결된 Role에서 시작할 수 있어요.`처럼 구매 화면에서 설명할 조건을 기능 소개에 반복하거나, `이렇게 연결돼요 · 예시`처럼 눈앞의 콘텐츠를 해설하거나, `지민님과 Harper`처럼 대화 배치만으로 충분한 참여자 설명을 덧붙이지 않는다. 이는 해당 문자열만의 금지가 아니라 같은 역할을 하는 군더더기 전체에 적용되는 기준이다.
- 필요한 설명은 실제로 알 수 없던 기능·차이·결과를 구체적으로 전달해야 한다. 오류 원인·복구 방법, 비용·동의·공개 범위·되돌릴 수 없는 결과처럼 판단에 필요한 정보와 접근성 이름은 유지하되, 실제 필요한 위치에 한 번만 제공한다. 불필요한 설명을 tooltip이나 다른 위치로 옮겨 남겨두지 않는다.
- 사용자가 특정 화면을 디자인 참조로 지정하면 실제 구현의 정보 구조·아이콘·타이포그래피·간격·행동 배치를 확인하고 따른다. 배경색이나 분위기만 가져오고 핵심 구성을 임의로 생략하지 않는다. 참조가 기능별 아이콘 + 제목 + 설명의 세로 목록이면 같은 구조와 밀도를 재사용하며, 체크 아이콘을 반복한 한 줄 요약으로 대체하지 않는다.
- 이 규칙은 UI 작성·검토의 판단 기준이다. 예시 단어를 정규식·키워드 목록으로 검열하거나 LLM의 실제 답변을 결정론적 문구로 덮어쓰는 런타임 로직으로 구현하지 않는다.

## Structure

```
supabase-postgres-best-practices/
  SKILL.md       # Main skill file - read this first
  AGENTS.md      # This navigation guide
  CLAUDE.md      # Symlink to AGENTS.md
  references/    # Detailed reference files
```

## Usage

1. Read `SKILL.md` for the main skill instructions
2. Browse `references/` for detailed documentation on specific topics
3. Reference files are loaded on-demand - read only what you need

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact to guide automated query optimization and schema design.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
references/query-missing-indexes.md
references/schema-partial-indexes.md
references/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)

## References

- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/row-level-security
