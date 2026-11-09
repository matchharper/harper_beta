import {
  isOrgAgentToolName,
  type OrgAgentToolName,
} from "@/lib/org/agent/tools";

const inputErrorBrand = Symbol.for("harper.orgAgentToolInputError");

export class OrgAgentToolInputError extends Error {
  readonly [inputErrorBrand] = true;

  // The receiver and dynamically loaded executors can load separate CJS/ESM
  // copies. A recoverable input error must retain its classification there.
  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error &&
      (value as unknown as Record<symbol, unknown>)[inputErrorBrand] === true;
  }
}

/** Must run before parsing input or touching application state. */
export function assertOrgAgentToolAvailable(name: OrgAgentToolName) {
  if (!isOrgAgentToolName(name)) {
    throw new OrgAgentToolInputError("This tool is not available");
  }
}
