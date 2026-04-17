import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { DetailsStep } from "./DetailsStep";
import { Steps } from "@/components/shared/Steps";
import { Card, CardContent } from "@/components/ui/card";

const SignupPage = observer(function SignupPage() {
    const { signupStore } = useStore();
    return (
        <Card className="border-border/60 shadow-2xl">
            <div className="pt-6">
                <Steps
                    current={signupStore.step}
                    total={3}
                    labels={["Email", "Verify", "Details"]}
                />
            </div>
            <CardContent>
                {signupStore.step === 1 && <EmailStep />}
                {signupStore.step === 2 && <VerifyStep />}
                {signupStore.step === 3 && <DetailsStep />}
            </CardContent>
        </Card>
    );
});

export default SignupPage;
