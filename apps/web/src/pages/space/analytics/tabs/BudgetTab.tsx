import { EnvelopesSection } from "./sections/EnvelopesSection";
import { AllocationsSection } from "./sections/AllocationsSection";

export default function BudgetTab() {
    return (
        <div className="grid gap-10">
            <EnvelopesSection />
            <AllocationsSection />
        </div>
    );
}
