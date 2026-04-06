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
  searchHistory: {
    all: ['searchHistory'] as const,
    byUser: (userId: string) => ['searchHistory', 'byUser', userId] as const,
  },
} as const;
