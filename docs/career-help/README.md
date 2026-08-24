# Service Answer Examples

The ops-managed `service_answer_examples` table is maintained from
`/ops/answer-examples`. Company-side chat currently uses its Company corpus.
Career rows remain stored under `audience = career`, but Career does not read or
use them at runtime until their content has been reviewed and rewritten.

## What Ops Manages

Each row is one reusable answer example:

- `user_example_text`: a realistic user message. This is embedded and used for
  semantic lookup.
- `answer_example_text`: the answer style/content Harper should use as a
  reference.
- `audience`: required `career` or `company` execution boundary.
- `tags`: optional labels for ops filtering.
- `enabled`: whether lookup can return the example.
- `notes`: optional internal memo.

`embedding`, `embedding_model`, and `user_example_hash` are system fields. Ops
does not edit them directly. When `user_example_text` changes, the API rebuilds
the embedding. If only the answer, tags, notes, or enabled state changes, the
existing embedding is kept.

There is no `intent_key` or manual `priority`. Lookup ranking is based on vector
similarity, with recently updated rows used as a tie-breaker.

`tags` are for topics and locale, not for the audience boundary. Ops must select
the audience explicitly when creating or editing a row.

## Runtime Lookup

Company-side chat automatically embeds the latest user message once per turn
and searches only `audience = company`. The lookup runs alongside other
prompt-context work. A missing audience-aware RPC, lookup error, or 2.5-second
timeout returns no examples and does not block the main reply.

Default lookup behavior:

- returns up to 3 examples
- filters by `audience` in the database before similarity ranking
- filters out examples below the minimum similarity score
- sends only example questions and answers to the main LLM
- never sends IDs, scores, or ops notes to the main LLM or user

Career has neither automatic lookup nor a model-callable answer-example tool.

## Legacy Files

The MDX files under this directory are retained only as source material from the
previous help system. The old `pnpm index:help` pipeline has been removed. Do not
index these documents into production chat retrieval unless the legacy help
system is intentionally restored in a new PR.
