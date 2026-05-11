/* Compound keyset cursor for transaction lists: `(transaction_datetime,
   id)`. Ordering by transaction_datetime alone is ambiguous (multiple
   rows can share a timestamp), so we tiebreak by id. The cursor is an
   opaque string the client passes back verbatim — `<isoDate>|<uuid>`.

   Why not order by id alone: id is uuidv7, roughly time-sorted by
   *creation* time. Late-receipt transactions (dated yesterday but
   recorded today) would visually sort above older entries that were
   recorded in real time, contradicting the date label shown on each
   row. */

const SEP = "|";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeTransactionCursor(row: {
    transaction_datetime: Date | string;
    id: string;
}): string {
    const dt =
        row.transaction_datetime instanceof Date
            ? row.transaction_datetime
            : new Date(row.transaction_datetime);
    return `${dt.toISOString()}${SEP}${row.id}`;
}

/* Returns `null` when the cursor is malformed (or is a pre-fix bare
   UUID from an older client) — caller should treat that as "no cursor"
   and return page 1, which is the least-surprising behavior across a
   deploy. */
export function decodeTransactionCursor(
    cursor: string
): { dt: Date; id: string } | null {
    const idx = cursor.indexOf(SEP);
    if (idx < 0) return null;
    const dtStr = cursor.slice(0, idx);
    const id = cursor.slice(idx + 1);
    const dt = new Date(dtStr);
    if (Number.isNaN(dt.getTime())) return null;
    if (!UUID_RE.test(id)) return null;
    return { dt, id };
}
