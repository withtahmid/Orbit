import { addMembersToSpace } from "../procedures/space/addMembers.mjs";
import { changeMemberRoleInSpace } from "../procedures/space/changeMemberRole.mjs";
import { createSpace } from "../procedures/space/create.mjs";
import { deleteSpace } from "../procedures/space/delete.mjs";
import { listSpaces } from "../procedures/space/list.mjs";
import { spaceMemberList } from "../procedures/space/memberList.mjs";
import { removeMemberFromSpace } from "../procedures/space/removeMember.mjs";
import { updateSpace } from "../procedures/space/update.mjs";
import { sendInvite } from "../procedures/space/sendInvite.mjs";
import { listInvites } from "../procedures/space/listInvites.mjs";
import { revokeInvite } from "../procedures/space/revokeInvite.mjs";
import { acceptInvite } from "../procedures/space/acceptInvite.mjs";
import { inviteInfo } from "../procedures/space/inviteInfo.mjs";
import { leaveSpace } from "../procedures/space/leave.mjs";
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
    sendInvite,
    listInvites,
    revokeInvite,
    acceptInvite,
    inviteInfo,
    leave: leaveSpace,
});
