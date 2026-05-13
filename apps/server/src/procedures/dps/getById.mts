import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveDpsSchemeAccess } from "./utils/resolveDpsScheme.mjs";
import { ALL_ROLES } from "../space/utils/resolveSpaceMembership.mjs";
import { buildDpsSummary } from "./utils/buildDpsSummary.mjs";
import { buildDpsSchedule } from "./utils/dpsSchedule.mjs";

const GRACE_DAYS = 5;

type ScheduleStatus = "paid" | "missed" | "upcoming" | "in_grace";

/**
 * Full DPS detail. Summary + the per-installment schedule (each row
 * tagged `paid` | `missed` | `in_grace` | `upcoming`) + the payouts
 * ledger. The schedule join matches an installment date to the first
 * tagged transfer that lands inside `[date, date + GRACE_DAYS]` —
 * Bangladeshi banks routinely settle the auto-debit a day or two
 * after the official installment date.
 */
export const getDpsById = authorizedProcedure
    .input(z.object({ schemeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const scheme = await resolveDpsSchemeAccess({
                    trx,
                    schemeId: input.schemeId,
                    userId: ctx.auth.user.id,
                    roles: ALL_ROLES,
                });

                const now = new Date();
                const summary = await buildDpsSummary({ trx, scheme, now });

                const startDate = new Date(scheme.start_date as unknown as string);
                const schedule = buildDpsSchedule({
                    startDate,
                    installmentDay: Number(scheme.installment_day),
                    termMonths: Number(scheme.term_months),
                });

                const installmentTxns = await trx
                    .selectFrom("transactions")
                    .select(["id", "transaction_datetime", "amount"])
                    .where("dps_scheme_id", "=", scheme.id)
                    .where("destination_account_id", "=", scheme.account_id)
                    .where("type", "=", "transfer" as never)
                    .orderBy("transaction_datetime", "asc")
                    .execute();

                const missedRows = await trx
                    .selectFrom("dps_payouts")
                    .select(["id", "occurred_at"])
                    .where("dps_scheme_id", "=", scheme.id)
                    .where("kind", "=", "missed_installment")
                    .execute();

                const payouts = await trx
                    .selectFrom("dps_payouts")
                    .selectAll()
                    .where("dps_scheme_id", "=", scheme.id)
                    .orderBy("occurred_at", "asc")
                    .execute();

                // Match each installment date to the earliest unmatched
                // transfer within the grace window.
                const remaining = installmentTxns.map((t) => ({
                    id: t.id,
                    at: new Date(t.transaction_datetime).getTime(),
                    used: false,
                }));

                const missedSet = new Set(
                    missedRows.map((r) =>
                        toMonthKey(new Date(r.occurred_at))
                    )
                );

                const gracMs = GRACE_DAYS * 24 * 3600 * 1000;
                const items = schedule.map(({ index, date }) => {
                    const startMs = date.getTime();
                    const endMs = startMs + gracMs;
                    let match: { id: string } | null = null;
                    for (const r of remaining) {
                        if (r.used) continue;
                        if (r.at < startMs - 24 * 3600 * 1000) continue;
                        if (r.at > endMs + 7 * 24 * 3600 * 1000) break;
                        if (r.at >= startMs - 24 * 3600 * 1000 && r.at <= endMs + 7 * 24 * 3600 * 1000) {
                            r.used = true;
                            match = { id: r.id };
                            break;
                        }
                    }

                    let status: ScheduleStatus;
                    if (match) {
                        status = "paid";
                    } else if (missedSet.has(toMonthKey(date))) {
                        status = "missed";
                    } else if (now.getTime() < startMs) {
                        status = "upcoming";
                    } else if (now.getTime() <= endMs) {
                        status = "in_grace";
                    } else {
                        status = "missed";
                    }

                    return {
                        index,
                        installmentDate: date.toISOString(),
                        status,
                        linkedTransactionId: match?.id ?? null,
                    };
                });

                return {
                    ...summary,
                    schedule: items,
                    payouts: payouts.map((p) => ({
                        id: p.id,
                        kind: p.kind as
                            | "opened"
                            | "matured"
                            | "encashed_early"
                            | "abandoned"
                            | "missed_installment",
                        occurredAt: new Date(p.occurred_at).toISOString(),
                        cashAmount:
                            p.cash_amount === null ? null : Number(p.cash_amount),
                        linkedTransactionId: p.linked_transaction_id,
                        note: p.note,
                    })),
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to load DPS scheme",
            });
        }
        return result!;
    });

const toMonthKey = (d: Date): string => {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
