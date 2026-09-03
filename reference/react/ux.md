# UX Rules for Agents

Use these rules for user-facing React flows. Keep feedback explicit and avoid
leaving users guessing whether an action worked.

## Checklist

1. User-triggered requests must show toast feedback on both success and failure.
2. Copy style must be consistent. Do not mix labels such as OK, 确定, and 确认提交 in
   the same product flow.
3. Desktop pages must set a reasonable `max-width`.
4. Check responsive behavior at `375px`, `768px`, and `1440px` widths.
5. On mobile, check button size, modal height, bottom action areas, and
   horizontal overflow.
6. If dark mode is supported, support it completely. If it is not supported, do
   not mix in unfinished dark styles.
7. Images and avatars must have fallbacks.
8. Skeleton styles must be consistent.
9. Pages must never show `undefined`, `null`, `NaN`, or `Invalid Date`.
10. Date, money, count, and percentage formatting must be consistent.
11. Permission-denied states must show a clear message.
12. Table action columns must be consistent. Prefer putting dangerous actions in
    a more menu.
13. Pages must cover loading, populated, empty, search-no-results, error, and
    permission-denied states.
14. Search and filter flows must provide clear, reset, and no-results states.
15. Page headers must follow a consistent title, description, and actions
    structure.
16. Content density must be consistent. Do not make one page loose and another
    page cramped.
17. Motion must be restrained. Use unified transitions and avoid exaggerated
    animations.
18. `z-index` must be planned so Dropdown, Modal, Toast, and Tooltip do not
    cover each other incorrectly.
19. Long text must use `truncate`, `line-clamp`, `break-words`, or `max-w` so it
    cannot break layouts.
20. Empty data must render an Empty state.
21. Loading states must render Loading or Skeleton UI.
22. API errors must show an error message and a retry entry.
23. Toast success, failure, warning, and info messages must use consistent
    style, placement, and wording.
24. Dangerous operations such as delete, clear, reset, remove, and destructive
    bulk actions must require a second confirmation.
25. Check overflow to avoid horizontal scrolling, long text breaking layouts,
    and modals exceeding the viewport.
26. Reuse componentized UI for Button, Input, Modal, Dropdown, Card, Badge,
    Toast, Empty, and Skeleton patterns.
27. Tailwind classes should use shared tokens where possible. Do not scatter
    random colors and sizes through feature code.

## Request Feedback

Every user-triggered request must show a toast on both success and failure.

Rules:

1. If a user clicks, submits, confirms, toggles, imports, deletes, updates, or
   otherwise starts an async request, show a success toast after it completes.
2. Show a failure toast when the request rejects or returns an invalid result.
3. Success text should name the completed action, not describe implementation
   details.
4. Failure text should be brief and actionable. Prefer existing i18n keys and
   shared error helpers.
5. Do not show success toasts for background polling, initial page loads,
   automatic cache refreshes, or non-user-triggered sync.
6. Use consistent Toast variants for success, failure, warning, and info. Do not
   mix different wording styles or placements for the same kind of feedback.

Examples:

```tsx
try {
	await updateProject(projectId);
	Toast.toast.success(t("project.update.success"));
} catch (error) {
	handleError(error, "Project update failed", true);
}
```

```tsx
<AlertDialog
	confirmText={t("common.remove")}
	onConfirm={async () => {
		await removeMount(id);
		Toast.toast.success(t("skillMount.remove.success"));
	}}
	title={t("skillMount.remove.title")}
/>
```

## Media Fallbacks

Images and avatars must always have a fallback.

Rules:

1. Avatars must render a fallback initial, icon, or placeholder when the image
   URL is missing or fails to load.
2. Product, workspace, user, and integration images must render a visible
   fallback state when the image cannot be loaded.
3. The fallback must preserve the intended layout size so the UI does not jump.
4. Fallbacks must be accessible. Decorative fallback images should be hidden
   from assistive technology; meaningful fallbacks need an accessible label.
5. Do not leave broken image icons, empty avatar circles, or collapsed media
   containers in user-visible UI.

Examples:

```tsx
<Avatar src={user.avatarUrl} fallback={user.name.slice(0, 1)} />
```

```tsx
<img
	alt={project.name}
	onError={(event) => {
		event.currentTarget.hidden = true;
	}}
	src={project.imageUrl}
/>
<div aria-label={project.name} hidden={Boolean(project.imageUrl)}>
	{project.name.slice(0, 1)}
</div>
```

## Skeletons

Skeleton styles must be consistent across the app.

Rules:

1. Prefer shared loading components or copy the closest existing Skeleton
   pattern in the same UI surface.
2. Match the loaded content's layout, row height, spacing, width, and radius so
   loading does not shift the page.
3. Use the app's loading colors and motion utilities consistently, such as
   `bg-hairline` and `motion-reduce:animate-none`.
4. Keep Skeletons local to the area that is loading. Do not replace the whole
   page when only a list, row, button label, or count is pending.
5. Do not mix unrelated Skeleton shapes in one repeated list unless the loaded
   rows are also different.

Example:

```tsx
<div aria-label={t("loadingPage")} className="space-y-xs" role="status">
	<div className="h-8 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
	<div className="h-8 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
</div>
```

## States And Safety

Pages and components must cover the states a user can actually encounter.

Rules:

1. Empty data must use a clear Empty state instead of an empty panel.
2. Loading data must use Loading or Skeleton UI that matches the final layout.
3. API errors must show an error message and a visible retry action when retry
   is possible.
4. Long text must be constrained with `truncate`, `line-clamp`, `break-words`,
   or `max-w`.
5. Dangerous operations must use `AlertDialog` for confirmation before running
   the destructive request.
