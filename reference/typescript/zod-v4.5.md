# Zod new version 4.5

## Pre compiled mod

z.compile() any schema and get back a new precompiled schema that's 3-9x faster

```ts
const Player = z.object({
    username: z.string(),
    bio: z.string(),
    xp: z.number(),
})


const CompiledPlayer = z.complie(Player);

Player.parse({...})
CompilerPlayer.parse({...}); // 9x faster
```