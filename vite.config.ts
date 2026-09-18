import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
const devPort = Number(process.env.THEORIA_DEV_PORT ?? 1420);

// https://vite.dev/config/
export default defineConfig({
	plugins: [react({ compiler: true }), tailwindcss()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	build: {
		// Preserve the browser targets used before upgrading to Vite 8.
		target: ["chrome107", "edge107", "firefox104", "safari16"],
		rolldownOptions: {
			output: {
				minify: {
					compress: { dropConsole: true },
				},
			},
		},
	},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. keep the selected port in sync with Tauri's devUrl override
	server: {
		port: devPort,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					clientPort: devPort,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
});
