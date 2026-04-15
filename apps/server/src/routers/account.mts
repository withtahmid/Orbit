import { addMemberToAccount } from "../procedures/account/addMember.mjs";
import { createAccount } from "../procedures/account/create.mjs";
import { deleteAccount } from "../procedures/account/delete.mjs";
import { listAccountsBySpace } from "../procedures/account/listBySpace.mjs";
import { listAccountsByUser } from "../procedures/account/listByUser.mjs";
import { listUsersHaveAccessToAccount } from "../procedures/account/listUsers.mjs";
import { removeMemberFromAccount } from "../procedures/account/removeMember.mjs";
import { updateAccount } from "../procedures/account/update.mjs";
import { router } from "../trpc/index.mjs";

export const accountRouter = router({
    create: createAccount,
    update: updateAccount,
    addMember: addMemberToAccount,
    removeMember: removeMemberFromAccount,
    delete: deleteAccount,
    listBySpace: listAccountsBySpace,
    listByUser: listAccountsByUser,
    listUsers: listUsersHaveAccessToAccount,
});
