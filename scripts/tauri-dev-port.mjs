import { createServer } from "node:net";

// macOS can allow a wildcard listener beside a loopback listener, so probe each address.
const isAvailable = (port, host) =>
	new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", (error) => {
			if (error.code === "EADDRINUSE") resolve(false);
			else if (
				host === "::1" &&
				(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")
			)
				resolve(true);
			else reject(error);
		});
		server.listen(port, host, () => server.close(() => resolve(true)));
	});

// Tauri needs the port before it starts its Vite beforeDevCommand.
const findAvailableDevPort = async (startingPort = 1420) => {
	const hosts = [
		...new Set(
			["127.0.0.1", "::1", process.env.TAURI_DEV_HOST].filter(Boolean),
		),
	];
	for (let port = startingPort; port <= 65535; port += 1) {
		if (
			(await Promise.all(hosts.map((host) => isAvailable(port, host)))).every(
				Boolean,
			)
		)
			return port;
	}
	throw new Error(`No available development port at or above ${startingPort}`);
};

const tauriDevConfig = (port) => ({
	build: { devUrl: `http://localhost:${port}` },
});

export { findAvailableDevPort, tauriDevConfig };
