# p0-contract-repair — external opportunity value

- Run: `p0-glm53-flash-high-v4-new-only`
- Dataset: `pilot-v1`
- Model: `glm-5.3-flash` / high
- Cases: 6/6
- Actual LLM cost: $0.080521 / $0.12 cap
- Cost is a lower bound: False (unknown-cost calls: 0)
- Cost from incomplete cases: $0.000000
- Budget aborted: False
- Treatment/control attributed cost ratio: None
- Structural gate pass: True
- Call latency p50/p95: 28.101s / 61.512s

| Arm | Calls | Cost | Raw batch coverage | Missing before repair | Raw hallucinated IDs | Recovered role coverage | Selector raw valid/called | Selector valid | Empty slates | Mean selected |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| current | 0 | $0.000000 | None | 0 | None | None | 0/0 | 0/0 | 0 | None |
| new | 24 | $0.080521 | 1.0 | 0 | 0 | 1.0 | 6/6 | 6/6 | 0 | 2.1667 |

- Different slates: 0/6
- Mean selected-role Jaccard: None
- Quality conclusion: **pending human blind review**. Structural success or disagreement is not evidence that the new slate is better.
