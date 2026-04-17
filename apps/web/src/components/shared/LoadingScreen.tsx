import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingScreen({ className }: { className?: string }) {
    return (
        <div className={cn("flex h-[60vh] items-center justify-center", className)}>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
    );
}

export function FullPageSpinner() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Loader2 className="size-6 animate-spin text-primary" />
        </div>
    );
}
