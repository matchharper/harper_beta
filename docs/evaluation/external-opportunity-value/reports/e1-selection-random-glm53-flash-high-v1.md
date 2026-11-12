# e1-selection-random — external opportunity value

- Run: `e1-selection-random-glm53-flash-high-v1`
- Dataset: `selection-random-v1`
- Model: `glm-5.3-flash` / high
- Cases: 48/48
- Actual LLM cost: $1.530668 / $2.00 cap
- Cost is a lower bound: True (unknown-cost calls: 0)
- Cost from incomplete cases: $0.159009
- Budget aborted: False
- Treatment/control attributed cost ratio: 0.9111
- Structural gate pass: True
- Call latency p50/p95: 33.653s / 59.555s

| Arm | Calls | Cost | Raw batch coverage | Missing before repair | Raw hallucinated IDs | Recovered role coverage | Selector raw valid/called | Selector valid | Empty slates | Mean selected |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| current | 193 | $0.717725 | 0.9792 | 21 | None | 1.0 | 46/46 | 48/48 | 8 | 2.2083 |
| new | 186 | $0.653934 | 0.9861 | 11 | 1 | 1.0 | 40/40 | 48/48 | 8 | 2.0417 |

- current selector candidates mean: 10.3125; selected retrieval rank p50/p90: 10.0/68.0; rank 16+/101+: 40/6; same-company multi-role cases: 0
- new selector candidates mean: 5.0208; selected retrieval rank p50/p90: 13.0/92.0; rank 16+/101+: 41/8; same-company multi-role cases: 1

- Different slates: 39/48
- Mean selected-role Jaccard: 0.4073
- Quality conclusion: **pending human blind review**. Structural success or disagreement is not evidence that the new slate is better.
