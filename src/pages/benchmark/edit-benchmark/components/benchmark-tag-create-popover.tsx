import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Popover } from "@/components/ui/popover";
import { handleError } from "@/utils/error";
import { createBenchmarkTag } from "@/api/benchmark";
import type { BenchmarkTag } from "@/types/benchmark";
import { BENCHMARK_ICONS, TagIcon } from "../../components/tag-icon";

const TAG_NAME_FIELD =
	"w-full rounded-md border border-hairline bg-canvas px-md py-sm text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

type BenchmarkTagCreatePopoverProps = {
	/** Selects the freshly created tag in the surrounding editor. */
	onCreated: (tag: BenchmarkTag) => void;
};

/**
 * Creates a personal Benchmark tag and returns it to the editor.
 *
 * @example
 * <BenchmarkTagCreatePopover onCreated={setTag} />
 */
const BenchmarkTagCreatePopover = ({
	onCreated,
}: BenchmarkTagCreatePopoverProps) => {
	const { t } = useTranslation();
	const client = useQueryClient();
	const [pending, setPending] = useState(false);
	const [icon, setIcon] = useState("Code");

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending) return;
		const name = String(new FormData(event.currentTarget).get("tagName") ?? "");
		setPending(true);
		try {
			const tag = await createBenchmarkTag(name, icon);
			await client.invalidateQueries({ queryKey: ["benchmarks", "tags"] });
			onCreated(tag);
			Toast.toast.success(t("benchmark.tagCreated"));
		} catch (error) {
			handleError(error, "Benchmark tag creation failed", true);
		} finally {
			setPending(false);
		}
	};

	return (
		<Popover
			title={t("benchmark.newTag")}
			trigger={
				<Button
					size="sm"
					variant="secondary"
					className="border border-hairline bg-canvas shadow-none"
				>
					{t("benchmark.newTag")}
				</Button>
			}
		>
			<form onSubmit={submit} className="flex max-w-72 flex-col gap-md pt-md">
				<label className="text-body-sm">
					{t("benchmark.tagName")}
					<input
						name="tagName"
						required
						maxLength={40}
						className={TAG_NAME_FIELD}
					/>
				</label>
				<div
					className="grid grid-cols-5 gap-sm"
					aria-label={t("benchmark.icon")}
				>
					{Object.keys(BENCHMARK_ICONS).map((name) => (
						<Button
							key={name}
							isIconOnly
							aria-label={name}
							aria-pressed={icon === name}
							variant={icon === name ? "primary" : "tertiary"}
							onPress={() => setIcon(name)}
						>
							<TagIcon name={name} />
						</Button>
					))}
				</div>
				<div className="flex justify-end">
					<Button type="submit" isPending={pending}>
						{t("common.confirm")}
					</Button>
				</div>
			</form>
		</Popover>
	);
};

export { BenchmarkTagCreatePopover };
