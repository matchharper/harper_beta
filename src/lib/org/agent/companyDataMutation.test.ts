import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCompanyDataProposalSnapshotUnchanged,
  buildCompanyAgentEventContent,
  CompanyDataMutationError,
  mergeCompanyDataProposalRevision,
  parseCompanyDataChanges,
  resolveCompanyDataMutation,
  type CompanyDataSnapshot,
  type ResolvedCompanyDataChange,
} from "@/lib/org/agent/companyDataMutation";

function snapshot(values: Record<string, unknown>): CompanyDataSnapshot {
  return new Map(
    Object.entries(values).map(([key, value]) => [
      key,
      { expected: value ?? null, value },
    ])
  );
}

test("role request appends hard and preferred criteria without classifying legacy text", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "role_request",
        kind: "append",
        roleId: "role-1",
        section: "preferred_criteria",
        value: "B2B SaaS 경험",
      },
      {
        key: "role_request",
        kind: "append",
        roleId: "role-1",
        section: "hard_constraints",
        value: "서울 주 3일 출근 가능",
      },
    ],
    summary: "Backend Engineer 기준 수정",
  });
  const result = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => false,
    snapshot: snapshot({ "role_request:role-1": "기존 자유 형식 기준" }),
  });

  assert.equal(result.changes.length, 1);
  assert.equal(result.confirmationRequired, true);
  assert.equal(
    result.changes[0].value,
    [
      "## Hard constraints",
      "",
      "- 서울 주 3일 출근 가능",
      "",
      "## Preferred criteria",
      "",
      "- B2B SaaS 경험",
      "",
      "## Legacy notes — unclassified",
      "",
      "기존 자유 형식 기준",
    ].join("\n")
  );
  assert.match(result.changes[0].preview, /\+ ## Hard constraints/);
  assert.match(result.changes[0].preview, /\+ ## Preferred criteria/);
  assert.match(result.changes[0].preview, /\+ ## Legacy notes — unclassified/);
});

test("role request append preview shows the normalized bullet that is actually stored", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "role_request",
        kind: "append",
        roleId: "role-1",
        section: "hard_constraints",
        value: "- 5년\n- B2B",
      },
    ],
    summary: "채용 기준 추가",
  });
  const result = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => false,
    snapshot: snapshot({ "role_request:role-1": "기존 자유 형식 기준" }),
  });

  assert.match(result.changes[0].value as string, /- 5년 - B2B/);
  assert.match(result.changes[0].preview, /\+ - 5년 - B2B/);
  assert.doesNotMatch(result.changes[0].preview, /^\+ - B2B$/m);
});

test("replace requires one exact match", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      { key: "pitch", kind: "replace", oldValue: "10명", value: "18명" },
    ],
    summary: "팀 규모 수정",
  });
  assert.throws(
    () =>
      resolveCompanyDataMutation({
        ...parsed,
        isComplete: () => false,
        snapshot: snapshot({ "pitch:workspace": "10명, 개발팀 10명" }),
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "replace_match_error"
  );
});

test("exact replace keeps a legacy role request free-form", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "role_request",
        kind: "replace",
        oldValue: "3년 이상",
        roleId: "role-1",
        value: "5\u0000년 이상",
      },
    ],
    summary: "경력 기준 수정",
  });
  const result = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => false,
    snapshot: snapshot({
      "role_request:role-1": "백엔드 경력 3년 이상, B2B 경험 우대",
    }),
  });

  assert.equal(result.changes[0].value, "백엔드 경력 5년 이상, B2B 경험 우대");
  assert.doesNotMatch(result.changes[0].value as string, /## Hard constraints/);
  assert.match(result.changes[0].preview, /\+ 5년 이상/);
  assert.doesNotMatch(result.changes[0].preview, /\u0000/);
});

test("exact replace cannot remove headings from an already canonical role request", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "role_request",
        kind: "replace",
        oldValue: "## Preferred criteria",
        roleId: "role-1",
        value: "우대 조건",
      },
    ],
    summary: "채용 기준 수정",
  });
  assert.throws(
    () =>
      resolveCompanyDataMutation({
        ...parsed,
        isComplete: () => false,
        snapshot: snapshot({
          "role_request:role-1": [
            "## Hard constraints",
            "",
            "- 5년 이상",
            "",
            "## Preferred criteria",
            "",
            "- B2B 경험",
          ].join("\n"),
        }),
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "invalid_request_format"
  );
});

test("long text rewrite is blocked until the complete current value was read", () => {
  const parsed = parseCompanyDataChanges({
    changes: [{ key: "pitch", kind: "rewrite", value: "새 피치" }],
    summary: "피치 재작성",
  });
  assert.throws(
    () =>
      resolveCompanyDataMutation({
        ...parsed,
        isComplete: () => false,
        snapshot: snapshot({ "pitch:workspace": "기존 피치" }),
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "complete_read_required"
  );
});

test("role request rewrite requires both canonical headings", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "role_request",
        kind: "rewrite",
        roleId: "role-1",
        value: "필수: 5년",
      },
    ],
    summary: "채용 기준 재작성",
  });
  assert.throws(
    () =>
      resolveCompanyDataMutation({
        ...parsed,
        isComplete: () => true,
        snapshot: snapshot({ "role_request:role-1": "기존 기준" }),
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "invalid_request_format"
  );
});

test("employee range is validated after all batch operations", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      { key: "employee_count_start", kind: "rewrite", value: 50 },
      { key: "employee_count_end", kind: "rewrite", value: 20 },
    ],
    summary: "직원 수 범위 수정",
  });
  assert.throws(
    () =>
      resolveCompanyDataMutation({
        ...parsed,
        isComplete: () => true,
        snapshot: snapshot({
          "employee_count_end:workspace": 100,
          "employee_count_start:workspace": 10,
        }),
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "invalid_employee_range"
  );
});

test("unchanged changes resolve to a no-op batch", () => {
  const parsed = parseCompanyDataChanges({
    changes: [{ key: "founded_year", kind: "rewrite", value: 2021 }],
    summary: "설립 연도 확인",
  });
  const result = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => true,
    snapshot: snapshot({ "founded_year:workspace": 2021 }),
  });
  assert.deepEqual(result.changes, []);
  assert.equal(result.confirmationRequired, false);
});

test("employment types preserve company-specific labels", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "role_employment_types",
        kind: "rewrite",
        roleId: "role-1",
        value: ["full_time", "freelance", "프로젝트 계약"],
      },
    ],
    summary: "고용 형태 수정",
  });
  const result = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => true,
    snapshot: snapshot({ "role_employment_types:role-1": ["full_time"] }),
  });

  assert.deepEqual(result.changes[0]?.value, [
    "full_time",
    "freelance",
    "프로젝트 계약",
  ]);
});

test("a mirrored physical value drift is not treated as a logical no-op", () => {
  const parsed = parseCompanyDataChanges({
    changes: [{ key: "company_description", kind: "rewrite", value: null }],
    summary: "회사 소개 동기화",
  });
  const physicalSnapshot: CompanyDataSnapshot = new Map([
    [
      "company_description:workspace",
      {
        expected_physical: { company_db: "오래된 소개", workspace: null },
        value: null,
      },
    ],
  ]);
  const result = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => true,
    snapshot: physicalSnapshot,
  });

  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.changes[0].expected_physical, {
    company_db: "오래된 소개",
    workspace: null,
  });
  assert.equal(result.changes[0].value, null);
});

test("proposal revision detects database changes against the original expectation", () => {
  const base: ResolvedCompanyDataChange = {
    expected: "원래 값",
    key: "workspace_memory",
    preview: "[전체 수정] 회사 메모\n- 원래 값\n+ 제안 값",
    role_id: null,
    value: "제안 값",
  };
  assert.doesNotThrow(() =>
    assertCompanyDataProposalSnapshotUnchanged({
      changes: [base],
      snapshot: snapshot({ "workspace_memory:workspace": "원래 값" }),
    })
  );
  assert.throws(
    () =>
      assertCompanyDataProposalSnapshotUnchanged({
        changes: [base],
        snapshot: snapshot({
          "workspace_memory:workspace": "다른 사용자가 바꾼 값",
        }),
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "stale_base_proposal"
  );
});

test("proposal physical expectations compare values independent of JSON key order", () => {
  assert.doesNotThrow(() =>
    assertCompanyDataProposalSnapshotUnchanged({
      changes: [
        {
          expected_physical: { workspace: "A", company_db: "DB 소개" },
          key: "company_description",
          preview: "[전체 수정] 회사 소개\n- A\n+ B",
          role_id: null,
          value: "B",
        },
      ],
      snapshot: new Map([
        [
          "company_description:workspace",
          {
            expected_physical: { company_db: "DB 소개", workspace: "A" },
            value: "A",
          },
        ],
      ]),
    })
  );
});

test("proposal revision preserves inherited previews and original expectations", () => {
  const largeInheritedValue = "x".repeat(8_000);
  const baseChanges: ResolvedCompanyDataChange[] = [
    {
      expected: "기존 기준",
      key: "role_request",
      preview: "[부분 수정] Backend · 채용 기준\n- 3년\n+ 5년",
      role_id: "role-1",
      value: largeInheritedValue,
    },
    {
      expected: "기존 메모",
      key: "workspace_memory",
      preview: "[추가] 회사 메모\n+ 첫 제안",
      role_id: null,
      value: "기존 메모\n\n첫 제안",
    },
  ];
  const revisedChanges: ResolvedCompanyDataChange[] = [
    {
      expected: "기존 메모\n\n첫 제안",
      key: "workspace_memory",
      preview: "이 미리보기는 재사용되면 안 됨",
      role_id: null,
      value: "기존 메모\n\n수정 제안",
    },
  ];
  const merged = mergeCompanyDataProposalRevision({
    baseChanges,
    revisedChanges,
    roleNamesById: { "role-1": "Backend" },
  });

  assert.equal(merged.changes.length, 2);
  assert.equal(merged.changes[0].preview, baseChanges[0].preview);
  assert.equal(
    "expected" in merged.changes[1] ? merged.changes[1].expected : undefined,
    "기존 메모"
  );
  assert.match(merged.changes[1].preview, /\+ 수정 제안/);
  assert.doesNotMatch(merged.changes[1].preview, /첫 제안/);
  assert.equal(merged.preview.includes(largeInheritedValue), false);
  assert.match(merged.summary, /Backend · 채용 기준/);
  assert.match(merged.summary, /회사 메모/);
  const eventContent = buildCompanyAgentEventContent({
    actorLabel: "김채용",
    summary: merged.summary,
  });
  assert.match(eventContent, /Backend · 채용 기준/);
  assert.match(eventContent, /회사 메모/);
});

test("proposal revision preserves original mirrored expectations", () => {
  const merged = mergeCompanyDataProposalRevision({
    baseChanges: [
      {
        expected_physical: { company_db: "DB 소개", workspace: "A" },
        key: "company_description",
        preview: "[전체 수정] 회사 소개\n- A\n+ B",
        role_id: null,
        value: "B",
      },
    ],
    revisedChanges: [
      {
        expected_physical: { company_db: "B", workspace: "B" },
        key: "company_description",
        preview: "임시 preview",
        role_id: null,
        value: "C",
      },
    ],
  });

  assert.deepEqual(
    "expected_physical" in merged.changes[0]
      ? merged.changes[0].expected_physical
      : undefined,
    {
      company_db: "DB 소개",
      workspace: "A",
    }
  );
  assert.match(merged.changes[0].preview, /- A/);
  assert.match(merged.changes[0].preview, /\+ C/);
});

test("proposal revision never truncates final target labels", () => {
  const longRoleName = "아주 긴 포지션 이름".repeat(20);
  assert.throws(
    () =>
      mergeCompanyDataProposalRevision({
        baseChanges: [
          {
            expected: "기존 기준",
            key: "role_request",
            preview: "[부분 수정] 채용 기준\n- 3년\n+ 5년",
            role_id: "role-1",
            value: "새 기준",
          },
        ],
        revisedChanges: [],
        roleNamesById: { "role-1": longRoleName },
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "smaller_operation_required"
  );
});

test("legacy proposal payloads without per-target previews must be recreated", () => {
  const legacyChange = {
    expected: "기존 메모",
    key: "workspace_memory",
    role_id: null,
    value: "새 메모",
  } as ResolvedCompanyDataChange;
  assert.throws(
    () =>
      mergeCompanyDataProposalRevision({
        baseChanges: [legacyChange],
        revisedChanges: [],
      }),
    (error: unknown) =>
      error instanceof CompanyDataMutationError &&
      error.code === "base_proposal_regeneration_required"
  );
});

test("clearing list fields normalizes to the empty logical array", () => {
  const parsed = parseCompanyDataChanges({
    changes: [
      { key: "investors", kind: "rewrite", value: null },
      { key: "related_links", kind: "rewrite", value: null },
    ],
    summary: "투자사와 관련 링크 삭제",
  });
  const result = resolveCompanyDataMutation({
    ...parsed,
    isComplete: () => true,
    snapshot: snapshot({
      "investors:workspace": ["Example Ventures"],
      "related_links:workspace": ["https://example.com/news"],
    }),
  });

  assert.deepEqual(
    result.changes.map((change) => [change.key, change.value]),
    [
      ["investors", []],
      ["related_links", []],
    ]
  );
});

test("append is idempotent for an existing text block and request bullet", () => {
  const pitch = parseCompanyDataChanges({
    changes: [{ key: "pitch", kind: "append", value: "원격 근무 가능" }],
    summary: "피치 문구 확인",
  });
  const pitchResult = resolveCompanyDataMutation({
    ...pitch,
    isComplete: () => false,
    snapshot: snapshot({
      "pitch:workspace": "빠르게 성장하는 팀\n\n원격 근무 가능",
    }),
  });
  assert.deepEqual(pitchResult.changes, []);

  const request = parseCompanyDataChanges({
    changes: [
      {
        key: "role_request",
        kind: "append",
        roleId: "role-1",
        section: "hard_constraints",
        value: "서울 주 3일 출근 가능",
      },
    ],
    summary: "채용 기준 확인",
  });
  const requestResult = resolveCompanyDataMutation({
    ...request,
    isComplete: () => false,
    snapshot: snapshot({
      "role_request:role-1": [
        "## Hard constraints",
        "",
        "- 서울 주 3일 출근 가능",
        "",
        "## Preferred criteria",
      ].join("\n"),
    }),
  });
  assert.deepEqual(requestResult.changes, []);
});

test("list decoding preserves slash, middle-dot, and pipe characters inside an item", async () => {
  const calls: Array<{ table: string }> = [];
  const terminal = (data: unknown) => ({
    data,
    error: null,
    eq() {
      return this;
    },
    in() {
      return this;
    },
    is() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data, error: null });
    },
    not() {
      return this;
    },
    or() {
      return Promise.resolve({ data, error: null });
    },
    select() {
      return this;
    },
    single() {
      return Promise.resolve({ data, error: null });
    },
  });
  const admin = {
    from(table: string) {
      calls.push({ table });
      if (table === "company_workspace") {
        return terminal({
          company_db_id: 1,
          company_description: null,
          company_name: "Test",
          company_workspace_id: "workspace-1",
        });
      }
      if (table === "company_db") {
        return terminal({
          description: "DB에 저장된 회사 소개",
          investors: "A|B Ventures",
          specialities: "UI/UX, B2B·SaaS",
        });
      }
      if (table === "company_data") return terminal(null);
      if (table === "company_memories") return terminal([]);
      return terminal([]);
    },
  };
  const { fetchCompanyDataSnapshot } =
    await import("@/lib/org/agent/companyDataMutation");
  const result = await fetchCompanyDataSnapshot({
    admin: admin as any,
    changes: [
      {
        key: "specialities",
        kind: "append",
        roleId: null,
        value: ["Developer tools"],
      },
      {
        key: "company_description",
        kind: "rewrite",
        roleId: null,
        value: "새 회사 소개",
      },
    ],
    workspaceId: "workspace-1",
  });
  assert.deepEqual(result.get("specialities:workspace")?.value, [
    "UI/UX",
    "B2B·SaaS",
  ]);
  assert.equal(result.get("company_description:workspace")?.value, null);
  assert.deepEqual(
    result.get("company_description:workspace")?.expected_physical,
    { company_db: "DB에 저장된 회사 소개", workspace: null }
  );
  assert.equal(
    calls.some((call) => call.table === "company_db"),
    true
  );
});
