import { useState } from "react";
import { ChevronsUpDown, Plus, Check, Sparkles, LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { CreateSpaceDialog } from "./CreateSpaceDialog";
import { cn } from "@/lib/utils";
import { PERSONAL_SPACE_ID, PERSONAL_SPACE_NAME } from "@/lib/personalSpace";

export function SpaceSwitcher() {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const spacesQuery = trpc.space.list.useQuery();

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between bg-card px-3"
                >
                    <span className="flex items-center gap-2 truncate">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-brand-gradient-to text-[11px] font-bold text-white">
                            {space.name[0]?.toUpperCase() ?? "S"}
                        </span>
                        <span className="truncate font-medium">{space.name}</span>
                    </span>
                    <ChevronsUpDown className="size-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search spaces…" />
                    <CommandList>
                        <CommandEmpty>No spaces found.</CommandEmpty>
                        <CommandGroup heading="Personal">
                            <CommandItem
                                key={PERSONAL_SPACE_ID}
                                value={PERSONAL_SPACE_NAME}
                                onSelect={() => {
                                    navigate(ROUTES.space(PERSONAL_SPACE_ID));
                                    setOpen(false);
                                }}
                            >
                                <LineChart className="mr-2 size-3.5 opacity-80" />
                                <span className="truncate font-medium">
                                    {PERSONAL_SPACE_NAME}
                                </span>
                                <Check
                                    className={cn(
                                        "ml-auto size-4",
                                        space.id === PERSONAL_SPACE_ID
                                            ? "opacity-100"
                                            : "opacity-0"
                                    )}
                                />
                            </CommandItem>
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup heading="Your spaces">
                            {(spacesQuery.data ?? []).map((s) => (
                                <CommandItem
                                    key={s.id}
                                    value={s.name}
                                    onSelect={() => {
                                        navigate(ROUTES.space(s.id));
                                        setOpen(false);
                                    }}
                                >
                                    <Sparkles className="mr-2 size-3.5 opacity-60" />
                                    <span className="truncate">{s.name}</span>
                                    <Check
                                        className={cn(
                                            "ml-auto size-4",
                                            s.id === space.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                            <CreateSpaceDialog
                                trigger={
                                    <CommandItem
                                        onSelect={(e) => {
                                            e; // cmdk passes value
                                        }}
                                    >
                                        <Plus className="mr-2 size-3.5" />
                                        Create new space
                                    </CommandItem>
                                }
                            />
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
