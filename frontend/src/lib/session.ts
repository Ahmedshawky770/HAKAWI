import type { QueryClient } from "@tanstack/react-query";

import { setStoredUser, type StoredUser } from "@/lib/api";

/**
 * The queries that NOBODY is watching any more.
 *
 * A query with no observers is not being waited for by anybody: the page that
 * asked for it has been unmounted, and nothing will read what it brings back.
 * Such a query can be removed outright, and removing it cancels whatever
 * request it still had in flight — which is right, because that request is
 * being made for a session that is over.
 *
 * A query WITH observers is a different matter, and it is left alone here: it
 * is being waited for, and the answer it is waiting for — the error the server
 * sent — has to reach the component that is waiting for it. Removing it would
 * cancel the request and swallow the error, and the component would sit in the
 * loading state for ever. Those queries are removed later, by the
 * authenticated frame, once the pages that were reading them have been torn
 * down.
 */
export function clearUnobservedQueries(queryClient: QueryClient): void {
  const cache = queryClient.getQueryCache();
  for (const query of cache.getAll()) {
    if (query.getObserversCount() > 0) continue;
    cache.remove(query);
  }
}

/**
 * THE MOMENT A SESSION BEGINS.
 *
 * The cache holds every conversation, library entry, payment and unread count
 * the reader fetched, under keys that carry no account identity — the fact
 * being cached is "this reader's conversations", and the reader is whoever is
 * signed in. The cache lives in the root layout, so it survives a redirect to
 * the sign-in screen.
 *
 * So a sign-in that FOLLOWS another session in the same tab has to empty it.
 * The reader who reaches the sign-in screen without signing out — to switch
 * accounts, or to sign in again after the session ended — would otherwise be
 * served the previous reader's conversations, library and payments. The next
 * person to use the same machine would be served them too.
 *
 * This is the ONE place that does it, and both sign-in paths use it: the
 * sign-in screen and the registration screen. The registration screen used to
 * skip it, which was a hole straight through the guarantee: registering a
 * second account in the same tab handed the second reader the first reader's
 * private lists.
 */
export function startSession(queryClient: QueryClient, user: StoredUser): void {
  // The cache is emptied FIRST, so that anything the session change notifies
  // — the reader's own record, the header's unread count — sees an empty
  // cache and the new session, and never the other order round.
  queryClient.clear();
  setStoredUser(user);
}
