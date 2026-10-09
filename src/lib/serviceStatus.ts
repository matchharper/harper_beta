// Set only after the Harper status page has been created and verified.
export const SERVICE_STATUS_PAGE_URL =
  process.env.NEXT_PUBLIC_HARPER_STATUS_PAGE_URL?.trim() ?? "";

export type ServiceStatus = "operational" | "incident" | "maintenance" | "unknown";

export type ServiceStatusResponse = {
  status: ServiceStatus;
};
