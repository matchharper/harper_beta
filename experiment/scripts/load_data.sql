-- Load data from CSV files mounted at /data

-- 1. Base Tables (No Foreign Keys or FKs to self)
COPY candid(id, created_at, last_updated_at, name, headline, location, profile_picture, linkedin_url, total_exp_months, bio, email, links, summary, fts)
FROM '/data/candid.csv'
DELIMITER ','
CSV HEADER NULL '';

COPY company_db(id, last_updated_at, linkedin_url, name, website_url, description, logo, founded_year, location, funding_url, employee_count_range, specialities, related_links, investors, funding, short_description)
FROM '/data/company_db.csv'
DELIMITER ','
CSV HEADER NULL '';

-- 2. Dependent Tables
COPY edu_user(id, school, degree, field, start_date, end_date, url, candid_id, created_at)
FROM '/data/edu_user.csv'
DELIMITER ','
CSV HEADER NULL '';

COPY experience_user(id, candid_id, company_id, role, description, months, start_date, end_date, created_at)
FROM '/data/experience_user.csv'
DELIMITER ','
CSV HEADER NULL '';

COPY extra_experience(id, created_at, title, description, issued_by, issued_at, candid_id, type)
FROM '/data/extra_experience.csv'
DELIMITER ','
CSV HEADER NULL '';

COPY publications(id, created_at, candid_id, title, published_at, link, abstract, citation_num)
FROM '/data/publications.csv'
DELIMITER ','
CSV HEADER NULL '';

-- 3. Reset Sequences (Optional but recommended if IDs were manually inserted)
-- Since we are inserting specific IDs, we should restart sequences to avoid conflicts on future inserts.
SELECT setval('experience_user_id_seq', (SELECT MAX(id) FROM experience_user));
SELECT setval('extra_experience_id_seq', (SELECT MAX(id) FROM extra_experience));
SELECT setval('organization_database_id_seq', (SELECT MAX(id) FROM company_db));
SELECT setval('publications_id_seq', (SELECT MAX(id) FROM publications));
