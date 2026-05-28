# Career Answer Examples

Career chat no longer uses the old MDX chunk RAG pipeline. The active system is
the ops-managed `service_answer_examples` table, maintained from
`/ops/answer-examples`.

## What Ops Manages

Each row is one reusable answer example:

- `user_example_text`: a realistic user message. This is embedded and used for
  semantic lookup.
- `answer_example_text`: the answer style/content Harper should use as a
  reference.
- `tags`: optional labels for ops filtering.
- `enabled`: whether lookup can return the example.
- `notes`: optional internal memo.

`embedding`, `embedding_model`, and `user_example_hash` are system fields. Ops
does not edit them directly. When `user_example_text` changes, the API rebuilds
the embedding. If only the answer, tags, notes, or enabled state changes, the
existing embedding is kept.

There is no `intent_key` or manual `priority`. Lookup ranking is based on vector
similarity, with recently updated rows used as a tie-breaker.

## Runtime Lookup

The chat model can call `lookup_answer_examples` when the current prompt and
conversation are not enough to answer well. The tool embeds the latest user
message, searches enabled examples, and returns the closest answer examples for
the model to adapt naturally.

Default lookup behavior:

- returns up to 3 examples
- filters out examples below the minimum similarity score
- never exposes IDs, scores, or ops notes to the user

## Legacy Files

The MDX files under this directory are retained only as source material from the
previous help system. The old `pnpm index:help` pipeline has been removed. Do not
index these documents into production chat retrieval unless the legacy help
system is intentionally restored in a new PR.
