# Styles (`src/styles`)

Global CSS for the admin app. Single entry file imported from [main.tsx](../main.tsx).

## Overview

| File | Summary |
| --- | --- |
| [index.css](index.css) | Tailwind v4 `@import`, HackUTA design tokens, admin layout utilities |

## index.css sections

| Section | Role |
| --- | --- |
| `@import "tailwindcss"` | Tailwind v4 entry |
| `@theme` | Palette — ink, clay, ocean, sand, night, mist, light (aligned with HackUTA brand) |
| `@layer base` | Body defaults, focus rings, font stack |
| Component utilities | Admin-specific spacing and card patterns used by layouts and pages |

Page components use mostly Tailwind utility classes inline; no separate form CSS layer (unlike register).

## Related

| Location | Role |
| --- | --- |
| [layouts/README.md](../layouts/README.md) | AdminLayout structure |
| [hackuta-2026-repository/HACKUTA_DESIGN_CONTEXT.md](../../hackuta-2026-repository/HACKUTA_DESIGN_CONTEXT.md) | Brand reference (marketing repo) |

Parent index: [../README.md](../README.md).
