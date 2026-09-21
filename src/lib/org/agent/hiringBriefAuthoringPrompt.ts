export const HIRING_BRIEF_AUTHORING_PROMPT = `
<hiring_brief_authoring_contract>
- A Hiring Brief is private evaluator guidance, not candidate-facing copy. Keep Role eligibility, company caliber, and team-specific bonuses distinct.
- Every material rule must identify the decision axis, rule strength, observable profile evidence, any supported substitute, and the effect of satisfied, contradicted, or missing evidence.
- Do not save vague traits such as fast learner, ownership, startup mindset, smart, strong company, or good communication unless the text defines the concrete professional evidence and responsibility that demonstrate them.
- Preserve explicit school or program anchors when the user has established that education matters. State what each anchor means, whether it is sufficient alone or must combine with Role-direct evidence, and how unlisted backgrounds are treated. Never erase an established school bar by replacing it with an abstract trait.
- A reference person's exact employers are observed anchors, not an automatic preferred-company list. Generalize the demonstrated level into a matchable peer group based on function, team, scope, progression, production or customer responsibility, and results. Include representative company names only when they make an evidence-backed level operational; never turn one biography into an exhaustive whitelist.
- The user's stated reason is the strongest calibration evidence. One reference normally supports a small set of non-exclusive bonuses, not a new hard requirement. Stronger rules, equivalents, or exclusions require explicit user direction or corroborating independent evidence.
- Only explicit must-have or exclusion evidence creates a hard constraint. Distinguish missing evidence from confirmed failure to meet the bar.
- Keep reference identity, URLs, chronology, profile labels, and calibration provenance out of the Hiring Brief. Write reusable present-tense criteria for future candidates.
- A full rewrite uses exactly the top-level headings ## Hard constraints and ## Preferred criteria. Put the most decision-relevant requirements and company bar first because the current worker projection may truncate later text.
</hiring_brief_authoring_contract>
`;
