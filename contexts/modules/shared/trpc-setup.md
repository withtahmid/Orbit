# tRPC setup

> tRPC v11 wired through Express on the server, with a shared singleton `services` object injected per request; web uses `@trpc/react-query` and pulls `AppRouter` directly from server source for zero-codegen end-to-end types.

## Components

Server:

- `apps/server/src/trpc/index.mts` — `t = initTRPC.context<Context>().create()`, exports `router`, `procedure`.
- `apps/server/src/trpc/context.mts` — `createContext({ req })` shape: `{ auth: { user }, services }`. The `services` object is created once at module load (`context.mts:5`); the `idempotencyCleanup` sweep timer is also started here.
- `apps/server/src/trpc/auth.mts` — `signJWT({ userId })` (no expiry), `authorizeJWT(authHeader)`, `fetchUserFromJWT(payload, qb)`. Currently `fetchUserFromJWT` does NOT touch the DB — it trusts the JWT payload (the DB lookup is commented out at `auth.mts:41-53`).
- `apps/server/src/trpc/middlewares/`:
  - `public.mts` — `publicProcedure = procedure.use(filterMutationsOnDemoMiddleware).use(mutationLoggerMiddleware)`.
  - `authorized.mts` — `authorizedProcedure = t.procedure.use(filterMutations).use(mutationLogger).use(is_authenticated)`. The last middleware throws `UNAUTHORIZED` if `ctx.auth.user` is null and narrows the type to `AuthenticatedUser` for downstream.
  - `mutationLogger.mts` — records mutation duration + payload but the actual DB insert is commented out (`mutationLogger.mts:32-41`). Currently a no-op timing wrapper.
  - `filterMutationsOnDemo.mts` — when `IS_DEMO`, throws `FORBIDDEN` for any mutation not in `DEMO_ALLOWED_MUTATIONS = new Set(["auth.login"])`.
- `apps/server/src/routers/index.mts` — composes 15 feature routers (`health`, `auth`, `space`, `account`, `event`, `envelop`, `plan`, `expenseCategory`, `transaction`, `allocation`, `analytics`, `file`, `user`, `personal`, `reckoning`) into `appRouter` and `export type AppRouter`.
- `apps/server/src/services/index.mts` — `createServices()` returns `{ pgPool, qb, mailer, r2 }`. Singleton in `context.mts`.
- Mounted in `apps/server/src/index.mts:28-34` via `trpcExpress.createExpressMiddleware`. In `NODE_ENV=development`, `trpc-playground` is also exposed at `/trpc-playground` (`index.mts:36-45`).

Web:

- `apps/web/src/trpc.ts` — `createTRPCReact<AppRouter>()`. The `AppRouter` import points at `../../server/src/routers/index.mjs` (cross-package relative import, no codegen). Also re-exports `RouterInput` / `RouterOutput` for hand-typed call-sites.
- `apps/web/src/App.tsx:24-30` — `<trpc.Provider client={trpcClient} queryClient={queryClient}>` wraps `<QueryClientProvider>` and the rest of the app.

## Flow

### Per-request server pipeline

1. Express receives `POST /trpc/<batchKey>`. `cors()` + `express.json()` run first (`index.mts:16-17`).
2. `createContext({ req })` (`context.mts:9-18`) reads `req.headers.authorization`, decodes the JWT (`authorizeJWT`), and returns `{ auth: { user }, services }`. `services` is the module-scoped singleton — it's NOT recreated per request.
3. The procedure-specific middleware chain runs. For `authorizedProcedure` that's: demo-filter → mutation-logger → is_authenticated.
4. Zod input parsing, handler, output parsing (when an `.output()` is declared).

### Web client token rotation (`trpc.ts:9-22`)

```ts
const getHeaders = () => {
    const token = localStorage.getItem("auth_token");
    if (token) return { Authorization: `Bearer ${token}` };
    const signupToken = localStorage.getItem("signup_token");
    if (signupToken) return { Authorization: `Bearer ${signupToken}` };
    const resetToken = localStorage.getItem("password_reset_token");
    if (resetToken) return { Authorization: `Bearer ${resetToken}` };
    return {};
};
```

`httpBatchLink` calls `getHeaders` on every batch, so swapping tokens mid-flow (signup → auth) takes effect on the next mutation without a client reset.

### End-to-end types

`apps/web/src/trpc.ts:2` imports `AppRouter` from `../../server/src/routers/index.mjs`. TypeScript resolves through the workspace, so a server-side input change is a web-side type error on the next `tsc`. No regen step, no `.d.ts` artifact.

### QueryClient defaults (`App.tsx:11-21`)

```ts
new QueryClient({
    defaultOptions: {
        queries: { refetchOnWindowFocus: false, staleTime: 30 * 1000 },
    },
});
```

30-second staleTime is the global default; individual hooks like `useSignedUrl` set their own `staleTime` (12 min there).

## Conventions & gotchas

- **ESM-only imports use `.mjs`**: server source is `.mts`, but imports between source files must specify `.mjs` (e.g. `import { router } from "../trpc/index.mjs"`). TypeScript resolves through; the runtime needs the compiled extension.
- **One procedure per file**: under `procedures/<resource>/<action>.mts`. The feature router (`routers/<resource>.mts`) just re-exports them into a `router({...})`. See `routers/auth.mts` and `routers/file.mts` for the pattern.
- **`services` is a singleton across requests**: `context.mts:5` calls `createServices()` once at module load. Don't recreate per request — the pg pool would multiply.
- **`authorizedProcedure` is the default for authed endpoints**: it already chains demo-filter and mutation-logger. Don't re-add those middlewares.
- **Demo mode locks writes twice**: `filterMutationsOnDemoMiddleware` rejects at the tRPC layer, and `db/index.mts` sets `default_transaction_read_only = on` on every pg connection. Belt-and-suspenders for CLI / direct-pg paths.
- **`mutationLoggerMiddleware` is a no-op**: the insert is commented out (`mutationLogger.mts:32-41`); only timing/diagnostics is happening. If a feature wants real audit logging, uncomment + create the `mutation_logs` table.
- **No JWT expiry on the main auth token**: `signJWT` doesn't pass `expiresIn` (`auth.mts:11-13`). Tokens live until the user logs out.
- **`fetchUserFromJWT` trusts the payload**: no DB validation. A deleted user with a valid token still gets `ctx.auth.user = { id: payload.userId }`. Procedures that need the user row must `selectFrom("users")` themselves (e.g. `me.mts:16`).

## Cross-references

- `./auth-flow.md` — how JWTs get into and out of `Authorization` headers.
- `./stores.md` — `AuthStore` writes the `auth_token` that `trpc.ts:getHeaders` reads.
- `./db-layer.md` — `services.qb`, the typed Kysely instance attached to every context.
