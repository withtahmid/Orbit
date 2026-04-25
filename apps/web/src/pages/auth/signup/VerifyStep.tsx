import { useState } from "react";
import { observer } from "mobx-react-lite";
import { ShieldCheck, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";

export const VerifyStep = observer(function VerifyStep() {
    const { signupStore } = useStore();
    const [code, setCode] = useState("");

    const verify = trpc.auth.signup.verify.useMutation({
        onSuccess: (data) => {
            signupStore.setSignupToken(data.token);
            signupStore.setStep(3);
        },
        onError: (e) => toast.error(e.message),
    });

    const resend = trpc.auth.signup.resendCode.useMutation({
        onSuccess: () => {
            toast.success("Code sent again");
            signupStore.startResendCooldown(60);
        },
        onError: (e) => toast.error(e.message),
    });

    const onComplete = (value: string) => {
        setCode(value);
        if (value.length === 6 && signupStore.signupToken) {
            verify.mutate({ code: value, token: signupStore.signupToken });
        }
    };

    return (
        <div className="grid gap-6">
            <div>
                <p className="o-eyebrow mb-3 flex items-center gap-2">
                    <ShieldCheck className="size-3.5" />
                    <span>Verify email</span>
                </p>
                <h1 className="o-page-title">Check your inbox.</h1>
                <p className="o-page-sub mt-3">
                    Enter the 6-digit code we sent to{" "}
                    <span className="font-medium text-foreground">
                        {signupStore.email}
                    </span>
                    .
                </p>
            </div>
            <div className="flex justify-center md:justify-start">
                <InputOTP maxLength={6} value={code} onChange={onComplete} autoFocus>
                    <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot key={i} index={i} />
                        ))}
                    </InputOTPGroup>
                </InputOTP>
            </div>
            {verify.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Verifying…
                </div>
            )}
            <div className="flex items-center justify-between text-sm">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => signupStore.setStep(1)}
                >
                    <ArrowLeft />
                    Back
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                        signupStore.resendCooldown > 0 ||
                        resend.isPending ||
                        !signupStore.signupToken
                    }
                    onClick={() =>
                        resend.mutate({ token: signupStore.signupToken! })
                    }
                >
                    {signupStore.resendCooldown > 0
                        ? `Resend in ${signupStore.resendCooldown}s`
                        : "Resend code"}
                </Button>
            </div>
        </div>
    );
});
