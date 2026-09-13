# batch-tournament — selector architecture development

- Run: `d3-batch-tournament-glm53-flash-high-v1`
- Base run: `e1-selection-random-glm53-flash-high-v1`
- Dataset: `selection-random-v1`
- Model: `glm-5.3-flash` / high
- Cases: 48/48
- Actual LLM cost: $0.396257 / $2.50 cap
- Calls: 184; hard timeouts: 0; unknown-cost calls: 0
- Selector valid: 48/48 (raw valid 48)
- Empty slates: 15; mean selected: 1.7292
- Mean final selector candidates: 8.1875
- Mean tournament challengers: 8.1875
- Call latency p50/p95: 12.942s / 24.962s
- This is a development run on an already opened dataset. It is not holdout or production evidence.
