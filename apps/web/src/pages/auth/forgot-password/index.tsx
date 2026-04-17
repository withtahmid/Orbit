import { observer } from "mobx-react-lite";
import { Card, CardContent } from "@/components/ui/card";
import { Steps } from "@/components/shared/Steps";
import { useStore } from "@/stores/useStore";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { NewPasswordStep } from "./NewPasswordStep";

const ForgotPasswordPage = observer(function ForgotPasswordPage() {
    const { forgotPasswordStore } = useStore();
    return (
        <Card className="border-border/60 shadow-2xl">
            <div className="pt-6">
                <Steps
                    current={forgotPasswordStore.step}
                    total={3}
                    labels={["Email", "Verify", "New password"]}
                />
            </div>
            <CardContent>
                {forgotPasswordStore.step === 1 && <EmailStep />}
                {forgotPasswordStore.step === 2 && <VerifyStep />}
                {forgotPasswordStore.step === 3 && <NewPasswordStep />}
            </CardContent>
        </Card>
    );
});

export default ForgotPasswordPage;
