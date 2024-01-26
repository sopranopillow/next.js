import { fetchServerResponse } from '../fetch-server-response'
import type {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
  PrefetchCacheEntry,
} from '../router-reducer-types'
import { PrefetchKind } from '../router-reducer-types'
import { prunePrefetchCache } from './prune-prefetch-cache'
import { NEXT_RSC_UNION_QUERY } from '../../app-router-headers'
import { PromiseQueue } from '../../promise-queue'
import { createPrefetchCacheKey } from './create-prefetch-cache-key'

export const prefetchQueue = new PromiseQueue(5)

export function prefetchReducer(
  state: ReadonlyReducerState,
  action: PrefetchAction
): ReducerState {
  // let's prune the prefetch cache before we do anything else
  prunePrefetchCache(state.prefetchCache)

  const { url } = action
  url.searchParams.delete(NEXT_RSC_UNION_QUERY)

  let prefetchCacheKey = createPrefetchCacheKey(url)
  const interceptionCacheKey = createPrefetchCacheKey(url, state.nextUrl)
  let cacheEntry =
    // first check if there's a more specific interception route prefetch entry
    // as we don't want to potentially re-use a cache node that would resolve to the same URL
    // but renders differently when intercepted
    state.prefetchCache.get(interceptionCacheKey) ||
    state.prefetchCache.get(prefetchCacheKey)

  if (cacheEntry) {
    /**
     * If the cache entry present was marked as temporary, it means that we prefetched it from the navigate reducer,
     * where we didn't have the prefetch intent. We want to update it to the new, more accurate, kind here.
     */
    if (cacheEntry.kind === PrefetchKind.TEMPORARY) {
      state.prefetchCache.set(prefetchCacheKey, {
        ...cacheEntry,
        kind: action.kind,
      })
    }

    /**
     * if the prefetch action was a full prefetch and that the current cache entry wasn't one, we want to re-prefetch,
     * otherwise we can re-use the current cache entry
     **/
    if (
      !(
        cacheEntry.kind === PrefetchKind.AUTO &&
        action.kind === PrefetchKind.FULL
      )
    ) {
      return state
    }
  }

  const newEntry = createPrefetchEntry({
    state,
    url,
    kind: action.kind,
    prefetchCacheKey,
  })

  state.prefetchCache.set(prefetchCacheKey, newEntry)

  return state
}

export function createPrefetchEntry({
  state,
  url,
  kind,
  prefetchCacheKey,
}: {
  state: ReadonlyReducerState
  url: URL
  kind: PrefetchKind
  prefetchCacheKey: string
}): PrefetchCacheEntry {
  // initiates the fetch request for the prefetch and attaches a listener
  // to the promise to update the prefetch cache entry when the promise resolves (if necessary)
  const getPrefetchData = () =>
    fetchServerResponse(
      url,
      state.tree,
      state.nextUrl,
      state.buildId,
      kind
    ).then((prefetchResponse) => {
      /* [flightData, canonicalUrlOverride, postpone, intercept] */
      const [, , , intercept] = prefetchResponse
      const existingPrefetchEntry = state.prefetchCache.get(prefetchCacheKey)
      // If we discover that the prefetch corresponds with an interception route, we want to move it to
      // a prefixed cache key to avoid clobbering an existing entry.
      if (intercept && existingPrefetchEntry) {
        const prefixedCacheKey = createPrefetchCacheKey(url, state.nextUrl)
        state.prefetchCache.set(prefixedCacheKey, existingPrefetchEntry)
        state.prefetchCache.delete(prefetchCacheKey)
      }

      return prefetchResponse
    })

  const data = prefetchQueue.enqueue(getPrefetchData)

  return {
    treeAtTimeOfPrefetch: state.tree,
    data,
    kind,
    prefetchTime: Date.now(),
    lastUsedTime: null,
  }
}
