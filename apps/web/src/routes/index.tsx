import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { strings } from "@/strings";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	const healthCheck = useQuery(trpc.healthCheck.queryOptions());

	return (
		<div className="container mx-auto max-w-3xl px-4 py-2">
			<h1 className="my-6 text-4xl font-bold">{strings.appName}</h1>
			<section className="rounded-lg border p-4">
				<h2 className="mb-2 font-medium">{strings.home.apiStatus}</h2>
				<div className="flex items-center gap-2">
					<div
						className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
					/>
					<span className="text-muted-foreground text-sm">
						{healthCheck.isLoading
							? strings.home.checking
							: healthCheck.data
								? strings.home.connected
								: strings.home.disconnected}
					</span>
				</div>
			</section>
		</div>
	);
}
