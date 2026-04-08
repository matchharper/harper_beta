// Central Query Key Factory
// New hooks should use these keys. Existing hooks migrate opportunistically.

export type QueryKey = readonly unknown[];

export const queryKeys = {
  candidate: {
    all: ['candidate'] as const,
    detail: (candidId: string) => ['candidate', 'detail', candidId] as const,
    bookmark: (candidId: string) => ['candidate', 'bookmark', candidId] as const,
  },
  run: {
    all: ['run'] as const,
    detail: (runId: string) => ['run', 'detail', runId] as const,
    results: (runId: string) => ['run', 'results', runId] as const,
  },
  connections: {
    all: ['connections'] as const,
    count: (userId: string) => ['connections', 'count', userId] as const,
  },
  bookmarkFolders: {
    all: ['bookmarkFolders'] as const,
    byUser: (userId: string) => ['bookmarkFolders', 'byUser', userId] as const,
    detail: (folderId: string) => ['bookmarkFolders', 'detail', folderId] as const,
  },
  match: {
    all: ['match'] as const,
    workspace: (workspaceId?: string | null) =>
      ['match', 'workspace', workspaceId ?? 'active'] as const,
    candidates: (workspaceId?: string | null, roleId?: string | null) =>
      ['match', 'candidates', workspaceId ?? 'active', roleId ?? 'all'] as const,
    candidateDetail: (candidId: string, roleId?: string | null) =>
      ['match', 'candidate', candidId, roleId ?? 'primary'] as const,
  },
  opsOpportunity: {
    all: ['opsOpportunity'] as const,
    catalog: ['opsOpportunity', 'catalog'] as const,
    candidates: (query?: string | null, roleId?: string | null) =>
      ['opsOpportunity', 'candidates', query ?? '', roleId ?? 'all'] as const,
    matches: (roleId?: string | null, candidId?: string | null) =>
      ['opsOpportunity', 'matches', roleId ?? 'all', candidId ?? 'all'] as const,
    recommendations: (roleId?: string | null, talentId?: string | null) =>
      ['opsOpportunity', 'recommendations', roleId ?? 'all', talentId ?? 'all'] as const,
  },
  searchHistory: {
    all: ['searchHistory'] as const,
    byUser: (userId: string) => ['searchHistory', 'byUser', userId] as const,
  },
} as const;
