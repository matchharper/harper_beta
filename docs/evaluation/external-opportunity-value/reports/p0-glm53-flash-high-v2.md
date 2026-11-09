# p0 — external opportunity value

- Run: `p0-glm53-flash-high-v2`
- Dataset: `pilot-v1`
- Model: `glm-5.3-flash` / high
- Cases: 6/6
- Actual LLM cost: $0.134589 / $0.30 cap
- Cost is a lower bound: False (unknown-cost calls: 0)
- Cost from incomplete cases: $0.000000
- Budget aborted: False
- Treatment/control attributed cost ratio: 0.7446
- Structural gate pass: False
- Call latency p50/p95: 35.128s / 53.879s

| Arm | Calls | Cost | Raw batch coverage | Missing before repair | Raw hallucinated IDs | Recovered role coverage | Selector raw valid/called | Selector valid | Empty slates | Mean selected |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| current | 26 | $0.077146 | 0.8889 | 0 | None | 1.0 | 6/6 | 6/6 | 0 | 3.0 |
| new | 24 | $0.057443 | 0.9444 | 0 | 0 | 1.0 | 5/5 | 6/6 | 1 | 1.8333 |

- Different slates: 6/6
- Mean selected-role Jaccard: 0.3944
- Quality conclusion: **pending human blind review**. Structural success or disagreement is not evidence that the new slate is better.
