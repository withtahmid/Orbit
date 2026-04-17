export type SpaceRole = "owner" | "editor" | "viewer";
export type AccountRole = "owner" | "viewer";

export function canEdit(role: SpaceRole | null | undefined): boolean {
    return role === "owner" || role === "editor";
}

export function isOwner(role: SpaceRole | null | undefined): boolean {
    return role === "owner";
}
