import { router } from "../trpc/index.mjs";
import { createDps } from "../procedures/dps/create.mjs";
import { updateDps } from "../procedures/dps/update.mjs";
import { deleteDps } from "../procedures/dps/delete.mjs";
import { listDpsBySpace } from "../procedures/dps/listBySpace.mjs";
import { getDpsById } from "../procedures/dps/getById.mjs";
import { dpsProjection } from "../procedures/dps/projection.mjs";
import { markDpsMatured } from "../procedures/dps/markMatured.mjs";
import { encashDpsEarly } from "../procedures/dps/encashEarly.mjs";
import { markDpsAbandoned } from "../procedures/dps/markAbandoned.mjs";
import { markDpsMissed } from "../procedures/dps/markMissed.mjs";
import { undoDpsMissed } from "../procedures/dps/undoMarkMissed.mjs";
import { markDpsPaid } from "../procedures/dps/markPaid.mjs";
import { bulkBackfillDps } from "../procedures/dps/bulkBackfill.mjs";

export const dpsRouter = router({
    create: createDps,
    update: updateDps,
    delete: deleteDps,
    listBySpace: listDpsBySpace,
    getById: getDpsById,
    projection: dpsProjection,
    markPaid: markDpsPaid,
    markMissed: markDpsMissed,
    undoMarkMissed: undoDpsMissed,
    markMatured: markDpsMatured,
    encashEarly: encashDpsEarly,
    markAbandoned: markDpsAbandoned,
    bulkBackfill: bulkBackfillDps,
});
