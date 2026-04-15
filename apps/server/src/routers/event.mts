import { createEvent } from "../procedures/event/create.mjs";
import { deleteEvent } from "../procedures/event/delete.mjs";
import { listEventsBySpace } from "../procedures/event/listBySpace.mjs";
import { updateEvent } from "../procedures/event/update.mjs";
import { router } from "../trpc/index.mjs";

export const eventRouter = router({
    listBySpace: listEventsBySpace,
    create: createEvent,
    update: updateEvent,
    delete: deleteEvent,
});
