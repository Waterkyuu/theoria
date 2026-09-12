import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { BenchmarkFilters, BenchmarkTag } from "@/types/benchmark";
import { BenchmarkFiltersBar } from "./filters";

const tags: BenchmarkTag[] = [
	{ id: "code", name: "Coding", icon: "Code", isSystem: false },
];

it("keeps the all benchmarks button white when another benchmark filter is active", () => {
	const value: BenchmarkFilters = {
		search: "",
		tagIds: ["code"],
		author: null,
		sort: "newest",
	};
	render(<BenchmarkFiltersBar value={value} tags={tags} onChange={vi.fn()} />);

	expect(screen.getByRole("button", { name: "全部 Benchmark" })).toHaveClass(
		"bg-canvas",
	);
});

it("localizes benchmark author labels in Chinese", async () => {
	const user = userEvent.setup();
	const value: BenchmarkFilters = {
		search: "",
		tagIds: [],
		author: "myself",
		sort: "newest",
	};
	render(<BenchmarkFiltersBar value={value} tags={tags} onChange={vi.fn()} />);

	await user.click(screen.getByRole("button", { name: "本人" }));

	expect(screen.getByRole("button", { name: "平台" })).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "本人" })).toBeInTheDocument();
	expect(screen.queryByText("Platform")).not.toBeInTheDocument();
	expect(screen.queryByText("MySelf")).not.toBeInTheDocument();
});
