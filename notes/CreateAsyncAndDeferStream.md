* Authentication & Streaming in SolidStart: The Complete Guide
:PROPERTIES:
:CUSTOM_ID: authentication--streaming-in-solidstart-the-complete-guide
:END:
*Why =deferStream= exists, how =query()= caching works, and the patterns
that keep your app secure without killing performance*

/For SolidStart developers building authenticated apps with SSR
streaming./

SolidStart's streaming SSR creates subtle auth bugs that are easy to
miss. This guide starts from first principles, shows what breaks, and
arrives at the maintainer-endorsed pattern.

--------------

** 1. The Problem: Streaming and Authentication Don't Mix Naively
:PROPERTIES:
:CUSTOM_ID: 1-the-problem-streaming-and-authentication-dont-mix-naively
:END:
*** How SolidStart Streaming Works
:PROPERTIES:
:CUSTOM_ID: how-solidstart-streaming-works
:END:
When the browser requests a route, SolidStart server-renders the
component tree. At each =<Suspense>= boundary, the server chooses: wait
for async data, or stream HTML now.

Once the server sends HTTP headers (=200 OK=), it *cannot* send a =302=
redirect. Auth checks are async, but headers must go out before content
--- and once they're gone, they're gone.

#+begin_quote
Once streaming begins, response headers cannot be changed. Any
header-modifying logic within server functions --- including redirects
or cookie-setting APIs --- must execute before streaming starts.

---
[[https://docs.solidjs.com/solid-start/building-your-application/data-fetching][SolidStart
Data Fetching docs]]
#+end_quote

*** What =deferStream= Does
:PROPERTIES:
:CUSTOM_ID: what-deferstream-does
:END:
=createAsync= accepts a =deferStream= option:

#+begin_src typescript
function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    deferStream?: boolean; // <-- the key option
  },
): Accessor<T | undefined>;
#+end_src

| Mode                           | Behavior                                            | Redirect outcome                                                                        |
|--------------------------------+-----------------------------------------------------+-----------------------------------------------------------------------------------------|
| =deferStream: true=            | Holds the HTTP response until the resource resolves | Proper HTTP =302= --- headers haven't been sent                                         |
| =deferStream: false= (default) | Streams immediately; data fills in via =<Suspense>= | Redirect becomes =<script>window.location = "/login"</script>= injected into the stream |

#+begin_example
deferStream: true   → [request] → [wait...] → [302 redirect] or [200 + full page]
deferStream: false  → [request] → [200 + shell sent] → [data streams in] → [can't 302 anymore]
#+end_example

The
[[https://docs.solidjs.com/solid-router/reference/data-apis/create-async][official
=createAsync= reference]] confirms: =deferStream: true= "defers
streaming until the fetcher finishes executing."

--------------

** 2. What Goes Wrong: Two Common Footguns
:PROPERTIES:
:CUSTOM_ID: 2-what-goes-wrong-two-common-footguns
:END:
*** Footgun 1: "Headers Already Sent"
:PROPERTIES:
:CUSTOM_ID: footgun-1-headers-already-sent
:END:
An unauthenticated user requests =/top-stock=:

1. *The browser requests =/top-stock=.*
2. *SolidStart server-renders* the component tree, starting with the
   =(app).tsx= layout.
3. *The layout renders =<NavbarContent>=*, which contains
   =<UserDropdown>=. The dropdown calls =createAsync(() => getUser())=
   without =deferStream= (defaults to =false=). This creates a pending
   resource but doesn't block.
4. *SolidStart hits the =<Suspense>= boundary.* Because =deferStream= is
   =false=, it doesn't wait --- it renders the fallback and *starts
   streaming HTML*. HTTP headers go out: =200 OK=.
5. *=TopStockReport= renders.* Its =createAsync(() => getWeeklyTSR(…))=
   fires. On the server, =getWeeklyTSR= calls =requireUser()= →
   =getUser()=. The =query("user")= cache is still pending from Step 3,
   so both calls share one request.
6. *=getUser()= resolves* --- no valid session →
   =throw redirect("/login")=.
7. *Too late.* The =200 OK= and partial HTML already went out in Step 4.
   The server *cannot* send a =302=. SolidStart injects
   =<script>window.location = "/login"</script>= into the stream
   instead.

*Result:* The user briefly sees the page skeleton flash, then the
client-side redirect fires.

*** Footgun 2: Content Flash
:PROPERTIES:
:CUSTOM_ID: footgun-2-content-flash
:END:
Same scenario, but notice what the user /sees/.

After Steps 1--4, the browser has received:

- The full =(app).tsx= layout chrome
- The navbar (minus =UserDropdown=, which is inside
  =<Show when={user()}>= --- so nothing renders)
- The sidebar
- =TopStockReport='s synchronous parts: date pickers, metric selectors,
  loading skeletons

The user sees a *fully laid-out admin page* with working controls and
placeholder content.

Then auth fails, the redirect fires, and the page vanishes.

Static routes are worse. A page that says "Authorized Access Only" with
no async data renders *instantly and completely* in Step 4. The redirect
yanks it away, but the user already read everything.

*** The Trap: Accidental Protection via UI Components
:PROPERTIES:
:CUSTOM_ID: the-trap-accidental-protection-via-ui-components
:END:
A =UserDropdown= in the navbar calls
=createAsync(() => getUser(), { deferStream: true })=. This
*accidentally* blocks streaming until auth resolves, protecting every
route under the layout.

Remove the dropdown, and every route loses protection. The auth is real
--- but it depends on a UI component's rendering option, not an
architectural decision.

--------------

** 3. Building Blocks: =query()=, =getUser()=, =requireUser()=, and =preload=
:PROPERTIES:
:CUSTOM_ID: 3-building-blocks-query-getuser-requireuser-and-preload
:END:
*** =query()= vs Plain Async Functions
:PROPERTIES:
:CUSTOM_ID: query-vs-plain-async-functions
:END:
=query()= caches and deduplicates an async resource under a stable key:

#+begin_src typescript
// query() — cached, keyed, safe in preload
export const getUser = query(async (): Promise<User | undefined> => {
  "use server";
  const session = await getSession();
  const userId = session.data.userId;
  if (!userId) throw new Error("User not found");
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");
  return {
    id: user.id,
    username: user.username,
    clientId: session.data.clientId,
  };
}, "user");

// Plain async — throws redirect, NOT safe in preload
export async function requireUser(): Promise<User> {
  "use server";
  const user = await getUser();
  if (!user || !user.id || !user.username) {
    throw redirect("/login");
  }
  return user;
}
#+end_src

| Function        | Wrapped in =query()=?   | Safe in =preload=?           | Can throw redirect?                |
|-----------------+-------------------------+------------------------------+------------------------------------|
| =getUser()=     | Yes --- =query("user")= | Yes (fire-and-forget)        | Yes, but returns =undefined= first |
| =requireUser()= | No --- plain async      | *No* --- unhandled rejection | Yes --- and that's the problem     |

=getUser= is safe everywhere because =query()= wraps it. =requireUser=
calls =getUser= internally then throws a redirect --- so only
=createAsync= or a server function can catch the thrown =Response=.

*** =preload=: Fire-and-Forget Cache Warming
:PROPERTIES:
:CUSTOM_ID: preload-fire-and-forget-cache-warming
:END:
=preload= runs when the route matches --- even on *link hover* --- and
populates the =query()= cache before the component renders:

#+begin_src typescript
export const route = {
  preload: () => {
    getUser(); // warm auth cache
    getData(); // warm data cache
  },
} satisfies RouteDefinition;
#+end_src

=preload= does *not* block rendering and does *not* hold streaming. Only
=query()= functions belong here --- plain async functions that throw
will produce unhandled rejections.

See:
[[https://docs.solidjs.com/solid-start/building-your-application/data-fetching][SolidStart
Data Fetching --- Preload]]

*** =createAsync= + =deferStream=: The Streaming Gate
:PROPERTIES:
:CUSTOM_ID: createasync--deferstream-the-streaming-gate
:END:
=createAsync(() => fn(), { deferStream: true })= is the *only* way to
block streaming. If =fn= throws a redirect, SolidStart returns a clean
HTTP =302= because headers haven't been sent yet.

*Defer only the fast auth check, never slow data queries.* Auth is a
session/cookie lookup --- milliseconds. A ClickHouse query might take
2--3 seconds. Deferring the data query forces the user to stare at a
blank page until ClickHouse responds --- streaming is gone.

--------------

** 4. The Pattern: Data Functions and Conditionals, Not Guards
:PROPERTIES:
:CUSTOM_ID: 4-the-pattern-data-functions-and-conditionals-not-guards
:END:
*** The Maintainer's Position
:PROPERTIES:
:CUSTOM_ID: the-maintainers-position
:END:
Ryan Carniato (creator of SolidJS) addressed this directly in
[[https://github.com/solidjs/solid-router/issues/247][solid-router
​#247]]:

#+begin_quote
*"To be fair there are other ways to accomplish this using data
functions and conditionals."*
#+end_quote

Async guards conflict with Suspense and SSR transitions. Auth checks
belong in the data loading layer, not in a separate guard concept. The
community keeps requesting Angular-style =CanActivate= guards; the
maintainer keeps saying no.

=createAsync(() => getUser(), { deferStream: true })= *is* a data
function with a conditional --- not a guard. It follows the endorsed
pattern exactly.

*** Anatomy of a Protected Route
:PROPERTIES:
:CUSTOM_ID: anatomy-of-a-protected-route
:END:
Each protected route has three pieces:

1. *=preload=* --- warms auth and data caches (fire-and-forget head
   start)
2. *Auth =createAsync=* with =deferStream: true= --- blocks streaming
   until auth resolves
3. *Data =createAsync=* with default =deferStream= --- streams in via
   =<Suspense>=

#+begin_src typescript
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { Suspense } from "solid-js";
import { getUser, requireUser } from "~/lib/auth";
import { getInventoryData } from "~/lib/db/queries/inventory";

export const route = {
  preload: () => {
    getUser();                    // warm auth cache (query — safe in preload)
    getInventoryData();           // warm data cache
  },
} satisfies RouteDefinition;

export default function InventoryPage() {
  // Blocks streaming until auth resolves — clean 302 if unauth
  createAsync(() => getUser(), { deferStream: true });

  // Streams in via Suspense — internal requireUser() is a cache hit
  const data = createAsync(() => getInventoryData());

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <pre>{JSON.stringify(data(), null, 2)}</pre>
    </Suspense>
  );
}
#+end_src

*** Why NOT =deferStream: true= on Data Queries
:PROPERTIES:
:CUSTOM_ID: why-not-deferstream-true-on-data-queries
:END:
=deferStream: true= on a ClickHouse query blocks streaming until the
full result returns. The user sees nothing for 2--3 seconds. Streaming
is gone.

Separate the concerns:

| What                            | =deferStream=     | Why                                                                           |
|---------------------------------+-------------------+-------------------------------------------------------------------------------|
| Auth check (=getUser=)          | =true=            | Fast session/cookie lookup. Holds the stream so a redirect stays a clean 302. |
| Data query (=getInventoryData=) | =false= (default) | Slow --- may hit ClickHouse. Streams in via =<Suspense>= after auth resolves. |

*** Request Timeline
:PROPERTIES:
:CUSTOM_ID: request-timeline
:END:
#+begin_example
preload fires: getUser() + getData()       ← both start in parallel (head start)
Component renders:
  └─ createAsync(getUser, deferStream: true)  ← holds stream
     └─ Auth resolves (fast, ~ms)
        ├─ If unauth → redirect("/login")     ← clean HTTP 302, no content sent
        └─ If auth OK → stream flushes
           └─ createAsync(getData)            ← picks up preloaded/in-flight data
              └─ Suspense fallback shown      ← data streams in when ready
#+end_example

*** Static Route (No Data)
:PROPERTIES:
:CUSTOM_ID: static-route-no-data
:END:
Even routes without data queries need the auth gate:

#+begin_src typescript
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { getUser } from "~/lib/auth";

export const route = {
  preload: () => { getUser(); },
} satisfies RouteDefinition;

export default function StaticPage() {
  createAsync(() => getUser(), { deferStream: true });

  return <p>Authorized Access Only</p>;
}
#+end_src

Without the gate, static content renders fully before auth resolves ---
the user reads "Authorized Access Only" before the redirect fires.

--------------

** 5. Why Each Route Needs Its Own Auth Gate
:PROPERTIES:
:CUSTOM_ID: 5-why-each-route-needs-its-own-auth-gate
:END:
/Can't I just do this once in the layout?/

*** Solid Components Are Setup Functions
:PROPERTIES:
:CUSTOM_ID: solid-components-are-setup-functions
:END:
Solid components run *once* to wire up the reactive graph, then never
re-execute. A route component runs when you navigate to it; its reactive
bindings (=createAsync=, signals) drive updates from there. Navigate
away, and Solid tears it down.

A *layout* persists across navigations. It runs once on initial load. On
client-side navigation, only =props.children= swaps --- the layout never
re-executes.

=createAsync(() => getUser(), { deferStream: true })= in the layout
therefore fires once on initial SSR --- *not* on every client-side
navigation. The auth gate belongs in the component that mounts and
unmounts with navigation: the route component.

See:
[[https://docs.solidjs.com/solid-start/building-your-application/routing][SolidStart
Routing --- Nested Routes & Layouts]]

*** Layout Auth Works, With Extra Machinery
:PROPERTIES:
:CUSTOM_ID: layout-auth-works-with-extra-machinery
:END:
You can put auth in the layout, but it takes more work:

1. *SSR*: =createAsync(() => checkAuth(), { deferStream: true })= covers
   the initial page load.
2. *Client-side nav*: Since the layout never remounts, you need an
   effect that revalidates auth whenever the pathname changes:

#+begin_src typescript
import { createAsync, query, revalidate, useLocation } from "@solidjs/router";
import { createEffect, on, type ParentProps } from "solid-js";
import { requireUser } from "~/lib/auth";

const checkAuth = query(async () => {
  "use server";
  return requireUser();
}, "auth-check");

export default function AppLayout(props: ParentProps) {
  const location = useLocation();

  // SSR gate — blocks streaming until auth resolves
  createAsync(() => checkAuth(), { deferStream: true });

  // Client-side nav — revalidate auth when pathname changes
  createEffect(on(() => location.pathname, () => {
    revalidate(checkAuth.key);
  }, { defer: true }));  // defer: true skips the initial SSR run

  return <>{props.children}</>;
}
#+end_src

[[https://docs.solidjs.com/solid-router/reference/primitives/use-location][=useLocation=]]
is reactive --- =location.pathname= updates on every navigation and
triggers the effect.

But =createEffect= runs *after* render, so the new route's =preload=
might read a stale cache before revalidation fires. Not a security hole
--- =requireUser()= in the server function still rejects the request ---
but the page shell may flash briefly.

You also need separate layout groups when different routes need
different auth behavior (redirect vs 404). See
[[#6-admin-routes-redirect-vs-404][Section 6]].

Per-route auth is simpler, more explicit, and re-checks naturally each
time a route mounts.

*** Community Approaches That Miss the Streaming Problem
:PROPERTIES:
:CUSTOM_ID: community-approaches-that-miss-the-streaming-problem
:END:
[[https://github.com/solidjs/solid-router/discussions/364][solid-router
​#364]] collects community auth patterns. None solve the streaming timing
problem:

| Approach                       | Problem                                                                                                       |
|--------------------------------+---------------------------------------------------------------------------------------------------------------|
| =createRenderEffect= AuthGuard | Runs *after* render --- too late to block streaming on the server                                             |
| Root-level =query=/=preload=   | No =deferStream= in the route component, so the layout gate wins the race                                     |
| HOC wrapping                   | The HOC still needs =deferStream= internally                                                                  |
| Middleware (Auth.js/Clerk)     | Avoids the streaming issue but brings its own trade-offs (see [[#7-middleware-as-an-alternative][Section 7]]) |

No maintainer responded on #364 --- because Ryan Carniato already
answered the conceptual question in
[[https://github.com/solidjs/solid-router/issues/247][#247]]: use data
functions, not guards.

Two contributions from *madaxen86* in #364 are worth noting:

- *Token refresh on tab-resume*: A =visibilitychange= listener combined
  with =setInterval= (15 min) calls =revalidate()= when the tab regains
  focus. This catches idle expiry --- a user leaves a tab open, the
  session expires, and they switch back. No navigation occurs, so the
  pathname effect alone won't fire.
- *=ErrorBoundary= for role-based auth*: The server function throws an
  authorization error; =<ErrorBoundary>= in the layout catches it and
  shows an access-denied message inline. This suits finer-grained role
  checks: the route renders but displays an error state instead of
  redirecting.

--------------

** 6. Admin Routes: Redirect vs 404
:PROPERTIES:
:CUSTOM_ID: 6-admin-routes-redirect-vs-404
:END:
Auth failures sometimes need different HTTP responses:

- *Unauthenticated* → =302= redirect to =/login=
- *Authenticated but unauthorized* → =404 Not Found=

*** Separate Layout Groups
:PROPERTIES:
:CUSTOM_ID: separate-layout-groups
:END:
[[https://docs.solidjs.com/solid-start/building-your-application/routing][Route
groups]] separate auth behavior cleanly:

#+begin_example
src/routes/
├── (app).tsx          ← redirects to /login if unauthenticated
├── (app)/
│   ├── index.tsx
│   ├── inventory.tsx
│   └── admin/
│       └── audit.tsx  ← returns 404 if not admin/staff
#+end_example

The admin audit route checks roles via a =query= and falls back to
=<NotFound>=:

#+begin_src typescript
import { createAsync, query, type RouteDefinition } from "@solidjs/router";
import { Show } from "solid-js";
import { getUser, requireRole } from "~/lib/auth";
import NotFound from "~/routes/[...404]";

const getAdminUser = query(async () => {
  "use server";
  return requireRole("admin", "staff");
}, "admin-user");

export const route = {
  preload: () => {
    getUser();
    getAdminUser();
  },
} satisfies RouteDefinition;

export default function AdminAuditPage() {
  const user = createAsync(() => getAdminUser(), { deferStream: true });

  return (
    <Show when={user()} fallback={<NotFound />}>
      <p>Authorized Access Only</p>
    </Show>
  );
}
#+end_src

=deferStream: true= on =getAdminUser()= holds streaming until the role
check completes. If the user lacks the admin/staff role, =requireRole=
returns =undefined=, and =<Show>= renders =<NotFound>=. Because
streaming hasn't started, =<HttpStatusCode code={404} />= inside
=<NotFound>= can still set the correct HTTP status.

Without =deferStream=, the server would have already sent =200 OK= ---
the 404 page would render visually, but with the wrong status code.

--------------

** 7. Middleware as an Alternative
:PROPERTIES:
:CUSTOM_ID: 7-middleware-as-an-alternative
:END:
SolidStart
[[https://docs.solidjs.com/solid-start/advanced/middleware][middleware]]
intercepts requests before route handlers run:

#+begin_src typescript
import { createMiddleware } from "@solidjs/start/middleware";

export default createMiddleware({
  onRequest: (event) => {
    // Runs before route handlers
    // Can return a Response to short-circuit
  },
});
#+end_src

Third-party auth libraries like
[[https://authjs.dev/reference/solid-start][Auth.js]] and
[[https://www.brenelz.com/posts/protected-routes-with-clerk-solidstart/][Clerk]]
check auth in middleware before streaming starts --- which sidesteps the
=deferStream= problem entirely.

But the SolidStart docs warn:

#+begin_quote
Authorization should not rely on middleware --- it doesn't run during
client-side navigations. Authorization checks should occur in API routes
or server-side utilities instead.

---
[[https://docs.solidjs.com/solid-start/advanced/middleware][SolidStart
Middleware docs]]
#+end_quote

Middleware runs only on initial page loads and server-side requests.
Client-side navigations bypass it entirely --- so you still need
=requireUser()= in every server function.

--------------

** 8. Query Caching, Session Expiry, and Edge Cases
:PROPERTIES:
:CUSTOM_ID: 8-query-caching-session-expiry-and-edge-cases
:END:
*** How =query()= Cache Keys Work
:PROPERTIES:
:CUSTOM_ID: how-query-cache-keys-work
:END:
=query()= deduplicates by key + arguments: same key, same args, cache
hit. =preload= and =createAsync= exploit this --- both call the same
=query()=, and the second call reuses the first's result.

[[https://github.com/solidjs/solid-router/discussions/306][RFC #306]]
(by Ryan Carniato) specifies the cache lifetimes:

- *Server-side*: deduplication for the request lifetime
- *Browser preload cache*: ~10 seconds --- prevents duplicate calls
  during route preloading
- *Back/forward cache*: up to 5 minutes for browser navigation

*Never* pass =Date.now()= or timestamps as cache-busting arguments. If
=preload= calls =checkAuth(Date.now())= and =createAsync= calls
=checkAuth(Date.now())= milliseconds later, the timestamps differ, the
keys differ, and two server calls fire. Dedup is broken.

*** Explicit Logout via =action()=
:PROPERTIES:
:CUSTOM_ID: explicit-logout-via-action
:END:
Solid Router auto-revalidates every query when an =action()= completes.
A logout action clears the auth cache for free:

#+begin_src typescript
export const logout = action(async () => {
  "use server";
  await logoutSession();
  return redirect("/login");
});
#+end_src

Route A → Route B → logout → Route A: the =action()= revalidation clears
the cache, and the router re-checks auth.

You can also target specific keys:
=throw redirect("/", { revalidate: getUser.keyFor(id) })=. See
[[https://docs.solidjs.com/solid-start/building-your-application/data-mutation][SolidStart
Data Mutation docs]] and the
[[https://docs.solidjs.com/solid-router/reference/data-apis/revalidate][revalidate
API reference]].

*** Server-Side Session Expiry (No Explicit Logout)
:PROPERTIES:
:CUSTOM_ID: server-side-session-expiry-no-explicit-logout
:END:
When a session expires server-side without a logout, the client cache is
likely stale too --- the preload cache only lives ~5 seconds.

If a user leaves a tab open and the session expires, madaxen86's
tab-resume pattern from
[[https://github.com/solidjs/solid-router/discussions/364][#364]]
handles it:

#+begin_src typescript
// In the layout — catches idle session expiry on tab resume
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    revalidate(checkAuth.key);
  }
});
#+end_src

Even in the worst case --- stale cache, no revalidation ---
=requireUser()= in the server function rejects the request. No data
returns. The user might briefly see an empty page shell before the
redirect --- a UX glitch, not a security hole.

--------------

** 9. The Security Model: Routing Auth Is UX, Server Functions Are Security
:PROPERTIES:
:CUSTOM_ID: 9-the-security-model-routing-auth-is-ux-server-functions-are-security
:END:
*** Two Distinct Layers
:PROPERTIES:
:CUSTOM_ID: two-distinct-layers
:END:
| Layer                                    | Handles                                    | Mechanism                             | Bypassable?                                      |
|------------------------------------------+--------------------------------------------+---------------------------------------+--------------------------------------------------|
| Routing auth (=deferStream= + =preload=) | Clean redirects, no content flash, good UX | Holds streaming gate, client-side nav | *Yes* --- =curl= calls server functions directly |
| Server function auth (=requireUser()=)   | No data without a valid session            | Server-side check in every query      | *No* --- runs on the server regardless of client |

*** =requireUser()= in Server Functions Is Non-Negotiable
:PROPERTIES:
:CUSTOM_ID: requireuser-in-server-functions-is-non-negotiable
:END:
Remove =requireUser()= from a server function and the data is exposed
--- no amount of =deferStream=, =preload=, or layout guards changes
that. Anyone can call the server function endpoint with =curl=.

#+begin_src typescript
const getInventory = query(async () => {
  "use server";
  const user = await requireUser(); // ← THIS is the security boundary
  return db.getInventory(user.clientId);
}, "inventory");
#+end_src

Routing-level auth (=deferStream=, =preload=, layout effects) is the *UX
layer*. Server function auth is the *security boundary*.

Many articles frame server-side auth as "defense in depth." It's the
opposite: server-side auth is the *primary* layer. Routing-level auth
provides defense in depth --- for UX.

*** What Can Leak in the Worst Case?
:PROPERTIES:
:CUSTOM_ID: what-can-leak-in-the-worst-case
:END:
| Scenario                                               | What the user sees                                             | Data leaked?                          |
|--------------------------------------------------------+----------------------------------------------------------------+---------------------------------------|
| No routing auth, =requireUser()= in server functions   | Page shell (layout, nav, empty containers) flashes briefly     | *No* --- server rejects data requests |
| Routing auth + =requireUser()= in server functions     | Nothing --- clean redirect                                     | *No*                                  |
| Routing auth, *no* =requireUser()= in server functions | Nothing visible (redirect works) --- but =curl= can fetch data | *Yes* --- the real security hole      |

Both layers are needed; neither suffices alone.

--------------

** 10. Quick Reference
:PROPERTIES:
:CUSTOM_ID: 10-quick-reference
:END:
*** Route With Data Queries
:PROPERTIES:
:CUSTOM_ID: route-with-data-queries
:END:
#+begin_src typescript
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { Suspense } from "solid-js";
import { getUser } from "~/lib/auth";
import { getData } from "~/lib/db/queries/data";

export const route = {
  preload: () => {
    getUser();
    getData();
  },
} satisfies RouteDefinition;

export default function Page() {
  createAsync(() => getUser(), { deferStream: true });
  const data = createAsync(() => getData());

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <pre>{JSON.stringify(data(), null, 2)}</pre>
    </Suspense>
  );
}
#+end_src

*** Static Route (No Data)
:PROPERTIES:
:CUSTOM_ID: static-route-no-data-1
:END:
#+begin_src typescript
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { getUser } from "~/lib/auth";

export const route = {
  preload: () => { getUser(); },
} satisfies RouteDefinition;

export default function Page() {
  createAsync(() => getUser(), { deferStream: true });
  return <p>Protected content here</p>;
}
#+end_src

*** Route With Date-Based Defaults
:PROPERTIES:
:CUSTOM_ID: route-with-date-based-defaults
:END:
#+begin_src typescript
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { createSignal, Suspense } from "solid-js";
import { getUser } from "~/lib/auth";
import { getWeeklyInventoryYoY } from "~/lib/db/queries/inventory";

// Module-level defaults — shared between preload and component
const defaultStartDate = "2024-01-01";
const defaultEndDate = "2024-12-31";

export const route = {
  preload: () => {
    getUser();
    getWeeklyInventoryYoY(defaultStartDate, defaultEndDate);
  },
} satisfies RouteDefinition;

export default function InventoryReport() {
  createAsync(() => getUser(), { deferStream: true });

  const [startDate, setStartDate] = createSignal(defaultStartDate);
  const [endDate, setEndDate] = createSignal(defaultEndDate);

  const data = createAsync(() =>
    getWeeklyInventoryYoY(startDate(), endDate())
  );

  return (
    <Suspense fallback={<p>Loading...</p>}>
      {/* Date pickers + data display */}
    </Suspense>
  );
}
#+end_src

*** Layout-Level Auth (Alternative Pattern)
:PROPERTIES:
:CUSTOM_ID: layout-level-auth-alternative-pattern
:END:
#+begin_src typescript
import { createAsync, query, revalidate, useLocation } from "@solidjs/router";
import { createEffect, on, type ParentProps } from "solid-js";
import { requireUser } from "~/lib/auth";

const checkAuth = query(async () => {
  "use server";
  return requireUser();
}, "auth-check");

export default function AppLayout(props: ParentProps) {
  const location = useLocation();

  // SSR gate
  createAsync(() => checkAuth(), { deferStream: true });

  // Client-side nav revalidation
  createEffect(on(() => location.pathname, () => {
    revalidate(checkAuth.key);
  }, { defer: true }));

  return <>{props.children}</>;
}
#+end_src

*** Auth Gate Checklist
:PROPERTIES:
:CUSTOM_ID: auth-gate-checklist
:END:
- [ ] Every =(app)= route has =preload= calling =getUser()= + data
  queries
- [ ] Every =(app)= route component starts with
  =createAsync(() => getUser(), { deferStream: true })=
- [ ] Data =createAsync= calls do *not* use =deferStream: true=
- [ ] Every server function calls =requireUser()= --- the actual
  security boundary
- [ ] Date-based defaults live at module level so =preload= and the
  component share the same cache key
- [ ] =logout= uses =action()= so the query cache auto-revalidates
- [ ] Admin routes check roles with =deferStream: true= for proper HTTP
  status codes

--------------

** References
:PROPERTIES:
:CUSTOM_ID: references
:END:
*** Official Documentation
:PROPERTIES:
:CUSTOM_ID: official-documentation
:END:
- [[https://docs.solidjs.com/solid-start/advanced/auth][SolidStart ---
  Authentication]] --- server function auth patterns and =deferStream=
  guidance
- [[https://docs.solidjs.com/solid-start/advanced/middleware][SolidStart
  --- Middleware]] --- middleware lifecycle, client-side nav limitations
- [[https://docs.solidjs.com/solid-start/advanced/return-responses][SolidStart
  --- Returning Responses]] --- =redirect()=, =json()=, and response
  helpers
- [[https://docs.solidjs.com/solid-start/building-your-application/data-fetching][SolidStart
  --- Data Fetching]] --- =query()=, =createAsync=, =preload=, streaming
  constraints
- [[https://docs.solidjs.com/solid-start/building-your-application/routing][SolidStart
  --- Routing]] --- file-based routing, route groups, layouts
- [[https://docs.solidjs.com/solid-router/reference/data-apis/create-async][Solid
  Router --- =createAsync= Reference]] --- API signature, =deferStream=
  option
- [[https://docs.solidjs.com/solid-router/reference/primitives/use-location][Solid
  Router --- =useLocation= Reference]] --- reactive location primitive
- [[https://authjs.dev/reference/solid-start][Auth.js --- SolidStart
  Integration]] --- Auth.js setup and session management

*** Maintainer Guidance
:PROPERTIES:
:CUSTOM_ID: maintainer-guidance
:END:
- [[https://github.com/solidjs/solid-router/issues/247][solid-router
  ​#247]] --- Ryan Carniato: "use data functions and conditionals"
  instead of route guards
- [[https://github.com/solidjs/solid-router/discussions/306][solid-router
  ​#306]] --- Ryan Carniato's cache/preload architecture RFC; cache
  timing (~10s preload, ~5min back/forward)

*** Community Discussions
:PROPERTIES:
:CUSTOM_ID: community-discussions
:END:
- [[https://github.com/solidjs/solid-router/discussions/364][solid-router
  ​#364]] --- community auth patterns; includes madaxen86's
  =visibilitychange= token refresh and =ErrorBoundary= role-based auth
- [[https://github.com/solidjs/solid-start/issues/533][solid-start
  ​#533]] --- =redirect()= fails after await in =createServerData$= with
  =renderAsync=/=renderStream= --- early evidence of the
  streaming/redirect timing issue

*** Third-Party
:PROPERTIES:
:CUSTOM_ID: third-party
:END:
- [[https://www.brenelz.com/posts/protected-routes-with-clerk-solidstart/][Brenelz
  --- Protected Routes with Clerk & SolidStart]] --- layout-based
  protection using Clerk's =<SignedIn>=/=<SignedOut>= components and
  middleware (not verified for accuracy)

** Appendix

* TODO These are wrong
Don't bother going for Identical 404, use 403 instead. Solid Start leaks the difference. It's theatre. Use actual rate limiting

** Appendix
*** Privileged Routes with RBAC
:PROPERTIES:
:CUSTOM_ID: privileged-routes-with-rbac
:END:
Admin routes need different failure modes than regular protected routes:

| User state                  | Regular route  | Admin route    |
|-----------------------------+----------------+----------------|
| No session                  | 302 → =/login= | 302 → =/login= |
| Valid session, wrong role   | n/a            | 404 Not Found  |
| Valid session, correct role | 200            | 200            |

The 404 for wrong-role users is intentional --- it hides the route's
existence entirely, making it indistinguishable from a non-existent URL.

**** Server-Side: =requirePrivilegedUser=
:PROPERTIES:
:CUSTOM_ID: server-side-requireprivilegeduser
:END:
=requirePrivilegedUser= follows the same throw-on-failure pattern as
=requireUser=, but with an additional role gate:

#+begin_src typescript
export const PriviligedRoles = ["staff", "admin"];

export async function requirePrivilegedUser(): Promise<User> {
  "use server";
  const user = await requireUser();    // throws redirect("/login") if no session
  if (!user.role || !PriviligedRoles.includes(user.role)) {
    throw new Error("Not found");      // caught by ErrorBoundary in component
  }
  return user;
}

export const getAdminUser = query(async () => {
  "use server";
  return requirePrivilegedUser();
}, "admin-user");
#+end_src

Key design decisions:

- *Throws =Error=, not =Response=* --- =redirect()= is special in
  SolidStart (intercepted at the framework level regardless of whether
  the signal is read). A thrown =Response(null, { status: 404 })= is not
  --- it's just a value that nobody catches. Throwing =Error= works with
  Solid's =ErrorBoundary= mechanism.
- *Wrapped in =query()=* --- safe for =preload= (fire-and-forget) and
  deduplicated with =createAsync=.
- *Calls =requireUser= internally* --- unauthenticated users get
  redirected before the role check runs.

**** Component-Side: =ErrorBoundary= + =HttpStatusCode=
:PROPERTIES:
:CUSTOM_ID: component-side-errorboundary--httpstatuscode
:END:
The component must *read the signal* for the error to propagate. If
=createAsync= creates a signal that is never accessed in JSX, thrown
errors are silently dropped --- the page renders unconditionally.

#+begin_src typescript
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { ErrorBoundary } from "solid-js";
import { HttpStatusCode } from "@solidjs/start";
import { getUser, getAdminUser } from "~/lib/auth";

export const route = {
  preload: () => {
    getUser();
    getAdminUser();
  },
} satisfies RouteDefinition;

export default function Page() {
  const user = createAsync(() => getAdminUser(), { deferStream: true });

  return (
    <ErrorBoundary fallback={<HttpStatusCode code={404} />}>
      {user() && <p>Authorized Access Only</p>}
    </ErrorBoundary>
  );
}
#+end_src

The three pieces work together:

1. *=deferStream: true=* --- holds the HTTP response until
   =getAdminUser= resolves. Without this, =200 OK= headers ship before
   the role check completes, and the 404 status can never be set.
2. *=user()= read in JSX* --- triggers the error if
   =requirePrivilegedUser= threw. Without reading the signal, the
   =ErrorBoundary= never fires.
3. *=ErrorBoundary= + =HttpStatusCode=* --- catches the thrown =Error=
   and sets the HTTP 404 status code. Because =deferStream= held the
   response, the status code is still uncommitted.

**** Why Not =<Show fallback={<NotFound />}>=?
:PROPERTIES:
:CUSTOM_ID: why-not-show-fallbacknotfound-
:END:
The earlier approach used =requireRole= (returns =undefined= on wrong
role) with =<Show when={user()} fallback={<NotFound />}>=:

#+begin_src typescript
// DON'T — leaks authenticated layout to wrong-role users
<Show when={user()} fallback={<NotFound />}>
  <p>Authorized Access Only</p>
</Show>
#+end_src

Problems:

- *Layout leakage* --- the =<NotFound />= renders inside the =(app)=
  layout, so the 404 page includes the authenticated navbar, sidebar,
  and other chrome. A real 404 (non-existent URL) renders outside the
  layout. The difference reveals the route exists.
- *Requires =<Suspense>=* --- without it, =<Show>= evaluates =user()= on
  the first render pass (before =createAsync= resolves), always
  rendering the fallback first and committing the 404 status even for
  admin users.

The =ErrorBoundary= approach avoids both: the error propagates through
SolidStart's response handling, producing a 404 identical to a
non-existent route.

**** Checklist for Admin Routes
:PROPERTIES:
:CUSTOM_ID: checklist-for-admin-routes
:END:
- [ ] =requirePrivilegedUser()= throws =Error= for wrong role (not
  =undefined=, not =Response=)
- [ ] =getAdminUser= wraps it in =query()= for cache dedup
- [ ] Component reads =user()= inside an =<ErrorBoundary>=
- [ ] =deferStream: true= on the =createAsync= call
- [ ] =preload= calls both =getUser()= and =getAdminUser()=
- [ ] Server functions behind admin routes call
  =requirePrivilegedUser()= --- the actual security boundary

**** References
:PROPERTIES:
:CUSTOM_ID: references-1
:END:
- [[https://docs.solidjs.com/solid-start/reference/server/http-status-code][SolidStart
  =HttpStatusCode= --- 404 for dynamic routes]] --- the canonical
  =ErrorBoundary= + =HttpStatusCode= + =deferStream= pattern for
  returning 404 from async data fetching
- [[https://docs.solidjs.com/solid-start/reference/server/http-status-code][SolidStart
  =HttpStatusCode= --- streaming constraint]] --- "when streaming
  responses, the HTTP Status can only be included if added /before/ the
  stream first flushed. It is important to add =deferStream= to any
  resources calls that need to be loaded before responding."
- [[https://docs.solidjs.com/solid-router/reference/data-apis/create-async][Solid
  Router =createAsync= reference]] --- =deferStream= option, =Suspense=
  integration, signal semantics
- [[https://docs.solidjs.com/solid-start/building-your-application/data-fetching][SolidStart
  Data Fetching]] --- "Errors can be thrown from inside these fetchers
  and caught by the nearest =<ErrorBoundary>= component from where the
  data is accessed."
- [[https://github.com/solidjs/solid-router/discussions/364][solid-router
  ​#364]] --- madaxen86's =ErrorBoundary= pattern for role-based auth:
  server function throws an authorization error, =<ErrorBoundary>= in
  the component catches it and shows an access-denied state inline
- [[https://github.com/solidjs/solid-router/issues/247][solid-router
  ​#247]] --- Ryan Carniato: "use data functions and conditionals" ---
  auth checks belong in the data loading layer, not in route guards

*** Privileged Routes with RBAC 2
:PROPERTIES:
:CUSTOM_ID: privileged-routes-with-rbac
:END:
**** The core problem
:PROPERTIES:
:CUSTOM_ID: the-core-problem
:END:
Routes under =(app)/admin/= are nested inside the =(app)= layout.
=[...404].tsx= is a top-level sibling that renders /outside/ all
layouts. When authorization fails inside a matched route, there's no way
to "break out" of the parent layout to render the catch-all 404 --- the
router has already committed to the =(app)= layout tree.

**** FileRouter source code analysis
:PROPERTIES:
:CUSTOM_ID: filerouter-source-code-analysis
:END:
Reference: =node_modules/@solidjs/start/dist/router/routes.js= --- the
=defineRoutes= function (lines 4--25).

How route nesting is determined:

1. Routes are sorted by path length, shortest first (line 21)
2. =processRoute= checks if a route's =id= starts with an existing
   route's =id + "/"= (line 7)
3. If a parent is found, the route is recursively nested as a child
   (line 17)
4. If no parent is found, it becomes a top-level sibling (lines 9--15)
5. Route group names are stripped from the path:
   =.replace(/\([^)/]+\)/g, "")= (line 13)

Because =(app)= and =[...404]= are both top-level siblings, the
catch-all is never nested inside any layout group. Once a URL matches a
route inside =(app)=, the =(app)= layout renders --- the catch-all is
unreachable from within it.

**** Why =throw redirect("/404")= is the pragmatic solution
:PROPERTIES:
:CUSTOM_ID: why-throw-redirect404-is-the-pragmatic-solution
:END:
Other approaches render within the =(app)= layout (navbar, sidebar still
visible to an unauthorized user):

- =ErrorBoundary= inside the route still renders within the =(app)=
  layout
- =<Show>= fallback with =<HttpStatusCode code={404} />= also renders
  within the layout

Only =throw redirect("/404")= breaks out of the layout by re-navigating
to a URL that matches the top-level catch-all. Trade-off: the URL
changes to =/404= (unlike real unknown routes which render 404 in-place
at the original URL).

**** The =(admin)= route group alternative
:PROPERTIES:
:CUSTOM_ID: the-admin-route-group-alternative
:END:
Admin routes can be moved to a separate =(admin)= route group as a
top-level sibling to =(app)=. The =(admin).tsx= layout reuses the same
layout component from =(app).tsx= and supports multiple endpoints:
=(admin)/admin/audit.tsx=, =(admin)/admin/user-management.tsx=, etc.

This does *not* solve the 404 problem --- the route still matches inside
=(admin)=, so the router doesn't fall through to =[...404]=. The
redirect approach is still necessary.

**** Current implementation
:PROPERTIES:
:CUSTOM_ID: current-implementation
:END:
Reference: =src/lib/auth/index.ts=

- =requirePriviliged(redirectTo = "/login")= --- takes a redirect path,
  defaults to =/login= (line 71)
- =getAdminUser= calls =requirePriviliged("/404")= --- redirects
  unauthorized users to the catch-all (line 82)
- =requireUser()= handles the unauthenticated case upstream and always
  redirects to =/login= (line 58)

**** Failed attempt: =HttpStatusCode= with =deferStream=
:PROPERTIES:
:CUSTOM_ID: failed-attempt-httpstatuscode-with-deferstream
:END:
Before settling on the redirect approach, we tried rendering
=<HttpStatusCode code={404} />= inline via a =<Show>= fallback,
expecting =deferStream: true= on =createAsync= to hold the HTTP response
until the resource resolved. The theory was sound --- if the stream is
deferred, the component renders with the resolved user before any bytes
are sent, so =HttpStatusCode= should be able to set the status in time.

Server logs proved the component /did/ render server-side with the 404
branch before flush:

#+begin_example
[audit/Page] render — user(): undefined        ← synchronous render pass
[audit/Page] outer Show fallback — user() is falsy
[getUser] OK — user: kenware role: viewer       ← resource resolves
[audit/Page] render — user(): {...}             ← reactive re-render
[audit/Page] DENIED — rendering HttpStatusCode 404
#+end_example

But the HTTP status was still 200.

***** Why =deferStream= defers but =HttpStatusCode= still fails
:PROPERTIES:
:CUSTOM_ID: why-deferstream-defers-but-httpstatuscode-still-fails
:END:
The root =<Suspense>= in =src/app.tsx= (line 8) wraps all route children
with no fallback. When =createAsync='s =user()= throws a pending
promise, this Suspense boundary catches it. =deferStream: true= tells
the boundary to hold the stream until the resource resolves. The stream
/is/ held.

When =getUser= resolves, the component re-renders inside the Suspense
boundary, the DENIED branch renders =<HttpStatusCode code={404} />=, and
then the stream flushes. So =HttpStatusCode= renders server-side before
the flush --- but the status is still 200.

The issue is framework-level: =HttpStatusCode= sets the status via a
one-time setup effect (like =useRequest().response.status = code=) that
only fires during the initial synchronous shell render --- *not* during
Suspense-deferred re-renders, even if the stream hasn't flushed yet.

From the docs:

#+begin_quote
The HTTP Status can only be included if added before the stream first
flushed.
#+end_quote

And from the =renderToStream= docs: the status is committed during
=onCompleteShell= --- the synchronous render pass. =deferStream= delays
the flush, but the status-setting mechanism is tied to the shell phase,
not the flush phase.

***** Alternatives that were considered
:PROPERTIES:
:CUSTOM_ID: alternatives-that-were-considered
:END:
1. *=mode: "async"= in entry-server* --- the server fully renders the
   page before sending any response, eliminating the Suspense/streaming
   race. =HttpStatusCode= would work because there's only one render
   pass. Tradeoff: slower TTFB on all routes since nothing streams until
   everything resolves.

2. *Server-side middleware* --- check the role and return 404 before the
   component ever renders. Keeps streaming for everything else.

3. *=throw redirect("/404")=* --- the approach we adopted. Bypasses the
   component render entirely by redirecting at the server function
   level, before any layout or component code runs.
