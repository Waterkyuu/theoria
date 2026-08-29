import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
	BrowserRouter,
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from "react-router";
import { AppShell } from "@/components/share/app-shell";

const WorkspacePage = lazy(() => import("@/pages/workspace"));
const ComparisonHistoryPage = lazy(() => import("@/pages/comparison-history"));
const RunBoardPage = lazy(() => import("@/pages/run-board"));
const SkillsPage = lazy(() => import("@/pages/skills"));

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

const RoutedApplication = () => {
	const { pathname } = useLocation();
	const navigate = useNavigate();

	return (
		<AppShell currentPath={pathname} onNavigate={(path) => navigate(path)}>
			<Suspense fallback={<RouteLoadingFallback />}>
				<Routes>
					<Route element={<WorkspacePage />} path="/" />
					<Route
						element={<WorkspacePage workspaceName="agent-gauge" />}
						path="/workspaces/agent-gauge"
					/>
					<Route
						element={<ComparisonHistoryPage />}
						path="/comparison-history"
					/>
					<Route
						element={<ComparisonHistoryPage />}
						path="/comparison-history/:comparisonId"
					/>
					<Route element={<RunBoardPage />} path="/runs" />
					<Route element={<SkillsPage />} path="/skills" />
					<Route element={null} path="/benchmark" />
					<Route element={<Navigate replace to="/" />} path="*" />
				</Routes>
			</Suspense>
		</AppShell>
	);
};

const AppRouter = () => (
	<BrowserRouter>
		<RoutedApplication />
	</BrowserRouter>
);

export { AppRouter };
