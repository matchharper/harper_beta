// Run with an isolated PGlite database. The schema input contains DDL only.
// See docs/contents-engine/gtm-workspace.md for setup and the API contract.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { PGlite } = await import(
  process.env.GTM_PGLITE_MODULE || "@electric-sql/pglite"
);
const schemaDir = process.argv[2];
if (!schemaDir) throw new Error("Supply the schema-only export directory");
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const db = await PGlite.create();
let assertions = 0;
const check = (value) => {
  assert.ok(value);
  assertions++;
};
const rejects = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
  assertions++;
};
const api = async (action, data = {}) =>
  (
    await db.query("select public.gtm_workspace($1,$2::jsonb) result", [
      action,
      JSON.stringify(data),
    ])
  ).rows[0].result;
const uid = "22222222-2222-4222-8222-222222222222";
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
        nullif(current_setting('request.jwt.claim.role',true),'')
      )
    $$;
    SET check_function_bodies=off;`);
  const functions = fs
    .readFileSync(path.join(schemaDir, "functions.sql"), "utf8")
    .split(/(?=CREATE OR REPLACE FUNCTION)/)
    // The workspace itself is loaded from the migrations below, including when
    // the schema-only export comes from a DB where this feature is already live.
    .filter(
      (text) =>
        text.trim() &&
        !/^CREATE OR REPLACE FUNCTION public\.gtm_workspace\(/.test(text)
    )
    .map((text) => text.trim().replace(/;+$/, "") + ";");
  for (const definition of functions.filter((text) =>
    /^CREATE OR REPLACE FUNCTION public\.gtm_(net_paid|compensation_amount)\(/.test(
      text
    )
  ))
    await db.exec(definition);
  const schema = fs
    .readFileSync(path.join(schemaDir, "schema.sql"), "utf8")
    .replace(/^\\.*$/gm, "");
  const boundary = schema.indexOf("CREATE TRIGGER");
  assert.ok(boundary > 0, "Use a complete GTM schema-only dump");
  await db.exec(schema.slice(0, boundary));
  for (const definition of functions) await db.exec(definition);
  await db.exec(schema.slice(boundary));
  await db.exec(`SET check_function_bodies=on;
    create table public.talent_users(user_id uuid,email text,created_at timestamptz,deleted_at timestamptz);
    create table public.logs(id uuid,user_id uuid,type text,created_at timestamptz);
    create table public.landing_logs(id uuid,local_id text,type text,created_at timestamptz);
    create table public.contact_queue(user_id uuid,type text,payload jsonb,created_at timestamptz);
    create table public.talent_activity_events(talent_id uuid,event_type text,created_at timestamptz);
    create table if not exists public.gtm_access_tokens(
      id uuid primary key default gen_random_uuid(),
      name text not null,
      token_hash text not null unique,
      can_write boolean not null default false,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      last_used_at timestamptz
    );`);
  await db.exec(`
    create or replace function public.gtm_outreach_prepare(
      p_token text,
      p_creator_id uuid,
      p_outreach_template_id uuid,
      p_recipient_email text,
      p_sender_email text,
      p_subject text,
      p_body text,
      p_selection_reason text,
      p_request_id uuid,
      p_collaboration_id uuid default null,
      p_scheduled_at timestamptz default null,
      p_personalization_evidence text default null
    ) returns jsonb language plpgsql security definer set search_path='' as $$
    declare credential public.gtm_access_tokens;
    begin
      select * into credential from public.gtm_access_tokens
      where token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex')
        and revoked_at is null and expires_at>now();
      return '{}'::jsonb;
    end $$;
  `);
  await db.exec(
    fs.readFileSync(
      path.join(root, "supabase/migrations/20260921120000_gtm_workspace.sql"),
      "utf8"
    )
  );
  await db.exec(
    fs.readFileSync(
      path.join(root, "supabase/migrations/20260921123000_gtm_operations.sql"),
      "utf8"
    )
  );
  const workspaceFunctionsPath = path.join(
    schemaDir,
    "workspace-functions.sql"
  );
  // A current production schema export no longer contains every legacy
  // overload removed by this migration. In that fixture only, tolerate those
  // already-absent drops while exercising the complete replacement contract.
  const removeTokensMigration = fs
    .readFileSync(
      path.join(
        root,
        "supabase/migrations/20260921180000_gtm_remove_access_tokens.sql"
      ),
      "utf8"
    )
    .replace(/^drop function /gm, "drop function if exists ");
  const serviceRoleMigration = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20260921181000_gtm_service_role_auth.sql"
    ),
    "utf8"
  );
  if (fs.existsSync(workspaceFunctionsPath)) {
    await db.exec(removeTokensMigration);
    await db.exec(serviceRoleMigration);
    const cellNavigationMigration = fs.readFileSync(
      path.join(
        root,
        "supabase/migrations/20260921170000_gtm_creator_cell_navigation.sql"
      ),
      "utf8"
    );
    await db.exec(cellNavigationMigration.split("-- The record workspace")[0]);
    await db.exec(
      fs.readFileSync(
        path.join(
          root,
          "supabase/migrations/20260921173000_gtm_outreach_status_colors.sql"
        ),
        "utf8"
      )
    );
    const workspaceFunctions = fs
      .readFileSync(workspaceFunctionsPath, "utf8")
      .split(/(?=CREATE OR REPLACE FUNCTION)/)
      .filter((text) => text.trim())
      .map((text) => text.trim().replace(/;+$/, "") + ";");
    for (const definition of workspaceFunctions) await db.exec(definition);
    await db.exec(`
      revoke all on function public.gtm_outreach_pending_reply_notifications(integer)
        from public,anon,authenticated;
      grant execute on function public.gtm_outreach_pending_reply_notifications(integer)
        to service_role;
    `);
  } else {
    await db.exec(
      fs.readFileSync(
        path.join(
          root,
          "supabase/migrations/20260921150000_gtm_creator_mail.sql"
        ),
        "utf8"
      )
    );
    await db.exec(removeTokensMigration);
    await db.exec(serviceRoleMigration);
  }
  await db.query(
    "select set_config('request.jwt.claim.role','anon',false)"
  );
  await rejects(() => api("catalog"), /Internal GTM access/);
  await db.query(
    "select set_config('request.jwt.claim.role','service_role',false)"
  );
  check((await api("catalog")).sheets.length === 18);
  await db.query(
    "insert into auth.users values($1,'fixture@matchharper.com',now(),null)",
    [uid]
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.query(
    "select set_config('request.jwt.claim.role','authenticated',false)"
  );
  let catalog = await api("catalog");
  check(catalog.sheets.length === 18);
  check(
    catalog.sources.every(
      (source) =>
        !source.entity?.includes("access_tokens") &&
        !source.entity?.includes("mailboxes")
    )
  );
  for (const sheet of catalog.sheets) {
    await db.query("select gtm_view.validate_definition($1::jsonb)", [
      JSON.stringify(sheet.definition),
    ]);
    const result = await api("query", { sheet_id: sheet.id });
    check(Array.isArray(result.rows) && typeof result.total === "number");
  }
  const creators = catalog.sheets.find(
    (sheet) => sheet.definition.source === "creators"
  );
  const collaborations = catalog.sheets.find(
    (sheet) => sheet.definition.source === "collaborations"
  );
  const pricing = catalog.sheets.find(
    (sheet) => sheet.definition.source === "pricing"
  );
  const save = (sheet, values, record) =>
    api("save_record", {
      sheet_id: sheet.id,
      values,
      record_id: record?.id,
      expected_version: record?.row_version,
      request_id: crypto.randomUUID(),
    });
  const creator = (
    await save(creators, {
      name: "한글 Creator",
      notes: "First",
      outreach_score: 4,
    })
  ).record;
  const other = (await save(creators, { name: "Another", outreach_score: 2 }))
    .record;
  check(creator.name === "한글 Creator");
  const definition = structuredClone(creators.definition);
  definition.filters = [{ key: "outreach_score", operator: "gte", value: "3" }];
  definition.sorting = [{ key: "outreach_score", desc: true }];
  const filtered = await api("query", { sheet_id: creators.id, definition });
  check(filtered.total === 1 && filtered.rows[0].id === creator.id);
  const sorted = await api("query", {
    sheet_id: creators.id,
    definition: { ...definition, filters: [] },
    limit: 1,
    offset: 1,
  });
  check(sorted.total === 2 && sorted.rows[0].id === other.id);
  const edit = {
    sheet_id: creators.id,
    record_id: creator.id,
    expected_version: creator.row_version,
    values: { notes: "Updated" },
    request_id: crypto.randomUUID(),
  };
  const edited = await api("save_record", edit);
  check(
    edited.record.notes === "Updated" &&
      edited.record.updated_by === "fixture@matchharper.com"
  );
  assert.deepEqual(await api("save_record", edit), edited);
  assertions++;
  await rejects(
    () =>
      api("save_record", {
        ...edit,
        values: { notes: "Stale" },
        request_id: crypto.randomUUID(),
      }),
    /version conflict/
  );
  await rejects(
    () => api("save_record", { ...edit, values: { total_followers: 88 } }),
    /Read-only field/
  );
  const collaboration = (
    await save(collaborations, { title: "협업 테스트", creator_id: creator.id })
  ).record;
  const joinedDefinition = structuredClone(collaborations.definition);
  joinedDefinition.columns.push({
    key: "creator_id.name",
    label: "연결된 크리에이터",
    width: 220,
  });
  joinedDefinition.filters = [
    { key: "creator_id.name", operator: "contains", value: "한글" },
  ];
  const joined = await api("query", {
    sheet_id: collaborations.id,
    definition: joinedDefinition,
  });
  check(
    joined.rows[0]["creator_id.name"] === creator.name &&
      joined.rows[0].id === collaboration.id
  );
  await rejects(
    () =>
      api("save_record", {
        sheet_id: collaborations.id,
        record_id: collaboration.id,
        values: { "creator_id.name": "No" },
      }),
    /Read-only field/
  );
  const options = await api("reference_options", {
    source: "creators",
    search: "한글",
  });
  check(
    options.options[0].id === creator.id &&
      options.options[0].label.includes("한글")
  );
  const price = await save(pricing, {
    name: "Fixture pricing",
    pricing_model: "fixed",
    base_fee: 1000,
  });
  check(price.record.name === "Fixture pricing");
  const contents = catalog.sheets.find(
    (sheet) => sheet.definition.source === "contents"
  );
  const performance = catalog.sheets.find(
    (sheet) => sheet.definition.source === "performance_creator"
  );
  const content = (
    await save(contents, {
      title: "Local performance fixture",
      creator_id: creator.id,
      collaboration_id: collaboration.id,
    })
  ).record;
  let metrics = (await api("query", { sheet_id: performance.id })).rows[0];
  check(
    metrics.visitors === null &&
      metrics.signups === null &&
      metrics.cost === null
  );
  const allocation = JSON.stringify([{ content_id: content.id, share: 1 }]);
  await db.query(
    "insert into public.gtm_costs(kind,description,currency,base_currency,incurred_amount,allocations) values('cash','KRW fixture','KRW','KRW',1000,$1::jsonb),('cash','USD fixture','USD','USD',10,$1::jsonb)",
    [allocation]
  );
  metrics = (await api("query", { sheet_id: performance.id })).rows[0];
  check(
    metrics.cost === null &&
      metrics.currency === "mixed" &&
      metrics.cost_per_completion === null
  );
  await db.exec("delete from public.gtm_costs where description='USD fixture'");
  metrics = (await api("query", { sheet_id: performance.id })).rows[0];
  check(metrics.cost === 1000 && metrics.currency === "KRW");
  await db.query(
    "insert into public.gtm_costs(kind,description,allocations) values('cash','Missing incurred fixture',$1::jsonb)",
    [allocation]
  );
  metrics = (await api("query", { sheet_id: performance.id })).rows[0];
  check(
    metrics.cost === null &&
      metrics.measurement_status.includes("비용 일부 누락")
  );
  await db.query(
    "insert into public.gtm_activities(entity,entity_id,kind,body) values('gtm_creators',$1,'message_sent','Isolated fixture only')",
    [creator.id]
  );
  const connected = catalog.sheets.find(
    (sheet) => sheet.definition.source === "connected"
  );
  const connectedRows = await api("query", { sheet_id: connected.id });
  check(
    connectedRows.rows.some(
      (row) => row.id === creator.id && row._creator_visitors === null
    )
  );
  await save(creators, { name: "Unscored" });
  const nullLast = await api("query", {
    sheet_id: creators.id,
    definition: { ...definition, filters: [] },
  });
  check(nullLast.rows[nullLast.rows.length - 1].outreach_score === null);
  // Exercise approval only in this isolated DB: no delivery worker/provider is connected.
  const reviewSheet = catalog.sheets.find(
    (sheet) => sheet.definition.source === "review"
  );
  const templates = catalog.sheets.find(
    (sheet) => sheet.definition.source === "templates"
  );
  const template = (
    await save(templates, {
      name: "Fixture email",
      status: "active",
      channel: "email",
      opening_template: "Hello fixture",
    })
  ).record;
  await db.query(
    "update public.gtm_creators set contacts=$1::jsonb where id=$2",
    [
      JSON.stringify([{ channel: "email", address: "recipient@example.test" }]),
      creator.id,
    ]
  );
  const dispatch = (
    await db.query(
      `insert into public.gtm_outreach_dispatches(creator_id,outreach_template_id,template_version,recipient_email,sender_email,subject,body,selection_reason,rfc_message_id,prepare_request_id,prepare_input_hash)
    values($1,$2,'fixture','recipient@example.test','sender@example.test','Original subject','Original body','Isolated fixture','<fixture@example.test>',$3,'fixture') returning *`,
      [creator.id, template.id, crypto.randomUUID()]
    )
  ).rows[0];
  const approval = {
    sheet_id: reviewSheet.id,
    record_id: dispatch.id,
    expected_version: dispatch.row_version,
    request_id: crypto.randomUUID(),
    decision: "approve",
    subject: "Reviewed subject",
    body: "검토한 본문\n두 번째 줄",
    scheduled_at: "2030-01-01T00:00:00Z",
  };
  await rejects(
    () => api("review_outreach", { ...approval, subject: "" }),
    /제목과 본문/
  );
  const approved = await api("review_outreach", approval);
  check(
    approved.status === "approved" &&
      approved.approved_by === "fixture@matchharper.com" &&
      approved.body === approval.body
  );
  assert.deepEqual(await api("review_outreach", approval), approved);
  assertions++;
  await rejects(
    () =>
      api("review_outreach", {
        ...approval,
        request_id: crypto.randomUUID(),
        decision: "revise",
      }),
    /version conflict/
  );
  const config = await api("save_sheet", {
    id: creators.id,
    name: "Team view",
    expected_version: creators.row_version,
    definition,
  });
  check(config.row_version === 2);
  await rejects(
    () =>
      api("save_sheet", {
        id: creators.id,
        name: "Stale",
        expected_version: 1,
        definition,
      }),
    /다른 팀원/
  );
  const clone = await api("save_sheet", { name: "Custom view", definition });
  check(clone.id !== creators.id);
  await api("delete_sheet", {
    id: clone.id,
    expected_version: clone.row_version,
  });
  check((await api("query", { sheet_id: creators.id })).total === 1);
  // End-to-end record workflow through the same API used by the browser and agents.
  const writeRecord = async (source, values, record) =>
    (
      await api("save_record", {
        source,
        values,
        record_id: record?.id,
        expected_version: record?.row_version,
        request_id: crypto.randomUUID(),
      })
    ).record;
  const changeItems = async (source, record, field, items) =>
    (
      await api("patch_items", {
        source,
        record_id: record.id,
        expected_version: record.row_version,
        field,
        items,
        request_id: crypto.randomUUID(),
      })
    ).record;
  let workflowCreator = await writeRecord("creators", {
    name: "워크플로 크리에이터",
  });
  const contactId = crypto.randomUUID();
  workflowCreator = await changeItems("creators", workflowCreator, "contacts", [
    {
      id: contactId,
      channel: "email",
      address: "workflow@example.test",
      source_ref: "https://example.test/profile",
      as_of: "2026-09-21T00:00:00Z",
    },
  ]);
  check(workflowCreator.contacts[0].id === contactId);
  const detail = await api("get_record", {
    source: "creators",
    record_id: workflowCreator.id,
  });
  check(
    detail.collections.some((item) => item.key === "contacts") &&
      detail.capabilities.prepare_outreach === true
  );
  const childRelation = detail.relations.find(
    (item) => item.source === "collaborations" && item.key === "creator_id"
  );
  check(childRelation.defaults.creator_id === workflowCreator.id);
  const workflowPlan = await writeRecord("plans", {
    name: "워크플로 집행",
    cash_budget: 100000,
  });
  const workflowCampaign = await writeRecord("campaigns", {
    name: "워크플로 캠페인",
  });
  let workflowCollab = await writeRecord("collaborations", {
    ...childRelation.defaults,
    title: "워크플로 협업",
    plan_id: workflowPlan.id,
  });
  const taskId = crypto.randomUUID();
  workflowCollab = await changeItems(
    "collaborations",
    workflowCollab,
    "action_items",
    [
      {
        id: taskId,
        text: "제작물 검토",
        owner_id: "테스트 팀원",
        due_at: "2026-01-01T00:00:00Z",
        status: "open",
      },
    ]
  );
  const queue = catalog.sheets.find(
    (sheet) => sheet.definition.source === "work_queue"
  );
  const queued = await api("query", { sheet_id: queue.id });
  check(
    queued.rows.some(
      (row) =>
        row.action_id === taskId &&
        row.record_id === workflowCollab.id &&
        row.record_source === "collaborations"
    )
  );
  const collabDetail = await api("get_record", {
    source: "collaborations",
    record_id: workflowCollab.id,
  });
  const contentRelation = collabDetail.relations.find(
    (item) => item.source === "contents" && item.key === "collaboration_id"
  );
  check(
    contentRelation.defaults.creator_id === workflowCreator.id &&
      contentRelation.defaults.plan_id === workflowPlan.id
  );
  let workflowContent = await writeRecord("contents", {
    ...contentRelation.defaults,
    title: "워크플로 콘텐츠",
    campaign_id: workflowCampaign.id,
  });
  const related = await api("related_records", {
    source: "collaborations",
    record_id: workflowCollab.id,
    target_source: "contents",
    key: "collaboration_id",
    limit: 1,
  });
  check(related.total === 1 && related.rows[0].id === workflowContent.id);
  await rejects(
    () =>
      api("related_records", {
        source: "collaborations",
        record_id: workflowCollab.id,
        target_source: "creators",
        key: "id",
      }),
    /Unknown record relation/
  );
  const linkInput = {
    source: "contents",
    record_id: workflowContent.id,
    expected_version: workflowContent.row_version,
    request_id: crypto.randomUUID(),
    values: {
      destination_url: "https://example.test/start",
      source: "creator",
      medium: "social",
      scope: "content",
    },
  };
  const linkResult = await api("issue_link", linkInput);
  check(
    linkResult.link.url.includes("utm_content=gtm_") &&
      linkResult.record.tracking_links.length === 1
  );
  assert.deepEqual(await api("issue_link", linkInput), linkResult);
  assertions++;
  workflowContent = await changeItems(
    "contents",
    linkResult.record,
    "asset_refs",
    [
      {
        id: crypto.randomUUID(),
        ref: "https://example.test/script",
        version: "1",
      },
    ]
  );
  const costRelation = collabDetail.relations.find(
    (item) => item.source === "costs" && item.key === "collaboration_id"
  );
  let workflowCost = await writeRecord("costs", {
    ...costRelation.defaults,
    description: "테스트 비용",
    kind: "cash",
    currency: "KRW",
    base_currency: "KRW",
    incurred_amount: 10000,
  });
  workflowCost = await changeItems("costs", workflowCost, "allocations", [
    { id: crypto.randomUUID(), content_id: workflowContent.id, share: 1 },
  ]);
  const paymentId = crypto.randomUUID();
  workflowCost = await changeItems("costs", workflowCost, "payments", [
    {
      id: paymentId,
      kind: "payment",
      amount: 10000,
      occurred_at: "2026-09-21T00:00:00Z",
      source_ref: "https://example.test/receipt",
    },
  ]);
  check(
    workflowCost.payments[0].amount === 10000 &&
      workflowCost.allocations[0].content_id === workflowContent.id
  );
  await rejects(
    () =>
      changeItems("costs", workflowCost, "payments", [
        { id: paymentId, amount: 99999 },
      ]),
    /Payments are immutable/
  );
  await api("log_activity", {
    source: "collaborations",
    record_id: workflowCollab.id,
    body: "제작 조건을 확인했습니다.",
    source_ref: "https://example.test/agreement",
    request_id: crypto.randomUUID(),
  });
  const history = await api("activity_history", {
    source: "collaborations",
    record_id: workflowCollab.id,
  });
  check(
    history.total === 1 && history.rows[0].body === "제작 조건을 확인했습니다."
  );
  const preparation = {
    source: "creators",
    record_id: workflowCreator.id,
    template_id: template.id,
    recipient_email: "workflow@example.test",
    subject: "검토할 제목",
    body: "검토할 실제 본문",
    selection_reason: "확인된 이메일 템플릿",
    request_id: crypto.randomUUID(),
  };
  const prepared = await api("prepare_outreach", preparation);
  check(
    prepared.status === "ready_for_review" &&
      prepared.approved_at === null &&
      prepared.body === preparation.body
  );
  assert.deepEqual(await api("prepare_outreach", preparation), prepared);
  assertions++;
  workflowCollab = await changeItems(
    "collaborations",
    workflowCollab,
    "action_items",
    [{ id: taskId, status: "done", completed_at: "2026-09-21T00:00:00Z" }]
  );
  check(
    !(await api("query", { sheet_id: queue.id })).rows.some(
      (row) => row.action_id === taskId
    )
  );
  await rejects(
    () =>
      api("patch_items", {
        source: "creators",
        record_id: workflowCreator.id,
        expected_version: workflowCreator.row_version,
        field: "tracking_links",
        items: [],
        request_id: crypto.randomUUID(),
      }),
    /Unknown child collection/
  );
  const archiveInput = {
    source: "creators",
    record_id: workflowCreator.id,
    expected_version: workflowCreator.row_version,
    request_id: crypto.randomUUID(),
  };
  await api("archive_record", archiveInput);
  check(
    (
      await api("get_record", {
        source: "creators",
        record_id: workflowCreator.id,
      })
    ).capabilities.write === false
  );
  await api("restore_record", {
    ...archiveInput,
    expected_version: (
      await api("get_record", {
        source: "creators",
        record_id: workflowCreator.id,
      })
    ).record.row_version,
    request_id: crypto.randomUUID(),
  });
  check(
    (
      await api("get_record", {
        source: "creators",
        record_id: workflowCreator.id,
      })
    ).capabilities.write === true
  );
  const decision = {
    source: "contents",
    record_id: workflowContent.id,
    body: "근거를 검토하고 다음 방향을 채택했습니다.",
    kind: "review_adopted",
    direction: "Retry",
    source_ref: "https://example.test/report",
    request_id: crypto.randomUUID(),
  };
  const adopted = await api("log_activity", decision);
  check(
    adopted.record.kind === "review_adopted" &&
      adopted.record.payload.direction === "Retry"
  );
  assert.deepEqual(await api("log_activity", decision), adopted);
  assertions++;
  const currentSelection = await api("reference_options", {
    source: "creators",
    search: "does-not-match",
    selected_id: workflowCreator.id,
  });
  check(currentSelection.options[0].label.includes("워크플로 크리에이터"));

  {
    // Manual composition uses the same exact-copy approval and delivery ledger.
    const emailInput = {
      record_id: workflowCreator.id,
      recipient_email: "workflow@example.test",
      subject: "직접 작성한 메일",
      body: "<h2>제안</h2><p><strong>굵게</strong> <u>밑줄</u></p>",
      request_id: crypto.randomUUID(),
    };
    const manual = await api("prepare_email", emailInput);
    check(
      manual.status === "ready_for_review" &&
        manual.outreach_template_id === null
    );
    check((await api("prepare_email", emailInput)).id === manual.id);
    await rejects(
      () => api("prepare_email", { ...emailInput, body: "different" }),
      /Idempotency/
    );
    await rejects(
      () =>
        api("prepare_email", {
          ...emailInput,
          recipient_email: "outsider@example.test",
          request_id: crypto.randomUUID(),
        }),
      /current email contact/
    );
    const reviewSheet = catalog.sheets.find(
      (s) => s.definition.source === "review"
    );
    check(
      (await api("query", { sheet_id: reviewSheet.id })).rows.some(
        (r) => r.id === manual.id
      )
    );
    const approved = await api("review_outreach", {
      source: "review",
      record_id: manual.id,
      expected_version: manual.row_version,
      decision: "approve",
      subject: manual.subject,
      body: manual.body,
      request_id: crypto.randomUUID(),
    });
    check(approved.status === "approved");
    const claims = (
      await db.query("select public.gtm_outreach_worker_claim($1,1) value", [
        manual.id,
      ])
    ).rows[0].value;
    check(
      claims.length === 1 &&
        claims[0].body === emailInput.body &&
        Boolean(claims[0].first_attempt_at)
    );
    check(
      (
        await db.query("select public.gtm_outreach_worker_claim($1,1) value", [
          manual.id,
        ])
      ).rows[0].value.length === 0
    );
    const providerId = crypto.randomUUID();
    const sent = (
      await db.query(
        "select public.gtm_outreach_worker_record_delivery($1,'resend',$2,'<manual@resend.test>') value",
        [manual.id, providerId]
      )
    ).rows[0].value;
    check(
      sent.status === "sent" &&
        sent.provider === "resend" &&
        sent.provider_thread_id === null
    );
    await db.query(
      "select public.gtm_outreach_worker_record_delivery($1,'resend',$2,'<manual@resend.test>')",
      [manual.id, providerId]
    );
    const received = (
      await db.query(`select public.gtm_outreach_ingest_gmail_reply('harper@matchharper.com','received-fixture','thread-fixture',
    'workflow@example.test','harper@matchharper.com','Re: 직접 작성한 메일','네, 이야기해봐요.',now(),'<reply@creator.test>','<manual@resend.test>','<manual@resend.test>') value`)
    ).rows[0].value;
    check(received.matched && received.notify_needed);
    const thread = await api("creator_conversation", {
      record_id: workflowCreator.id,
    });
    check(
      thread.messages.filter((m) => m.payload.dispatch_id === manual.id)
        .length === 2
    );
    check(
      thread.messages.some(
        (m) =>
          m.id === received.activity_id &&
          m.rfc_message_id === "<reply@creator.test>"
      )
    );
    const replyDraft = await api("prepare_email", {
      ...emailInput,
      reply_to_activity_id: received.activity_id,
      request_id: crypto.randomUUID(),
    });
    check(
      replyDraft.in_reply_to === "<reply@creator.test>" &&
        replyDraft.email_references.includes("<manual@resend.test>")
    );
    await rejects(
      () =>
        api("prepare_email", {
          ...emailInput,
          record_id: creator.id,
          recipient_email: "recipient@example.test",
          reply_to_activity_id: received.activity_id,
          request_id: crypto.randomUUID(),
        }),
      /Reply must belong|Reply recipient differs/
    );
    check(
      (
        await db.query(
          "select public.gtm_outreach_pending_reply_notifications() value"
        )
      ).rows[0].value.some((r) => r.activity_id === received.activity_id)
    );
    await db.query(
      "insert into public.gtm_outreach_mailboxes(email) values('mailbox@example.test')"
    );
    const lease = crypto.randomUUID();
    const otherLease = crypto.randomUUID();
    const claimNotifications = async (id) =>
      (
        await db.query(
          "select public.gtm_outreach_claim_notifications('mailbox@example.test',$1) value",
          [id]
        )
      ).rows[0].value;
    check((await claimNotifications(lease)).claimed);
    check(!(await claimNotifications(otherLease)).claimed);
    await db.query(
      "select public.gtm_outreach_release_notifications('mailbox@example.test',$1,null)",
      [otherLease]
    );
    check(!(await claimNotifications(otherLease)).claimed);
    await db.query(
      "select public.gtm_outreach_release_notifications('mailbox@example.test',$1,'Slack temporarily unavailable')",
      [lease]
    );
    check((await claimNotifications(otherLease)).claimed);
    await db.query(
      "select public.gtm_outreach_release_notifications('mailbox@example.test',$1,null)",
      [otherLease]
    );
    await db.query(
      "select public.gtm_outreach_record_slack_notification($1,'fixture-channel','123.45')",
      [received.activity_id]
    );
    check(
      !(
        await db.query(
          "select public.gtm_outreach_pending_reply_notifications() value"
        )
      ).rows[0].value.some((r) => r.activity_id === received.activity_id)
    );
    const resendFallback = await api("prepare_email", {
      ...emailInput,
      request_id: crypto.randomUUID(),
    });
    await api("review_outreach", {
      source: "review",
      record_id: resendFallback.id,
      expected_version: resendFallback.row_version,
      decision: "approve",
      subject: resendFallback.subject,
      body: resendFallback.body,
      request_id: crypto.randomUUID(),
    });
    await db.query("select public.gtm_outreach_worker_claim($1,1)", [
      resendFallback.id,
    ]);
    const fallbackId = crypto.randomUUID();
    const fallbackSent = (
      await db.query(
        "select public.gtm_outreach_worker_mark_sent($1,$2,$2) value",
        [resendFallback.id, fallbackId]
      )
    ).rows[0].value;
    check(
      fallbackSent.provider === "resend" &&
        fallbackSent.provider_rfc_message_id === null &&
        fallbackSent.provider_thread_id === null
    );
    await api("review_outreach", {
      source: "review",
      record_id: replyDraft.id,
      expected_version: replyDraft.row_version,
      decision: "approve",
      subject: replyDraft.subject,
      body: replyDraft.body,
      request_id: crypto.randomUUID(),
    });
    await db.query("select public.gtm_outreach_worker_claim($1,1)", [
      replyDraft.id,
    ]);
    await db.query(
      "select public.gtm_outreach_worker_mark_failed($1,'uncertain provider response',true)",
      [replyDraft.id]
    );
    const attempted = (
      await api("get_record", { source: "review", record_id: replyDraft.id })
    ).record;
    await rejects(
      () =>
        api("review_outreach", {
          source: "review",
          record_id: attempted.id,
          expected_version: attempted.row_version,
          decision: "approve",
          subject: attempted.subject,
          body: "changed after send attempt",
          request_id: crypto.randomUUID(),
        }),
      /attempted email cannot change/
    );
    await db.query(
      "update public.gtm_outreach_dispatches set status='approved',first_attempt_at=now()-interval '24 hours' where id=$1",
      [replyDraft.id]
    );
    check(
      (
        await db.query("select public.gtm_outreach_worker_claim($1,1) value", [
          replyDraft.id,
        ])
      ).rows[0].value.length === 0
    );
    check(
      (
        await api("get_record", { source: "review", record_id: replyDraft.id })
      ).record.last_error.includes("retry window expired")
    );
  }
  const bad = structuredClone(definition);
  bad.columns[0].key = "name'); delete from public.gtm_creators; --";
  await rejects(
    () => api("save_sheet", { name: "Bad", definition: bad }),
    /Unknown or duplicate column/
  );
  await rejects(
    () =>
      api("save_sheet", {
        name: "Bad",
        definition: { ...definition, source: "talent_users" },
      }),
    /registered GTM data source/
  );
  await rejects(
    () =>
      api("query", {
        sheet_id: creators.id,
        definition: { ...definition, source: "campaigns" },
      }),
    /Unknown or duplicate column|source cannot change/
  );
  check(
    (await db.query("select to_regclass('public.gtm_access_tokens') value"))
      .rows[0].value === null
  );
  check(
    (
      await db.query(
        "select to_regprocedure('public.gtm_workspace(text,jsonb,text)') value"
      )
    ).rows[0].value === null
  );
  await db.query(
    "update auth.users set email='outside@example.test' where id=$1",
    [uid]
  );
  await rejects(() => api("catalog"), /Internal GTM access/);
  await db.query(
    "update auth.users set email='fixture@matchharper.com',email_confirmed_at=null where id=$1",
    [uid]
  );
  await rejects(() => api("catalog"), /Internal GTM access/);
  await db.exec("set role anon");
  await rejects(
    () => db.query("select public.gtm_outreach_pending_reply_notifications()"),
    /permission denied/
  );
  await rejects(
    () => db.query("select * from gtm_view.sheets"),
    /permission denied/
  );
  await db.exec("reset role");
  console.log(
    `PASS ${assertions} workspace checks; all database changes stayed inside isolated PostgreSQL WASM.`
  );
} finally {
  await db.close();
}
