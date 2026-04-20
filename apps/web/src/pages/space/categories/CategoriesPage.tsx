import { useMemo, useState } from "react";
import {
    FolderTree,
    Plus,
    Trash2,
    ChevronRight,
    Pencil,
    Move,
    FolderInput,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { CategoryTreeSelect } from "@/components/shared/CategoryTreeSelect";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { DEFAULT_COLOR } from "@/lib/entityStyle";

interface CategoryRaw {
    id: string;
    name: string;
    envelop_id: string;
    parent_id: string | null;
    color: string;
    icon: string;
}
interface CategoryNode extends CategoryRaw {
    children: CategoryNode[];
}
interface EnvelopeLite {
    id: string;
    name: string;
    color: string;
    icon: string;
}

function buildTree(flat: CategoryRaw[]): CategoryNode[] {
    const map = new Map<string, CategoryNode>();
    flat.forEach((c) => map.set(c.id, { ...c, children: [] }));
    const roots: CategoryNode[] = [];
    map.forEach((node) => {
        if (node.parent_id && map.has(node.parent_id)) {
            map.get(node.parent_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    });
    return roots;
}

export default function CategoriesPage() {
    const { space } = useCurrentSpace();
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({
        spaceId: space.id,
    });
    const envelopesQuery = trpc.envelop.listBySpace.useQuery({ spaceId: space.id });

    const tree = useMemo(
        () => buildTree((categoriesQuery.data ?? []) as CategoryRaw[]),
        [categoriesQuery.data]
    );
    const envelopes = (envelopesQuery.data ?? []) as EnvelopeLite[];

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Categories"
                description="Categories map to envelopes. Use them for every expense."
                actions={
                    <PermissionGate roles={["owner"]}>
                        <CreateCategoryDialog
                            envelopes={envelopes}
                            categories={(categoriesQuery.data ?? []) as CategoryRaw[]}
                        />
                    </PermissionGate>
                }
            />
            {categoriesQuery.isLoading ? (
                <Card className="p-4">
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                </Card>
            ) : tree.length === 0 ? (
                <EmptyState
                    icon={FolderTree}
                    title="No categories yet"
                    description="Create categories to classify your expenses into envelopes."
                    action={
                        <PermissionGate roles={["owner"]}>
                            <CreateCategoryDialog
                                envelopes={envelopes}
                                categories={(categoriesQuery.data ?? []) as CategoryRaw[]}
                            />
                        </PermissionGate>
                    }
                />
            ) : (
                <Card className="p-2">
                    <div className="grid gap-0.5">
                        {tree.map((node) => (
                            <CategoryRow
                                key={node.id}
                                node={node}
                                depth={0}
                                envelopes={envelopes}
                                allCategories={
                                    (categoriesQuery.data ?? []) as CategoryRaw[]
                                }
                            />
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}

function CategoryRow({
    node,
    depth,
    envelopes,
    allCategories,
}: {
    node: CategoryNode;
    depth: number;
    envelopes: EnvelopeLite[];
    allCategories: CategoryRaw[];
}) {
    const [open, setOpen] = useState(true);
    const envelope = envelopes.find((e) => e.id === node.envelop_id);
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const del = trpc.expenseCategory.delete.useMutation({
        onSuccess: async () => {
            toast.success("Category deleted");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <>
            <div
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
                {node.children.length > 0 ? (
                    <button
                        type="button"
                        onClick={() => setOpen((s) => !s)}
                        className="flex size-5 items-center justify-center text-muted-foreground"
                    >
                        <ChevronRight
                            className={cn(
                                "size-3.5 transition-transform",
                                open && "rotate-90"
                            )}
                        />
                    </button>
                ) : (
                    <span className="size-5" />
                )}
                <EntityAvatar color={node.color} icon={node.icon} size="sm" />
                <span className="text-sm font-medium">{node.name}</span>
                {envelope && (
                    <span className="ml-2 hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                        →
                        <EntityAvatar
                            color={envelope.color}
                            icon={envelope.icon}
                            size="sm"
                        />
                        {envelope.name}
                    </span>
                )}
                <PermissionGate roles={["owner"]}>
                    <div className="ml-auto flex opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <EditCategoryDialog category={node} />
                        <ChangeParentDialog
                            category={node}
                            allCategories={allCategories}
                        />
                        <MoveEnvelopDialog
                            category={node}
                            envelopes={envelopes}
                            hasChildren={node.children.length > 0}
                        />
                        <ConfirmDialog
                            trigger={
                                <Button size="icon" variant="ghost" className="size-7">
                                    <Trash2 className="size-3.5 text-destructive" />
                                </Button>
                            }
                            title={`Delete "${node.name}"?`}
                            description={
                                node.children.length > 0
                                    ? "This category has sub-categories. They must be deleted or reparented first."
                                    : "Transactions using this category will keep it referenced."
                            }
                            confirmLabel="Delete"
                            destructive
                            onConfirm={() => del.mutate({ categoryId: node.id })}
                        />
                    </div>
                </PermissionGate>
            </div>
            {open &&
                node.children.map((c) => (
                    <CategoryRow
                        key={c.id}
                        node={c}
                        depth={depth + 1}
                        envelopes={envelopes}
                        allCategories={allCategories}
                    />
                ))}
        </>
    );
}

function CreateCategoryDialog({
    envelopes,
    categories,
}: {
    envelopes: EnvelopeLite[];
    categories: CategoryRaw[];
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [envelopId, setEnvelopId] = useState("");
    const [parentId, setParentId] = useState("");
    const [color, setColor] = useState<string>(DEFAULT_COLOR);
    const [icon, setIcon] = useState("folder");
    const utils = trpc.useUtils();
    const create = trpc.expenseCategory.create.useMutation({
        onSuccess: async () => {
            toast.success("Category created");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            setName("");
            setEnvelopId("");
            setParentId("");
            setColor(DEFAULT_COLOR);
            setIcon("folder");
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    // When parent is selected, lock the envelope to the parent's envelope.
    const parentCategory = parentId ? categories.find((c) => c.id === parentId) : null;
    const effectiveEnvelopId = parentCategory ? parentCategory.envelop_id : envelopId;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="gradient">
                    <Plus />
                    New category
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create category</DialogTitle>
                    <DialogDescription>
                        Categories must be linked to an envelope. Sub-categories inherit the
                        parent's envelope.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim()) return;
                        if (!effectiveEnvelopId) {
                            toast.error("Pick an envelope");
                            return;
                        }
                        if (envelopes.length === 0) {
                            toast.error("Create an envelope first");
                            return;
                        }
                        create.mutate({
                            spaceId: space.id,
                            name: name.trim(),
                            envelopId: effectiveEnvelopId,
                            parentId: parentId || undefined,
                            color,
                            icon,
                        });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="cat-name">Name</Label>
                        <Input
                            id="cat-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Groceries, Restaurants…"
                            required
                            maxLength={255}
                            autoFocus
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Parent category (optional)</Label>
                        <CategoryTreeSelect
                            categories={categories as any}
                            value={parentId || null}
                            onChange={(v) => setParentId(v ?? "")}
                            placeholder="(none — top level)"
                            allowAll={false}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Envelope</Label>
                        <Select
                            value={effectiveEnvelopId}
                            onValueChange={setEnvelopId}
                            disabled={!!parentCategory}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Choose envelope" />
                            </SelectTrigger>
                            <SelectContent>
                                {envelopes.map((e) => (
                                    <SelectItem key={e.id} value={e.id}>
                                        {e.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {parentCategory && (
                            <p className="text-xs text-muted-foreground">
                                Inherits parent's envelope.
                            </p>
                        )}
                    </div>
                    <EntityStyleFields
                        name={name}
                        color={color}
                        setColor={setColor}
                        icon={icon}
                        setIcon={setIcon}
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
                            disabled={!name.trim() || !effectiveEnvelopId || create.isPending}
                        >
                            {create.isPending ? "Creating…" : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EditCategoryDialog({ category }: { category: CategoryRaw }) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(category.name);
    const [color, setColor] = useState(category.color);
    const [icon, setIcon] = useState(category.icon);
    const utils = trpc.useUtils();
    const update = trpc.expenseCategory.update.useMutation({
        onSuccess: async () => {
            toast.success("Category updated");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7">
                    <Pencil className="size-3.5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit category</DialogTitle>
                </DialogHeader>
                <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        update.mutate({
                            categoryId: category.id,
                            name: name.trim(),
                            color,
                            icon,
                        });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label>Name</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={255}
                            required
                        />
                    </div>
                    <EntityStyleFields
                        name={name}
                        color={color}
                        setColor={setColor}
                        icon={icon}
                        setIcon={setIcon}
                    />
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="gradient" disabled={update.isPending}>
                            {update.isPending ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ChangeParentDialog({
    category,
    allCategories,
}: {
    category: CategoryRaw;
    allCategories: CategoryRaw[];
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [parentId, setParentId] = useState<string>(category.parent_id ?? "none");
    const utils = trpc.useUtils();
    const mutate = trpc.expenseCategory.changeParent.useMutation({
        onSuccess: async () => {
            toast.success("Parent updated");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    // Exclude self + descendants so we can't create a cycle.
    const invalidIds = useMemo(() => {
        const children = new Map<string, string[]>();
        for (const c of allCategories) {
            if (c.parent_id) {
                const arr = children.get(c.parent_id) ?? [];
                arr.push(c.id);
                children.set(c.parent_id, arr);
            }
        }
        const forbidden = new Set<string>([category.id]);
        const stack = [category.id];
        while (stack.length) {
            const id = stack.pop()!;
            for (const c of children.get(id) ?? []) {
                if (!forbidden.has(c)) {
                    forbidden.add(c);
                    stack.push(c);
                }
            }
        }
        return forbidden;
    }, [allCategories, category.id]);

    const candidates = allCategories.filter((c) => !invalidIds.has(c.id));
    const candidate = candidates.find((c) => c.id === parentId);
    const envelopeMismatch =
        candidate != null && candidate.envelop_id !== category.envelop_id;
    const unchanged = (category.parent_id ?? "none") === parentId;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    title="Change parent"
                >
                    <FolderInput className="size-3.5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Move "{category.name}" under a different parent</DialogTitle>
                    <DialogDescription>
                        Pick a new parent category, or "(top level)" to un-nest it. You
                        can't pick the category itself or any of its descendants.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label>Parent</Label>
                    <CategoryTreeSelect
                        categories={candidates as any}
                        value={parentId === "none" ? null : parentId}
                        onChange={(v) => setParentId(v ?? "none")}
                        placeholder="(top level — no parent)"
                        allowAll={false}
                    />
                    {envelopeMismatch && (
                        <p className="text-xs text-[color:var(--warning)]">
                            Heads up: the new parent belongs to a different envelope.
                            This category will still route transactions to its current
                            envelope; use "Move to envelope" afterwards if you want the
                            whole subtree in one place.
                        </p>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="gradient"
                        disabled={mutate.isPending || unchanged}
                        onClick={() =>
                            mutate.mutate({
                                categoryId: category.id,
                                parentId: parentId === "none" ? null : parentId,
                            })
                        }
                    >
                        {mutate.isPending ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MoveEnvelopDialog({
    category,
    envelopes,
    hasChildren,
}: {
    category: CategoryRaw;
    envelopes: EnvelopeLite[];
    hasChildren: boolean;
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [envelopId, setEnvelopId] = useState(category.envelop_id);
    const utils = trpc.useUtils();
    const mutate = trpc.expenseCategory.changeEnvelop.useMutation({
        onSuccess: async (data) => {
            toast.success(
                data && data.movedCount > 0
                    ? `Moved ${data.movedCount} category${data.movedCount === 1 ? "" : "ies"}`
                    : "No change"
            );
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7" title="Move to envelope">
                    <Move className="size-3.5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Move "{category.name}" to another envelope</DialogTitle>
                    <DialogDescription>
                        {hasChildren
                            ? "Sub-categories will move with it."
                            : "New transactions will route to the chosen envelope. Past envelope balances are not rewritten."}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label>Envelope</Label>
                    <Select value={envelopId} onValueChange={setEnvelopId}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {envelopes.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                    {e.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="gradient"
                        disabled={mutate.isPending || envelopId === category.envelop_id}
                        onClick={() =>
                            mutate.mutate({
                                categoryId: category.id,
                                envelopId,
                            })
                        }
                    >
                        {mutate.isPending ? "Moving…" : "Move"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
