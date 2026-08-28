# Tailwind CSS Styling Rules

1. Prefer Tailwind CSS canonical utility classes over arbitrary values.
   Before using an arbitrary value, check whether Tailwind provides an
   equivalent built-in utility.

   Examples:

   - Use `h-dvh`, not `h-[100dvh]`.
   - Use `w-full`, not `w-[100%]`.
   - Use `translate-y-1/2`, not `translate-y-[50%]`.
   - Use `z-10`, not `z-[10]`.
   - Use `h-7.5`, not `h-[30px]`.
   - Use `leading-8.5`, not `leading-[34px]`.
   - Use `bg-linear-to-t`, not `bg-gradient-to-t`.

2. Arbitrary values such as `[...]` are allowed only when Tailwind has no
   equivalent canonical utility. Do not replace required arbitrary selectors,
   CSS variables, or project-specific design-token values.

## Spacing Scale Conversion

Tailwind CSS v4 spacing utilities use a `0.25rem` (`4px`) base unit. Convert
pixel values that are exact multiples of `4px` to their canonical numeric
utility by dividing the pixel value by four:

```css
.h-\[30px\] {
	height: 30px;
}
```

The generated declaration above has the canonical utility `h-7.5` because
`30px / 4px = 7.5`. Likewise, use `leading-8.5` instead of `leading-[34px]`.
The backslashes only escape the square brackets in the generated CSS selector;
they do not indicate that an arbitrary utility is preferred.
