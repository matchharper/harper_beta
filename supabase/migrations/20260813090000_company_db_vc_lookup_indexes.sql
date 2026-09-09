-- Index the normalized company signals used by the VC portfolio collector.
--
-- Website hosts are reversed so registrable-domain suffix matching becomes a
-- btree prefix lookup (`moc.elpmaxe.%`) instead of a leading-wildcard scan.

begin;

create index if not exists company_db_vc_linkedin_url_normalized_idx
  on public.company_db (
    (
      regexp_replace(
        regexp_replace(
          lower(trim(trailing '/' from coalesce(linkedin_url, ''))),
          '^https?://(www[.])?linkedin[.]com/',
          'https://www.linkedin.com/'
        ),
        '[?#].*$',
        ''
      )
    )
  )
  where linkedin_url is not null;

create index if not exists company_db_vc_website_host_reverse_idx
  on public.company_db (
    (
      reverse(
        regexp_replace(
          lower(
            split_part(
              split_part(
                regexp_replace(
                  coalesce(website_url, ''),
                  '^[a-zA-Z][a-zA-Z0-9+.-]*://',
                  ''
                ),
                '/',
                1
              ),
              ':',
              1
            )
          ),
          '^www[.]',
          ''
        )
      )
    ) text_pattern_ops
  )
  where website_url is not null;

commit;
