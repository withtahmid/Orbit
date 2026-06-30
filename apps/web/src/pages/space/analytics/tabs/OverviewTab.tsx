import { CashFlowSection } from "./sections/CashFlowSection";
import { CategoriesSection } from "./sections/CategoriesSection";
import { EnvelopesSection } from "./sections/EnvelopesSection";

/** At-a-glance summary: how money moved, where it went, and how the
 *  envelopes are tracking — all for the focused period. Each section
 *  links onward to its dedicated tab. */
export default function OverviewTab() {
    return (
        <div className="grid gap-10">
            <CashFlowSection />
            <CategoriesSection />
            <EnvelopesSection />
        </div>
    );
}
