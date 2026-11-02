// Scheduler process (ADR 0002, 0008): same codebase, separate process.
// Composition root for pg-boss workers. Reminder delivery and the morning
// list are added as their own tasks; this entry point only boots the queue.
import "varlock/auto-load";

import { ensureQueues } from "@katip/db/job-scheduler";
import { PgBoss } from "pg-boss";

import { ENV } from "./env";

async function main(): Promise<void> {
	const boss = new PgBoss(ENV.DATABASE_URL);
	boss.on("error", (error) =>
		console.error("[scheduler] pg-boss error", error),
	);

	await boss.start();
	await ensureQueues(boss);
	console.log("[scheduler] started");

	const shutdown = async (signal: string) => {
		console.log(`[scheduler] ${signal} received, stopping`);
		await boss.stop({ graceful: true });
		process.exit(0);
	};
	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
	console.error("[scheduler] fatal", error);
	process.exit(1);
});
