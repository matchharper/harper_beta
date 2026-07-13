# test_company2.tsx Harper Company Landing Spec

Date: 2026-07-13

This document is the implementation brief for turning `test_company2.tsx` into Harper's company-side landing page. It intentionally contains no component code. It defines the final page structure, exact copy, visual direction, section hierarchy, and design constraints.

## 1. Page Goal

The page should make Harper feel like a premium, high-touch AI headhunter for teams hiring exceptional people.

Harper is not a job board, ATS, sourcing database, or generic AI recruiting SaaS. The company-side message is:

> Harper understands what the company actually needs, talks with candidates directly, and only introduces people worth interviewing.

The page should feel calm, specific, and credible. It should not over-explain AI. Harper's AI advantage should appear through speed, precision, and contextual understanding, not through futuristic visuals or generic "AI-powered" claims.

## 2. Non-Negotiable Constraints

- Use only the existing `fontBig`, `fontMedium`, and `fontSmall` variables for visible typography.
- Colors may change by context, but typography size/weight/leading must come from those three variables.
- Every major section must be centered inside a `max-w-[1440px]` content area.
- Desktop is the primary target for this spec.
- No eyebrow labels. Treat eyebrow as nonexistent.
- Hero must stay simple: title, description, one primary CTA.
- Candidate brief must be the strongest product visual on the page.
- Avoid nested cards and generic SaaS feature grids.
- The final page should feel closer to Cursor's restrained product confidence than to a decorative AI SaaS template.

## 3. Reference Research

### Cursor

Reference: https://cursor.com/

Useful patterns to borrow:

- Confident hero copy with very little surrounding decoration.
- A real product surface does most of the persuasion.
- Generous spacing and clear alignment make the page feel premium.
- Visuals look like working software, not marketing illustrations.
- Social proof is specific to the audience, not just a random logo wall.

Do not copy:

- Developer-tool-specific terminal/IDE metaphors unless they directly support Harper's story.
- Any overly technical UI that makes Harper feel like a workflow dashboard.

### ElevenLabs

Reference: https://elevenlabs.io/

Useful patterns to borrow:

- Social proof comes early and builds confidence before deeper product explanation.
- Large platform/product blocks make sections feel substantial.
- CTAs are repeated calmly without making the page feel desperate.
- Enterprise trust is shown through restraint, not excessive claims.

Do not copy:

- Voice/audio-specific visual language.
- Giant logo wall as filler.
- Heavy platform breadth messaging. Harper should feel focused and selective.

## 4. What To Avoid

Avoid these even if they are common in AI or hiring landing pages:

- Eyebrow text above every section title.
- "AI-powered", "agentic", "autonomous", "10x hiring", "top 1%" style generic claims.
- Neon gradients, glowing dots, or abstract AI/network graphics.
- Glassmorphism, blurred blobs, or futuristic dashboard decoration.
- Cards inside cards.
- Too many pills, badges, or status chips.
- Thick bold type used as a substitute for hierarchy.
- Fake dashboards, settings screens, charts, or metrics that Harper does not actually need.
- A candidate profile that looks like a normal LinkedIn card.
- Logo grids without an explanation of why those logos matter.
- Overly broad copy like "Find better candidates faster" without explaining how Harper is different.

## 5. Brand And Tone

Harper should sound like a senior headhunter who deeply understands both the company and the candidate.

Tone:

- Direct.
- Calm.
- Specific.
- Premium but not grandiose.
- Human, even though Harper uses AI.

Preferred words:

- `Top talent`
- `directly talks with candidates`
- `matched to your requirements`
- `ready to interview`
- `curated shortlist`
- `vetted`
- `warm intro`
- `context`
- `requirements`

Words to use carefully:

- `AI`: use only when explaining why Harper is faster or better at understanding technical/domain context.
- `headhunter`: useful for positioning, but do not make the page feel old-school.
- `platform`: avoid unless needed.

## 6. Global Layout System

### Page Shell

- Background: warm off-white or neutral white.
- Main content width: centered, maximum 1440px.
- Internal section padding should be consistent across sections.
- Use a single left/right alignment system for AppBar, Hero, Social proof, How it works, Why Harper, Final CTA, and Footer.

### Section Rhythm

Use fewer, larger sections. The page should not feel like a stack of small cards.

Recommended desktop rhythm:

- AppBar to Hero: tight and deliberate.
- Hero to Social proof: close enough that social proof feels attached to the claim.
- Social proof to How Harper works: medium-large gap.
- How Harper works internal gap: large enough that the two stories feel independent.
- Candidate brief to Why Harper: moderate gap.
- Why Harper to Final CTA: clear transition.
- Final CTA to Footer: compact.

### Typography Usage

Use only these roles:

- `fontBig`: all major headings and primary section titles.
- `fontMedium`: body copy, important explanations, large product-surface text.
- `fontSmall`: metadata, secondary explanations, list details, footer text, supporting labels inside visuals.

Do not create new arbitrary text sizes. Do not use separate heavy font weights.

### Visual Style

- Prefer dividers, spacing, and subtle background surfaces over cards.
- Product visuals should use a single large surface, not many small boxes.
- Border radius should be restrained.
- Borders should be subtle and purposeful.
- Shadows should be minimal or absent.
- Use black, neutral, muted gray, and one restrained accent color if needed.

## 7. AppBar

### Purpose

The AppBar should quietly establish Harper as the brand and let a company user jump to the key proof points.

### Layout

- Left: Harper logo/wordmark.
- Center or right: simple navigation anchors.
- Far right: Talent-side link and primary CTA.
- Keep it lightweight. It should not compete with Hero.

### Navigation Copy

- `일하는 방식`
- `후보자 소개`
- `Why Harper`
- `For Talent`

### Primary CTA

Button text:

> 미팅 신청하기

Behavior:

- Opens the company meeting request flow.
- Same action should be used by Hero CTA and Final CTA.

## 8. Section 1: Hero

### Purpose

Make the core promise immediately clear:

Harper connects companies with top talent they would not reach through job posts or generic sourcing.

### Layout

- Simple centered section.
- Title, description, one CTA.
- No product visual in Hero.
- No secondary CTA.
- No eyebrow.

### Exact Copy

Title:

> 채용 공고로는 닿기 어려운  
> Top talent를 연결해드립니다.

Description:

> Harper는 인재들과 직접 대화하며 회사가 찾는 역할의 기술 스택, 제품/도메인 맥락, 경력과 관심도를 바탕으로 대화해볼 만한 인재만 선별해 소개합니다.

Primary CTA:

> 미팅 신청하기

### Design Notes

- The title should feel confident but not oversized to the point of feeling empty.
- Description should sit close enough to the title to read as one thought.
- CTA should be clearly visible but not oversized.
- The first screen should not look empty. The Social proof section should begin close enough below Hero that the page immediately feels substantiated.

## 9. Section 2: Social Proof

### Purpose

Show that Harper sits between two credible sides:

- Strong candidates from serious schools, companies, and AI/product teams.
- Selective companies with high-context hiring needs.

This section must not look like a generic logo wall.

### Layout

- Centered `max-w-[1440px]`.
- Section title and description above the split.
- Main body split approximately 60:40.
- Left 60%: talent background logo matrix.
- Right 40%: company-type list.
- The two sides should feel related, as if Harper is connecting these worlds.

### Section Copy

Title:

> 검증된 인재와 신중한 팀을 연결합니다.

Description:

> Harper는 공개적으로 구직 중인 사람만 모으지 않습니다. 좋은 기회를 조용히 검토하는 인재와, 역할의 맥락을 정확히 설명할 수 있는 팀을 연결합니다.

### Left Side: Talent Background

Heading:

> Talent Harper can reach

Body:

> 학교, 빅테크, AI 연구 조직, 빠르게 성장한 제품팀 출신 인재들이 Harper와 대화하며 다음 기회를 검토합니다.

Logo matrix:

- SNU
- KAIST
- CMU
- Stanford
- University of Toronto
- Harvard
- Toss
- Naver
- Amazon
- NVIDIA
- Microsoft
- Cohere

Layout:

- 4 columns x 3 rows on desktop.
- Static grid, not marquee.
- Normalize visual weight manually. Some logos should render smaller than their raw asset size.
- Use grayscale or low opacity by default.
- Keep enough contrast that logos are legible, but not loud.

### Right Side: Company Trust

Heading:

> Teams Harper works best with

Body:

> Harper is most useful when the role is senior, context-heavy, or hard to explain in a job post.

Company descriptors:

1. `2B VC-backed AI infrastructure team`  
   Senior engineering and founding leadership roles.

2. `Europe top-tier industrial AI company`  
   Korea/APAC expansion and domain-heavy product roles.

3. `Series B enterprise AI startup`  
   Applied AI, platform, and GTM-critical hires.

4. `YC-backed product team`  
   Small senior teams where one hire changes velocity.

Design:

- Use a vertical list, not company cards.
- Each item should be separated by a thin divider.
- The descriptor line can be `fontMedium`; explanation can be `fontSmall`.
- No logos on the company side unless they are real and approved.
- Keep the right side quieter than the talent logo matrix, but more editorial and specific.

## 10. Section 3: Harper가 일하는 방법

### Purpose

Explain that Harper is not another tool the company has to operate. The company gives context; Harper understands it, talks to candidates, and sends only useful introductions.

### Section Header

Title:

> Harper가 일하는 방법

Description:

> 복잡한 ATS나 검색 필터를 새로 운영하지 않아도 됩니다. 찾는 사람을 설명하면 Harper가 후보자와 직접 대화하고, 인터뷰할 가치가 있을 때만 소개합니다.

### Structure

This section has two large product-story blocks.

Do not make them look like equal feature cards. Each block should feel like an independent product story.

Block 1:

- Explains the company-side process.
- Shows how little the company has to do.
- Visual should feel like a concise request handoff, not a dashboard.

Block 2:

- Shows the candidate brief.
- This is the most important visual in the page.
- It must feel like a polished introduction document Harper would actually send.

## 11. How It Works Block 1: Tell Harper Who You Need

### Purpose

Show that the workflow starts with company context, not with filling out a complex platform.

### Layout

- Large horizontal surface.
- Left side: explanation.
- Right side: simple visual showing request -> Harper understanding -> email/Slack intro.
- The visual should not look like settings, filters, or analytics.

### Exact Copy

Title:

> Tell Harper who you need.

Body:

> 필요한 역할, 팀 상황, 반드시 맞아야 하는 기준을 알려주세요. Harper는 기술 스택, 제품/도메인 맥락, 팀 단계까지 정리한 뒤 적합한 후보자가 있을 때 이메일 또는 Slack으로 바로 연결합니다.

Supporting line:

> No sourcing workflow. No dashboard setup. Just tell Harper what good looks like.

### Visual Content

Show three simple stages:

1. `Role context`  
   팀 단계, 책임 범위, 성공 기준을 먼저 정리합니다.

2. `Harper understands`  
   기술적 기준과 도메인 맥락을 사람보다 빠르게 구조화합니다.

3. `Warm intro`  
   fit이 명확할 때만 이메일 또는 Slack으로 바로 연결합니다.

### Design Notes

- Avoid checklists that feel like onboarding chores.
- Avoid a fake chat interface unless it looks very restrained.
- The email/Slack delivery point should be visually obvious.
- Use one large calm surface with a few dividers.
- The user should understand within 3 seconds: "I just tell Harper what I need."

## 12. How It Works Block 2: Candidate Brief

### Purpose

This section should make the visitor think:

> This is exactly the kind of candidate introduction I would want to receive.

It should not communicate "AI recommended a candidate." It should communicate "a sharp headhunter understood our requirements and prepared the right person for interview."

### Layout

- One large product surface.
- No nested cards.
- Use typography, dividers, subtle background, and spacing to build hierarchy.
- Candidate identity should be anonymized, but not visually awkward.
- Photo/name blur should feel intentional and premium, not broken.
- Interview CTA must be visible.

### 3-Second Information Hierarchy

The brief must make these clear, in this order:

1. Who the candidate is.
2. Why this person matches the company's requirements.
3. What Harper learned directly from the candidate.
4. What Harper already verified.
5. What the company should do next.

### Exact Visual Copy

Document title:

> Candidate brief

Candidate identity:

> Candidate H-204  
> Senior Backend Engineer · AI Infrastructure

Status:

> Ready to interview

Primary candidate summary:

> Built production ML/data systems at scale and has owned reliability for customer-facing infrastructure. Strong fit for a Korea/APAC team that needs technical depth and early-team ownership.

Company requirement:

> Requirement  
> Applied AI infrastructure owner for a small senior team expanding in Korea/APAC.

Why matched:

> Why this person fits  
> Matches the backend depth, infra ownership, and domain-heavy customer context discussed with Harper.

Harper-only context:

> Harper learned directly  
> Interested in Korea-facing roles, compensation range already discussed, open to broader technical leadership scope.

Verified:

> Verified before intro  
> Interest checked · timing confirmed · intro consented

Next action:

> 인터뷰 일정 잡기

### Design Notes

- Candidate name can be anonymized as `Candidate H-204`.
- Profile image should be a neutral blurred silhouette or soft masked block, not a fake person photo.
- Do not use many badges. Maximum two visible status treatments:
  - `Ready to interview`
  - `Verified before intro`
- Do not add generic skills pills.
- Do not show a LinkedIn-style profile layout.
- Do not show star ratings or match percentages.
- Use a strong top identity row, then divided content rows.
- The CTA should sit where a recipient would naturally act after reading the brief.

### Candidate Brief Quality Bar

Before implementation is considered good, this visual should pass all of these:

- Looks like a real product artifact.
- Feels premium enough to send to a founder or hiring manager.
- Explains the candidate in under 3 seconds.
- Shows Harper-only differentiation.
- Makes interview scheduling feel like the natural next step.

## 13. Section 4: Why Harper

### Purpose

Summarize why Harper is different without creating another card-heavy feature section.

### Layout

- Simple 3-column grid.
- Use vertical dividers or spacing rather than boxed cards.
- No icons unless they are extremely restrained and useful.
- Keep copy short and concrete.

### Section Copy

Title:

> Smarter hiring starts here.

Description:

> Harper는 더 많은 후보자를 보여주는 도구가 아니라, 회사가 바로 대화할 만한 사람을 더 빠르게 좁히는 방식입니다.

### Grid Items

Item 1 title:

> Understand quality.

Item 1 body:

> 포지션명과 키워드만 보지 않습니다. 팀 단계, 기술적 깊이, 도메인 제약, 함께 일할 방식까지 이해한 뒤 정확히 맞는 사람을 찾습니다.

Item 2 title:

> Faster, cheaper.

Item 2 body:

> 검색, 아웃리치, 1차 확인에 드는 시간을 줄입니다. 많은 이력서를 검토하는 대신 인터뷰할 가치가 있는 소수만 받습니다.

Item 3 title:

> Nothing new to operate.

Item 3 body:

> 새 툴을 관리할 필요가 없습니다. 후보자에 대한 피드백만 주면 Harper가 기준을 학습해 다음 소개를 더 날카롭게 만듭니다.

## 14. Section 5: Final CTA

### Purpose

Close with a clear action: request a meeting.

The final CTA should feel like the natural conclusion after seeing the candidate brief. Do not introduce a new concept here.

### Layout

- Strong centered headline.
- Short supporting copy.
- Primary CTA.
- Small secondary line introducing three pills.
- Pills: LinkedIn, Talent side, Contact.

### Exact Copy

Title:

> Skip the sourcing. Start with the right conversation.

Description:

> 찾고 있는 역할과 팀 상황을 남겨주세요. Harper가 어떤 후보자 풀을 열 수 있는지 확인하고, 가장 빠른 연결 방식을 제안드립니다.

Primary CTA:

> 미팅 신청하기

Secondary line:

> 더 궁금한 점이 있으신가요?

Pills:

- `LinkedIn`
- `For Talent`
- `문의하기`

### Button And Link Behavior

- `미팅 신청하기`: opens company meeting request flow.
- `LinkedIn`: opens `https://www.linkedin.com/company/matchharper/` in a new tab.
- `For Talent`: goes to `/`.
- `문의하기`: opens `mailto:chris@matchharper.com`.

## 15. Footer

### Purpose

End quietly and credibly. Footer should not become another marketing section.

### Layout

- Left: Harper logo or wordmark and one-line positioning.
- Right: small link groups.
- Include legal links if already available.

### Exact Copy

Footer line:

> For teams hiring exceptional people.

Supporting line:

> High-touch AI headhunting for fewer, better introductions.

Links:

- `일하는 방식`
- `후보자 소개`
- `Why Harper`
- `For Talent`
- `LinkedIn`
- `문의하기`
- `Terms`
- `Privacy`

## 16. CTA Copy System

Use one primary CTA label across the page:

> 미팅 신청하기

Do not rotate between `Contact sales`, `Request demo`, `Learn more`, and `Get started`. Harper is not selling software seats here; it is asking for a hiring conversation.

Secondary links should be visibly less important than the meeting CTA.

## 17. Product Visual Hierarchy

The page should have this visual weight order:

1. Hero title.
2. Candidate brief visual.
3. Social proof split.
4. Tell Harper process visual.
5. Why Harper grid.
6. Final CTA.
7. Footer.

Candidate brief should be the strongest product proof. If another section feels more visually dominant, reduce that section rather than adding decoration to the candidate brief.

## 18. Trust Signals To Include

Trust should come from concrete operating details:

- Harper talks with candidates directly.
- Harper understands technical and domain context quickly.
- Candidate interest is checked before introduction.
- Compensation and timing can be clarified before interview.
- Companies receive fewer, better introductions.
- Delivery happens through familiar channels like email or Slack.
- Feedback improves the next shortlist.

Avoid trust signals based on fake metrics, fake logos, or vague claims.

## 19. Desktop QA Checklist

Before implementation is accepted, check:

- AppBar, Hero, Social proof, How it works, Why Harper, Final CTA, and Footer share the same content alignment.
- Every section is centered with `max-w-[1440px]`.
- No section uses an eyebrow.
- Hero has only one CTA.
- Social proof does not look like a generic logo wall.
- Talent logos and company descriptors feel related.
- Candidate brief is stronger than other product visuals.
- Candidate brief does not look like LinkedIn.
- The page has no nested cards.
- Typography uses only `fontBig`, `fontMedium`, and `fontSmall`.
- CTA buttons have working behavior.
- Footer links resolve to real destinations.
- At 1024px desktop width, grids do not become cramped and candidate brief text remains readable.

## 20. Final Implementation Priority

When implementing, optimize in this order:

1. Layout and information hierarchy.
2. Section size and spacing.
3. Typography and line breaks.
4. Candidate brief product visual.
5. Social proof credibility.
6. Border, radius, color, and hover details.

Do not start by polishing colors or borders. The page will only feel premium if the hierarchy and product story are correct first.
