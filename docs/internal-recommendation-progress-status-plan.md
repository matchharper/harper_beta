# Internal Recommendation Progress Status Plan

## Goal

When a user asks what happened after accepting an internal recommendation,
Harper should answer from a deterministic system-level status instead of asking
the LLM to infer company-side progress.

## Source of Truth

- User acceptance is read from `talent_opportunity_recommendation.feedback`.
- Acceptance time is `feedback_at`, falling back to `created_at` when missing.
- Ops review progress is read from `talent_opportunity_tag`.
- `processed_stage`, `recommended_at`, and `dismissed_at` are not used.

## Stage Tag Mapping

| Ops tag | Status meaning |
| --- | --- |
| no internal stage tag | Ops has not touched it yet |
| `내부:연결대기` | Shared with company; waiting for response |
| `내부:아카이브` | Internally archived / will not proceed |
| `내부:프로세스중단` | Process stopped |
| `내부:거절` | Rejected / no longer proceeding |
| `내부:최종오퍼`, `내부:보류`, `내부단계:*` | Non-rejected next process |

## User-Facing Rules

1. If there is no internal stage tag:
   - Accepted less than 7 days ago: "적절한 타이밍에 회사에게 전달하기 위해 대기중입니다."
   - Accepted 7 days or more ago: "회사에게 전달되었고, 회신을 기다리고 있습니다."
   - Accepted 21 days or more ago: "회사에게서 응답이 없습니다. 더 이상 프로세스를 진행할 의사가 없는 것으로 판단됩니다. 프로세스를 종료하고 더이상 트래킹 하지 않겠습니다. 불편을 드려 죄송합니다."
2. If stage is `내부:연결대기`:
   - "회사에게 전달되었고, 회신을 기다리고 있습니다. 회사에서 후보자님을 인지한 상태이니 조금만 기다려주세요."
3. If stage is after connection and not rejected/stopped/archived:
   - "회사에서 다음 프로세스를 진행하겠다고 알렸습니다. 혹시 아직 다른 연락이 없으신가요?"
4. If stage is internally archived, stopped, or rejected:
   - Accepted less than 7 days ago, or the terminal stage tag changed less than 3 days ago: "회사에게 전달되었고, 회신을 기다리고 있습니다."
   - Otherwise: "회사 측에서 이번 포지션에서는 더 이상 진행하지 않기로 했습니다. 이력과 경험에 기반해 긍정적으로 검토했으나, 우선적으로 보고 있는 방향과 더 가까운 후보자와 다음 단계를 진행하게 되었다고 알려왔습니다. 또 다른 좋은 기회가 있을 때 연락드릴게요. 감사합니다."

## Implementation

- Add/maintain `internalProgress` on `TalentOpportunityHistoryItem`.
- Batch-load matching `talent_opportunity_tag` rows for accepted internal
  recommendations.
- Include the matched stage tag's `updated_at` as `stageChangedAt`.
- Compute `daysSinceAccepted` and `daysSinceStageChanged`.
- Return `internalProgress.message` through existing tools:
  - `read_recommended_opportunities`
  - `get_role_context`
- Update prompt/tool policy so the LLM uses `internalProgress.message` instead
  of inferring from saved stage or stale fields.

## Verification

- Search for stale `processed_stage`, `recommended_at`, and `dismissed_at`
  runtime references.
- Run TypeScript compilation for `harper_beta`.
- Run Python syntax compilation for modified worker files.
