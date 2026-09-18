import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("design token namespaces", () => {
	it("keeps semantic spacing names out of Tailwind's width namespace", () => {
		expect(styles).not.toMatch(
			/--spacing-(?:xxs|xs|sm|md|lg|xl|xxl|section)\s*:/,
		);
	});
});
