import { createEvent } from "../procedures/event/create.mjs";
import { deleteEvent } from "../procedures/event/delete.mjs";
import { getEventById } from "../procedures/event/getById.mjs";
import { listEventsBySpace } from "../procedures/event/listBySpace.mjs";
import { setEventStatus } from "../procedures/event/setStatus.mjs";
import { updateEvent } from "../procedures/event/update.mjs";
import { router } from "../trpc/index.mjs";

export const eventRouter = router({
    listBySpace: listEventsBySpace,
    getById: getEventById,
    create: createEvent,
    update: updateEvent,
    delete: deleteEvent,
    setStatus: setEventStatus,
});
