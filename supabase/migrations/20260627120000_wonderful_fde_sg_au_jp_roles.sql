BEGIN;

INSERT INTO public.company_workspace (
  company_workspace_id,
  company_name,
  homepage_url,
  linkedin_url,
  company_description,
  company_db_id,
  is_internal,
  request,
  test_score,
  created_at,
  updated_at
)
SELECT
  'f2e80aee-fee3-40f5-807f-5f8694c37eee'::uuid,
  'Wonderful',
  'https://wonderful.ai/',
  'https://www.linkedin.com/company/wonderfulcx',
  'Wonderful builds enterprise AI agents for customer operations and deploys them into real customer workflows across voice, chat, email, and back-office systems.',
  (
    SELECT id
    FROM public.company_db
    WHERE id = 106168221
       OR lower(name) = 'wonderful'
    ORDER BY CASE WHEN id = 106168221 THEN 0 ELSE 1 END
    LIMIT 1
  ),
  true,
  'Outstanding software engineer profile with strong customer-facing B2B deployment, systems integration, startup/building ownership, and business-level English communication. Prefer 13 years of experience or less, while allowing exceptional candidates.',
  14,
  timezone('utc', now()),
  timezone('utc', now())
ON CONFLICT (company_workspace_id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  homepage_url = COALESCE(public.company_workspace.homepage_url, EXCLUDED.homepage_url),
  linkedin_url = COALESCE(public.company_workspace.linkedin_url, EXCLUDED.linkedin_url),
  company_description = COALESCE(public.company_workspace.company_description, EXCLUDED.company_description),
  company_db_id = COALESCE(public.company_workspace.company_db_id, EXCLUDED.company_db_id),
  is_internal = true,
  request = COALESCE(public.company_workspace.request, EXCLUDED.request),
  test_score = COALESCE(public.company_workspace.test_score, EXCLUDED.test_score),
  updated_at = timezone('utc', now());

WITH role_payload AS (
  SELECT *
  FROM (
    VALUES
      (
        '55b555be-c8d6-4ada-a0c3-b093939a1239'::uuid,
        'SG',
        'Forward Deployed Engineer (FDE) - Singapore',
        'Singapore, Singapore',
        'wonderful-fde-sg',
        $description$
### Role Overview

Forward Deployed Engineers at Wonderful work deeply inside real customer environments to design, build, deploy, and operate AI agents in production.

This is not a model-building-only role. The core responsibility is to understand complex business problems and turn them into working systems that customers can actually use.

This Singapore-focused role is intended for candidates currently based in Singapore or realistically able to work closely with Singapore-based customers.

---

### Responsibilities

- Work directly with enterprise customers to analyze business workflows and define problems.
- Design AI agent architectures from customer requirements and build fast prototypes.
- Connect LLMs, internal data, external APIs, and customer systems into production-ready workflows.
- Integrate with existing infrastructure such as CRM, ERP, contact center, messaging, and data systems.
- For telephony-heavy deployments, design voice systems, IVR, call routing, and real-time voice processing pipelines.
- Debug issues in customer environments and continuously improve performance, reliability, and adoption.
- Optimize against real business KPIs such as response rate, conversion, handle time, resolution time, and operational throughput.
- Collaborate closely with customers, product, engineering, and operations teams, then iterate quickly as requirements change.

---

### Qualifications

- 3+ years of software engineering or equivalent technical building experience.
- Strong persistence and execution in defining ambiguous problems and driving them to working solutions.
- Backend or systems development experience with Python, TypeScript, or comparable production stacks.
- Practical understanding of REST APIs, databases, cloud environments, and system integration.
- Basic understanding of LLMs, AI agents, automation systems, or workflow orchestration.
- Experience building and improving prototypes quickly under uncertainty.
- Strong English communication for technical customer work and cross-functional collaboration.

---

### Preferred Qualifications

- Customer-facing engineering experience such as Solution Engineer, Forward Deployed Engineer, Consulting Engineer, or technical implementation lead.
- Experience integrating complex enterprise systems such as CRM, ERP, contact center platforms, or data pipelines.
- Voice, call center, or telephony systems experience such as Twilio, SIP, STT/TTS, IVR, or real-time audio pipelines.
- Experience building LLM-based products, including prompting, tool use, RAG, evaluation, and production monitoring.
- Startup or early-product experience where speed, ownership, and ambiguity were part of the job.
- Evidence of communicating with external customers, executives, or business stakeholders while still owning implementation.

---

### What Makes This Role Unique

- Compensation can be in the high-growth startup range with meaningful equity depending on level and fit.
- Success is measured by real business impact, not only model quality or code output.
- The role spans problem definition, architecture, implementation, deployment, and operation.
- FDEs sit close to customers and directly shape how Wonderful's product works in production.
- The environment rewards fast experiments, clear judgment, and visible customer outcomes.

---

### Who This Role Fits

- Someone more excited by solving real customer problems than by writing isolated "good code."
- Someone who can structure incomplete requirements and move quickly into implementation.
- Someone who enjoys working across technology, product, operations, and business conversations.

---

### Interview Process

1. Initial phone call for mutual fit and role introduction.
2. Technical interview focused on role-relevant engineering depth.
3. Decomposition case study with a Wonderful global engineering leader, including live architecture and technical decision discussion.
4. VP Operations interview focused on business, customer, and operating judgment.
5. Founder or executive overview for culture fit and company vision.
6. Reference check and offer.
$description$,
        'Forward Deployed Engineer building and deploying Wonderful AI agents for Singapore-based enterprise customer workflows.',
        $request$
Evaluate only candidates currently based in Singapore or realistically able to work closely with Singapore-based customers for this country-specific Wonderful FDE path. Do not evaluate candidates from other countries for this role.

Strong positive signals: exceptional software engineering ability, startup or founder-like ownership, hands-on implementation, systems integration, automation, B2B or enterprise customer-facing deployment, high-quality English communication, ability to structure ambiguous customer problems, and readiness to work directly with APAC customers.

Prefer candidates with 13 years of experience or less, but do not hard reject exceptional profiles. The bar is very high: the candidate's resume/profile should make an enterprise customer believe this person can justify a premium forward-deployed engineering engagement.

If the profile lacks clear evidence for Singapore availability, customer-facing technical communication, English communication, or hands-on engineering depth, use hold or a mismatch label rather than fit.
$request$
      ),
      (
        'eefc766c-d55a-4c6e-835c-3822b4b5ff56'::uuid,
        'JP',
        'Forward Deployed Engineer (FDE) - Japan',
        'Tokyo, Japan',
        'wonderful-fde-jp',
        $description$
### Role Overview

Forward Deployed Engineers at Wonderful work deeply inside real customer environments to design, build, deploy, and operate AI agents in production.

This is not a model-building-only role. The core responsibility is to understand complex business problems and turn them into working systems that customers can actually use.

This Japan-focused role is intended for candidates currently based in Japan or realistically able to work closely with Japan-based customers.

---

### Responsibilities

- Work directly with enterprise customers to analyze business workflows and define problems.
- Design AI agent architectures from customer requirements and build fast prototypes.
- Connect LLMs, internal data, external APIs, and customer systems into production-ready workflows.
- Integrate with existing infrastructure such as CRM, ERP, contact center, messaging, and data systems.
- For telephony-heavy deployments, design voice systems, IVR, call routing, and real-time voice processing pipelines.
- Debug issues in customer environments and continuously improve performance, reliability, and adoption.
- Optimize against real business KPIs such as response rate, conversion, handle time, resolution time, and operational throughput.
- Collaborate closely with customers, product, engineering, and operations teams, then iterate quickly as requirements change.

---

### Qualifications

- 3+ years of software engineering or equivalent technical building experience.
- Strong persistence and execution in defining ambiguous problems and driving them to working solutions.
- Backend or systems development experience with Python, TypeScript, or comparable production stacks.
- Practical understanding of REST APIs, databases, cloud environments, and system integration.
- Basic understanding of LLMs, AI agents, automation systems, or workflow orchestration.
- Experience building and improving prototypes quickly under uncertainty.
- Strong English communication for technical customer work and cross-functional collaboration.

---

### Preferred Qualifications

- Customer-facing engineering experience such as Solution Engineer, Forward Deployed Engineer, Consulting Engineer, or technical implementation lead.
- Experience integrating complex enterprise systems such as CRM, ERP, contact center platforms, or data pipelines.
- Voice, call center, or telephony systems experience such as Twilio, SIP, STT/TTS, IVR, or real-time audio pipelines.
- Experience building LLM-based products, including prompting, tool use, RAG, evaluation, and production monitoring.
- Startup or early-product experience where speed, ownership, and ambiguity were part of the job.
- Evidence of communicating with external customers, executives, or business stakeholders while still owning implementation.

---

### What Makes This Role Unique

- Compensation can be in the high-growth startup range with meaningful equity depending on level and fit.
- Success is measured by real business impact, not only model quality or code output.
- The role spans problem definition, architecture, implementation, deployment, and operation.
- FDEs sit close to customers and directly shape how Wonderful's product works in production.
- The environment rewards fast experiments, clear judgment, and visible customer outcomes.

---

### Who This Role Fits

- Someone more excited by solving real customer problems than by writing isolated "good code."
- Someone who can structure incomplete requirements and move quickly into implementation.
- Someone who enjoys working across technology, product, operations, and business conversations.

---

### Interview Process

1. Initial phone call for mutual fit and role introduction.
2. Technical interview focused on role-relevant engineering depth.
3. Decomposition case study with a Wonderful global engineering leader, including live architecture and technical decision discussion.
4. VP Operations interview focused on business, customer, and operating judgment.
5. Founder or executive overview for culture fit and company vision.
6. Reference check and offer.
$description$,
        'Forward Deployed Engineer building and deploying Wonderful AI agents for Japan-based enterprise customer workflows.',
        $request$
Evaluate only candidates currently based in Japan or realistically able to work closely with Japan-based customers for this country-specific Wonderful FDE path. Do not evaluate candidates from other countries for this role.

Strong positive signals: exceptional software engineering ability, startup or founder-like ownership, hands-on implementation, systems integration, automation, B2B or enterprise customer-facing deployment, high-quality English communication, ability to structure ambiguous customer problems, and readiness to work directly with APAC customers. Japanese-language or Japan enterprise customer context is a plus when present, but do not invent it.

Prefer candidates with 13 years of experience or less, but do not hard reject exceptional profiles. The bar is very high: the candidate's resume/profile should make an enterprise customer believe this person can justify a premium forward-deployed engineering engagement.

If the profile lacks clear evidence for Japan availability, customer-facing technical communication, English communication, or hands-on engineering depth, use hold or a mismatch label rather than fit.
$request$
      ),
      (
        '0844b56e-ed3d-4051-ae0d-22abbf1c9ed2'::uuid,
        'AU',
        'Forward Deployed Engineer (FDE) - Australia',
        'Sydney, Australia',
        'wonderful-fde-au',
        $description$
### Role Overview

Forward Deployed Engineers at Wonderful work deeply inside real customer environments to design, build, deploy, and operate AI agents in production.

This is not a model-building-only role. The core responsibility is to understand complex business problems and turn them into working systems that customers can actually use.

This Australia-focused role is intended for candidates currently based in Australia or realistically able to work closely with Australia-based customers.

---

### Responsibilities

- Work directly with enterprise customers to analyze business workflows and define problems.
- Design AI agent architectures from customer requirements and build fast prototypes.
- Connect LLMs, internal data, external APIs, and customer systems into production-ready workflows.
- Integrate with existing infrastructure such as CRM, ERP, contact center, messaging, and data systems.
- For telephony-heavy deployments, design voice systems, IVR, call routing, and real-time voice processing pipelines.
- Debug issues in customer environments and continuously improve performance, reliability, and adoption.
- Optimize against real business KPIs such as response rate, conversion, handle time, resolution time, and operational throughput.
- Collaborate closely with customers, product, engineering, and operations teams, then iterate quickly as requirements change.

---

### Qualifications

- 3+ years of software engineering or equivalent technical building experience.
- Strong persistence and execution in defining ambiguous problems and driving them to working solutions.
- Backend or systems development experience with Python, TypeScript, or comparable production stacks.
- Practical understanding of REST APIs, databases, cloud environments, and system integration.
- Basic understanding of LLMs, AI agents, automation systems, or workflow orchestration.
- Experience building and improving prototypes quickly under uncertainty.
- Strong English communication for technical customer work and cross-functional collaboration.

---

### Preferred Qualifications

- Customer-facing engineering experience such as Solution Engineer, Forward Deployed Engineer, Consulting Engineer, or technical implementation lead.
- Experience integrating complex enterprise systems such as CRM, ERP, contact center platforms, or data pipelines.
- Voice, call center, or telephony systems experience such as Twilio, SIP, STT/TTS, IVR, or real-time audio pipelines.
- Experience building LLM-based products, including prompting, tool use, RAG, evaluation, and production monitoring.
- Startup or early-product experience where speed, ownership, and ambiguity were part of the job.
- Evidence of communicating with external customers, executives, or business stakeholders while still owning implementation.

---

### What Makes This Role Unique

- Compensation can be in the high-growth startup range with meaningful equity depending on level and fit.
- Success is measured by real business impact, not only model quality or code output.
- The role spans problem definition, architecture, implementation, deployment, and operation.
- FDEs sit close to customers and directly shape how Wonderful's product works in production.
- The environment rewards fast experiments, clear judgment, and visible customer outcomes.

---

### Who This Role Fits

- Someone more excited by solving real customer problems than by writing isolated "good code."
- Someone who can structure incomplete requirements and move quickly into implementation.
- Someone who enjoys working across technology, product, operations, and business conversations.

---

### Interview Process

1. Initial phone call for mutual fit and role introduction.
2. Technical interview focused on role-relevant engineering depth.
3. Decomposition case study with a Wonderful global engineering leader, including live architecture and technical decision discussion.
4. VP Operations interview focused on business, customer, and operating judgment.
5. Founder or executive overview for culture fit and company vision.
6. Reference check and offer.
$description$,
        'Forward Deployed Engineer building and deploying Wonderful AI agents for Australia-based enterprise customer workflows.',
        $request$
Evaluate only candidates currently based in Australia or realistically able to work closely with Australia-based customers for this country-specific Wonderful FDE path. Do not evaluate candidates from other countries for this role.

Strong positive signals: exceptional software engineering ability, startup or founder-like ownership, hands-on implementation, systems integration, automation, B2B or enterprise customer-facing deployment, high-quality English communication, ability to structure ambiguous customer problems, and readiness to work directly with APAC customers.

Prefer candidates with 13 years of experience or less, but do not hard reject exceptional profiles. The bar is very high: the candidate's resume/profile should make an enterprise customer believe this person can justify a premium forward-deployed engineering engagement.

If the profile lacks clear evidence for Australia availability, customer-facing technical communication, English communication, or hands-on engineering depth, use hold or a mismatch label rather than fit.
$request$
      )
  ) AS payload(
    role_id,
    country_code,
    role_name,
    location_text,
    source_job_id,
    description,
    description_summary,
    request
  )
)
INSERT INTO public.company_roles (
  role_id,
  company_workspace_id,
  name,
  external_jd_url,
  description,
  information,
  type,
  status,
  created_at,
  updated_at,
  priority,
  source_type,
  source_provider,
  source_job_id,
  posted_at,
  location_text,
  work_mode,
  salary_range,
  seniority_level,
  description_summary,
  is_expired,
  request
)
SELECT
  role_id,
  'f2e80aee-fee3-40f5-807f-5f8694c37eee'::uuid,
  role_name,
  'https://wonderful.ai/',
  description,
  jsonb_build_object(
    'wonderfulFdeCountryScoped', true,
    'countryCode', country_code,
    'matchingScope', 'country_only'
  ),
  ARRAY['full_time']::text[],
  'active',
  timezone('utc', now()),
  timezone('utc', now()),
  10,
  'internal',
  'harper_wonderful_fde',
  source_job_id,
  timezone('utc', now()),
  location_text,
  'onsite',
  NULL,
  NULL,
  description_summary,
  false,
  request
FROM role_payload
ON CONFLICT (role_id) DO UPDATE SET
  company_workspace_id = EXCLUDED.company_workspace_id,
  name = EXCLUDED.name,
  external_jd_url = EXCLUDED.external_jd_url,
  description = EXCLUDED.description,
  information = EXCLUDED.information,
  type = EXCLUDED.type,
  status = EXCLUDED.status,
  updated_at = timezone('utc', now()),
  priority = EXCLUDED.priority,
  source_type = EXCLUDED.source_type,
  source_provider = EXCLUDED.source_provider,
  source_job_id = EXCLUDED.source_job_id,
  posted_at = COALESCE(public.company_roles.posted_at, EXCLUDED.posted_at),
  location_text = EXCLUDED.location_text,
  work_mode = EXCLUDED.work_mode,
  salary_range = EXCLUDED.salary_range,
  seniority_level = EXCLUDED.seniority_level,
  description_summary = EXCLUDED.description_summary,
  is_expired = false,
  request = EXCLUDED.request;

COMMIT;
