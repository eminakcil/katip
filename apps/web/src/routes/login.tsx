import { Button } from "@katip/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { strings } from "@/strings";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const [pending, setPending] = useState(false);

	const signInWithGoogle = async () => {
		setPending(true);
		const { error } = await authClient.signIn.social({
			provider: "google",
			callbackURL: `${window.location.origin}/dashboard`,
		});
		if (error) {
			setPending(false);
			toast.error(strings.login.failed);
		}
	};

	return (
		<div className="mx-auto mt-10 w-full max-w-md space-y-6 p-6 text-center">
			<h1 className="text-3xl font-bold">{strings.login.title}</h1>
			<p className="text-muted-foreground">{strings.login.subtitle}</p>
			<Button className="w-full" disabled={pending} onClick={signInWithGoogle}>
				{pending ? strings.login.redirecting : strings.login.google}
			</Button>
		</div>
	);
}
