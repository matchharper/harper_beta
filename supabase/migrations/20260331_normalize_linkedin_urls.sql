-- Migration: Normalize LinkedIn URLs (www.linkedin.com → linkedin.com)
-- Run once: migrate_linkedin_url_normalization.py
-- Changes:
--   - candid_links_index.linkedin_links: 'https://www.linkedin.com/in/{id}' → 'https://linkedin.com/in/{id}'
--   - candid.linkedin_url: same normalization

-- candid_links_index: normalize string values
UPDATE candid_links_index
SET linkedin_links = regexp_replace(
    linkedin_links,
    'https?://www\.linkedin\.com',
    'https://linkedin.com',
    'gi'
)
WHERE linkedin_links ~ 'https?://www\.linkedin\.com';

-- candid: normalize string values
UPDATE candid
SET linkedin_url = regexp_replace(
    linkedin_url,
    'https?://www\.linkedin\.com',
    'https://linkedin.com',
    'gi'
)
WHERE linkedin_url ~ 'https?://www\.linkedin\.com';
