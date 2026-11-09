# Decisions v6 aggregate pilot — 2026-10-15

12 numeric gold, 4 development + 8 company-disjoint holdout; 6 production missing-pay cases. 124 role estimates / 46 successful requests.

Usage-priced cost USD 0.024525; including one unreported HTTP 400 reserve USD 0.039781 (< USD 1). Median request 0.253s, p95 0.425s.

| Method | Median midpoint APE | Median endpoint error | Median nonpoint IoU | Overlap |
|---|---:|---:|---:|---:|
| baseline | 19.6% | 19.6% | 1.6% | 4/8 |
| mapping | 24.4% | 24.4% | 0.0% | 2/8 |
| market_reasoning | 16.8% | 19.9% | 16.1% | 4/8 |

NO-GO. Numeric mapping worsens accuracy. Market-reasoning follow-up was authored after inspecting A/B gold outputs and is explicitly unblinded; it is not independent validation. Korean compensation-composition/historical-source caveats and discrete anchor resolution remain. Frozen labels and all previous runs are preserved.

Frozen fixture SHA256: `ed174b3bf5c05620c412b7ccb13ad213c43063a82b17decc83cda0f4cd1a1f9f`.
Canonical report: `harper_worker/llm_evals/company_role_salary_estimation/decisions_report.py`.
