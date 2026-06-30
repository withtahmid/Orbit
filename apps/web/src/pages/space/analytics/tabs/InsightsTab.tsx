import { TrendsSection } from "./sections/TrendsSection";
import { AnomaliesSection } from "./sections/AnomaliesSection";

export default function InsightsTab() {
    return (
        <div className="grid gap-10">
            <TrendsSection />
            <AnomaliesSection />
        </div>
    );
}
