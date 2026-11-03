// PreToolUse hook (ADR 0010): first line of test integrity in the local pipeline.
// - implementer: may not edit test paths (`**/*.test.ts`, `**/test/**`).
// - tester: may edit only test paths and port interfaces.
// Everyone else (the main session, planner, reviewer) is not restricted here.
// CI `test-guard` is the second line: it also catches writes made through Bash.
//
// Role: the `agent_type` field of the hook input, or argv[2] when the hook is
// attached in an agent's frontmatter. Exit 2 blocks the tool call and shows
// stderr to the agent.
import path from "node:path";

const TEST_PATH = /(^|\/)test\/|\.test\.ts$/;
const PORT_PATH =
	/^packages\/core\/src\/ports\/|^packages\/[^/]+\/src\/ports\.ts$/;

function readStdin() {
	return new Promise((resolve) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("end", () => resolve(data));
	});
}

function toRepoPath(filePath, projectDir) {
	const absolute = path.resolve(projectDir, filePath);
	return path.relative(projectDir, absolute).split(path.sep).join("/");
}

const input = JSON.parse((await readStdin()) || "{}");
const role = process.argv[2] ?? input.agent_type ?? "";
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;

if (!filePath || (role !== "implementer" && role !== "tester")) {
	process.exit(0);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const repoPath = toRepoPath(filePath, projectDir);
const isTest = TEST_PATH.test(repoPath);
const isPort = PORT_PATH.test(repoPath);

if (role === "implementer" && isTest) {
	process.stderr.write(
		`Blocked: the implementer may not edit test paths (${repoPath}). ` +
			"If a test, fake or port looks wrong or missing, stop and report it to the orchestrator instead of working around it.\n",
	);
	process.exit(2);
}

if (role === "tester" && !isTest && !isPort) {
	process.stderr.write(
		`Blocked: the tester may edit only test paths and port interfaces, not ${repoPath}. ` +
			"Production code belongs to the implementer.\n",
	);
	process.exit(2);
}

process.exit(0);
