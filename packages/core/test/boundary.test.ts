import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? sourceFiles(path) : [path];
	});
}

describe("core boundary (ADR 0002)", () => {
	it("never mentions Telegram or its identifiers in core source", () => {
		const forbidden = /telegram|chat_?id|update_?id|message_?id/i;
		const offenders = sourceFiles(srcDir).filter(
			(file) =>
				!file.endsWith(".test.ts") &&
				forbidden.test(readFileSync(file, "utf8")),
		);
		expect(offenders).toEqual([]);
	});
});
