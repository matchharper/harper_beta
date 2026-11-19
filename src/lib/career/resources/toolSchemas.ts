export const str = { type: "string" },
  num = { type: "integer" };
export const resourceRefInput = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [
        "company",
        "company_workspace",
        "company_datum",
        "role",
        "posting",
        "web_resource",
        "observation",
        "document",
        "memory",
        "profile",
        "message",
        "email_message",
        "opportunity",
        "operation",
      ],
    },
    id: str,
    revision: str,
  },
  required: ["kind", "id"],
  additionalProperties: false,
};
export const refsInput = { type: "array", items: resourceRefInput };
export const selectorInput = {
  type: "object",
  properties: {
    itemIds: { type: "array", items: str },
    excludeItemIds: { type: "array", items: str },
    where: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: str,
          op: { type: "string", enum: ["eq", "in", "gte", "lte", "exists"] },
          value: { type: ["string", "number", "boolean", "array"], items: str },
        },
        required: ["field", "op"],
      },
    },
    orderBy: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: str,
          direction: { type: "string", enum: ["asc", "desc"] },
        },
        required: ["field", "direction"],
      },
    },
  },
  additionalProperties: false,
};
export const selectionInput = {
  type: "object",
  properties: {
    refs: refsInput,
    setId: str,
    revision: num,
    selector: selectorInput,
  },
  description:
    "Use either exact refs, or setId + immutable revision + optional selector. Selection is resolved on the server across every page.",
  additionalProperties: false,
};
export const criterionInput = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: str,
      type: { type: "string", enum: ["predicate", "choice", "score"] },
      instructions: str,
      choices: {
        type: "array",
        items: {
          type: "object",
          properties: { value: str, description: str },
          required: ["value"],
        },
      },
      levels: {
        type: "array",
        minItems: 2,
        maxItems: 10,
        items: {
          type: "object",
          properties: { label: str, description: str },
          required: ["label"],
        },
      },
    },
    required: ["name", "type", "instructions"],
    additionalProperties: false,
  },
};
export const viewDefinitionInput = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str,
          type: {
            type: "string",
            enum: ["narrative", "collection", "document", "activity"],
          },
          title: str,
          markdown: str,
          sourceRefs: refsInput,
          selection: selectionInput,
          layout: { type: "string", enum: ["list", "table"] },
          columns: { type: "array", items: str },
          ref: resourceRefInput,
          refs: refsInput,
          action: {
            type: "object",
            properties: { id: str, label: str, request: str },
            required: ["id", "label", "request"],
          },
        },
        required: ["id", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["blocks"],
  additionalProperties: false,
};
