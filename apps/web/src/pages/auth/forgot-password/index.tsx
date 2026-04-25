import { observer } from "mobx-react-lite";
import { Steps } from "@/components/shared/Steps";
import { useStore } from "@/stores/useStore";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { NewPasswordStep } from "./NewPasswordStep";

const ForgotPasswordPage = observer(function ForgotPasswordPage() {
    const { forgotPasswordStore } = useStore();
    return (
        <div className="grid gap-7">
            <Steps
                current={forgotPasswordStore.step}
                total={3}
                labels={["Email", "Verify", "New password"]}
            />
            {forgotPasswordStore.step === 1 && <EmailStep />}
            {forgotPasswordStore.step === 2 && <VerifyStep />}
            {forgotPasswordStore.step === 3 && <NewPasswordStep />}
        </div>
    );
});

export default ForgotPasswordPage;
