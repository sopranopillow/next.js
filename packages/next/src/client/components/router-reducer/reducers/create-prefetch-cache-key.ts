import { createHrefFromUrl } from '../create-href-from-url'

/**
 * Creates a cache key for the router prefetch cache
 *
 * @param url - The URL being navigated to
 * @param nextUrl - an internal URL, primarily used for handling rewrites. Defaults to '/'.
 * @return The generated prefetch cache key.
 */
export function createPrefetchCacheKey(url: URL, nextUrl?: string | null) {
  const pathnameFromUrl = createHrefFromUrl(
    url,
    // Ensures the hash is not part of the cache key as it does not impact the server fetch
    false
  )

  // delimit the prefix so we don't conflict with other pages

  // Route interception depends on `nextUrl` values which aren't a 1:1 mapping to a URL
  // The cache key that we store needs to use `nextUrl` to properly distinguish cache entries
  if (nextUrl) {
    return `${nextUrl}%${pathnameFromUrl}`
  }

  return pathnameFromUrl
}
