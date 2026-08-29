# ModalProvider Rules for Agents

Use `src/components/ui/modal-provider.tsx`; do not assemble HeroUI modal
primitives in feature code.

## Rules

1. Prefer `trigger`. Do not add `isOpen` state when one nearby button is the
   only opener.
2. Use controlled mode only when an external menu, route, or async workflow
   must control visibility. `trigger` and `isOpen` are mutually exclusive.
3. Keep simple form fields uncontrolled. Use `name`, native validation, and
   `FormData` on submit; use React state only for live UI derived from input.
4. The provider owns opening and closing. Do not hoist modal state merely to
   close after submit; extend the shared provider's close API when needed.

```tsx
<ModalProvider
	title={t("workspace.createTitle")}
	trigger={<Button>{t("workspace.create")}</Button>}
>
	<form onSubmit={handleSubmit}>
		<input name="name" required />
		<Button type="submit">{t("common.create")}</Button>
	</form>
</ModalProvider>
```

Controlled mode is reserved for an external opener:

```tsx
<ModalProvider isOpen={isOpen} onOpenChange={setIsOpen} title={title}>
	<Content />
</ModalProvider>
```
