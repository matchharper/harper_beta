/** Validate the machine contract, not the meaning or wording of a contact. */
export function validateCompanyContactContext(value: unknown) {
  if (typeof value !== "string") throw new Error("requestContext must be text");
  const context = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!context) throw new Error("requestContext is required");
  if (context.length > 800)
    throw new Error("requestContext exceeds 800 characters");
  return context;
}
