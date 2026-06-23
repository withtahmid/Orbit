import { archiveEnvelop } from "../procedures/envelop/archive.mjs";
import { createEnvelop } from "../procedures/envelop/create.mjs";
import { createEnvelopAllocation } from "../procedures/envelop/createAllocation.mjs";
import { deleteEnvelop } from "../procedures/envelop/delete.mjs";
import { listEnvelopAllocationsBySpace } from "../procedures/envelop/listAllocationsBySpace.mjs";
import { listEnvelopsBySpace } from "../procedures/envelop/listBySpace.mjs";
import { updateEnvelop } from "../procedures/envelop/update.mjs";
import { router } from "../trpc/index.mjs";

export const envelopRouter = router({
    create: createEnvelop,
    update: updateEnvelop,
    delete: deleteEnvelop,
    listBySpace: listEnvelopsBySpace,
    allocationCreate: createEnvelopAllocation,
    allocationListBySpace: listEnvelopAllocationsBySpace,
    archive: archiveEnvelop,
});
