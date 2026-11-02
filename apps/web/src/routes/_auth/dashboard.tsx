import { createFileRoute } from "@tanstack/react-router";

import { strings } from "@/strings";

export const Route = createFileRoute("/_auth/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const { session } = Route.useRouteContext();

	return (
		<div className="container mx-auto max-w-3xl px-4 py-2">
			<h1 className="my-6 text-2xl font-bold">{strings.dashboard.title}</h1>
			<p>{strings.dashboard.welcome(session.data?.user.name ?? "")}</p>
		</div>
	);
}
