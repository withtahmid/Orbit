import { createContext, useContext, useEffect, useMemo } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { trpc } from "@/trpc";
import { FullPageSpinner } from "@/components/shared/LoadingScreen";
import type { SpaceRole } from "@/lib/permissions";

export interface CurrentSpace {
    id: string;
    name: string;
    myRole: SpaceRole;
}

interface CurrentSpaceContextValue {
    space: CurrentSpace;
    myRole: SpaceRole;
}

const Ctx = createContext<CurrentSpaceContextValue | null>(null);

export const LAST_SPACE_KEY = "orbit:last_space_id";

export function CurrentSpaceProvider() {
    const { spaceId } = useParams<{ spaceId: string }>();
    const spacesQuery = trpc.space.list.useQuery();

    const space = useMemo<CurrentSpace | null>(() => {
        if (!spacesQuery.data || !spaceId) return null;
        const found = spacesQuery.data.find((s) => s.id === spaceId);
        if (!found) return null;
        return {
            id: found.id,
            name: found.name,
            myRole: found.myRole as unknown as SpaceRole,
        };
    }, [spacesQuery.data, spaceId]);

    useEffect(() => {
        if (space) {
            localStorage.setItem(LAST_SPACE_KEY, space.id);
        }
    }, [space]);

    if (spacesQuery.isLoading) return <FullPageSpinner />;
    if (!space) return <Navigate to="/spaces" replace />;

    return (
        <Ctx.Provider value={{ space, myRole: space.myRole }}>
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
