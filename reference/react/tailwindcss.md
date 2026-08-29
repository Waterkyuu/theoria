# Tailwind CSS Styling Rules

1. Prefer named Tailwind CSS utilities and integer spacing-scale utilities over
   arbitrary values. Convert pixel values to the spacing scale only when the
   value is divisible by `4px` and the result is an integer.

   Examples:

   - Use `h-dvh`, not `h-[100dvh]`.
   - Use `w-full`, not `w-[100%]`.
   - Use `translate-y-1/2`, not `translate-y-[50%]`.
   - Use `z-10`, not `z-[10]`.
   - Use `h-10`, not `h-[40px]`.
   - Use `px-7`, not `px-[28px]`.
   - Use `bg-linear-to-t`, not `bg-gradient-to-t`.

2. Arbitrary values such as `[...]` are allowed only when Tailwind has no
   equivalent named utility or when conversion would produce a decimal spacing
   scale. Prefer `h-[210px]` over `h-52.5` and `mt-[7px]` over `mt-1.75` when
   the exact non-`4px` value is required. Do not replace required arbitrary
   selectors, CSS variables, or project-specific design-token values.

## Spacing Scale Conversion

Tailwind CSS v4 spacing utilities use a `0.25rem` (`4px`) base unit. Convert a
pixel value only when dividing it by four produces an integer:

```css
.h-\[40px\] {
	height: 40px;
}
```

Use `h-10` for the declaration above because `40px / 4px = 10`. Keep
`h-[30px]` when `30px` is required because its scale value would be the decimal
`7.5`. The backslashes only escape the square brackets in generated CSS.
