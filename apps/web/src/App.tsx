import { rootStore } from "@/stores/RootStore";
import { StoreProvider } from "@/stores/useStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import "@/App.css";
import { router } from "@/router";
import { trpc, trpcClient } from "@/trpc";
import { RouterProvider } from "react-router-dom";

const App = () => {
    const [client] = useState(() => trpcClient);
    const [queryClient] = useState(() => new QueryClient());

    return (
        <trpc.Provider client={client} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <StoreProvider value={rootStore}></StoreProvider>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </trpc.Provider>
    );
};

export default App;
