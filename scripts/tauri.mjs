import { spawn } from "node:child_process";
import { findAvailableDevPort, tauriDevConfig } from "./tauri-dev-port.mjs";

const cliArgs = process.argv.slice(2);
const port = cliArgs[0] === "dev" ? await findAvailableDevPort() : null;
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = ["exec", "tauri", ...cliArgs];

if (port !== null) {
	args.push("--config", JSON.stringify(tauriDevConfig(port)));
	process.stdout.write(`Starting Tauri and Vite on port ${port}\n`);
}

const child = spawn(command, args, {
	stdio: "inherit",
	env:
		port === null
			? process.env
			: { ...process.env, THEORIA_DEV_PORT: String(port) },
});

child.once("error", (error) => {
	process.stderr.write(`${error.message}\n`);
	process.exitCode = 1;
});
child.once("exit", (code, signal) => {
	process.exitCode = code ?? (signal ? 1 : 0);
});
