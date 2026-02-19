# Styling

## Tailwind CSS v4 + DaisyUI v5

Styling uses **Tailwind CSS v4** with the **DaisyUI v5** component library. Both are registered as Vite plugins in `app.config.ts`.

Theme configuration lives in `src/app.css`:

```css
@import "tailwindcss";
@plugin "daisyui";

@plugin "daisyui/theme" {
  name: "corporate-light";
  default: true;
  color-scheme: light;
  /* OKLch color tokens */
}

@plugin "daisyui/theme" {
  name: "corporate-dark";
  prefersdark: true;
  color-scheme: dark;
  /* OKLch color tokens */
}
```

## Themes

Two custom themes are defined:

| Theme              | Trigger              |
|--------------------|----------------------|
| `corporate-light`  | Default              |
| `corporate-dark`   | `prefers-color-scheme: dark` |

Both use the OKLch color space for all color tokens.

## Using DaisyUI Components

DaisyUI provides class-based components. Use them directly in JSX:

```tsx
<button class="btn btn-primary">Submit</button>
<div class="card bg-base-100 shadow-sm">...</div>
<div class="chat chat-start">...</div>
```

Reference: [DaisyUI docs](https://daisyui.com/components/).

## Design Tokens

Key tokens from the theme:

| Token               | Light                       | Dark                        |
|----------------------|-----------------------------|-----------------------------|
| `base-100`           | Near-white background       | Dark background             |
| `base-content`       | Dark text                   | Light text                  |
| `primary`            | Deep blue                   | Bright blue                 |
| `success`            | Green (review pass)         | Green (review pass)         |
| `warning`            | Amber (review warning)      | Amber (review warning)      |
| `radius-box`         | `0.375rem`                  | `0.375rem`                  |

## Modifying the Theme

Edit the `@plugin "daisyui/theme"` blocks in `src/app.css`. Colors use OKLch: `oklch(lightness chroma hue)`.
