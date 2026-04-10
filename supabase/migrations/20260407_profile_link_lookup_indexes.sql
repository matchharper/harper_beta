-- Hot-path lookup indexes for crawler/profile dedup flows.
-- data_sc uses exact URL lookups on candid.linkedin_url and candid_links_index
-- link columns before falling back to broader string matching.

create index if not exists candid_linkedin_url_idx
on public.candid (linkedin_url);

create index if not exists candid_links_index_linkedin_links_idx
on public.candid_links_index (linkedin_links);

create index if not exists candid_links_index_github_links_idx
on public.candid_links_index (github_links);

create index if not exists candid_links_index_scholar_links_idx
on public.candid_links_index (scholar_links);
