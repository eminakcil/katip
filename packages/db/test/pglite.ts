// In-process Postgres (PGlite) with the real migrations applied.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { relations } from "../src/relations";
import type { AnyDatabase } from "../src/repositories";
import { user } from "../src/schema/auth";

const migrationsFolder = fileURLToPath(
	new URL("../src/migrations", import.meta.url),
);

export async function createTestDb(): Promise<AnyDatabase> {
	const db = drizzle({ client: new PGlite(), relations });
	await migrate(db, { migrationsFolder });
	return db as unknown as AnyDatabase;
}

export async function insertUser(
	db: AnyDatabase,
	id: string,
	timezone = "Europe/Istanbul",
): Promise<void> {
	await db.insert(user).values({
		id,
		name: id,
		email: `${id}@example.com`,
		timezone,
	});
}
