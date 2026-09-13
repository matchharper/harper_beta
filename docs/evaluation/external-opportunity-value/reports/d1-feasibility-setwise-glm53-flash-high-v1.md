# feasibility-setwise — selector architecture development

- Run: `d1-feasibility-setwise-glm53-flash-high-v1`
- Base run: `e1-selection-random-glm53-flash-high-v1`
- Dataset: `selection-random-v1`
- Model: `glm-5.3-flash` / high
- Cases: 48/48
- Actual LLM cost: $0.126052 / $0.60 cap
- Calls: 48; hard timeouts: 0; unknown-cost calls: 0
- Selector valid: 48/48 (raw valid 48)
- Empty slates: 8; mean selected: 2.1667
- Mean final selector candidates: 12.2083
- Mean tournament challengers: None
- Call latency p50/p95: 12.766s / 26.298s
- This is a development run on an already opened dataset. It is not holdout or production evidence.
