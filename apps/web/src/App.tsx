import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { rootStore } from "@/stores/RootStore";
import { StoreProvider } from "@/stores/useStore";
import { router } from "@/router";
import { trpc, trpcClient } from "@/trpc";

const App = () => {
    const [client] = useState(() => trpcClient);
    const [queryClient] = useState(
        () =>
            new QueryClient({
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
