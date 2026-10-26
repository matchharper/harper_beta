export function scheduledSearchOptions(raw: unknown, roleId: string) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) throw new Error("Search arguments must be an object");
  const input=raw as Record<string,unknown>;
  if (input.roleId !== roleId) throw new Error("Scheduled request outside Role authority");
  const scope=input.scope??"unassessed", startStage=input.startStage??1;
  const recommendCount=input.recommendCount??10, limit=input.limit??5000;
  if(!["all","unassessed","new_members","evaluated"].includes(String(scope))||![1,2].includes(startStage as number)) throw new Error("Invalid scope/stage");
  if(!Number.isSafeInteger(limit)||Number(limit)<1||!Number.isSafeInteger(recommendCount)||Number(recommendCount)<0) throw new Error("Invalid counts");
  const counts=(input.recommendCounts??{companyFirst:recommendCount,talentFirst:recommendCount}) as Record<string,unknown>;
  if(!counts||typeof counts!=="object"||Array.isArray(counts)||Object.keys(counts).sort().join(",")!=="companyFirst,talentFirst"
    ||Object.values(counts).some(value=>!Number.isSafeInteger(value)||Number(value)<0)
    ||(recommendCount===0&&Object.values(counts).some(value=>value!==0))) throw new Error("Invalid direction counts");
  if(input.sourceRelation!==undefined&&input.sourceRelation!=="accepted") throw new Error("Invalid source relationship");
  if(input.talentIds!==undefined&&(!Array.isArray(input.talentIds)||!input.talentIds.length
    ||input.talentIds.some(value=>typeof value!=="string"||!/^[-0-9a-f]{36}$/i.test(value)))) throw new Error("Exact candidate IDs required");
  // Explicit allowlist: a model cannot forge root/origin/delegation metadata.
  return {roleId,scope,startStage,limit,recommendCount,recommendCounts:counts,
    ...(input.sourceRelation?{sourceRelation:input.sourceRelation}:{}),
    ...(input.talentIds?{talentIds:input.talentIds}:{}),
    ...(typeof input.reason==="string"?{reason:input.reason}:{})};
}

