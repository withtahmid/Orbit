import { useState } from "react";
import { observer } from "mobx-react-lite";
import { ShieldCheck, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";

export const VerifyStep = observer(function VerifyStep() {
    const { forgotPasswordStore } = useStore();
    const [code, setCode] = useState("");

    const verify = trpc.auth.resetPassword.verify.useMutation({
        onSuccess: (data) => {
            forgotPasswordStore.setResetToken(data.token);
            forgotPasswordStore.setStep(3);
        },
        onError: (e) => toast.error(e.message),
    });

    const resend = trpc.auth.resetPassword.resendCode.useMutation({
        onSuccess: () => {
            toast.success("Code sent again");
            forgotPasswordStore.startResendCooldown(60);
        },
        onError: (e) => toast.error(e.message),
    });

    const onComplete = (value: string) => {
        setCode(value);
        if (value.length === 6 && forgotPasswordStore.resetToken) {
            verify.mutate({ code: value, token: forgotPasswordStore.resetToken });
        }
    };

    return (
        <div className="grid gap-5 py-2 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-brand-gradient-to/20 text-primary">
                <ShieldCheck className="size-6" />
            </div>
            <div>
                <h2 className="text-xl font-bold">Enter the code</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    We sent a 6-digit code to{" "}
                    <span className="font-medium text-foreground">
                        {forgotPasswordStore.email}
                    </span>
                </p>
            </div>
            <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={onComplete} autoFocus>
                    <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot key={i} index={i} />
                        ))}
                    </InputOTPGroup>
                </InputOTP>
            </div>
            {verify.isPending && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Verifying…
                </div>
            )}
            <div className="flex items-center justify-between text-sm">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => forgotPasswordStore.setStep(1)}
                >
                    <ArrowLeft />
                    Back
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                        forgotPasswordStore.resendCooldown > 0 ||
                        resend.isPending ||
                        !forgotPasswordStore.resetToken
                    }
                    onClick={() =>
                        resend.mutate({
                            token: forgotPasswordStore.resetToken!,
                        })
                    }
                >
                    {forgotPasswordStore.resendCooldown > 0
                        ? `Resend in ${forgotPasswordStore.resendCooldown}s`
                        : "Resend code"}
                </Button>
            </div>
        </div>
    );
});
