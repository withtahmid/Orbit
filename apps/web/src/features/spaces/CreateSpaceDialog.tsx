import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
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
import { trpc } from "@/trpc";
import { ROUTES } from "@/router/routes";

export function CreateSpaceDialog({
    trigger,
    onCreated,
}: {
    trigger?: React.ReactNode;
    onCreated?: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const utils = trpc.useUtils();
    const create = trpc.space.create.useMutation({
        onSuccess: async (space) => {
            toast.success("Space created");
            await utils.space.list.invalidate();
            setName("");
            setOpen(false);
            if (onCreated) onCreated(space.id);
            else navigate(ROUTES.space(space.id));
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button variant="gradient">
                        <Plus />
                        New space
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create a new space</DialogTitle>
                    <DialogDescription>
                        Spaces keep your finances organized. You can collaborate with others in
                        a space.
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim()) return;
                        create.mutate({ name: name.trim() });
                    }}
                    className="grid gap-3"
                >
                    <Label htmlFor="space-name">Space name</Label>
                    <Input
                        id="space-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Family finances, Vacation fund…"
                        autoFocus
                        required
                        maxLength={100}
                    />
                    <DialogFooter>
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
                            {create.isPending ? "Creating…" : "Create space"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
