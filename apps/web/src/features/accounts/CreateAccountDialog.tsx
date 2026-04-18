import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { trpc } from "@/trpc";
import { useCurrentSpaceId } from "@/hooks/useCurrentSpace";
import { DEFAULT_COLOR } from "@/lib/entityStyle";

type AccountType = "asset" | "liability" | "locked";

const DEFAULT_ICON_BY_TYPE: Record<AccountType, string> = {
    asset: "wallet",
    liability: "credit-card",
    locked: "piggy-bank",
};

export function CreateAccountDialog() {
    const spaceId = useCurrentSpaceId();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [accountType, setAccountType] = useState<AccountType>("asset");
    const [color, setColor] = useState<string>(DEFAULT_COLOR);
    const [icon, setIcon] = useState(DEFAULT_ICON_BY_TYPE.asset);
    const [iconTouched, setIconTouched] = useState(false);
    const utils = trpc.useUtils();

    const create = trpc.account.create.useMutation({
        onSuccess: async () => {
            toast.success("Account created");
            await utils.account.listBySpace.invalidate({ spaceId });
            setName("");
            setAccountType("asset");
            setIcon(DEFAULT_ICON_BY_TYPE.asset);
            setIconTouched(false);
            setColor(DEFAULT_COLOR);
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="gradient">
                    <Plus />
                    New account
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create an account</DialogTitle>
                    <DialogDescription>
                        Accounts hold money. Locked accounts (FD, DPS) can't be spent from.
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim()) return;
                        create.mutate({
                            space_id: spaceId,
                            name: name.trim(),
                            account_type: accountType,
                            color,
                            icon,
                        });
                    }}
                    className="grid gap-4"
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="account-name">Name</Label>
                        <Input
                            id="account-name"
                            placeholder="Cash, Checking, Credit card…"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            required
                            maxLength={255}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Account type</Label>
                        <Select
                            value={accountType}
                            onValueChange={(v) => {
                                const next = v as AccountType;
                                setAccountType(next);
                                if (!iconTouched) setIcon(DEFAULT_ICON_BY_TYPE[next]);
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="asset">
                                    Asset — cash, bank, etc.
                                </SelectItem>
                                <SelectItem value="liability">
                                    Liability — credit card, loans
                                </SelectItem>
                                <SelectItem value="locked">
                                    Locked — FD, DPS (cannot spend)
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <EntityStyleFields
                        name={name}
                        color={color}
                        setColor={setColor}
                        icon={icon}
                        setIcon={(i) => {
                            setIcon(i);
                            setIconTouched(true);
                        }}
                    />
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="gradient"
                            disabled={!name.trim() || create.isPending}
                        >
                            {create.isPending ? "Creating…" : "Create account"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
