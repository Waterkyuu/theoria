# AlertDialog Rules for Agents

Use `src/components/ui/alert-dialog.tsx` for confirmation flows; do not assemble
HeroUI alert-dialog primitives in feature code.

## Rules

1. Prefer `trigger` when the action button is next to the dialog.
2. Use controlled mode only when an external menu, route, or workflow opens the
   dialog. `trigger` and `isOpen` are mutually exclusive.
3. Put business work in `onConfirm`. Confirm and cancel already close through
   the shared component; do not call `setIsOpen(false)` only to close it.
4. Use `AlertDialog` for explicit confirmation. Use `ModalProvider` for forms
   and non-destructive content.
5. Pass user-visible text through i18n keys.

```tsx
<AlertDialog
	title={t("project.deleteTitle")}
	description={t("project.deleteDescription")}
	confirmText={t("common.delete")}
	onConfirm={() => deleteProject(project.id)}
	trigger={<Button variant="danger">{t("common.delete")}</Button>}
/>
```

Controlled mode is reserved for an external opener:

```tsx
<AlertDialog
	isOpen={isOpen}
	onOpenChange={setIsOpen}
	onConfirm={deleteProject}
	title={title}
/>
```
