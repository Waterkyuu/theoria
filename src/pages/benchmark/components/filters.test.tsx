import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { BenchmarkFilters, BenchmarkTag } from "@/types/benchmark";
import { BenchmarkFiltersBar } from "./filters";

const tags: BenchmarkTag[] = [
	{ id: "code", name: "Coding", icon: "Code", isSystem: false },
];

const paletteTags: BenchmarkTag[] = [
	{ id: "code", name: "Coding", icon: "Code", isSystem: false },
	{ id: "reasoning", name: "Reasoning", icon: "Brain", isSystem: false },
	{ id: "data", name: "Data", icon: "Database", isSystem: false },
	{ id: "debugging", name: "Debugging", icon: "Bug", isSystem: false },
	{ id: "refactoring", name: "Refactoring", icon: "Code", isSystem: false },
	{ id: "testing", name: "Testing", icon: "Check", isSystem: false },
	{ id: "frontend", name: "Frontend", icon: "Globe", isSystem: false },
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

it("shows a search icon inside the tag search field", async () => {
	const user = userEvent.setup();
	const value: BenchmarkFilters = {
		search: "",
		tagIds: [],
		author: null,
		sort: "newest",
	};
	render(<BenchmarkFiltersBar value={value} tags={tags} onChange={vi.fn()} />);

	await user.click(screen.getByRole("button", { name: "标签" }));

	const tagSearch = screen.getByLabelText("搜索标签…");
	expect(tagSearch.previousElementSibling).toHaveClass("size-4");
	expect(tagSearch.previousElementSibling).toHaveAttribute(
		"aria-hidden",
		"true",
	);
});

it("hides the tag search icon after selected tag chips", async () => {
	const user = userEvent.setup();
	const value: BenchmarkFilters = {
		search: "",
		tagIds: ["code"],
		author: null,
		sort: "newest",
	};
	render(<BenchmarkFiltersBar value={value} tags={tags} onChange={vi.fn()} />);

	await user.click(screen.getByRole("button", { name: "标签 (1)" }));

	const tagSearch = screen.getByLabelText("搜索标签…");
	expect(tagSearch.previousElementSibling).toHaveTextContent("Coding");
	expect(tagSearch.previousElementSibling).not.toHaveClass("size-4");
});

it("keeps selected tag chips on one compact fixed-height search row", async () => {
	const user = userEvent.setup();
	const value: BenchmarkFilters = {
		search: "",
		tagIds: paletteTags.map((tag) => tag.id),
		author: null,
		sort: "newest",
	};
	render(
		<BenchmarkFiltersBar value={value} tags={paletteTags} onChange={vi.fn()} />,
	);

	await user.click(screen.getByRole("button", { name: "标签 (7)" }));

	const tagSearch = screen.getByLabelText("搜索标签…");
	expect(tagSearch.parentElement).toHaveClass("h-10");
	expect(tagSearch.parentElement).toHaveClass("flex-nowrap");
	expect(tagSearch.parentElement).toHaveClass("overflow-x-auto");
	expect(tagSearch.parentElement).toHaveClass("overflow-y-hidden");
	const chip = within(tagSearch.parentElement!).getByText("Coding");
	expect(chip).toHaveClass(
		"h-7",
		"shrink-0",
		"bg-[#1d4ed8]",
		"px-2",
		"py-1",
		"text-caption-sm",
	);
});

it("uses fixed color dots instead of tag icons in the tag dropdown", async () => {
	const user = userEvent.setup();
	const value: BenchmarkFilters = {
		search: "",
		tagIds: ["code"],
		author: null,
		sort: "newest",
	};
	render(
		<BenchmarkFiltersBar value={value} tags={paletteTags} onChange={vi.fn()} />,
	);

	await user.click(screen.getByRole("button", { name: "标签 (1)" }));

	const firstOption = screen.getByRole("checkbox", { name: "Coding" });
	const seventhOption = screen.getByRole("checkbox", { name: "Frontend" });
	expect(firstOption.querySelectorAll("svg")).toHaveLength(1);

	const firstDot = firstOption.querySelector("span");
	const seventhDot = seventhOption.querySelector("span");
	expect(firstDot).toHaveClass("size-2.5", "rounded-full");
	expect(seventhDot).toHaveClass("size-2.5", "rounded-full");
	expect(seventhDot?.className).toBe(firstDot?.className);
});
