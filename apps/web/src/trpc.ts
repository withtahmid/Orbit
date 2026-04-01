import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../server/src/routers/index.mjs";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { baseBackendURL } from "./config/urls";

export const trpc = createTRPCReact<AppRouter>();

const getHeaders = () => {
    const token = localStorage.getItem("auth_token");
    if (token) return { Authorization: `Bearer ${token}` };

    // During signup flow, use the signup token
    const signupToken = localStorage.getItem("signup_token");
    if (signupToken) return { Authorization: `Bearer ${signupToken}` };

    // During password reset flow
    const resetToken = localStorage.getItem("password_reset_token");
    if (resetToken) return { Authorization: `Bearer ${resetToken}` };

    return {};
};

export const trpcClient = trpc.createClient({
    links: [
        httpBatchLink({
            url: `${baseBackendURL}/trpc`,
            headers: getHeaders,
        }),
    ],
});

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
