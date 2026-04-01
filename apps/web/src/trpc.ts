import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../server/src/routers/index.mjs";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { baseBackendURL } from "./config/urls";

export const trpc = createTRPCReact<AppRouter>();

const getHeader = () => {
    const token = localStorage.getItem("TOKEN");
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const trpcClient = trpc.createClient({
    links: [
        httpBatchLink({
            url: `${baseBackendURL}/trpc`,
            headers: getHeader(),
        }),
    ],
});

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
