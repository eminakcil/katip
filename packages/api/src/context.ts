import type { Session } from "@katip/auth";
import type { Database } from "@katip/db";

export type Context = {
	session: Session | null;
	db: Database;
};
