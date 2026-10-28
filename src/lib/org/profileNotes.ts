export type ProfileEntityKind = "school" | "company";

export type ProfileEntityRef = { kind: ProfileEntityKind; name: string };

/** Key of one note in the API response: the kind and the name as shown. */
export function profileEntityKey(entity: ProfileEntityRef) {
  return `${entity.kind}:${entity.name.trim()}`;
}
