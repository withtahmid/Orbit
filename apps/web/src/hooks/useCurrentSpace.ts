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

/** True when the active space is the virtual "My money" space. */
export function useIsPersonalSpace() {
    return useCurrentSpaceContext().isPersonal;
}
