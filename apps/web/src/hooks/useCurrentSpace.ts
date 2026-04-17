import { useCurrentSpaceContext } from "@/providers/CurrentSpaceProvider";
import { canEdit, isOwner } from "@/lib/permissions";

export function useCurrentSpace() {
    return useCurrentSpaceContext();
}

export function useCurrentSpaceId() {
    return useCurrentSpaceContext().space.id;
}

export function useCanEdit() {
    return canEdit(useCurrentSpaceContext().myRole);
}

export function useIsOwner() {
    return isOwner(useCurrentSpaceContext().myRole);
}
