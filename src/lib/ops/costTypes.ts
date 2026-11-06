export type OpsCostProviderId =
  | "claude"
  | "openai"
  | "openrouter"
  | "exa"
  | "ec2"
  | "browser-use"
  | "browserless"
  | "vercel"
  | "supabase";

export type OpsCreditProviderId = "openrouter" | "aws" | "browser-use";

export type OpsCostSourceStatus =
  | "ok"
  | "not_configured"
  | "unavailable"
  | "error";

export type OpsDailyCostPoint = {
  amount: number;
  date: string;
};

export type OpsCostBreakdownItem = {
  label: string;
  points: OpsDailyCostPoint[];
  total: number;
};

export type OpsCostProviderResult = {
  breakdown?: OpsCostBreakdownItem[];
  currency: "USD";
  dashboardUrl?: string;
  id: OpsCostProviderId;
  label: string;
  message: string | null;
  netPoints?: OpsDailyCostPoint[];
  netTotal?: number;
  points: OpsDailyCostPoint[];
  status: OpsCostSourceStatus;
  total: number | null;
  totalLabel?: string;
  usage?: {
    from: string;
    through: string;
    plan: string;
    used: number;
    included: number;
    remaining: number;
  };
};

export type OpsCreditAmount = {
  amount: number;
  currency: string;
  currentPeriodUsedAmount?: number;
  grantedAmount?: number;
  toppedUpAmount?: number;
};

export type OpsCreditItem = {
  amount: number;
  currency: string;
  expiresAt: string | null;
  label: string;
};

export type OpsCreditProviderResult = {
  amounts: OpsCreditAmount[];
  id: OpsCreditProviderId;
  items: OpsCreditItem[];
  label: string;
  message: string | null;
  status: OpsCostSourceStatus;
};

export type OpsCostResponse = {
  costs: OpsCostProviderResult[];
  credits: OpsCreditProviderResult[];
  from: string;
  generatedAt: string;
  through: string;
  timezone: "UTC";
};
