import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ColorPicker } from "@/components/shared/ColorPicker";
import { IconPicker } from "@/components/shared/IconPicker";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { getIcon } from "@/lib/entityIcons";

/**
 * Compact color + icon picker pair used in every entity's create/edit
 * dialog. Both pickers live behind small popover triggers so they don't
 * dominate narrow forms.
 */
export function EntityStyleFields({
    color,
    setColor,
    icon,
    setIcon,
    name,
}: {
    color: string;
    setColor: (c: string) => void;
    icon: string;
    setIcon: (i: string) => void;
    name?: string;
}) {
    const IconCmp = getIcon(icon);
    return (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
            <EntityAvatar color={color} icon={icon} size="lg" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                    {name?.trim() || "Preview"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                    Pick a color and icon
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5 px-2"
                            aria-label="Choose color"
                            title="Color"
                        >
                            <span
                                className="size-5 rounded-sm border border-border/60"
                                style={{ backgroundColor: color }}
                                aria-hidden
                            />
                            <ChevronDown className="size-3 opacity-60" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        portal={false}
                        align="end"
                        className="w-[20rem] p-2"
                    >
                        <ColorPicker
                            value={color}
                            onChange={setColor}
                            className="border-none bg-transparent p-0"
                        />
                    </PopoverContent>
                </Popover>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5 px-2"
                            aria-label="Choose icon"
                            title="Icon"
                        >
                            <IconCmp className="size-4" />
                            <ChevronDown className="size-3 opacity-60" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        portal={false}
                        align="end"
                        className="w-[22rem] p-0"
                        style={{
                            maxHeight:
                                "min(var(--radix-popover-content-available-height, 26rem), 26rem)",
                        }}
                    >
                        <IconPicker
                            value={icon}
                            onChange={setIcon}
                            color={color}
                            className="h-full border-none bg-transparent"
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
