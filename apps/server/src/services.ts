import { createAuth } from "@katip/auth";
import { createDb } from "@katip/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
