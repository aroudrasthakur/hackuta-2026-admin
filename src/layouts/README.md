# Layouts

[`AdminLayout.tsx`](AdminLayout.tsx) — shell with nav and outlet for protected `/admin/*` routes.

The compact header stays in document flow, with branding, weather controls and
staff account controls. Section links wrap on mobile and use `aria-current="page"`;
they are route navigation rather than an ARIA tab widget. Applications remains
current on review detail routes. Role/assignment filtering and revocation notices
continue to use the existing route policy and reactive permission subscription.
