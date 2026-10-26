type CareerFunctionToolSchema = {
  function: {
    description?: string;
    name: string;
    parameters: Record<string, unknown>;
  };
};

export function scopeCareerChatToolForOnboarding<
  T extends CareerFunctionToolSchema,
>(tool: T, isOnboardingActive: boolean): T {
  if (!isOnboardingActive || tool.function.name !== "update_talent_profile") {
    return tool;
  }

  const parameters = tool.function.parameters;
  const properties = parameters.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  ) {
    return tool;
  }

  const onboardingProperties = {
    ...(properties as Record<string, unknown>),
  };
  delete onboardingProperties.talentInsights;

  return {
    ...tool,
    function: {
      ...tool.function,
      description:
        tool.function.description,
      parameters: {
        ...parameters,
        properties: onboardingProperties,
      },
    },
  };
}
