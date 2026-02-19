-- Final aggregation strategy for candidate profile text (v2)
-- Incorporates all relevant tables including extra_experience for richer semantic context.

WITH candidate_basic AS (
    SELECT 
        id,
        COALESCE(name, '') || ' | ' || 
        COALESCE(headline, '') || ' | ' || 
        COALESCE(summary, '') || ' | ' || 
        COALESCE(bio, '') as basic_info
    FROM public.candid
),
candidate_experience AS (
    SELECT 
        eu.candid_id,
        STRING_AGG(
            COALESCE(eu.role, '') || ' at ' || COALESCE(c.name, '') || ': ' || COALESCE(eu.description, ''),
            ' ; '
        ) as experience_info
    FROM public.experience_user eu
    LEFT JOIN public.company_db c ON eu.company_id = c.id
    GROUP BY eu.candid_id
),
candidate_education AS (
    SELECT 
        candid_id,
        STRING_AGG(
            COALESCE(school, '') || ' (' || COALESCE(degree, '') || ' in ' || COALESCE(field, '') || ')',
            ' ; '
        ) as education_info
    FROM public.edu_user
    GROUP BY candid_id
),
candidate_publications AS (
    SELECT 
        candid_id,
        STRING_AGG(COALESCE(title, '') || ' (' || COALESCE(published_at, '') || ')', ' ; ') as publication_info
    FROM public.publications
    GROUP BY candid_id
),
candidate_extra AS (
    SELECT 
        candid_id,
        STRING_AGG(COALESCE(title, '') || ': ' || COALESCE(description, ''), ' ; ') as extra_info
    FROM public.extra_experience
    GROUP BY candid_id
)
SELECT 
    b.id,
    'BASIC: ' || b.basic_info || 
    ' || EXPERIENCE: ' || COALESCE(e.experience_info, 'N/A') || 
    ' || EDUCATION: ' || COALESCE(ed.education_info, 'N/A') || 
    ' || PUBLICATIONS: ' || COALESCE(p.publication_info, 'N/A') ||
    ' || AWARDS/EXTRA: ' || COALESCE(ex.extra_info, 'N/A') as full_profile_text
FROM candidate_basic b
LEFT JOIN candidate_experience e ON b.id = e.candid_id
LEFT JOIN candidate_education ed ON b.id = ed.candid_id
LEFT JOIN candidate_publications p ON b.id = p.candid_id
LEFT JOIN candidate_extra ex ON b.id = ex.candid_id;
