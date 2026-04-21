import { createContext, useContext, useEffect, useMemo } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { trpc } from "@/trpc";
import { FullPageSpinner } from "@/components/shared/LoadingScreen";
import type { SpaceRole } from "@/lib/permissions";
import {
    PERSONAL_SPACE_ID,
    PERSONAL_SPACE_NAME,
    isPersonalSpaceId,
} from "@/lib/personalSpace";

export interface CurrentSpace {
    id: string;
    name: string;
    myRole: SpaceRole;
    /**
     * True when this is the virtual personal space (id === "me"). Every
     * page that wants cross-space behavior checks this and dispatches
     * to the `personal.*` trpc procedures; every mutation CTA hides
     * itself because the virtual space is inherently read-only.
     */
    isPersonal: boolean;
}

interface CurrentSpaceContextValue {
    space: CurrentSpace;
    myRole: SpaceRole;
    isPersonal: boolean;
}

const Ctx = createContext<CurrentSpaceContextValue | null>(null);

export const LAST_SPACE_KEY = "orbit:last_space_id";

export function CurrentSpaceProvider() {
    const { spaceId } = useParams<{ spaceId: string }>();
    const isVirtual = isPersonalSpaceId(spaceId);

    // The real-space list is only needed when spaceId is a real UUID;
    // the virtual personal space is synthesized without a DB roundtrip.
    // We still fire the query for real spaces so membership validation
    // and role resolution work the same as before.
    const spacesQuery = trpc.space.list.useQuery(undefined, { enabled: !isVirtual });

    const space = useMemo<CurrentSpace | null>(() => {
        if (isVirtual) {
            return {
                id: PERSONAL_SPACE_ID,
                name: PERSONAL_SPACE_NAME,
                // Force viewer so every existing PermissionGate hides
                // mutation CTAs in the virtual space. A dedicated role
                // would have been cleaner, but re-typing the whole gate
                // isn't worth it when viewer already means "read-only".
                myRole: "viewer" as SpaceRole,
                isPersonal: true,
            };
        }
        if (!spacesQuery.data || !spaceId) return null;
        const found = spacesQuery.data.find((s) => s.id === spaceId);
        if (!found) return null;
        return {
            id: found.id,
            name: found.name,
            myRole: found.myRole as unknown as SpaceRole,
            isPersonal: false,
        };
    }, [spacesQuery.data, spaceId, isVirtual]);

    useEffect(() => {
        if (space) {
            localStorage.setItem(LAST_SPACE_KEY, space.id);
        }
    }, [space]);

    if (!isVirtual && spacesQuery.isLoading) return <FullPageSpinner />;
    if (!space) return <Navigate to="/spaces" replace />;

    return (
        <Ctx.Provider
            value={{ space, myRole: space.myRole, isPersonal: space.isPersonal }}
        >
            <Outlet />
        </Ctx.Provider>
    );
}

export function useCurrentSpaceContext() {
    const ctx = useContext(Ctx);
    if (!ctx) {
        throw new Error("useCurrentSpace must be used inside CurrentSpaceProvider");
    }
    return ctx;
}
