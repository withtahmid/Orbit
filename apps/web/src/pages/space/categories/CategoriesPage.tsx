import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
    FolderTree,
    Plus,
    Trash2,
    ChevronRight,
    Pencil,
    Move,
    FolderInput,
    MoreHorizontal,
    Search,
    X,
    ChevronsUpDown,
    ChevronsDownUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { usePeriod } from "@/hooks/usePeriod";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { UNALLOCATED_COLOR } from "@/lib/entityStyle";

interface CategoryUsage {
    id: string;
    space_id: string;
    name: string;
    envelop_id: string;
    parent_id: string | null;
    color: string;
    icon: string;
    tx_count: number;
    spent_total: number;
    last_used: Date | string | null;
}
interface CategoryNode extends CategoryUsage {
    children: CategoryNode[];
    /** Sum of tx_count + descendants; used when parent is collapsed */
    subtree_tx_count: number;
    subtree_spent: number;
}
interface EnvelopeLite {
    id: string;
    name: string;
    color: string;
    icon: string;
}

function buildTree(flat: CategoryUsage[]): CategoryNode[] {
    const map = new Map<string, CategoryNode>();
    flat.forEach((c) =>
        map.set(c.id, {
            ...c,
            children: [],
            subtree_tx_count: c.tx_count,
            subtree_spent: c.spent_total,
        })
    );
    const roots: CategoryNode[] = [];
    map.forEach((node) => {
        if (node.parent_id && map.has(node.parent_id)) {
            map.get(node.parent_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    });
    const accumulate = (n: CategoryNode): { tx: number; spent: number } => {
        let tx = n.tx_count;
        let spent = n.spent_total;
        for (const c of n.children) {
            const r = accumulate(c);
            tx += r.tx;
            spent += r.spent;
        }
        n.subtree_tx_count = tx;
        n.subtree_spent = spent;
        return { tx, spent };
    };
    roots.forEach(accumulate);
    return roots;
}

export default function CategoriesPage() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod();

    const envelopesQuery = trpc.envelop.listBySpace.useQuery({ spaceId: space.id });
    const categoriesQuery = trpc.expenseCategory.listBySpaceWithUsage.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
    });

    const [query, setQuery] = useState("");
    const [collapsedEnvelopes, setCollapsedEnvelopes] = useState<Set<string>>(
        new Set()
    );
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

    const categories = useMemo(
        () => (categoriesQuery.data ?? []) as CategoryUsage[],
        [categoriesQuery.data]
    );
    const envelopes = useMemo(
        () => (envelopesQuery.data ?? []) as EnvelopeLite[],
        [envelopesQuery.data]
    );

    // Group categories by envelope, build per-envelope tree.
    const sections = useMemo(() => {
        const byEnv = new Map<string, CategoryUsage[]>();
        for (const c of categories) {
            const arr = byEnv.get(c.envelop_id) ?? [];
            arr.push(c);
            byEnv.set(c.envelop_id, arr);
        }
        const ordered: {
            envelope: EnvelopeLite | null;
            roots: CategoryNode[];
            totalCount: number;
            totalSpent: number;
        }[] = [];
        // Preserve envelope order from envelopes list.
        for (const env of envelopes) {
            const items = byEnv.get(env.id);
            if (!items || items.length === 0) continue;
            const roots = buildTree(items);
            ordered.push({
                envelope: env,
                roots,
                totalCount: items.length,
                totalSpent: roots.reduce((s, r) => s + r.subtree_spent, 0),
            });
            byEnv.delete(env.id);
        }
        // Orphans: categories pointing at an envelope we don't have (shouldn't
        // happen in practice, but guard anyway so the page stays usable).
        for (const [, items] of byEnv) {
            const roots = buildTree(items);
            ordered.push({
                envelope: null,
                roots,
                totalCount: items.length,
                totalSpent: roots.reduce((s, r) => s + r.subtree_spent, 0),
            });
        }
        return ordered;
    }, [categories, envelopes]);

    // Filter by search query. When a leaf matches, keep its ancestry visible.
    const q = query.trim().toLowerCase();
    const filteredSections = useMemo(() => {
        if (!q) return sections;
        const visible = new Set<string>();
        const parentOf = new Map<string, string | null>();
        for (const c of categories) parentOf.set(c.id, c.parent_id);
        for (const c of categories) {
            if (c.name.toLowerCase().includes(q)) {
                let cur: string | null = c.id;
                while (cur) {
                    if (visible.has(cur)) break;
                    visible.add(cur);
                    cur = parentOf.get(cur) ?? null;
                }
            }
        }
        const prune = (nodes: CategoryNode[]): CategoryNode[] =>
            nodes
                .filter((n) => visible.has(n.id))
                .map((n) => ({ ...n, children: prune(n.children) }));
        return sections
            .map((s) => ({ ...s, roots: prune(s.roots) }))
            .filter((s) => s.roots.length > 0);
    }, [sections, categories, q]);

    // When searching, force-expand everything so matches are visible.
    const searching = q.length > 0;
    const allEnvelopesCollapsed =
        sections.length > 0 &&
        sections.every(
            (s) => !!s.envelope && collapsedEnvelopes.has(s.envelope.id)
        );

    const toggleEnvelope = (id: string) => {
        setCollapsedEnvelopes((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const toggleNode = (id: string) => {
        setCollapsedNodes((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const toggleAll = () => {
        if (allEnvelopesCollapsed) {
            setCollapsedEnvelopes(new Set());
            setCollapsedNodes(new Set());
        } else {
            const allEnv = new Set<string>();
            for (const s of sections) if (s.envelope) allEnv.add(s.envelope.id);
            setCollapsedEnvelopes(allEnv);
        }
    };

    const isLoading = categoriesQuery.isLoading || envelopesQuery.isLoading;
    const hasAnyCategory = categories.length > 0;

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Categories"
                description="Categories route every expense into an envelope. Group, rename, and see what's actually used."
                actions={
                    <PermissionGate roles={["owner"]}>
                        <CreateCategoryDialog
                            envelopes={envelopes}
                            categories={categories}
                        />
                    </PermissionGate>
                }
            />

            {hasAnyCategory && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative sm:max-w-sm sm:flex-1">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search categories…"
                            className="pl-9 pr-9"
                            aria-label="Search categories"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                aria-label="Clear search"
                            >
                                <X className="size-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <PeriodSelector />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5"
                            onClick={toggleAll}
                            disabled={sections.length === 0}
                            title={allEnvelopesCollapsed ? "Expand all" : "Collapse all"}
                        >
                            {allEnvelopesCollapsed ? (
                                <ChevronsUpDown className="size-4" />
                            ) : (
                                <ChevronsDownUp className="size-4" />
                            )}
                            <span className="hidden sm:inline">
                                {allEnvelopesCollapsed ? "Expand all" : "Collapse all"}
                            </span>
                        </Button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="grid gap-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Card key={i} className="p-4">
                            <Skeleton className="mb-3 h-6 w-40" />
                            <div className="space-y-2">
                                {Array.from({ length: 3 }).map((_, j) => (
                                    <Skeleton key={j} className="h-10 w-full" />
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : !hasAnyCategory ? (
                <EmptyState
                    icon={FolderTree}
                    title="No categories yet"
                    description="Create categories so every expense lands in the right envelope."
                    action={
                        <PermissionGate roles={["owner"]}>
                            <CreateCategoryDialog
                                envelopes={envelopes}
                                categories={categories}
                            />
                        </PermissionGate>
                    }
                />
            ) : filteredSections.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                    No categories match "{query}".
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredSections.map((section) => {
                        const envKey = section.envelope?.id ?? "__orphan__";
                        const collapsed =
                            !searching &&
                            !!section.envelope &&
                            collapsedEnvelopes.has(section.envelope.id);
                        return (
                            <EnvelopeSectionCard
                                key={envKey}
                                envelope={section.envelope}
                                roots={section.roots}
                                categoryCount={section.totalCount}
                                totalSpent={section.totalSpent}
                                envelopes={envelopes}
                                allCategories={categories}
                                collapsed={collapsed}
                                onToggle={() =>
                                    section.envelope && toggleEnvelope(section.envelope.id)
                                }
                                collapsedNodes={collapsedNodes}
                                onToggleNode={toggleNode}
                                searching={searching}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope section card
// ─────────────────────────────────────────────────────────────────────────────

function EnvelopeSectionCard({
    envelope,
    roots,
    categoryCount,
    totalSpent,
    envelopes,
    allCategories,
    collapsed,
    onToggle,
    collapsedNodes,
    onToggleNode,
    searching,
}: {
    envelope: EnvelopeLite | null;
    roots: CategoryNode[];
    categoryCount: number;
    totalSpent: number;
    envelopes: EnvelopeLite[];
    allCategories: CategoryUsage[];
    collapsed: boolean;
    onToggle: () => void;
    collapsedNodes: Set<string>;
    onToggleNode: (id: string) => void;
    searching: boolean;
}) {
    const accent = envelope?.color ?? UNALLOCATED_COLOR;
    return (
        <Card
            className="overflow-hidden"
            style={{ borderTop: `3px solid ${accent}` }}
        >
            <button
                type="button"
                onClick={onToggle}
                disabled={!envelope}
                className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left",
                    envelope && "hover:bg-muted/40"
                )}
            >
                {envelope ? (
                    <EntityAvatar
                        color={envelope.color}
                        icon={envelope.icon}
                        size="md"
                    />
                ) : (
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <FolderTree className="size-4" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-base font-semibold">
                            {envelope?.name ?? "Unassigned envelope"}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                            · {categoryCount}{" "}
                            {categoryCount === 1 ? "category" : "categories"}
                        </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Spent{" "}
                        <MoneyDisplay
                            amount={totalSpent}
                            variant={totalSpent > 0 ? "expense" : "muted"}
                            className="text-xs"
                        />{" "}
                        in this period
                    </div>
                </div>
                {envelope && (
                    <ChevronRight
                        className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            !collapsed && "rotate-90"
                        )}
                    />
                )}
            </button>

            {!collapsed && (
                <div className="border-t border-border px-1 py-1 sm:px-2">
                    <div className="grid gap-0.5">
                        {roots.map((n) => (
                            <CategoryRow
                                key={n.id}
                                node={n}
                                depth={0}
                                envelopes={envelopes}
                                allCategories={allCategories}
                                collapsedNodes={collapsedNodes}
                                onToggleNode={onToggleNode}
                                searching={searching}
                            />
                        ))}
                    </div>
                    {envelope && (
                        <PermissionGate roles={["owner"]}>
                            <div className="mt-1 border-t border-border/60 p-1">
                                <CreateCategoryDialog
                                    envelopes={envelopes}
                                    categories={allCategories}
                                    trigger={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            <Plus className="size-3.5" />
                                            Add category in {envelope.name}
                                        </Button>
                                    }
                                    defaultEnvelopeId={envelope.id}
                                />
                            </div>
                        </PermissionGate>
                    )}
                </div>
            )}
        </Card>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category row
// ─────────────────────────────────────────────────────────────────────────────

function CategoryRow({
    node,
    depth,
    envelopes,
    allCategories,
    collapsedNodes,
    onToggleNode,
    searching,
}: {
    node: CategoryNode;
    depth: number;
    envelopes: EnvelopeLite[];
    allCategories: CategoryUsage[];
    collapsedNodes: Set<string>;
    onToggleNode: (id: string) => void;
    searching: boolean;
}) {
    const open = searching || !collapsedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const txCount = open ? node.tx_count : node.subtree_tx_count;
    const spent = open ? node.spent_total : node.subtree_spent;
    const lastUsed = node.last_used
        ? typeof node.last_used === "string"
            ? new Date(node.last_used)
            : node.last_used
        : null;
    const unused = node.subtree_tx_count === 0;

    return (
        <>
            <div
                className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/40"
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={() => onToggleNode(node.id)}
                        className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                        aria-label={open ? "Collapse" : "Expand"}
                    >
                        <ChevronRight
                            className={cn(
                                "size-3.5 transition-transform",
                                open && "rotate-90"
                            )}
                        />
                    </button>
                ) : (
                    <span className="size-5 shrink-0" />
                )}
                <EntityAvatar color={node.color} icon={node.icon} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <span
                        className={cn(
                            "truncate text-sm font-medium",
                            unused && "text-muted-foreground"
                        )}
                    >
                        {node.name}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:ml-auto sm:justify-end">
                        {unused ? (
                            <Badge variant="outline" className="border-border/60 font-normal">
                                Unused
                            </Badge>
                        ) : (
                            <>
                                <span className="tabular-nums">
                                    {txCount} {txCount === 1 ? "txn" : "txns"}
                                    {!open && hasChildren && " (incl. sub)"}
                                </span>
                                <MoneyDisplay
                                    amount={spent}
                                    variant="expense"
                                    className="text-xs"
                                />
                                {lastUsed && (
                                    <span className="hidden whitespace-nowrap md:inline">
                                        {formatDistanceToNow(lastUsed, {
                                            addSuffix: true,
                                        })}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <PermissionGate roles={["owner"]}>
                    <CategoryRowActions
                        node={node}
                        envelopes={envelopes}
                        allCategories={allCategories}
                    />
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
                        collapsedNodes={collapsedNodes}
                        onToggleNode={onToggleNode}
                        searching={searching}
                    />
                ))}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row action menu: one ⋯ button, all four actions inside controlled dialogs.
// ─────────────────────────────────────────────────────────────────────────────

function CategoryRowActions({
    node,
    envelopes,
    allCategories,
}: {
    node: CategoryNode;
    envelopes: EnvelopeLite[];
    allCategories: CategoryUsage[];
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const [editOpen, setEditOpen] = useState(false);
    const [reparentOpen, setReparentOpen] = useState(false);
    const [envelopeOpen, setEnvelopeOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const del = trpc.expenseCategory.delete.useMutation({
        onSuccess: async () => {
            toast.success("Category deleted");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            await utils.expenseCategory.listBySpaceWithUsage.invalidate({
                spaceId: space.id,
            });
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label="Category actions"
                    >
                        <MoreHorizontal className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setEditOpen(true);
                        }}
                    >
                        <Pencil />
                        Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setReparentOpen(true);
                        }}
                    >
                        <FolderInput />
                        Change parent
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setEnvelopeOpen(true);
                        }}
                    >
                        <Move />
                        Move to envelope
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onSelect={(e) => {
                            e.preventDefault();
                            setDeleteOpen(true);
                        }}
                    >
                        <Trash2 />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <EditCategoryDialog
                category={node}
                open={editOpen}
                onOpenChange={setEditOpen}
            />
            <ChangeParentDialog
                category={node}
                allCategories={allCategories}
                open={reparentOpen}
                onOpenChange={setReparentOpen}
            />
            <MoveEnvelopDialog
                category={node}
                envelopes={envelopes}
                hasChildren={node.children.length > 0}
                open={envelopeOpen}
                onOpenChange={setEnvelopeOpen}
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
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
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogs — controlled variants. Triggers live in the overflow menu /
// toolbar; each dialog renders its own DialogContent only.
// ─────────────────────────────────────────────────────────────────────────────

function CreateCategoryDialog({
    envelopes,
    categories,
    trigger,
    defaultEnvelopeId,
}: {
    envelopes: EnvelopeLite[];
    categories: CategoryUsage[];
    trigger?: React.ReactNode;
    defaultEnvelopeId?: string;
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [envelopId, setEnvelopId] = useState(defaultEnvelopeId ?? "");
    const [parentId, setParentId] = useState("");
    const [color, setColor] = useState<string>(DEFAULT_COLOR);
    const [icon, setIcon] = useState("folder");
    const utils = trpc.useUtils();
    const create = trpc.expenseCategory.create.useMutation({
        onSuccess: async () => {
            toast.success("Category created");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            await utils.expenseCategory.listBySpaceWithUsage.invalidate({
                spaceId: space.id,
            });
            setName("");
            setEnvelopId(defaultEnvelopeId ?? "");
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
                {trigger ?? (
                    <Button variant="gradient">
                        <Plus />
                        New category
                    </Button>
                )}
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
                            categories={categories as never}
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

function EditCategoryDialog({
    category,
    open,
    onOpenChange,
}: {
    category: CategoryUsage;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { space } = useCurrentSpace();
    const [name, setName] = useState(category.name);
    const [color, setColor] = useState(category.color);
    const [icon, setIcon] = useState(category.icon);
    const utils = trpc.useUtils();
    const update = trpc.expenseCategory.update.useMutation({
        onSuccess: async () => {
            toast.success("Category updated");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            await utils.expenseCategory.listBySpaceWithUsage.invalidate({
                spaceId: space.id,
            });
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                            onClick={() => onOpenChange(false)}
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
    open,
    onOpenChange,
}: {
    category: CategoryUsage;
    allCategories: CategoryUsage[];
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { space } = useCurrentSpace();
    const [parentId, setParentId] = useState<string>(category.parent_id ?? "none");
    const utils = trpc.useUtils();
    const mutate = trpc.expenseCategory.changeParent.useMutation({
        onSuccess: async () => {
            toast.success("Parent updated");
            await utils.expenseCategory.listBySpace.invalidate({ spaceId: space.id });
            await utils.expenseCategory.listBySpaceWithUsage.invalidate({
                spaceId: space.id,
            });
            onOpenChange(false);
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
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                        categories={candidates as never}
                        value={parentId === "none" ? null : parentId}
                        onChange={(v) => setParentId(v ?? "none")}
                        placeholder="(top level — no parent)"
                        allowAll={false}
                    />
                    {envelopeMismatch && (
                        <p className="text-xs text-[color:var(--warning)]">
                            Heads up: the new parent belongs to a different envelope. This
                            category will still route transactions to its current envelope;
                            use "Move to envelope" afterwards if you want the whole subtree
                            in one place.
                        </p>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
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
    open,
    onOpenChange,
}: {
    category: CategoryUsage;
    envelopes: EnvelopeLite[];
    hasChildren: boolean;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { space } = useCurrentSpace();
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
            await utils.expenseCategory.listBySpaceWithUsage.invalidate({
                spaceId: space.id,
            });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                        onClick={() => onOpenChange(false)}
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
