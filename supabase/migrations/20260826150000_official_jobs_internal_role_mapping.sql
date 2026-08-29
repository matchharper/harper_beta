alter table public.official_jobs
  add column if not exists role_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'official_jobs_role_id_fkey'
      and conrelid = 'public.official_jobs'::regclass
  ) then
    alter table public.official_jobs
      add constraint official_jobs_role_id_fkey
      foreign key (role_id)
      references public.company_roles(role_id)
      on delete set null;
  end if;
end
$$;

create index if not exists official_jobs_role_id_idx
  on public.official_jobs(role_id);

update public.official_jobs
set employment_type = case
  when lower(btrim(coalesce(employment_type, ''))) in (
    'part-time',
    'part time',
    'part_time',
    'parttime'
  ) then 'Part-time'
  else 'Full-time'
end
where slug <> 'internal-internal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'official_jobs_employment_type_check'
      and conrelid = 'public.official_jobs'::regclass
  ) then
    alter table public.official_jobs
      add constraint official_jobs_employment_type_check
      check (
        employment_type is null
        or employment_type in ('Full-time', 'Part-time')
      );
  end if;
end
$$;

update public.official_jobs as job
set role_id = mapping.role_id
from (
  values
    ('795b6eb0-7764-4cc6-b807-c7ebe67b45bd'::uuid, 'e1657263-3369-48c9-8e1b-812834e79037'::uuid),
    ('d0d0cf23-b536-42e6-b0aa-13a95d6ca54d'::uuid, 'e1657263-3369-48c9-8e1b-812834e79037'::uuid),
    ('b95463ac-e109-49fa-abcd-99b9bf93a54d'::uuid, 'b9abd72a-4217-4911-b814-b5bdd60516c3'::uuid),
    ('8174cf08-0a5c-4973-bf90-e3f7f959fa33'::uuid, 'e240964a-1899-4325-b6dc-3e7a1528dd67'::uuid),
    ('e48113bd-9da4-46d9-a388-1a77d5f67a86'::uuid, '6ccc51b9-a52e-5f78-a737-9124ab61618b'::uuid),
    ('cae81697-344c-4dab-87fd-d471b04dd3cd'::uuid, '2dde3537-74f8-52f2-83f1-793a530ba47c'::uuid),
    ('dfcecb34-5e36-4d23-aae5-915869c50796'::uuid, '5bcd9bef-f0a4-57c8-8be5-9931e5213fec'::uuid),
    ('e23b5ccf-7f11-4566-9c24-898cd1e8f78f'::uuid, '3c4bd950-f124-4be4-9018-8e7bcb7757b4'::uuid),
    ('96c28b17-c66b-451f-89a2-80794ee96355'::uuid, '3a8719ac-9483-40bb-b3a8-343680b4ab59'::uuid),
    ('39fe31d8-d52c-4ebf-b918-1dc420763ed5'::uuid, '4c80197b-bc2b-469c-966a-4e9e45631939'::uuid),
    ('9189d0d3-950a-4cab-811a-13999061606e'::uuid, 'e1657263-3369-48c9-8e1b-812834e79037'::uuid),
    ('36db1674-f313-45d1-b92a-df799cc81216'::uuid, '4c80197b-bc2b-469c-966a-4e9e45631939'::uuid),
    ('b162fb70-2251-460a-b543-8ad91d3bcf45'::uuid, '4c80197b-bc2b-469c-966a-4e9e45631939'::uuid),
    ('73bd1111-0736-4bcd-9c6d-4fe2291de3c7'::uuid, '4c80197b-bc2b-469c-966a-4e9e45631939'::uuid),
    ('d89543d6-51b1-49ac-9c74-ccfff64b32f9'::uuid, '41004dab-51d6-4e54-bafa-dbbf3c48d87e'::uuid),
    ('161a9ba5-3684-49c4-908a-8d4ab961664a'::uuid, 'f9c79377-53a3-4128-93d2-981f7115a368'::uuid),
    ('5402dafc-9884-4bbe-9838-93074859982f'::uuid, '1cc2cb09-ad1e-416a-b8f8-33baa4b2e7bf'::uuid),
    ('86ab909a-e71e-4032-88fc-c2dfe5e4741f'::uuid, 'eefc766c-d55a-4c6e-835c-3822b4b5ff56'::uuid),
    ('842779db-a998-4e01-ad82-03ef86db6caa'::uuid, '55b555be-c8d6-4ada-a0c3-b093939a1239'::uuid),
    ('19127e00-5bf0-4918-87d4-2676bdf59a6c'::uuid, '0844b56e-ed3d-4051-ae0d-22abbf1c9ed2'::uuid),
    ('2da3dab5-ccf4-46ce-9c2c-767d850d7b83'::uuid, '2da3dab5-ccf4-46ce-9c2c-767d850d7b83'::uuid),
    ('3bb22f4a-1c13-4bf1-be07-6034605d6840'::uuid, '3bb22f4a-1c13-4bf1-be07-6034605d6840'::uuid),
    ('f5e34f23-3602-4c14-a5fb-825386721aa4'::uuid, 'f5e34f23-3602-4c14-a5fb-825386721aa4'::uuid),
    ('3e963d1a-72e8-4695-b847-29eb833354df'::uuid, '3e963d1a-72e8-4695-b847-29eb833354df'::uuid),
    ('f5042c70-121d-4182-9911-6bd52f6aac92'::uuid, 'e1657263-3369-48c9-8e1b-812834e79037'::uuid),
    ('15f2f720-e241-42d3-8736-5e0bb3227c24'::uuid, 'eefc766c-d55a-4c6e-835c-3822b4b5ff56'::uuid),
    ('fbabb3d8-29d0-4efd-971c-641a4d81abca'::uuid, '0844b56e-ed3d-4051-ae0d-22abbf1c9ed2'::uuid),
    ('fa7416ea-d60e-414e-aa7a-42b07c5e3153'::uuid, 'f9c79377-53a3-4128-93d2-981f7115a368'::uuid),
    ('762b193d-1ee6-41ae-8100-1722157514b8'::uuid, '3c4bd950-f124-4be4-9018-8e7bcb7757b4'::uuid),
    ('34455e56-34ed-4e69-845d-9a708faac0f2'::uuid, '4c80197b-bc2b-469c-966a-4e9e45631939'::uuid),
    ('8b04bd5d-4fee-486b-b37f-952d54415a5a'::uuid, '3c4bd950-f124-4be4-9018-8e7bcb7757b4'::uuid),
    ('c59cdd97-8684-4eb0-baab-59dc7e9a91be'::uuid, '3a8719ac-9483-40bb-b3a8-343680b4ab59'::uuid),
    ('092a4e21-80d5-4d73-9c0e-508ef73c9e3c'::uuid, '6abd7ea2-890a-49a5-ad5e-258267499e3f'::uuid),
    ('1d1f99db-1815-452a-8328-1646a049fb7b'::uuid, '051c0bb1-8207-4459-b2f2-8d9a4b7beb04'::uuid),
    ('791e24fa-62ab-4802-8ddc-00eda845dfb6'::uuid, 'bc3145ea-df04-42e0-8d7a-46d7067357c4'::uuid),
    ('ef5b2cb5-7237-4b83-851f-7ea102e61064'::uuid, '20882456-8862-406d-8f1a-9d69ecb9b575'::uuid),
    ('3bba8b50-8b73-458e-a56b-ac4d43935133'::uuid, '6a6925bb-dbd0-45f0-9e1c-f741322291e9'::uuid),
    ('eb7f8ce2-6a04-44fa-be79-605879ed03ce'::uuid, 'f8515588-f69f-42a8-b3a4-5a5fa25785e5'::uuid),
    ('3be74bc2-5240-4c48-81bf-ffe7dd169fff'::uuid, '4361c6c2-3650-453d-bd17-5fe9401b7891'::uuid),
    ('6c86d27a-a57c-4975-a37a-cdfa8f1bd106'::uuid, '0844b56e-ed3d-4051-ae0d-22abbf1c9ed2'::uuid),
    ('d323467e-d693-4725-82f8-ebfeaee77c61'::uuid, '825b3c83-14eb-4bdd-a034-d0ad676b9735'::uuid),
    ('bacb24b8-045b-46f0-b268-47f29935751d'::uuid, 'e963d418-600b-4b1f-9e1e-94336221b805'::uuid),
    ('e12d4cda-abc5-4560-85fa-e2f28f281061'::uuid, '43038afd-0ada-4e84-8bd2-a28bfb71cfc3'::uuid),
    ('ed04b080-4e5f-47db-b12a-229797e5cf69'::uuid, '1cc2cb09-ad1e-416a-b8f8-33baa4b2e7bf'::uuid),
    ('cd04f9b8-b01e-475a-8335-8c023cbe0469'::uuid, '9cc520fb-2044-4c18-9fb9-c80d776e74e8'::uuid),
    ('0b6dbe54-3364-485b-91be-3c80bd3f138e'::uuid, '6486b30e-f378-4fa2-ba89-3729ecf6295e'::uuid),
    ('fa1ab717-5e22-4afa-91bb-ca1f3a43a24f'::uuid, '0b13092d-270c-4f6d-91ff-b523741a1884'::uuid)
) as mapping(official_job_id, role_id)
where job.id = mapping.official_job_id;

-- These official-jobs drafts intentionally remain unmapped because there is
-- no corresponding active or paused internal role: Sierra Enterprise Sales
-- Engineer Korea, Wonderful Korea Field CTO (two copies), Wonderful Singapore
-- Field CTO, and the New York K-Foodtech Operations Lead.

comment on column public.official_jobs.role_id is
  'Internal company role used for official-jobs chat mentions and priority-review requests.';
