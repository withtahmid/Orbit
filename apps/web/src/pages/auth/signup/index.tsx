import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { DetailsStep } from "./DetailsStep";
import { Steps } from "@/components/shared/Steps";

const SignupPage = observer(function SignupPage() {
    const { signupStore } = useStore();
    return (
        <div className="grid gap-7">
            <Steps
                current={signupStore.step}
                total={3}
                labels={["Email", "Verify", "Details"]}
            />
            {signupStore.step === 1 && <EmailStep />}
            {signupStore.step === 2 && <VerifyStep />}
            {signupStore.step === 3 && <DetailsStep />}
        </div>
    );
});

export default SignupPage;
