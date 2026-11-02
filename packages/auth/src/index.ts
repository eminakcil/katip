import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@katip/db";
import * as schema from "@katip/db/schema/auth";
import { betterAuth } from "better-auth";

export type AuthConfig = {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
};

// Google is the only sign-in method (ADR 0004). No email/password.
export function createAuth(
	env: AuthConfig,
	database: Database,
	desktopOrigins: readonly string[] = [],
) {
	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
		emailAndPassword: { enabled: false },
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
			},
		},
		user: {
			additionalFields: {
				// IANA timezone used to resolve and render dates (ADR 0001).
				timezone: {
					type: "string",
					required: false,
					defaultValue: "Europe/Istanbul",
					input: false,
				},
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [],
	});
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
