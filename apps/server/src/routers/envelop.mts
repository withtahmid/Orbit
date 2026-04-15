import { createEnvelop } from "../procedures/envelop/create.mjs";
import { deleteEnvelop } from "../procedures/envelop/delete.mjs";
import { listEnvelopsBySpace } from "../procedures/envelop/listBySpace.mjs";
import { updateEnvelop } from "../procedures/envelop/update.mjs";
import { router } from "../trpc/index.mjs";

export const envelopRouter = router({
    create: createEnvelop,
    update: updateEnvelop,
    delete: deleteEnvelop,
    listBySpace: listEnvelopsBySpace,
});
