import { authorize, completedReceipt, loadSnapshot, persistPublication,
  type Query, type PublicationCommand, type PublicationReceipt } from './repository';
import type { Presentation, PublicationRole, PublicationCandidate } from './writer';

export type PublicationDependencies = {
  transaction: <T>(work: (query: Query) => Promise<T>) => Promise<T>;
  write: (role: PublicationRole, candidate: PublicationCandidate) => Promise<Presentation>;
};

/** All network calls run outside SQL transactions. A failure never publishes a partial list. */
export async function publishRecommendations(command: PublicationCommand, deps: PublicationDependencies): Promise<PublicationReceipt> {
  const prepared = await deps.transaction(async query => {
    await authorize(query, command);
    const completed = await completedReceipt(query, command);
    return completed ? {completed} : {snapshot: await loadSnapshot(query, command)};
  });
  if (prepared.completed) return prepared.completed;
  const snapshot = prepared.snapshot!;
  // Start one request per person immediately, then wait for every request, including
  // failures, before returning. Never leave an unobserved request writing in the background.
  const written = await Promise.allSettled(snapshot.candidates.map(candidate => deps.write(snapshot.role, candidate)));
  const failed = written.flatMap((result, index) => result.status === 'rejected' ? [snapshot.candidates[index].talentId] : []);
  if (failed.length) throw new Error(`Candidate description writing failed for ${failed.join(', ')}; no recommendations were saved`);
  const presentations = new Map(written.map((result, index) => [snapshot.candidates[index].talentId,
    (result as PromiseFulfilledResult<Presentation>).value]));
  return deps.transaction(query => persistPublication(query, command, snapshot, presentations));
}

export function parsePublicationCommand(args: {
  input: Record<string, unknown>; workspaceId: string; userId: string; roleId: string;
  requestId: string; sourceMessageId?: number;
}): PublicationCommand {
  const {input} = args;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![args.workspaceId,args.userId,args.roleId].every(id => uuid.test(id))) throw new Error('Exact workspace, user and Role identifiers are required');
  if (input.kind !== 'add' && input.kind !== 'replace') throw new Error('kind must be add or replace');
  if (!args.requestId.trim()) throw new Error('A stable publication request identifier is required');
  if (!Array.isArray(input.talentIds) || !input.talentIds.every(id => typeof id === 'string' && uuid.test(id)))
    throw new Error('Select exact talentIds');
  const talentIds = (input.talentIds as string[]).map(id => id.toLowerCase());
  if (new Set(talentIds).size !== talentIds.length) throw new Error('Select unique talentIds');
  if (input.sourceRunId !== undefined && (typeof input.sourceRunId !== 'string' || !uuid.test(input.sourceRunId)))
    throw new Error('sourceRunId must be an exact saved run identifier');
  return {workspaceId:args.workspaceId,userId:args.userId,roleId:args.roleId,requestId:args.requestId,
    ...(args.sourceMessageId !== undefined ? {sourceMessageId:args.sourceMessageId} : {}), kind:input.kind,talentIds,
    ...(typeof input.sourceRunId === 'string' ? {sourceRunId:input.sourceRunId} : {}),
    ...(typeof input.reason === 'string' ? {reason:input.reason} : {})};
}
