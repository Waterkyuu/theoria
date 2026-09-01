# Zod 4.5

## Mandatory conventions

1. Schema names must use PascalCase and end with `Schema`.
2. Compiled schema names must use `Compiled<SchemaName>` and also end with `Schema`.
3. Keep the original schema and compiled schema as separate declarations. Do not inline `z.compile()`.
4. Infer TypeScript types from the original schema with `z.infer`.
5. Use only the compiled schema for runtime IPC response validation.
6. Use `z.literal([...])` for a finite set of literal values.

```ts
const PlayerSchema = z.object({
	username: z.string(),
	bio: z.string(),
	xp: z.number(),
});

const CompiledPlayerSchema = z.compile(PlayerSchema);

type Player = z.infer<typeof PlayerSchema>;

const response = await invoke<unknown>("get_player");
const player = CompiledPlayerSchema.parse(response);
```

## Prohibited patterns

Do not use camelCase schema names, omit the `Schema` suffix, or inline compilation:

```ts
const playerSchema = z.compile(
	z.object({
		username: z.string(),
	}),
);
```

Do not use a TypeScript assertion or an `invoke<T>()` generic as a replacement for runtime response validation:

```ts
const player = await invoke<Player>("get_player");
```

## Compilation behavior

`z.compile()` returns a precompiled schema with the same parsing interface as the original schema. Use the compiled schema for repeated IPC response parsing to benefit from Zod 4.5 compilation.
