import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  e2eMockRunMutation,
  e2eMockRunQuery,
  getE2eMockRevision,
  subscribeE2eMockStore,
} from "../../shared/admin/e2e/mockAdminStore.ts";
import { convexRefPath } from "./convexRefPath";

const MockRevisionContext = createContext(0);

function useMockRevision() {
  return useSyncExternalStore(
    subscribeE2eMockStore,
    getE2eMockRevision,
    getE2eMockRevision,
  );
}

/** Minimal Convex provider for Playwright — no network calls. */
export function ConvexProvider({ children }: { client?: unknown; children: ReactNode }) {
  const revision = useMockRevision();
  return (
    <MockRevisionContext.Provider value={revision}>{children}</MockRevisionContext.Provider>
  );
}

export function useQuery(ref: unknown, args: unknown) {
  const revision = useContext(MockRevisionContext);
  return useMemo(() => {
    if (args === "skip") {
      return undefined;
    }
    void revision;
    return e2eMockRunQuery(convexRefPath(ref), args as Record<string, unknown>);
  }, [ref, args, revision]);
}

export function useMutation(ref: unknown) {
  const path = useMemo(() => convexRefPath(ref), [ref]);
  return useCallback(
    async (args: Record<string, unknown>) => e2eMockRunMutation(path, args),
    [path],
  );
}

type PaginatedStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

export function usePaginatedQuery(
  ref: unknown,
  args: Record<string, unknown> | "skip",
  options: { initialNumItems: number },
) {
  const skipped = args === "skip";
  const revision = useContext(MockRevisionContext);
  const [loaded, setLoaded] = useState(options.initialNumItems);

  const pageResult = useMemo(() => {
    if (skipped) {
      return { page: [] as unknown[], isDone: true, continueCursor: null };
    }
    void revision;
    return e2eMockRunQuery(convexRefPath(ref), {
      ...args,
      paginationOpts: { numItems: loaded, cursor: null },
    }) as { page: unknown[]; isDone: boolean; continueCursor: string | null };
  }, [ref, args, loaded, revision, skipped]);

  const loadMore = useCallback((numItems: number) => {
    setLoaded((current) => current + numItems);
  }, []);

  if (skipped) {
    return {
      results: [],
      status: "Exhausted" as PaginatedStatus,
      loadMore: () => {},
      isLoading: false,
    };
  }

  const status: PaginatedStatus = pageResult.isDone ? "Exhausted" : "CanLoadMore";

  return {
    results: pageResult.page,
    status,
    loadMore,
    isLoading: false,
  };
}
