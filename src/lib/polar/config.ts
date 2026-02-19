export type PolarServer = "production" | "sandbox";
export type PolarPlanKey = "pro" | "max";
export type PolarBilling = "monthly" | "yearly";
export type PolarProductProfile = "live" | "test-monthly";

// Billing provider is fixed to Polar for current rollout.
export const BILLING_PROVIDER = "polar" as const;

// Current testing mode.
export const POLAR_SERVER: PolarServer = "sandbox";
export const POLAR_PRODUCT_PROFILE: PolarProductProfile = "test-monthly";
export const POLAR_SUCCESS_URL =
  "https://matchharper.com/billing/success?checkout_id={CHECKOUT_ID}";

export const POLAR_PRODUCT_IDS = {
  live: {
    pro: {
      monthly: "db35ecfc-3989-41b1-a777-14a08b70944e",
      yearly: "b7dfe79f-2241-4621-9d03-21a4fe61c566",
    },
    max: {
      monthly: "60bacd4f-8db6-4b28-ba77-ec6de9c796b1",
      yearly: "9273370e-f8b7-419d-a11e-c7c0ff234b30",
    },
  },
  "test-monthly": {
    pro: {
      monthly: "48e589dc-469a-46b2-8922-a7a7bd9de650",
      yearly: null,
    },
    max: {
      monthly: "9ef3847a-2fd5-40cc-8d07-beb2e9d8c9b3",
      yearly: null,
    },
  },
} as const;

export const POLAR_CHECKOUT_LINKS = {
  live: {
    proMonthly:
      "https://buy.polar.sh/polar_cl_U3hWdYVFL2S1GsFqOg7bZtOGJCWS97NIE6V223TrytJ",
    maxMonthly:
      "https://buy.polar.sh/polar_cl_NjoN3e81XW80w40Mc34cfVigjtQDNEHK3wzuc1ggZw6",
    proYearly:
      "https://buy.polar.sh/polar_cl_bDDj1gWXXHSFSlQOVF2dRNsy7ji4dP9o2s1S71m6UTR",
    maxYearly:
      "https://buy.polar.sh/polar_cl_1wPitO40nKOG72egIA0fEhm3JUOTCRCtfoJdd3EbJQj",
  },
  "test-monthly": {
    proMonthly:
      "https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_oEDGMrvs6pTPHgAwGcP6dg46mvMpttKwVXpbX1twtnX/redirect",
    maxMonthly:
      "https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_f8AML9Tsxfl7b3lbfkZV9KhdkaISwnVjoILXp18ahoB/redirect",
  },
} as const;

export function getPolarProductId(
  planKey: PolarPlanKey,
  billing: PolarBilling
): string | null {
  if (POLAR_PRODUCT_PROFILE === "test-monthly") {
    if (billing !== "monthly") return null;
    return POLAR_PRODUCT_IDS["test-monthly"][planKey].monthly;
  }

  return POLAR_PRODUCT_IDS.live[planKey][billing];
}
