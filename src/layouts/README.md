# Layouts (`src/layouts`)

Route-level layout shells. Flat directory.

## Overview

| File | Summary |
| --- | --- |
| [AdminLayout.tsx](AdminLayout.tsx) | Organizer chrome — header, AdminNav, sign-out placeholder, `<Outlet />` for nested routes |

## Usage

| Export | Used by |
| --- | --- |
| AdminLayout | [App.tsx](../App.tsx) — parent route for `/admin/*` |

## Related

| Location | Role |
| --- | --- |
| [components/README.md](../components/README.md) | AdminNav |
| [pages/README.md](../pages/README.md) | Child routes rendered in Outlet |

Parent index: [../README.md](../README.md).
