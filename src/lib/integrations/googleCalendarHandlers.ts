import { NextRequest, NextResponse } from "next/server";
import {
  ComposioApiError,
  getIntegrationErrorDiagnostics,
  isComposioAccountId,
} from "./composio";
import type { GoogleCalendarService } from "./googleCalendar";
import { GoogleCalendarError } from "./googleCalendarError";
import {
  buildCalendarCallbackUrl,
  CALENDAR_OAUTH_COOKIE,
  CALENDAR_OAUTH_COOKIE_PATH,
  CALENDAR_OAUTH_TTL_SECONDS,
  encodeCalendarOAuthState,
  newCalendarOAuthNonce,
  verifyCalendarOAuthState,
} from "./googleCalendarOAuth";

type Operation =
  | "read_status"
  | "create_connect_link"
  | "complete_connection"
  | "disconnect";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function cookieOptions(req: NextRequest) {
  return {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: CALENDAR_OAUTH_COOKIE_PATH,
  };
}

function clearCookie(req: NextRequest, response: NextResponse) {
  response.cookies.set(CALENDAR_OAUTH_COOKIE, "", {
    ...cookieOptions(req),
    maxAge: 0,
  });
  return response;
}

function assertFields(
  value: unknown,
  allowed: string[]
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    throw new GoogleCalendarError(
      400,
      "INVALID_REQUEST",
      "올바르지 않은 연결 요청이에요."
    );
  }
}

function workspaceId(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new GoogleCalendarError(
      400,
      "INVALID_WORKSPACE",
      "Workspace를 선택한 뒤 다시 시도해 주세요."
    );
  }
  return value.trim();
}

async function readBody(req: NextRequest, allowed: string[]) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    throw new GoogleCalendarError(
      403,
      "INVALID_ORIGIN",
      "Harper 설정 화면에서 다시 시도해 주세요."
    );
  }
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new GoogleCalendarError(
      400,
      "INVALID_REQUEST",
      "올바르지 않은 연결 요청이에요."
    );
  }
  const body: unknown = await req.json().catch(() => null);
  assertFields(body, allowed);
  return body;
}

function errorResponse(operation: Operation, error: unknown) {
  // An unauthenticated status read can happen while the browser is completing
  // an auth redirect. It is an expected client state, not a server failure.
  const silentUnauthenticatedStatusRead =
    operation === "read_status" &&
    error instanceof GoogleCalendarError &&
    error.status === 401;
  if (!silentUnauthenticatedStatusRead) {
    console.error("[GoogleCalendarIntegration] failed", {
      stage: operation,
      ...getIntegrationErrorDiagnostics(error),
      ...(error instanceof GoogleCalendarError ? { code: error.code } : {}),
    });
  }
  if (error instanceof GoogleCalendarError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof ComposioApiError) {
    const configurationError =
      ["MISSING_ENV", "AUTH_CONFIG_DISABLED"].includes(
        String(error.details.code)
      ) || [401, 403].includes(error.status);
    const message = configurationError
      ? "Google Calendar 연결 설정을 확인해야 해요. Harper 팀에 문의해 주세요."
      : operation === "disconnect"
        ? "Harper의 접근은 차단했지만 외부 계정 연결 해제는 완료하지 못했어요. 연결 해제를 다시 시도해 주세요."
        : "Google Calendar 연결 서비스에 일시적으로 접근하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return json(
      {
        error: message,
        code: configurationError ? "CONFIGURATION_ERROR" : "VENDOR_UNAVAILABLE",
      },
      error.status === 504 ? 504 : 503
    );
  }
  return json(
    {
      code: "STORAGE_ERROR",
      error:
        operation === "complete_connection"
          ? "인증 결과를 Harper에 저장하지 못했어요. 이 화면에서 저장을 다시 시도해 주세요."
          : "Google Calendar 연결 상태를 저장하거나 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.",
    },
    500
  );
}

export function createGoogleCalendarHandlers(deps: {
  getContext(
    req: NextRequest,
    workspaceId: string
  ): Promise<{ userId: string; service: GoogleCalendarService }>;
  getStateSecret(): string;
}) {
  return {
    async GET(req: NextRequest) {
      try {
        const query = Object.fromEntries(req.nextUrl.searchParams);
        assertFields(query, ["workspaceId"]);
        const context = await deps.getContext(
          req,
          workspaceId(query.workspaceId)
        );
        return json(await context.service.getStatus(context.userId));
      } catch (error) {
        return errorResponse("read_status", error);
      }
    },
    async connect(req: NextRequest) {
      try {
        const body = await readBody(req, ["workspaceId"]);
        const workspace = workspaceId(body.workspaceId);
        const context = await deps.getContext(req, workspace);
        const secret = deps.getStateSecret();
        const nonce = newCalendarOAuthNonce();
        const result = await context.service.connect(
          context.userId,
          buildCalendarCallbackUrl(req.nextUrl.origin, workspace, nonce)
        );
        if (result.status === "active")
          return clearCookie(req, json({ status: "active" }));
        const response = json({
          status: "redirect",
          authorizeUrl: result.authorizeUrl,
        });
        response.cookies.set(
          CALENDAR_OAUTH_COOKIE,
          encodeCalendarOAuthState(
            {
              userId: context.userId,
              workspaceId: workspace,
              accountId: result.accountId,
              nonce,
            },
            secret
          ),
          { ...cookieOptions(req), maxAge: CALENDAR_OAUTH_TTL_SECONDS }
        );
        return response;
      } catch (error) {
        return errorResponse("create_connect_link", error);
      }
    },
    async complete(req: NextRequest) {
      try {
        const body = await readBody(req, [
          "workspaceId",
          "state",
          "connectedAccountId",
          "status",
        ]);
        const workspace = workspaceId(body.workspaceId);
        const context = await deps.getContext(req, workspace);
        if (
          typeof body.state !== "string" ||
          !["success", "failed"].includes(String(body.status))
        ) {
          throw new GoogleCalendarError(
            400,
            "INVALID_CALLBACK",
            "연결 결과를 확인하지 못했어요. Google Calendar를 다시 연결해 주세요."
          );
        }
        const state = verifyCalendarOAuthState({
          cookie: req.cookies.get(CALENDAR_OAUTH_COOKIE)?.value,
          nonce: body.state,
          userId: context.userId,
          workspaceId: workspace,
          secret: deps.getStateSecret(),
        });
        if (body.status === "failed")
          return clearCookie(req, json({ status: "cancelled" }));
        if (
          !isComposioAccountId(body.connectedAccountId) ||
          body.connectedAccountId !== state.accountId
        ) {
          throw new GoogleCalendarError(
            400,
            "ACCOUNT_ID_MISMATCH",
            "연결을 시작한 계정과 인증 결과가 일치하지 않아요. 다시 연결해 주세요."
          );
        }
        await context.service.complete(context.userId, state.accountId);
        return clearCookie(req, json({ status: "active" }));
      } catch (error) {
        // Keep the cookie on transient vendor/DB failures so saving can be retried.
        return errorResponse("complete_connection", error);
      }
    },
    async DELETE(req: NextRequest) {
      let authorized = false;
      try {
        const body = await readBody(req, ["workspaceId"]);
        const context = await deps.getContext(
          req,
          workspaceId(body.workspaceId)
        );
        authorized = true;
        await context.service.disconnect(context.userId);
        return clearCookie(req, json({ status: "not_connected" }));
      } catch (error) {
        const response = errorResponse("disconnect", error);
        return authorized ? clearCookie(req, response) : response;
      }
    },
  };
}
