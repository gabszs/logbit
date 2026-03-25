# Frontend Architecture — TanStack Router + Better Auth

This file defines the architecture, patterns, and conventions for this frontend.
Follow these rules when generating, editing, or reviewing any route, auth, or data-fetching code.

---

## Stack

- **Router**: TanStack Router (file-based routing)
- **Auth**: Better Auth (`authClient`)
- **Server state**: TanStack Query (`queryClient`)
- **Language**: TypeScript (strict)

---

## Route File Structure

```
src/routes/
├── __root.tsx                    # Global layout, router context, root error boundary
├── index.tsx                     # Landing page (public)
├── auth/
│   ├── sign-in.tsx
│   └── -components/
│       └── sign-in-form.tsx
├── chat/
│   ├── route.tsx                 # Layout route — auth guard + shared chat shell
│   ├── $chatId.tsx               # Individual chat page
│   ├── -components/              # Private components scoped to /chat
│   │   ├── chat-shell.tsx
│   │   ├── message-input.tsx
│   │   └── chat-error.tsx
│   └── -hooks/                   # Private hooks scoped to /chat
│       └── use-pending-message.ts
└── settings/
    ├── route.tsx                 # Layout route — auth guard + redirect to /settings/profile
    ├── profile.tsx
    ├── models.tsx
    └── -components/
        └── settings-error.tsx
```

### File naming conventions

| Pattern | Example | URL produced | Purpose |
|---|---|---|---|
| `index.tsx` | `routes/index.tsx` | `/` | Exact path match |
| `route.tsx` | `routes/chat/route.tsx` | `/chat` | Layout — wraps children via `<Outlet />` |
| `$param.tsx` | `routes/chat/$chatId.tsx` | `/chat/123` | Dynamic segment |
| `_pathless/` | `routes/_auth/` | No URL change | Shared guards without URL nesting — **avoid, see below** |
| `-folder/` | `routes/chat/-components/` | Not a route | Private files, ignored by the router |
| `$.tsx` | `routes/docs/$.tsx` | `/docs/a/b/c` | Catch-all |

---

## Route Organization

### Use feature-based `route.tsx` as layout routes

Each major feature gets its own directory with a `route.tsx` that acts as a layout wrapper.
This is the chosen pattern because it:

- Allows auth guards and shared UI to be defined once and inherited by all children
- Enables colocation of components (`-components/`) and hooks (`-hooks/`) next to the routes that use them
- Keeps a predictable, flat-as-possible hierarchy — static pages stay at root level, features get their own folder

```ts
// routes/chat/route.tsx — layout for all /chat/* routes
export const Route = createFileRoute('/chat')({
  beforeLoad: async (opts) => {
    await requireAuthenticated({
      authClient: opts.context.authClient,
      location: opts.location,
    })
  },
  component: () => <ChatShell><Outlet /></ChatShell>,
  pendingComponent: AppShellSkeleton,
  errorComponent: ChatError,
})
```

All child routes (`/chat/$chatId`, etc.) automatically inherit the auth guard, loading state, error boundary, and shared shell. There is no need to repeat any of this in child routes.

### Do not use `_pathless/` layout groups

`_pathless/` layouts cause cryptic route conflicts. If `_authenticated/dashboard.tsx` creates `/dashboard` and a `dashboard.tsx` also exists at root, the router throws a duplicate route error. Managing which files belong inside vs outside the pathless folder becomes a maintenance problem. Use `route.tsx` parent layouts instead — they are explicit, predictable, and conflict-free.

### Do not create `index.tsx` inside feature directories unless strictly necessary

For `/settings`, redirect to a default child (`/settings/profile`) in `beforeLoad` instead of creating a `settings/index.tsx`. For `/chat`, use conditional rendering in the layout component. This avoids an extra file and keeps the structure lean.

---

## Authentication Guards

### The problem with synchronous guards

The naive pattern — checking `isAuthenticated` synchronously in `beforeLoad` — causes a race condition:

1. User navigates to `/chat`
2. Auth session is still fetching from the server
3. `isAuthenticated` is `false` because the session hasn't loaded yet
4. Guard fires immediately and redirects to `/auth/sign-in`
5. Auth finishes loading — user is actually authenticated
6. Another redirect back to `/chat`

The result is a visible flash between pages. The fix is to make guards wait for auth to fully resolve before making any redirect decision.

### The correct pattern: async guards with `getSession()`

```ts
// src/lib/route-guards.ts

export async function requireAuthenticated({ authClient, location }) {
  // Awaiting getSession() pauses beforeLoad until auth is resolved.
  // The router shows pendingComponent during this wait — no blank screen.
  const { data: session } = await authClient.getSession()

  if (!session) {
    throw redirect({
      to: '/auth/sign-in',
      replace: true,
      search: { redirect: location.href ?? location.pathname ?? '/' },
    })
  }
}

export async function redirectIfAuthenticated({ authClient, to }) {
  const { data: session } = await authClient.getSession()

  if (session) {
    throw redirect({ to, replace: true })
  }
}
```

Because `beforeLoad` is async and TanStack Router awaits it, the router holds the navigation and shows `pendingComponent` until the Promise resolves. This eliminates the race condition entirely — the guard only ever makes decisions on fully resolved auth state.

### Where to place guards

Place `requireAuthenticated` in the **parent** `route.tsx` `beforeLoad`. Child routes inherit the guard automatically. There is no reason to repeat the guard in child routes — doing so adds noise and creates inconsistency if the guard logic ever changes.

Place `redirectIfAuthenticated` on public auth routes (e.g. `/auth/sign-in`) so authenticated users are immediately sent to the app instead of seeing the sign-in page.

### `getSession()` in guards vs `useSession()` in components

These two methods serve different purposes and should not be swapped:

- **`authClient.getSession()`** — returns a Promise, awaitable inside `beforeLoad` (not a React component, cannot use hooks). Used exclusively in route guards.
- **`authClient.useSession()`** — a React hook, provides reactive session state to components. Used exclusively inside `AuthProvider`, which exposes state via context.

Both hit the same underlying cache, so using both has no performance cost.

---

## AuthProvider

`AuthProvider` calls `authClient.useSession()` exactly once and exposes the result via context. It wraps `<RouterProvider>` so auth state is available to all routes and components.

```ts
// src/components/auth-provider.tsx
export function AuthProvider({ children }: PropsWithChildren) {
  const { data: session, isPending, error } = authClient.useSession()

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!session?.user,
      session: session ?? null,
      isPending,
    }),
    [session, isPending]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
```

Components treat `!isAuthenticated` as a single state that covers both "loading" and "unauthenticated". This is intentional — showing "Sign In" during the brief loading period is a safe, correct default for navigation UI, and it avoids scattering `if (isPending) return <Loader />` checks throughout the codebase. The router's `pendingComponent` handles the loading experience for route-level content.

---

## Redirects

### Always redirect in `beforeLoad`, never in `useEffect`

The `useEffect` redirect pattern mounts the component and renders it before the redirect fires, which causes a visible flash of the wrong UI. `beforeLoad` runs before the component is ever rendered, so the user never sees the intermediate state.

```ts
// ✅ Correct — redirect before render
beforeLoad: async (opts) => {
  await requireAuthenticated({ authClient: opts.context.authClient, location: opts.location })

  const pathname = opts.location.pathname ?? ''
  if (pathname === '/settings' || pathname === '/settings/') {
    throw redirect({ to: '/settings/profile', replace: true })
  }
}

// ❌ Wrong — component mounts, user sees empty layout, then redirect fires
function SettingsLayout() {
  const navigate = useNavigate()
  useEffect(() => {
    if (location.pathname === '/settings') navigate({ to: '/settings/profile' })
  }, [])
  return <SettingsShell><Outlet /></SettingsShell>
}
```

The `beforeLoad` approach is also SSR-compatible and keeps all navigation decisions in route configuration, not scattered across component lifecycles.

---

## Data Loading

### Prefetch in `loader`, always in parallel

The `loader` function runs after `beforeLoad` resolves (auth is already confirmed) and before the component renders. Prefetching here eliminates loading waterfalls — the component renders with data already in the cache.

```ts
// routes/chat/$chatId.tsx
export const Route = createFileRoute('/chat/$chatId')({
  loader: async ({ params, context }) => {
    // Independent queries run in parallel — never sequential await
    await Promise.all([
      context.queryClient.ensureQueryData(messagesQuery(params.chatId)),
      context.queryClient.ensureQueryData(conversationQuery(params.chatId)),
    ])
  },
  component: ChatPage,
  pendingComponent: ChatPageSkeleton,
  errorComponent: ChatError,
})
```

Sequential `await` calls for independent queries create a waterfall: each query waits for the previous one to finish before starting. `Promise.all` starts all queries simultaneously — always faster when queries don't depend on each other.

Throw errors in `loader` when a required resource is not found. This lets `errorComponent` handle the failure gracefully instead of the component rendering with missing data.

---

## Loading and Error States

### Every route must define `pendingComponent` and `errorComponent`

`pendingComponent` is shown during the entire async `beforeLoad` (including the auth await) and `loader` execution. Without it, the user sees a blank screen during navigation. Every route must define one.

`errorComponent` scopes errors to the affected route instead of crashing the entire app. The root `__root.tsx` defines a catch-all error boundary, but feature routes should define their own for better UX.

### Skeleton guidelines

- Match the exact layout structure of the final rendered component so the transition is smooth
- Use simple rectangles for dynamic content areas (messages, lists)
- Replicate static elements (headers, navigation) exactly to minimize visual layout shift

### Error component guidelines

```ts
function ChatError({ error }: ErrorComponentProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center space-y-4">
        <h2>Conversation not found</h2>
        <p>This conversation may have been deleted.</p>
        {import.meta.env.DEV && <pre>{error.message}</pre>}
        <Button onClick={() => router.navigate({ to: '/chat' })}>
          Start a New Chat
        </Button>
      </div>
    </div>
  )
}
```

- Show a user-friendly message, never raw error text in production
- In `DEV` only, expose `error.message` via `<pre>` for debugging
- Always provide a recovery action so the user is not stuck

---

## Search Params

### Validate all user-controlled search params

Users can manually edit URLs. Unvalidated search params — especially redirect targets on auth pages — are a security risk (open redirect vulnerability). Use `validateSearch` to sanitize inputs at the route level before they reach `beforeLoad` or components.

```ts
// routes/auth/sign-in.tsx

const FALLBACK_REDIRECT = '/chat'

function sanitizeRedirect(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return FALLBACK_REDIRECT
  if (!raw.startsWith('/')) return FALLBACK_REDIRECT        // block external URLs
  if (raw === '/auth/sign-in') return FALLBACK_REDIRECT     // prevent redirect loop
  return raw
}

export const Route = createFileRoute('/auth/sign-in')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => {
    const redirect = sanitizeRedirect(search.redirect as string | undefined)
    return redirect === FALLBACK_REDIRECT ? {} : { redirect }
  },
  beforeLoad: async (opts) => {
    await redirectIfAuthenticated({
      authClient: opts.context.authClient,
      to: opts.search.redirect || FALLBACK_REDIRECT,  // type-safe after validation
    })
  },
  component: SignInRoute,
  pendingComponent: SignInShellSkeleton,
})
```

`validateSearch` runs before `beforeLoad`, so by the time the guard executes, the redirect value is already sanitized and type-safe.

---

## Router Context

The following must be wired into router context in `main.tsx` and typed in `__root.tsx`:

```ts
// __root.tsx
export interface RouterAppContext {
  orpc: typeof orpc
  queryClient: QueryClient
  authClient: typeof authClient   // for guards (getSession)
  auth: AuthContextValue          // for components (reactive state from AuthProvider)
}

// main.tsx
function AppRouter() {
  const auth = useAuth()
  const routerContext = useMemo(
    () => ({ orpc, queryClient, authClient, auth }),
    [auth]
  )
  return <RouterProvider router={router} context={routerContext} />
}
```

Both `authClient` and `auth` are on context for different reasons: `authClient` is used by guards in `beforeLoad` (which need `getSession()`), and `auth` is the reactive value from `AuthProvider` exposed for use by components.

---

## Better Auth: Production Config

```ts
// server/src/lib/auth.ts
export const auth = betterAuth({
  session: {
    cookieCache: {
      enabled: process.env.NODE_ENV === 'production',
      maxAge: 5 * 60, // 5 minutes
    }
  }
})
```

`cookieCache` makes auth checks very fast (under 10ms) by storing a signed session cookie so subsequent requests don't hit the database. It must be **disabled in development** when the frontend and backend run on different ports (e.g. `:3000` and `:3001`).

The reason: different ports are treated as different origins. Cross-origin cookies require `sameSite=None` and `secure=true`. Secure cookies require HTTPS, which is not available on localhost. If `cookieCache` is left enabled in this dev setup, sign-out breaks silently — the browser refuses to delete the cookie due to the SameSite mismatch, so the user appears to remain authenticated after logging out.

---

## Anti-Patterns Reference

| Anti-pattern | Root cause | Correct approach |
|---|---|---|
| Sync guard checking `isAuthenticated` | Auth may not be resolved yet — causes redirect flash | `await authClient.getSession()` in `beforeLoad` |
| Redirect inside `useEffect` | Component renders before redirect fires — causes UI flash | `throw redirect()` in `beforeLoad` |
| Auth guard repeated in child routes | Parent `route.tsx` guards are inherited automatically | Guard once in parent `route.tsx` only |
| Sequential `await` for independent queries | Creates a waterfall — each query waits unnecessarily | `Promise.all([...])` |
| Missing `pendingComponent` | Blank screen during navigation | Define `pendingComponent` on every route |
| Missing `errorComponent` | One error crashes the full app | Define `errorComponent` on every route |
| Raw unvalidated search params | Open redirect vulnerability | `validateSearch` + `sanitizeRedirect` |
| `_pathless/` layout groups | Causes duplicate route conflicts | Feature-based `route.tsx` layouts |
| `cookieCache` enabled in dev with split ports | Cross-origin cookie mismatch breaks sign-out | `enabled: process.env.NODE_ENV === 'production'` |
