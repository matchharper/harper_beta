export type OpsCostProviderId = "claude" | "openai" | "grok" | "exa" | "ec2";

export type OpsCreditProviderId = "deepseek" | "aws";

export type OpsCostSourceStatus = "ok" | "not_configured" | "error";

export type OpsDailyCostPoint = {
  amount: number;
  date: string;
};

export type OpsCostProviderResult = {
  currency: "USD";
  id: OpsCostProviderId;
  label: string;
  message: string | null;
  netPoints?: OpsDailyCostPoint[];
  netTotal?: number;
  points: OpsDailyCostPoint[];
  status: OpsCostSourceStatus;
  total: number;
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
