# direct-listwise — selector architecture development

- Run: `d2-direct-listwise-glm53-flash-high-v1`
- Base run: `e1-selection-random-glm53-flash-high-v1`
- Dataset: `selection-random-v1`
- Model: `glm-5.3-flash` / high
- Cases: 48/48
- Actual LLM cost: $0.234312 / $0.75 cap
- Calls: 48; hard timeouts: 0; unknown-cost calls: 0
- Selector valid: 48/48 (raw valid 48)
- Empty slates: 12; mean selected: 1.9583
- Mean final selector candidates: 30.0
- Mean tournament challengers: None
- Call latency p50/p95: 22.907s / 40.115s
- This is a development run on an already opened dataset. It is not holdout or production evidence.
