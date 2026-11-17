# Career LLM code map

`/ops/debugging/career-llm-map` preserves the original three-column HTML map. Its
internal-only API assembles synthetic inputs with the product's current prompt,
capability runtime, handbook registry, tool selector and Claude cache builders.
It does not call models, execute tools or read customer records.

- `annotations.json`: authored case names, explanations, sample selections and
  proposal. These are a navigational index, not a discovered execution graph.
- `server.ts`: current rendered prompt blocks, tool schemas and handbook bodies.
  New registry entries appear automatically. Main inputs use a fixed synthetic
  clock/profile/Memory so unrelated refreshes do not look like code changes.
- `auxiliary.ts`: pure auxiliary builders with synthetic arguments.
- `sources.json` / `source.ts`: named declarations or full files for code that
  cannot safely be invoked. Source line numbers are computed, never stored slices.
  Missing files/symbols are shown as unavailable, never replaced with old content.
- `map.html`, `compose.js`, `base.html`: original layout and comparison UI. Current
  main-call rows come from the server; proposed rows remain an authored proposal.

The authenticated client loads the code when the page opens. Reload the page to
see subsequent changes; there is no polling or focus/reconnection refetch.
A content revision avoids sending unchanged data on an explicit retry.
Development HMR refreshes imported builders; inspected sources are read on every
request. Production shows its **deployed** code, not uncommitted developer files.
Next output tracing includes the referenced web sources. Worker source is read
from the sibling `harper_worker` checkout when available; deployments without
that checkout explicitly report those components as unavailable.

Gray cache regions are candidate prefixes / explicit Claude breakpoints, not
measured cache hits. Runtime usage remains the evidence for actual hits.

When adding a new execution entry point, add its explanatory case and source
binding. Existing source contents and registry members need no snapshot refresh.
Do not add captured prompt/schema bodies or actual user data to annotations.

Validation:

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json --test src/lib/ops/careerLlmMap/source.test.ts
```
