export type MapComponent = {
  id: string;
  title: string;
  summary: string;
  text: string;
  source: string;
  kind: string;
  group: string;
  key?: string;
  cacheable?: boolean;
  inputType: string;
  members?: string[];
  when?: string;
  fixedPart?: string;
  dataPart?: string;
};
export type MapNode = {
  kind: string; title: string; mode?: string; prompt?: string;
  extra?: string[]; books?: string[]; tools?: string[]; directTools?: string[];
  note?: string; noTools?: boolean; eventData?: string;
};
export type MapScenario = {
  id: string; title: string; group: number; nodes: MapNode[];
  gate: string; source: string; commonBackground?: boolean;
};
export type MapCall = {
  rows: {id: string; label: string; child?: boolean}[];
  tools: string[]; mode: string; note: string; diff: string[];
  cacheEnds: string[];
  cacheToolNames: string[];
};
export type CareerLlmMap = {
  revision: string;
  captured: string;
  defaultModel: string;
  scheduledModel: string;
  components: Record<string, MapComponent>;
  plans: Record<string, string[]>;
  calls: Record<string, MapCall>;
  scenarios: MapScenario[];
  groups: string[];
  inputTypes: Record<string, {label: string; description: string}>;
  unavailable: string[];
};
export type CareerLlmMapResponse = {revision: string; manifest: CareerLlmMap; document: string};
