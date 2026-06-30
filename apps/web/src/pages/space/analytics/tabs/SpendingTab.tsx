import { CategoriesSection } from "./sections/CategoriesSection";
import { PrioritySection } from "./sections/PrioritySection";
import { HeatmapSection } from "./sections/HeatmapSection";

export default function SpendingTab() {
    return (
        <div className="grid gap-10">
            <CategoriesSection />
            <PrioritySection />
            <HeatmapSection />
        </div>
    );
}
