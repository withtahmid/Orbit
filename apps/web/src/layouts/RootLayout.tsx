import { Outlet, ScrollRestoration } from "react-router-dom";
import { DemoBanner } from "@/components/DemoBanner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function RootLayout() {
    return (
        <TooltipProvider delayDuration={200}>
            <ScrollRestoration />
            <DemoBanner />
            <Outlet />
            <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
    );
}
