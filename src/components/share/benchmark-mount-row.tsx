import { useState } from "react";
import { Ellipsis, Pin, PinFill, PinSlash, TrashBin } from "@gravity-ui/icons";
import { Button, Toast } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AlertDialog } from "@/components/ui/alert-dialog";
import type { DropdownMenuItemProps } from "@/components/ui/dropdown-menu";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { handleError } from "@/utils/error";
import {
	useBenchmark,
	useSetBenchmarkMountPin,
	useUnmountBenchmark,
} from "@/queries/benchmark";
import type { BenchmarkMount } from "@/types/benchmark";

type BenchmarkMountRowProps = {
	/** Active browser path used to highlight and safely leave a removed mount. */
	currentPath: string;
	/** Persisted relationship with a pinned version. */
	mount: BenchmarkMount;
	/** Preserves the desktop navigation shell. */
	onNavigate: (path: string) => void;
};

type BenchmarkMountActionsProps = {
	/** Persisted relationship changed by the available actions. */
	mount: BenchmarkMount;
	/** Current Benchmark name included in labels and feedback. */
	name: string;
	/** Leaves an active relationship route after it is removed. */
	onUnmounted: () => void;
};

type BenchmarkMountAction = "pin" | "unmount";

/**
 * Keeps mount actions aligned with the shared Task item interaction pattern.
 *
 * @example
 * <BenchmarkMountActions mount={mount} name="Suite" onUnmounted={returnToWorkspace} />
 */
const BenchmarkMountActions = ({
	mount,
	name,
	onUnmounted,
}: BenchmarkMountActionsProps) => {
	"use no memo";
	const { t } = useTranslation();
	const [isUnmountOpen, setIsUnmountOpen] = useState(false);
	const pinMutation = useSetBenchmarkMountPin();
	const unmountMutation = useUnmountBenchmark();
	const isPinned = mount.pinnedAtMs !== null;

	/** Persists the next pin state while keeping the mounted version unchanged. */
	const setPinState = async () => {
		if (pinMutation.isPending) return;
		try {
			await pinMutation.mutateAsync({
				isPinned: !isPinned,
				mountId: mount.id,
				workspaceId: mount.workspaceId,
			});
			Toast.toast.success(
				t(
					isPinned
						? "workspaceSidebar.benchmarkMountPin.unpinned"
						: "workspaceSidebar.benchmarkMountPin.pinned",
					{ benchmark: name },
				),
			);
		} catch (error) {
			handleError(
				error,
				"Benchmark mount pin update failed",
				true,
				t("workspaceSidebar.benchmarkMountPin.failed"),
			);
		}
	};

	/** Removes only the Workspace relationship after the user confirms. */
	const confirmUnmount = async () => {
		if (unmountMutation.isPending) return;
		try {
			await unmountMutation.mutateAsync({
				mountId: mount.id,
				workspaceId: mount.workspaceId,
			});
			Toast.toast.success(
				t("workspaceSidebar.benchmarkUnmount.success", { benchmark: name }),
			);
			setIsUnmountOpen(false);
			onUnmounted();
		} catch (error) {
			handleError(
				error,
				"Benchmark unmount failed",
				true,
				t("workspaceSidebar.benchmarkUnmount.failed"),
			);
		}
	};

	/**
	 * Routes compact menu identifiers to their owned interaction state.
	 *
	 * @example
	 * handleMenuAction("pin");
	 */
	const handleMenuAction = (action: BenchmarkMountAction) => {
		if (action === "pin") {
			setPinState();
			return;
		}
		setIsUnmountOpen(true);
	};

	const menuItems: DropdownMenuItemProps<BenchmarkMountAction>[] = [
		{
			icon: isPinned ? (
				<PinSlash aria-hidden="true" className="size-4 shrink-0 text-ink" />
			) : (
				<Pin aria-hidden="true" className="size-4 shrink-0 text-ink" />
			),
			id: "pin",
			isDisabled: pinMutation.isPending,
			labelKey: isPinned
				? "workspaceSidebar.unpinBenchmarkMount"
				: "workspaceSidebar.pinBenchmarkMount",
		},
		{
			danger: true,
			icon: (
				<TrashBin aria-hidden="true" className="size-4 shrink-0 text-danger" />
			),
			id: "unmount",
			labelKey: "workspaceSidebar.benchmarkUnmount.confirm",
			separated: true,
		},
	];

	return (
		<>
			<Button
				aria-label={t(
					isPinned
						? "workspaceSidebar.unpinBenchmarkMount"
						: "workspaceSidebar.pinBenchmarkMount",
				)}
				className="size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none transition-colors hover:bg-transparent hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
				isDisabled={pinMutation.isPending}
				isIconOnly
				onPress={() => setPinState()}
				size="sm"
				variant="ghost"
			>
				{isPinned ? (
					<PinFill aria-hidden="true" className="size-4" />
				) : (
					<Pin aria-hidden="true" className="size-4" />
				)}
			</Button>
			<DropdownMenu
				items={menuItems}
				onAction={handleMenuAction}
				placement="bottom end"
				trigger={
					<Button
						aria-label={t("workspaceSidebar.benchmarkMountActions", {
							benchmark: name,
						})}
						className={cn(
							"size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none transition-colors hover:bg-transparent hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
							isPinned &&
								"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
						)}
						isIconOnly
						size="sm"
						variant="ghost"
					>
						<Ellipsis aria-hidden="true" className="size-4" />
					</Button>
				}
			/>
			<AlertDialog
				confirmText={t("workspaceSidebar.benchmarkUnmount.confirm")}
				description={t("workspaceSidebar.benchmarkUnmount.description", {
					benchmark: name,
				})}
				isConfirmDisabled={unmountMutation.isPending}
				isOpen={isUnmountOpen}
				onConfirm={() => confirmUnmount()}
				onOpenChange={setIsUnmountOpen}
				title={t("workspaceSidebar.benchmarkUnmount.title")}
			>
				{unmountMutation.error ? (
					<p className="text-body-sm text-danger" role="alert">
						{t("workspaceSidebar.benchmarkUnmount.failed")}
					</p>
				) : null}
			</AlertDialog>
		</>
	);
};

/**
 * Reads the pinned title instead of looking up the latest catalog card.
 *
 * @example
 * <BenchmarkMountRow
 *   currentPath="/workspaces/workspace-1"
 *   mount={mount}
 *   onNavigate={navigate}
 * />
 */
const BenchmarkMountRow = ({
	currentPath,
	mount,
	onNavigate,
}: BenchmarkMountRowProps) => {
	"use no memo";
	const { t } = useTranslation();
	const query = useBenchmark(mount.benchmarkId, mount.versionId);
	const name =
		query.data?.document.name ??
		(query.isError ? t("benchmark.loadFailed") : t("loadingPage"));
	const mountPath = `/workspaces/${encodeURIComponent(mount.workspaceId)}/benchmark/${encodeURIComponent(mount.id)}`;
	const isActive = currentPath === mountPath;
	return (
		<div
			aria-label={name}
			aria-level={3}
			className={cn(
				"group mt-xs flex h-8 items-center gap-[7px] rounded-md pl-12 pr-[6px] text-body-sm font-medium hover:bg-hairline",
				isActive && "bg-hairline",
			)}
			role="treeitem"
			tabIndex={-1}
		>
			<button
				className="min-w-0 flex-1 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
				onClick={() => onNavigate(mountPath)}
				type="button"
			>
				{name}
			</button>
			<div
				className={cn(
					"flex shrink-0 items-center gap-sm text-mute transition-opacity motion-reduce:transition-none",
					!mount.pinnedAtMs &&
						"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
				)}
			>
				<BenchmarkMountActions
					mount={mount}
					name={name}
					onUnmounted={() => {
						if (isActive) {
							onNavigate(
								`/workspaces/${encodeURIComponent(mount.workspaceId)}`,
							);
						}
					}}
				/>
			</div>
		</div>
	);
};

export { BenchmarkMountRow };
