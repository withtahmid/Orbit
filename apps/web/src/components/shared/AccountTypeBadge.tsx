import { Badge } from "@/components/ui/badge";
import { Wallet, TrendingDown, Lock } from "lucide-react";

type AccountType = "asset" | "liability" | "locked";

export function AccountTypeBadge({ type }: { type: AccountType }) {
    if (type === "asset") {
        return (
            <Badge variant="success">
                <Wallet className="size-3" />
                Asset
            </Badge>
        );
    }
    if (type === "liability") {
        return (
            <Badge variant="destructive">
                <TrendingDown className="size-3" />
                Liability
            </Badge>
        );
    }
    return (
        <Badge variant="secondary">
            <Lock className="size-3" />
            Locked
        </Badge>
    );
}
