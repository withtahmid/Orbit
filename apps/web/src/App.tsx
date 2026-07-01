import { useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { RouterProvider } from "react-router-dom";
import { toast } from "sonner";
import { rootStore } from "@/stores/RootStore";
import { StoreProvider } from "@/stores/useStore";
import { router } from "@/router";
import { trpc, trpcClient } from "@/trpc";

// Guards against every failing query/mutation in a batch triggering its
// own redirect once the session is already known to be dead.
let isHandlingAuthError = false;

const handleQueryError = (error: unknown) => {
    if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED" &&
        rootStore.authStore.isAuthenticated &&
        !rootStore.authStore.isRotatingToken &&
        !isHandlingAuthError
    ) {
        isHandlingAuthError = true;
        rootStore.authStore.clearAuth();
        toast.error("Your session has expired. Please sign in again.");
        const from = encodeURIComponent(window.location.pathname + window.location.search);
        router.navigate(`/login?from=${from}`, { replace: true }).finally(() => {
            isHandlingAuthError = false;
        });
    }
};

const App = () => {
    const [client] = useState(() => trpcClient);
    const [queryClient] = useState(
        () =>
            new QueryClient({
                queryCache: new QueryCache({ onError: handleQueryError }),
                mutationCache: new MutationCache({ onError: handleQueryError }),
                defaultOptions: {
                    queries: {
                        refetchOnWindowFocus: false,
                        staleTime: 30 * 1000,
                    },
                },
            })
    );

    return (
        <trpc.Provider client={client} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <StoreProvider value={rootStore}>
                    <RouterProvider router={router} />
                </StoreProvider>
            </QueryClientProvider>
        </trpc.Provider>
    );
};

export default App;
