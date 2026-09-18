import { createServer } from "node:net";
import { expect, test } from "vitest";
import { findAvailableDevPort, tauriDevConfig } from "./tauri-dev-port.mjs";

test("skips an occupied development port and points Tauri at the chosen port", async () => {
	const occupied = createServer();
	await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
	try {
		const occupiedPort = occupied.address().port;
		const selectedPort = await findAvailableDevPort(occupiedPort);
		expect(selectedPort).toBeGreaterThan(occupiedPort);
		expect(tauriDevConfig(selectedPort)).toEqual({
			build: { devUrl: `http://localhost:${selectedPort}` },
		});
	} finally {
		await new Promise((resolve) => occupied.close(resolve));
	}
});
