/**
 * Sentinel space id for the virtual "My money" space. Flows through the
 * existing `/s/:spaceId` route tree but is not a real row in the
 * `spaces` table — the UI and server procedures dispatch on this literal
 * to swap their data source to the personal (cross-space) variants.
 *
 * "me" is not a valid UUID so there's no collision risk with real space
 * ids.
 */
export const PERSONAL_SPACE_ID = "me";

export const PERSONAL_SPACE_NAME = "My money";

export function isPersonalSpaceId(spaceId: string | null | undefined): boolean {
    return spaceId === PERSONAL_SPACE_ID;
}
