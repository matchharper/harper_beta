import Exa from "exa-js";

export type ExaSearchClient = Pick<Exa, "search">;
export type ExaContentsClient = Pick<Exa, "getContents">;

let sharedExaClient: Exa | null = null;

export function getExaClient() {
  if (sharedExaClient) return sharedExaClient;

  const apiKey = String(process.env.EXA_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("EXA_API_KEY is not configured.");
  }

  sharedExaClient = new Exa(apiKey);
  return sharedExaClient;
}
