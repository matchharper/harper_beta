# Blind model-judge selector development

- Run: `j1-selector-architecture-blind-glm53-flash-high-v1`
- Dataset: `selection-random-v1`
- Model: `glm-5.3-flash` / high
- Cases: 48/48; judgments: 139/144
- Actual LLM cost: $0.741566 / $2.50 cap
- Conservative cost with p95 imputation for unknown calls: $0.817166
- Calls: 155; hard timeouts: 12; unknown-cost calls: 12
- Call latency p50/p95: 27.831s / 73.57s

| Arm | Verdict mean | Strong | Acceptable+ | Harmful | Best vote share | Ref precision | Ref recall | Exact ref |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| current | 1.9784 | 0.3453 | 0.7266 | 0.0935 | 0.1679 | 0.5863 | 0.5875 | 0.2518 |
| hard-dual | 1.9928 | 0.3165 | 0.7482 | 0.0719 | 0.1595 | 0.5755 | 0.5612 | 0.2158 |
| feasibility-setwise | 2.2734 | 0.4532 | 0.8633 | 0.0432 | 0.1954 | 0.6511 | 0.6643 | 0.3165 |
| direct-listwise | 2.295 | 0.5036 | 0.8129 | 0.0216 | 0.2554 | 0.6607 | 0.6319 | 0.3165 |
| batch-tournament | 2.1942 | 0.4892 | 0.7554 | 0.0504 | 0.2146 | 0.6223 | 0.5767 | 0.3453 |

| Arm | Wins vs current | Losses | Ties | Decisive win rate | One-sided sign p |
|---|---:|---:|---:|---:|---:|
| hard-dual | 15 | 18 | 15 | 0.4545 | 0.75657488 |
| feasibility-setwise | 19 | 11 | 18 | 0.6333 | 0.10024421 |
| direct-listwise | 21 | 11 | 16 | 0.6562 | 0.05509208 |
| batch-tournament | 17 | 12 | 19 | 0.5862 | 0.22912916 |

- Reference replicate mean Jaccard / exact rate: 0.7053 / 0.5299
- Common best across valid replicates: 32/48; unanimous unique best: 7/48

Evidence boundary: Development proxy only: the judge is the same model family as the generators. Anonymous permutations and repeated judgments test order stability but do not replace human gold or online outcomes.
