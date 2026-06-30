import { AccountsSection } from "./sections/AccountsSection";
import { BalanceSection } from "./sections/BalanceSection";

export default function AccountsTab() {
    return (
        <div className="grid gap-10">
            <AccountsSection />
            <BalanceSection />
        </div>
    );
}
