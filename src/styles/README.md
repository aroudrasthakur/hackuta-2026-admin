# Styles

[`index.css`](index.css) — Tailwind v4 entry and HackUTA design tokens.

[`dashboard.css`](dashboard.css) — dashboard header/navigation, page headers,
tables, badges, states and reduced-motion behavior. The shell uses a translucent
surface to keep the weather backdrop subtle behind working content. Tokens in
`index.css` define surface/border/status colors, control and icon dimensions,
radii, shadows, table padding, and the existing brand typography.

Use `.admin-table` on semantic tables, `.admin-table-scroll` on contained scroll
regions, and the shared status components for labeled states. Application tables
retain mobile cards; resume dialogs retain document-viewer dimensions. Keep
interactive targets at least 44px high and use the shared focus treatment.

[`storm.css`](storm.css) — organizer sign-in storm backdrop and card styles, including `.sign-in-field__control` for the password reveal button (aligned with register sign-in).
