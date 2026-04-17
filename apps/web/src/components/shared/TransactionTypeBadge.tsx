import { Badge } from "@/components/ui/badge";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Scale } from "lucide-react";

type Type = "income" | "expense" | "transfer" | "adjustment";

export function TransactionTypeBadge({ type }: { type: Type }) {
    if (type === "income") {
        return (
            <Badge variant="income">
                <ArrowDownLeft className="size-3" />
                Income
            </Badge>
        );
    }
    if (type === "expense") {
        return (
            <Badge variant="expense">
                <ArrowUpRight className="size-3" />
                Expense
            </Badge>
        );
    }
    if (type === "transfer") {
        return (
            <Badge variant="transfer">
                <ArrowLeftRight className="size-3" />
                Transfer
            </Badge>
        );
    }
    return (
        <Badge variant="outline">
            <Scale className="size-3" />
            Adjustment
        </Badge>
    );
}
