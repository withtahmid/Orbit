import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

type Props = {
    fileId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    size?: Size;
    className?: string;
};

const SIZE_CLASS: Record<Size, string> = {
    xs: "size-6 text-[10px]",
    sm: "size-8 text-xs",
    md: "size-12 text-sm",
    lg: "size-16 text-lg",
};

const variantForSize = (size: Size): "sm" | "original" =>
    size === "lg" ? "original" : "sm";

const initials = (first?: string | null, last?: string | null) =>
    `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}` || "??";

export const UserAvatar = ({
    fileId,
    firstName,
    lastName,
    size = "sm",
    className,
}: Props) => {
    const { url } = useSignedUrl(fileId, { variant: variantForSize(size) });
    return (
        <Avatar className={cn(SIZE_CLASS[size], className)}>
            {url && <AvatarImage src={url} alt={`${firstName ?? ""} ${lastName ?? ""}`} />}
            <AvatarFallback className="bg-gradient-to-br from-primary to-brand-gradient-to font-semibold text-white">
                {initials(firstName, lastName)}
            </AvatarFallback>
        </Avatar>
    );
};
