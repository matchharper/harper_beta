import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  Clipboard,
  LoaderCircle,
  Play,
  TerminalSquare,
} from "lucide-react";
import {
  DebuggingPageShell,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/toast/toast";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  ORG_AGENT_DEBUG_TOOLS,
  ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS,
  isOrgAgentDebugToolName,
  type OpsOrgAgentToolDebugActor,
  type OpsOrgAgentToolDebugActorsResponse,
  type OpsOrgAgentToolDebugOptionsResponse,
  type OpsOrgAgentToolDebugRole,
  type OpsOrgAgentToolDebugRunResponse,
  type OpsOrgAgentToolDebugWorkspace,
  type OrgAgentDebugSurface,
  type OrgAgentDebugToolDefinition,
  type OrgAgentToolJsonSchema,
} from "@/lib/ops/orgAgentToolDebugger";

type ParameterDraft = Record<string, string | string[]>;
type ParameterMode = "form" | "json";
const UNSET_ROLE_ID = "__ops_unset_role_id__";

function includesSchemaType(schema: OrgAgentToolJsonSchema, type: string) {
  return Array.isArray(schema.type)
    ? schema.type.includes(type)
    : schema.type === type;
}

function createParameterDraft(tool: OrgAgentDebugToolDefinition) {
  return Object.fromEntries(
    Object.entries(tool.parameters.properties ?? {}).map(([key, schema]) => [
      key,
      includesSchemaType(schema, "array") ? [] : "",
    ])
  ) as ParameterDraft;
}

function buildInputFromDraft(
  tool: OrgAgentDebugToolDefinition,
  draft: ParameterDraft
) {
  const input: Record<string, unknown> = {};
  const required = new Set(tool.parameters.required ?? []);

  for (const [key, schema] of Object.entries(
    tool.parameters.properties ?? {}
  )) {
    const value = draft[key];
    if (includesSchemaType(schema, "array")) {
      const arrayValue = Array.isArray(value)
        ? value
        : String(value ?? "")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
      if (arrayValue.length > 0 || required.has(key)) input[key] = arrayValue;
      continue;
    }

    const stringValue = String(value ?? "").trim();
    if (!stringValue) {
      if (required.has(key)) throw new Error(`${key} 값을 입력해 주세요.`);
      continue;
    }
    if (includesSchemaType(schema, "boolean")) {
      input[key] = stringValue === "true";
    } else if (
      includesSchemaType(schema, "integer") ||
      includesSchemaType(schema, "number")
    ) {
      const numberValue = Number(stringValue);
      if (!Number.isFinite(numberValue)) {
        throw new Error(`${key}는 숫자여야 합니다.`);
      }
      input[key] = numberValue;
    } else {
      input[key] = stringValue;
    }
  }
  return input;
}

function workspaceOptionLabel(workspace: OpsOrgAgentToolDebugWorkspace) {
  return `${workspace.companyName} · ${workspace.workspaceId.slice(0, 8)}`;
}

function actorOptionLabel(actor: OpsOrgAgentToolDebugActor) {
  const identity = actor.name || actor.email || actor.userId;
  return `${identity} · ${actor.authority}`;
}

function roleOptionLabel(role: OpsOrgAgentToolDebugRole) {
  const status = role.status ? ` · ${role.status}` : "";
  return `${role.name}${status} · ${role.roleId.slice(0, 8)}`;
}

function ParameterField({
  field,
  onChange,
  required,
  roles,
  schema,
  value,
}: {
  field: string;
  onChange: (value: string | string[]) => void;
  required: boolean;
  roles: OpsOrgAgentToolDebugRole[];
  schema: OrgAgentToolJsonSchema;
  value: string | string[] | undefined;
}) {
  const id = `org-agent-tool-${field}`;
  const enumValues = schema.enum ?? [];
  const arrayEnumValues = schema.items?.enum ?? [];
  const label = (
    <div className="flex items-center gap-1.5">
      <span>{field}</span>
      {required ? <span className="text-critical">필수</span> : null}
      <span className="font-normal text-neutral-soft">
        {Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type}
      </span>
    </div>
  );

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={id}
        className="text-[13px] font-medium text-neutral-primary"
      >
        {label}
      </label>
      {field === "roleId" ? (
        <Select
          value={
            String(value ?? "") ||
            (!required && roles.length > 0 ? UNSET_ROLE_ID : null)
          }
          onValueChange={(nextValue) =>
            onChange(nextValue === UNSET_ROLE_ID ? "" : String(nextValue ?? ""))
          }
          disabled={roles.length === 0}
        >
          <SelectTrigger id={id}>
            <SelectValue
              placeholder={
                roles.length > 0 ? "Role 선택" : "선택 가능한 Role 없음"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {!required ? (
                <SelectItem value={UNSET_ROLE_ID}>선택 안 함</SelectItem>
              ) : null}
              {roles.map((role) => (
                <SelectItem key={role.roleId} value={role.roleId}>
                  {roleOptionLabel(role)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : includesSchemaType(schema, "array") && arrayEnumValues.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-2.5">
          {arrayEnumValues.map((item) => {
            const selected = Array.isArray(value) && value.includes(item);
            return (
              <Checkbox
                key={item}
                checked={selected}
                onChange={(event) => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(
                    event.target.checked
                      ? [...current, item]
                      : current.filter((currentItem) => currentItem !== item)
                  );
                }}
                label={item}
                size="medium"
              />
            );
          })}
        </div>
      ) : includesSchemaType(schema, "array") ? (
        <Textarea
          id={id}
          rows={3}
          value={Array.isArray(value) ? value.join("\n") : String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder="한 줄에 하나씩 입력"
          className="min-h-[88px] font-mono text-xs"
        />
      ) : enumValues.length > 0 ? (
        <Select
          value={String(value ?? "") || null}
          onValueChange={(nextValue) => onChange(String(nextValue ?? ""))}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="선택 안 함" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {enumValues.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : includesSchemaType(schema, "boolean") ? (
        <Select
          value={String(value ?? "") || null}
          onValueChange={(nextValue) => onChange(String(nextValue ?? ""))}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="기본값 사용" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={
            includesSchemaType(schema, "integer") ||
            includesSchemaType(schema, "number")
              ? "number"
              : "text"
          }
          min={schema.minimum}
          max={schema.maximum}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={required ? `${field} 입력` : "선택 사항"}
          className={
            field.toLowerCase().includes("id") ? "font-mono text-xs" : ""
          }
        />
      )}
      {field === "roleId" && value ? (
        <div className="break-all font-mono text-[11px] text-neutral-soft">
          {value}
        </div>
      ) : null}
      {schema.description ? (
        <p className="text-xs leading-5 text-neutral-muted">
          {schema.description}
        </p>
      ) : null}
    </div>
  );
}

function ExactOutput({
  icon,
  label,
  onCopy,
  placeholder,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  onCopy: () => void;
  placeholder: string;
  value: string | null | undefined;
}) {
  return (
    <section className={cx(opsTheme.panel, "min-w-0 overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-primary">
          {icon}
          {label}
        </div>
        <MuteButton
          size="sm"
          variant="transparent"
          disabled={value === null || value === undefined}
          onClick={onCopy}
        >
          <Clipboard className="h-3.5 w-3.5" />
          복사
        </MuteButton>
      </div>
      {value !== null && value !== undefined ? (
        <pre className="max-h-[680px] min-h-[320px] overflow-auto whitespace-pre p-4 font-mono text-xs leading-5 text-neutral-primary">
          {value}
        </pre>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-neutral-soft">
          {placeholder}
        </div>
      )}
    </section>
  );
}

export default function OpsOrgAgentToolDebuggerPage() {
  const canFetch = useCanFetchInternal();
  const [workspaces, setWorkspaces] = useState<OpsOrgAgentToolDebugWorkspace[]>(
    []
  );
  const [actors, setActors] = useState<OpsOrgAgentToolDebugActor[]>([]);
  const [roles, setRoles] = useState<OpsOrgAgentToolDebugRole[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [actorId, setActorId] = useState("");
  const [toolName, setToolName] = useState(
    ORG_AGENT_DEBUG_TOOLS[0]?.name ?? "get_talents"
  );
  const [surface, setSurface] = useState<OrgAgentDebugSurface>("chat");
  const [slackThreadId, setSlackThreadId] = useState("");
  const [currentUserMessageId, setCurrentUserMessageId] = useState("");
  const [priorToolResultChars, setPriorToolResultChars] = useState("0");
  const [parameterMode, setParameterMode] = useState<ParameterMode>("form");
  const selectedTool = useMemo(
    () => ORG_AGENT_DEBUG_TOOLS.find((tool) => tool.name === toolName)!,
    [toolName]
  );
  const [draft, setDraft] = useState<ParameterDraft>(() =>
    createParameterDraft(selectedTool)
  );
  const [jsonInput, setJsonInput] = useState("{}");
  const [result, setResult] = useState<OpsOrgAgentToolDebugRunResponse | null>(
    null
  );
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingActors, setLoadingActors] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    fetchWithInternalAuth<OpsOrgAgentToolDebugOptionsResponse>(
      "/api/internal/debug/org-agent-tools"
    )
      .then((payload) => {
        if (cancelled) return;
        setWorkspaces(payload.workspaces);
        const firstWorkspaceId = payload.workspaces[0]?.workspaceId || "";
        setWorkspaceId((current) => current || firstWorkspaceId);
        if (firstWorkspaceId) setLoadingActors(true);
      })
      .catch((loadError) => {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "회사 목록을 불러오지 못했습니다."
          );
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetch]);

  useEffect(() => {
    if (!canFetch || !workspaceId) return;
    let cancelled = false;
    fetchWithInternalAuth<OpsOrgAgentToolDebugActorsResponse>(
      `/api/internal/debug/org-agent-tools?workspaceId=${encodeURIComponent(workspaceId)}`
    )
      .then((payload) => {
        if (cancelled) return;
        setActors(payload.actors);
        setRoles(payload.roles);
        setActorId(payload.actors[0]?.userId ?? "");
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActors([]);
          setRoles([]);
          setActorId("");
          setError(
            loadError instanceof Error
              ? loadError.message
              : "회사 actor를 불러오지 못했습니다."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingActors(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetch, workspaceId]);

  const workspaceOptions = useMemo(
    () => workspaces.map(workspaceOptionLabel),
    [workspaces]
  );
  const selectedWorkspaceLabel = useMemo(() => {
    const workspace = workspaces.find(
      (item) => item.workspaceId === workspaceId
    );
    return workspace ? workspaceOptionLabel(workspace) : "";
  }, [workspaceId, workspaces]);

  const copyExact = useCallback(
    async (value: string | null | undefined, label: string) => {
      if (value === null || value === undefined) return;
      try {
        await navigator.clipboard.writeText(value);
        showToast({
          message: `${label} 원문을 복사했습니다.`,
          variant: "white",
        });
      } catch {
        showToast({ message: "복사하지 못했습니다.", variant: "white" });
      }
    },
    []
  );

  const switchParameterMode = useCallback(
    (mode: ParameterMode) => {
      if (mode === "json" && parameterMode === "form") {
        try {
          setJsonInput(
            JSON.stringify(buildInputFromDraft(selectedTool, draft), null, 2)
          );
        } catch {
          setJsonInput("{}");
        }
      }
      setParameterMode(mode);
    },
    [draft, parameterMode, selectedTool]
  );

  const handleToolChange = useCallback(
    (value: unknown) => {
      if (!isOrgAgentDebugToolName(value) || value === toolName) return;
      const nextTool = ORG_AGENT_DEBUG_TOOLS.find(
        (tool) => tool.name === value
      );
      if (!nextTool) return;
      setToolName(value);
      setDraft(createParameterDraft(nextTool));
      setJsonInput("{}");
      setResult(null);
    },
    [toolName]
  );

  const handleRun = useCallback(async () => {
    setError("");
    setResult(null);
    if (!workspaceId) {
      setError("회사를 선택해 주세요.");
      return;
    }
    if (!actorId) {
      setError("실행할 회사 actor를 선택해 주세요.");
      return;
    }
    if (surface === "slack" && !slackThreadId.trim()) {
      setError("Slack 실행에는 slackThreadId가 필요합니다.");
      return;
    }

    let input: unknown;
    try {
      input =
        parameterMode === "json"
          ? JSON.parse(jsonInput)
          : buildInputFromDraft(selectedTool, draft);
    } catch (inputError) {
      setError(
        inputError instanceof Error
          ? inputError.message
          : "parameter를 확인해 주세요."
      );
      return;
    }

    setRunning(true);
    try {
      const payload =
        await fetchWithInternalAuth<OpsOrgAgentToolDebugRunResponse>(
          "/api/internal/debug/org-agent-tools",
          {
            body: JSON.stringify({
              actorId,
              currentUserMessageId: currentUserMessageId
                ? Number(currentUserMessageId)
                : null,
              input,
              priorToolResultChars: Number(priorToolResultChars || 0),
              slackThreadId: surface === "slack" ? slackThreadId.trim() : null,
              surface,
              toolName,
              workspaceId,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
      setResult(payload);
      if (!payload.ok) setError(payload.error || "Tool 실행에 실패했습니다.");
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Tool 실행에 실패했습니다."
      );
    } finally {
      setRunning(false);
    }
  }, [
    actorId,
    currentUserMessageId,
    draft,
    jsonInput,
    parameterMode,
    priorToolResultChars,
    selectedTool,
    slackThreadId,
    surface,
    toolName,
    workspaceId,
  ]);

  return (
    <DebuggingPageShell filters={null} tab="orgAgentTools">
      <div className="grid gap-3 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <section
          className={cx(opsTheme.panel, "self-start p-4 xl:sticky xl:top-3")}
        >
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-[13px] font-medium text-neutral-primary">
                회사 workspace
              </label>
              <Combobox
                items={workspaceOptions}
                open={workspaceOpen}
                onOpenChange={setWorkspaceOpen}
                value={selectedWorkspaceLabel || null}
                onValueChange={(nextValue) => {
                  const workspace = workspaces.find(
                    (item) => workspaceOptionLabel(item) === nextValue
                  );
                  const nextWorkspaceId = workspace?.workspaceId ?? "";
                  setWorkspaceId(nextWorkspaceId);
                  setActors([]);
                  setRoles([]);
                  setActorId("");
                  setDraft((current) => ({ ...current, roleId: "" }));
                  setLoadingActors(Boolean(nextWorkspaceId));
                  setResult(null);
                }}
              >
                <ComboboxInput
                  aria-label="회사 workspace"
                  disabled={loadingOptions}
                  placeholder={
                    loadingOptions ? "회사 목록 불러오는 중..." : "회사명 검색"
                  }
                  showClear={Boolean(workspaceId)}
                />
                <ComboboxContent>
                  <ComboboxEmpty>일치하는 workspace가 없습니다.</ComboboxEmpty>
                  <ComboboxList>
                    {(option) => (
                      <ComboboxItem key={option} value={option}>
                        {option}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {workspaceId ? (
                <div className="break-all font-mono text-[11px] text-neutral-soft">
                  {workspaceId}
                </div>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="org-agent-actor"
                className="text-[13px] font-medium text-neutral-primary"
              >
                회사 actor
              </label>
              <Select
                value={actorId || null}
                onValueChange={(value) => setActorId(String(value ?? ""))}
                disabled={loadingActors || actors.length === 0}
              >
                <SelectTrigger id="org-agent-actor">
                  <SelectValue
                    placeholder={
                      loadingActors ? "actor 불러오는 중..." : "actor 선택"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {actors.map((actor) => (
                      <SelectItem key={actor.userId} value={actor.userId}>
                        {actorOptionLabel(actor)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-neutral-muted">
                이 멤버의 실제 권한과 공개 범위로 실행합니다.
              </p>
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="org-agent-tool-name"
                className="text-[13px] font-medium text-neutral-primary"
              >
                Tool
              </label>
              <Select value={toolName} onValueChange={handleToolChange}>
                <SelectTrigger id="org-agent-tool-name">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ORG_AGENT_DEBUG_TOOLS.map((tool) => (
                      <SelectItem key={tool.name} value={tool.name}>
                        {tool.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="line-clamp-4 text-xs leading-5 text-neutral-muted">
                {selectedTool.description}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-neutral-1000-a05 pt-4">
              <div className="text-[13px] font-medium text-neutral-primary">
                Parameters
              </div>
              <div className="flex gap-1">
                <MuteButton
                  size="sm"
                  variant={parameterMode === "form" ? "neutral" : "transparent"}
                  aria-pressed={parameterMode === "form"}
                  onClick={() => switchParameterMode("form")}
                >
                  Form
                </MuteButton>
                <MuteButton
                  size="sm"
                  variant={parameterMode === "json" ? "neutral" : "transparent"}
                  aria-pressed={parameterMode === "json"}
                  onClick={() => switchParameterMode("json")}
                >
                  JSON
                </MuteButton>
              </div>
            </div>

            {parameterMode === "form" ? (
              Object.entries(selectedTool.parameters.properties ?? {}).map(
                ([field, schema]) => (
                  <ParameterField
                    key={field}
                    field={field}
                    roles={roles}
                    required={(selectedTool.parameters.required ?? []).includes(
                      field
                    )}
                    schema={schema}
                    value={draft[field]}
                    onChange={(value) =>
                      setDraft((current) => ({ ...current, [field]: value }))
                    }
                  />
                )
              )
            ) : (
              <div className="grid gap-1.5">
                <label
                  htmlFor="org-agent-json-input"
                  className="text-[13px] font-medium text-neutral-primary"
                >
                  Tool arguments JSON
                </label>
                <Textarea
                  id="org-agent-json-input"
                  rows={12}
                  value={jsonInput}
                  onChange={(event) => setJsonInput(event.target.value)}
                  className="min-h-[240px] font-mono text-xs"
                  spellCheck={false}
                />
              </div>
            )}

            <details className="rounded-md border border-neutral-1000-a05 bg-bg-weak px-3 py-2">
              <summary className="cursor-pointer text-[13px] font-medium text-neutral-primary">
                실행 컨텍스트·budget
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-1.5">
                  <label
                    htmlFor="org-agent-surface"
                    className="text-xs font-medium text-neutral-primary"
                  >
                    Surface
                  </label>
                  <Select
                    value={surface}
                    onValueChange={(value) =>
                      setSurface(value === "slack" ? "slack" : "chat")
                    }
                  >
                    <SelectTrigger id="org-agent-surface" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="chat">/org web chat</SelectItem>
                        <SelectItem value="slack">Slack</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                {surface === "slack" ? (
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="org-agent-slack-thread"
                      className="text-xs font-medium text-neutral-primary"
                    >
                      slackThreadId
                    </label>
                    <Input
                      id="org-agent-slack-thread"
                      value={slackThreadId}
                      onChange={(event) => setSlackThreadId(event.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <label
                    htmlFor="org-agent-current-message"
                    className="text-xs font-medium text-neutral-primary"
                  >
                    currentUserMessageId
                  </label>
                  <Input
                    id="org-agent-current-message"
                    type="number"
                    min={1}
                    value={currentUserMessageId}
                    onChange={(event) =>
                      setCurrentUserMessageId(event.target.value)
                    }
                    placeholder="비우면 최신 turn 경계"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor="org-agent-prior-result-chars"
                    className="text-xs font-medium text-neutral-primary"
                  >
                    앞선 tool result 글자 수
                  </label>
                  <Input
                    id="org-agent-prior-result-chars"
                    type="number"
                    min={0}
                    max={ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS}
                    value={priorToolResultChars}
                    onChange={(event) =>
                      setPriorToolResultChars(event.target.value)
                    }
                  />
                  <p className="text-[11px] leading-4 text-neutral-muted">
                    turn 전체{" "}
                    {ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS.toLocaleString()}자
                    budget에서 이미 사용한 길이입니다.
                  </p>
                </div>
              </div>
            </details>

            {error ? (
              <div
                className={cx(opsTheme.errorNotice, "flex items-start gap-2")}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            ) : null}

            <MuteButton
              variant="dark"
              size="lg"
              className="w-full"
              disabled={running || !workspaceId || !actorId}
              onClick={() => void handleRun()}
            >
              {running ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {running ? "실제 tool 실행 중..." : "Tool 실행"}
            </MuteButton>
            <p className="text-center text-[11px] leading-4 text-neutral-soft">
              조회·준비 tool만 제공합니다. 회사 데이터 변경, 후보 상태 변경,
              발송은 실행하지 않습니다.
            </p>
          </div>
        </section>

        <div className="min-w-0 space-y-3">
          {result ? (
            <div
              className={cx(
                result.ok ? opsTheme.successNotice : opsTheme.errorNotice,
                "flex flex-wrap items-center gap-x-4 gap-y-1"
              )}
            >
              {result.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{result.ok ? "실행 완료" : "runtime error 결과"}</span>
              <span>{result.durationMs.toLocaleString()}ms</span>
              <span>
                JSON {result.resultJson?.length.toLocaleString() ?? "-"}자 · LLM{" "}
                {result.budget.deliveredChars.toLocaleString()}자
              </span>
              {!result.budget.complete ? (
                <span>budget으로 전체 결과 미전달</span>
              ) : null}
              <span className="ml-auto font-mono text-[11px]">
                {result.actor.email || result.actor.userId}
              </span>
            </div>
          ) : null}
          <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
            <ExactOutput
              icon={<Braces className="h-4 w-4" />}
              label="1. 반환 JSON"
              value={result?.resultJson}
              placeholder="Tool을 실행하면 executeOrgAgentTool의 반환값을 JSON으로 표시합니다."
              onCopy={() => void copyExact(result?.resultJson, "반환 JSON")}
            />
            <ExactOutput
              icon={<TerminalSquare className="h-4 w-4" />}
              label="2. LLM에 들어가는 tool content"
              value={result?.llmText}
              placeholder="직렬화와 turn budget 처리를 마친 실제 tool message content가 표시됩니다."
              onCopy={() => void copyExact(result?.llmText, "LLM tool content")}
            />
          </div>
          {result ? (
            <div
              className={cx(
                opsTheme.panelSoft,
                "grid gap-2 px-4 py-3 text-xs text-neutral-muted sm:grid-cols-2 xl:grid-cols-4"
              )}
            >
              <div>
                <span className="block text-neutral-soft">conversation</span>
                <span className="break-all font-mono text-[11px] text-neutral-primary">
                  {result.context.conversationId ?? "ephemeral"}
                </span>
              </div>
              <div>
                <span className="block text-neutral-soft">
                  message boundary
                </span>
                <span className="font-mono text-neutral-primary">
                  {result.context.currentUserMessageId}
                </span>
              </div>
              <div>
                <span className="block text-neutral-soft">
                  serialized / delivered
                </span>
                <span className="font-mono text-neutral-primary">
                  {result.budget.serializedChars} /{" "}
                  {result.budget.deliveredChars}
                </span>
              </div>
              <div>
                <span className="block text-neutral-soft">
                  prior / max budget
                </span>
                <span className="font-mono text-neutral-primary">
                  {result.budget.priorToolResultChars} /{" "}
                  {result.budget.maxTotalChars}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </DebuggingPageShell>
  );
}
