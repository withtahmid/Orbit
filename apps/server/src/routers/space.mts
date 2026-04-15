import { addMembersToSpace } from "../procedures/space/addMembers.mjs";
import { changeMemberRoleInSpace } from "../procedures/space/changeMemberRole.mjs";
import { createSpace } from "../procedures/space/create.mjs";
import { deleteSpace } from "../procedures/space/delete.mjs";
import { listSpaces } from "../procedures/space/list.mjs";
import { spaceMemberList } from "../procedures/space/memberList.mjs";
import { removeMemberFromSpace } from "../procedures/space/removeMember.mjs";
import { updateSpace } from "../procedures/space/update.mjs";
import { router } from "../trpc/index.mjs";

export const spaceRouter = router({
    create: createSpace,
    update: updateSpace,
    memberList: spaceMemberList,
    list: listSpaces,
    addMembers: addMembersToSpace,
    removeMember: removeMemberFromSpace,
    changeMemberRole: changeMemberRoleInSpace,
    delete: deleteSpace,
});
