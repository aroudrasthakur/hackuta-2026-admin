# Components

| Component | Role |
| --- | --- |
| [`AdminPageHeader.tsx`](AdminPageHeader.tsx) | Page title, optional description and action slot |
| [`AdminStatusBadge.tsx`](AdminStatusBadge.tsx) | Shared status tones with visible text |
| [`SectionIcon.tsx`](SectionIcon.tsx) | Decorative section icons used with visible labels |
| [`AdminAccountControls.tsx`](AdminAccountControls.tsx) | Staff identity, responsive account menu and sign-out |
| [`ApplicationDetail.tsx`](ApplicationDetail.tsx) | Read-only applicant fields |
| [`ApplicationsList.tsx`](ApplicationsList.tsx) | Desktop queue table and mobile cards |
| [`ApplicationStatusBadge.tsx`](ApplicationStatusBadge.tsx) | Consistent queue status labels |
| [`ApplicationReviewControls.tsx`](ApplicationReviewControls.tsx) | Review claim |
| [`ApplicationDecisionControls.tsx`](ApplicationDecisionControls.tsx) | Two-step decisions |
| [`ApplicationReviewHistory.tsx`](ApplicationReviewHistory.tsx) | Admin audit timeline |
| [`ReviewPanelSection.tsx`](ReviewPanelSection.tsx) | Shared review panel layout |
| [`AdminProtectedRoute.tsx`](AdminProtectedRoute.tsx) | Session gate |
| [`SignInPasswordInput.tsx`](SignInPasswordInput.tsx) | Password field with show/hide toggle (matches register sign-in) |
| [`shop/`](shop/) | Admin shop tabs, item drawer, refund dialog, shop volunteer switches |
| [`states/`](states/README.md) | Loading, empty, error |

Buttons share [`reviewButtonClasses.ts`](../lib/reviewButtonClasses.ts).
See [styles](../styles/README.md) for table and interaction patterns.
