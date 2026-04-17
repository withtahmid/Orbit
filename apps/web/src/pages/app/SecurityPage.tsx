import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { useStore } from "@/stores/useStore";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { Link } from "react-router-dom";

export default function SecurityPage() {
    const { authStore } = useStore();
    const navigate = useNavigate();
    return (
        <div className="grid gap-6">
            <PageHeader title="Security" description="Manage your account security" />
            <Card>
                <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>
                        You can change your password via the forgot-password flow.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild variant="outline">
                        <Link to={ROUTES.forgotPassword}>Reset password</Link>
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Session</CardTitle>
                    <CardDescription>Sign out of this device</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            authStore.clearAuth();
                            navigate(ROUTES.login, { replace: true });
                        }}
                    >
                        Log out
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
