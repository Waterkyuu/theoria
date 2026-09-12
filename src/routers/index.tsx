import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	BrowserRouter,
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
	useParams,
} from "react-router";
import { AppSidebar } from "@/components/share/app-sidebar";

type LastTaskContext =
	| {
			/** Selects the ordinary Task composer as the startup destination. */
			scope: "task";
	  }
	| {
			/** Selects a Workspace-bound Task composer as the startup destination. */
			scope: "workspace";
			/** Workspace restored without persisting navigation state in SQLite. */
			workspaceId: string;
	  };

const LAST_TASK_CONTEXT_KEY = "theoria:last-task-context";

const WorkspacePage = lazy(() => import("@/pages/workspace"));
const AgentsPage = lazy(() => import("@/pages/agents"));
const BenchmarkPage = lazy(() => import("@/pages/benchmark"));
const BenchmarkDetailPage = lazy(() => import("@/pages/benchmark/detail"));
const BenchmarkEditorPage = lazy(() => import("@/pages/benchmark/editor"));
const BenchmarkDraftsPage = lazy(() => import("@/pages/benchmark/drafts"));
const WorkspaceBenchmarkPage = lazy(() =>
	import("@/pages/benchmark/detail").then((module) => ({
		default: module.WorkspaceBenchmarkPage,
	})),
);
const RunBoardPage = lazy(() => import("@/pages/run-board"));
const SkillsPage = lazy(() => import("@/pages/skills"));
const SimpleCreateSkillPage = lazy(
	() => import("@/pages/skills/simple-create-skill"),
);
const EditSkillPage = lazy(() => import("@/pages/skills/edit-skill"));
const SettingsPage = lazy(() => import("@/pages/settings"));

const RouteLoadingFallback = () => {
	const { t } = useTranslation();

	return (
		<main
			aria-label={t("loadingPage")}
			aria-live="polite"
			className="mx-auto max-w-330 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
			role="status"
		>
			<div className="motion-safe:animate-pulse">
				<div className="h-4 w-48 rounded-full bg-hairline" />
				<div className="mt-5 h-10 max-w-2xl rounded-full bg-hairline" />
				<div className="mt-4 h-5 max-w-144 rounded-full bg-hairline" />
			</div>
		</main>
	);
};

/**
 * Converts the optional local startup context into an internal route.
 *
 * @example
 * getStartupPath('{"scope":"workspace","workspaceId":"docs-lab"}'); // "/workspaces/docs-lab"
 */
const getStartupPath = (storedContext: string | null) => {
	if (!storedContext) return "/task";

	try {
		const context: unknown = JSON.parse(storedContext);
		if (
			typeof context === "object" &&
			context !== null &&
			"scope" in context &&
			context.scope === "workspace" &&
			"workspaceId" in context &&
			typeof context.workspaceId === "string" &&
			context.workspaceId.length > 0
		) {
			return `/workspaces/${encodeURIComponent(context.workspaceId)}`;
		}
	} catch {
		return "/task";
	}

	return "/task";
};

/**
 * Persists only the last composer scope required by startup restoration.
 *
 * @example
 * rememberTaskContext({ scope: "task" });
 */
const rememberTaskContext = (context: LastTaskContext) => {
	window.localStorage.setItem(LAST_TASK_CONTEXT_KEY, JSON.stringify(context));
};

const StartupRoute = () => (
	<Navigate
		replace
		to={getStartupPath(window.localStorage.getItem(LAST_TASK_CONTEXT_KEY))}
	/>
);

const TaskRoute = () => {
	const { taskId } = useParams();

	useEffect(() => {
		rememberTaskContext({ scope: "task" });
	}, []);

	return <WorkspacePage taskId={taskId} />;
};

const WorkspaceRoute = () => {
	const { taskId, workspaceId } = useParams();

	useEffect(() => {
		if (workspaceId) {
			rememberTaskContext({ scope: "workspace", workspaceId });
		}
	}, [workspaceId]);

	if (!workspaceId) return <Navigate replace to="/task" />;

	return <WorkspacePage taskId={taskId} workspaceId={workspaceId} />;
};

const RoutedApplication = () => {
	const { pathname } = useLocation();
	const navigate = useNavigate();

	return (
		<AppSidebar
			currentPath={pathname === "/simple-create-skill" ? "/skills" : pathname}
			onNavigate={(path) => navigate(path)}
		>
			<Suspense fallback={<RouteLoadingFallback />}>
				<Routes>
					<Route element={<StartupRoute />} path="/" />
					<Route element={<TaskRoute />} path="/task" />
					<Route element={<TaskRoute />} path="/task/:taskId" />
					<Route element={<Navigate replace to="/task" />} path="/workspaces" />
					<Route element={<WorkspaceRoute />} path="/workspaces/:workspaceId" />
					<Route
						element={<WorkspaceRoute />}
						path="/workspaces/:workspaceId/task/:taskId"
					/>
					<Route element={<RunBoardPage />} path="/runs" />
					<Route element={<AgentsPage />} path="/agents" />
					<Route element={<SkillsPage />} path="/skills" />
					<Route
						element={<SimpleCreateSkillPage />}
						path="/simple-create-skill"
					/>
					<Route element={<EditSkillPage />} path="/skills/edit-skill" />
					<Route element={<BenchmarkPage />} path="/benchmark" />
					<Route element={<BenchmarkEditorPage />} path="/benchmark/new" />
					<Route element={<BenchmarkDraftsPage />} path="/benchmark/drafts" />
					<Route
						element={<BenchmarkEditorPage />}
						path="/benchmark/drafts/:draftId"
					/>
					<Route
						element={<BenchmarkDetailPage />}
						path="/benchmark/:benchmarkId"
					/>
					<Route
						element={<WorkspaceBenchmarkPage />}
						path="/workspaces/:workspaceId/benchmark/:mountId"
					/>
					<Route element={<SettingsPage />} path="/settings" />
					<Route element={<Navigate replace to="/" />} path="*" />
				</Routes>
			</Suspense>
		</AppSidebar>
	);
};

const AppRouter = () => (
	<BrowserRouter>
		<RoutedApplication />
	</BrowserRouter>
);

export { AppRouter };
