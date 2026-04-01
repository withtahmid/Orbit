# React Router Template — Production Setup

A batteries-included routing template for Vite + React + TypeScript + MobX projects.

---

## Folder Structure

```
src/
├── App.tsx                        # RouterProvider + StoreProvider
├── main.tsx                       # ReactDOM.createRoot
│
├── router/
│   ├── index.tsx                  # createBrowserRouter — all routes defined here
│   ├── routes.ts                  # ROUTES constant — single source of path truth
│   └── guards/
│       ├── PublicRoute.tsx        # Passes through to everyone
│       ├── ProtectedRoute.tsx     # Requires auth (reads MobX AuthStore)
│       └── GuestOnlyRoute.tsx    # Blocks logged-in users (login/signup pages)
│
├── layouts/
│   ├── RootLayout.tsx             # Outermost shell (wraps everything)
│   ├── AuthLayout.tsx             # Centered card layout for auth pages
│   └── DashboardLayout.tsx        # Sidebar + topbar for protected pages
│
├── pages/
│   ├── public/
│   │   ├── HomePage.tsx           # /
│   │   ├── AboutPage.tsx          # /about
│   │   └── NotFoundPage.tsx       # * (catch-all)
│   ├── auth/
│   │   ├── LoginPage.tsx          # /login        (guest-only)
│   │   ├── SignupPage.tsx         # /signup       (guest-only)
│   │   └── ForgotPasswordPage.tsx # /forgot-password (guest-only)
│   └── dashboard/
│       ├── DashboardPage.tsx      # /dashboard
│       ├── ProfilePage.tsx        # /profile
│       ├── UserDetailPage.tsx     # /users/:userId        ← URL param
│       ├── SearchPage.tsx         # /search?q=&page=      ← query params
│       ├── SettingsPage.tsx       # /settings             ← parent of nested routes
│       └── settings/
│           ├── SettingsGeneralPage.tsx   # /settings/general (index)
│           └── SettingsSecurityPage.tsx  # /settings/security
│
├── stores/
│   ├── AuthStore.ts               # MobX auth state + localStorage persistence
│   ├── RootStore.ts               # Composes all stores
│   └── useStore.ts                # StoreContext + useStore() hook
│
└── hooks/
    └── useAppNavigate.ts          # Typed navigation helpers
```

---

## Three Route Types

### 1. Public Route (`PublicRoute`)
Accessible by anyone — logged in or not.

```tsx
// router/index.tsx
{
  element: <PublicRoute />,
  children: [
    { path: "/",      element: <HomePage /> },
    { path: "/about", element: <AboutPage /> },
  ],
}
```

### 2. Guest-Only Route (`GuestOnlyRoute`)
For `/login`, `/signup`, etc. Redirects already-authenticated users away.
Respects the `?from=` parameter so the full redirect chain works:

```
User visits /dashboard
  → ProtectedRoute redirects to /login?from=%2Fdashboard
  → User logs in
  → LoginPage reads ?from= and navigates to /dashboard
```

```tsx
{
  element: <GuestOnlyRoute redirectTo="/dashboard" />,
  children: [
    { path: "/login",           element: <LoginPage /> },
    { path: "/signup",          element: <SignupPage /> },
    { path: "/forgot-password", element: <ForgotPasswordPage /> },
  ],
}
```

### 3. Protected Route (`ProtectedRoute`)
Requires authentication. Reads `authStore.isAuthenticated` from MobX.
Shows a loading spinner while the store rehydrates from localStorage (prevents flash-of-redirect on page refresh).

```tsx
{
  element: <ProtectedRoute redirectTo="/login" />,
  children: [
    { path: "/dashboard", element: <DashboardPage /> },
    // ...
  ],
}
```

---

## Route Patterns

### URL Param — `/users/:userId`
```tsx
// router/index.tsx
{ path: "/users/:userId", element: <UserDetailPage /> }

// UserDetailPage.tsx
import { useParams } from "react-router-dom";
const { userId } = useParams<{ userId: string }>();

// Navigate to it
import { ROUTES } from "@/router/routes";
navigate(ROUTES.userDetail("42"));
```

### Query Params — `/search?q=…&page=…`
```tsx
// SearchPage.tsx
import { useSearchParams } from "react-router-dom";
const [searchParams, setSearchParams] = useSearchParams();

const q    = searchParams.get("q") ?? "";
const page = Number(searchParams.get("page") ?? "1");

// Update URL (adds to history)
setSearchParams({ q: "new query", page: "1" });

// Update URL (replace, no history entry)
setSearchParams({ q: "new query", page: "1" }, { replace: true });

// Navigate with query params
navigate(ROUTES.searchWithQuery({ q: "react", page: "2" }));
```

### Nested Routes — `/settings/*`
The parent renders `<Outlet />` where children appear.

```tsx
// router/index.tsx
{
  path: "/settings",
  element: <SettingsPage />,       // renders <Outlet />
  children: [
    { index: true,          element: <SettingsGeneralPage /> },  // /settings
    { path: "general",      element: <SettingsGeneralPage /> },  // /settings/general
    { path: "security",     element: <SettingsSecurityPage /> }, // /settings/security
  ],
}

// SettingsPage.tsx
import { Outlet, NavLink } from "react-router-dom";
<NavLink to="/settings/general">General</NavLink>
<NavLink to="/settings/security">Security</NavLink>
<Outlet /> {/* child renders here */}
```

---

## ROUTES Constant

Never hardcode paths in components. Import from `@/router/routes`:

```ts
import { ROUTES } from "@/router/routes";

// Static
navigate(ROUTES.dashboard);
navigate(ROUTES.login);

// Dynamic param
navigate(ROUTES.userDetail("42"));

// Query params
navigate(ROUTES.searchWithQuery({ q: "react", page: "1" }));

// Link component
<Link to={ROUTES.about}>About</Link>
```

---

## MobX Auth Store

`AuthStore` is the single source of auth truth. It persists the token in `localStorage` and rehydrates on startup.

```ts
// Logging in (call after API success)
authStore.setAuth(token, user);

// Logging out
authStore.clearAuth();

// Reading state
authStore.isAuthenticated  // boolean
authStore.user             // AuthUser | null
authStore.token            // string | null
authStore.isLoading        // true while rehydrating
```

---

## Typed Navigation Hook

```ts
import { useAppNavigate } from "@/hooks/useAppNavigate";

const nav = useAppNavigate();

nav.toDashboard();
nav.toUserDetail("42");
nav.toSearch({ q: "mobx" });
nav.toLogin();
nav.back();
```

---

## Required vite.config.ts (path alias)

```ts
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Also add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

---

## Quick Checklist for New Projects

- [ ] Copy `src/router/`, `src/stores/`, `src/layouts/`, `src/hooks/`
- [ ] Update `ROUTES` in `router/routes.ts` with your paths
- [ ] Wire `<RouterProvider>` and `<StoreProvider>` in `App.tsx`
- [ ] Replace mock login in `LoginPage.tsx` with real tRPC/API call
- [ ] Add your own stores to `RootStore.ts`
- [ ] Build your pages and add them to `router/index.tsx`