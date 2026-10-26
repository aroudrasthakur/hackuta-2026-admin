# Issue #71: organizer dashboard commit and test plan

Review draft for [issue #71](https://github.com/aroudrasthakur/hackuta-2026-admin/issues/71).
Inspected on 2026-10-25 against `main` at `9de23a9`.
Only this plan is being added; implementation has not started.

## What exists and what needs work

| Area | Current implementation | Proposed work |
| --- | --- | --- |
| Navigation | `AdminLayout.tsx` filters sections using the existing route policy and marks Applications selected on detail routes. Links use `tab`/`tablist` semantics; there are no section icons. | Use navigation links with `aria-current="page"`, consistent icons and selected states, and responsive spacing. Preserve role filtering, permission loading, revocation notices, and routes. |
| Header and account | Compact fixed header, logo, desktop identity/role/sign-out, mobile account menu. Layout measures header height with `ResizeObserver`. Page headings differ in size and level. | Establish a consistent compact header and page-heading pattern; retain the account behavior and make long names, responsive resizing, and keyboard interaction reliable. |
| Tokens and controls | Tailwind 4 branding tokens, `admin-card`, fields, callouts, and review button classes already exist. Dashboard styles span `index.css` and `storm.css`. | Extend the existing system with semantic colors, spacing, type, radius, shadow, table, control, and icon tokens. Consolidate duplicated dashboard styling without changing sign-in visuals. |
| Applications | Search/status/sort/assignment URL controls, pagination, desktop table, mobile cards, accessible status text, empty states, and retry boundary already exist. | Refine the shared visual patterns, preserve every control and URL behavior, and add contextual skeleton loading. |
| Application review | Evidence-first detail page, inline two-step decision confirmation, completion focus, admin-only history timeline, and native resume dialog. | Apply consistent panels, buttons, status styles, dialog chrome, and feedback. Preserve confirmation, cancel, focus, history, and PDF behavior. |
| Decision emails | Separate table styles; raw queue status text; counts, selection, hold/unhold, send selected/all, retry failed, and recently sent section. Mutation errors are handled, but there is no page-local query retry boundary. | Align table and statuses, make mobile rows usable, unify notifications and loading, and add page-local query error recovery. Keep existing delivery semantics and role restrictions. |
| Participants and Volunteers | Protected `StaffWorkflowPage.tsx` entry pages displaying “Coming soon.” No management tables or forms are mounted. | Apply the shared page header and honest empty-state treatment. Management workflow implementation remains with its separate issues. |
| Events and audit | Volunteer events are cards; application review history is a timeline. No event table or general audit-log table is mounted in the SPA. | Style the existing cards and timeline consistently. Do not replace them with tables simply to satisfy a generic table requirement. |
| Interaction states | Shared loading spinner, empty and full-page error components; scoped focus indicators; storm-specific reduced-motion rules. | Add contextual skeletons, consistent inline notices and recovery, and reduced-motion handling for dashboard transitions and loading animation. |
| Tests | Vitest component/backend tests and Chromium Playwright auth, queue, and review suites. E2E mock already supports decision-email queries and actions. | Extend behavior tests where interactions change, add decision-email browser coverage, and capture desktop/mobile review evidence. |

## Scope and design assumptions for review

- Retain HackUTA branding, installed fonts, and the current ink/ocean/clay palette. Use quieter surfaces, readable text, restrained shadows, and visible focus states.
- Keep a compact brand/account header above responsive section navigation. Use labeled inline SVG icons, with decorative SVGs hidden from assistive technology; no icon package is needed. Keep labels visible on mobile and allow navigation to wrap without page overflow.
- Use one consistent page header with a title, short optional description, and an optional action slot. Keep staff identity, role, and sign-out in the shared shell. Do not invent primary actions for pages that do not need them.
- Keep the existing weather control and session behavior. Any dashboard styling changes must also be checked with both weather modes because `StormPageFrame` is shared with sign-in.
- Preserve all routes, query parameters, permission rules, backend calls, and data contracts. No backend deployment, database migration, or live email send is needed for this visual work.
- Use small shared styles/components where multiple screens actually need them. Avoid a generic table engine, a new form framework, or a global toast dependency.
- Maintain the native resume dialog and inline decision confirmation. A common dialog visual pattern does not require converting the decision flow into a modal.
- Preserve existing pagination and recently-sent limits. New pagination for the email queue or future management lists is a separate behavior change unless explicitly added to scope.

**Acceptance limitation:** the issue requests participant, volunteer, event, and audit-log tables, plus management form styling. Those interfaces do not currently exist here. This plan supplies reusable patterns and styles the current entry pages/cards/timeline. Full table/form acceptance for the missing workflows needs a follow-up or coordination with their implementation; it must not be marked complete based on placeholder pages.

## Proposed commits

Each commit should build independently and include any tests required by its own behavior changes. Subject lines use Conventional Commits. The order below keeps the shared foundation ahead of page adoption.

### 1. `style: define shared dashboard tokens and interaction styles`

**Changes**

- Extend `src/styles/index.css` with semantic dashboard tokens for surfaces, borders, text, status colors, spacing, typography, radii, shadows, control heights, table padding, and icon sizes.
- Define shared button, field, table, badge, notice, and skeleton styles while retaining existing classes until consumers migrate.
- Consolidate dashboard-specific topbar styles from `src/styles/storm.css` as needed; leave sign-in-specific rules scoped to sign-in.
- Scope reduced-motion overrides to dashboard transitions and loading effects. Retain a static loading indication and accessible text when animation is disabled.

**Validation**

- Run lint, typecheck, and build. Review dashboard and sign-in in both weather modes at desktop and mobile widths.
- Check text/status contrast and focus visibility on the actual rendered surfaces. Do not add unit tests that only assert CSS class strings or token values.

### 2. `refactor: unify dashboard controls and feedback components`

**Changes**

- Reuse `reviewButtonClasses.ts` as the button styling entry point; retain exports or update consumers together. Cover primary, secondary, ghost/icon, destructive, disabled, and pending presentation.
- Add a small page-header component and shared status presentation as needed. Align `ApplicationStatusBadge.tsx` and `ApplicationDecisionBadge.tsx` without changing status meaning or decision badge visibility.
- Extend `components/states/` with contextual skeleton/inline recovery patterns; preserve the full-page auth error use case. Keep loading announcements singular and decorative skeletons hidden.
- Align field labels, descriptions, validation, dropdown panels, and notice styles. Preserve `AdminListboxSelect.tsx` interaction behavior and accessible names.

**Validation**

- Test page heading/action semantics, readable status labels, loading announcements, and recovery callbacks where new behavior is introduced.
- Run existing application-page, decision-controls, dropdown-dismiss, shell, and decision-email tests. Verify loading/disabled controls do not issue duplicate requests through existing behavioral tests.
- Use browser checks for control dimensions, focus, and reduced motion; avoid snapshots of utility classes.

### 3. `feat: refresh role-aware navigation and account layout`

**Changes**

- Update `AdminLayout.tsx` with responsive icon-and-label section links and prominent current-section styling. Replace route tabs with ordinary navigation links and `aria-current`.
- Keep Applications current on review detail routes. Preserve admin/reviewer/volunteer navigation restrictions and reactive scan access updates through the existing policy.
- Keep `AdminAccountControls.tsx` compact and predictable, with visible identity/role, clearly labeled sign-out, and errors that remain readable on mobile.
- Retain skip-to-content and prevent the header from covering content or focused controls. Adjust measured header spacing only if the revised layout needs it.
- Update existing test selectors and auth helpers in this commit when navigation semantics change; do not leave browser tests broken until the final commit.

**Validation**

- Extend `admin-layout`, `admin-nav`, `admin-account-controls`, `admin-shell`, and `staff-routing` unit tests.
- Assert exact role-visible links, current indication on nested routes, permission loading/revocation, and no forbidden page mounting.
- Add account-menu open/focus, Escape/return focus, outside dismissal, arrow/Home/End, and resize checks where not already covered. Retain successful sign-out, pending state, and retry-after-failure assertions.
- Run `auth.spec.ts` and the queue keyboard test. Check long staff names, mobile navigation, deep links, refresh/history, and skip-to-content.

### 4. `style: align application queue and review presentation`

**Changes**

- Apply the shared page header, controls, table/cell patterns, badges, and notices to `ApplicationsPage.tsx`, `ApplicationsList.tsx`, and `ApplicationsQueuePagination.tsx`.
- Preserve desktop tables and mobile cards, all columns and controls, row links, counts, pagination, filters, and queue context.
- Apply the same visual system to `ApplicationReviewPage.tsx`, identity, evidence panels, review/decision controls, history, and resume preview/PDF controls.
- Keep contextual loading dimensions stable. Standardize resume dialog spacing/title/actions while retaining its larger document-viewer dimensions and full-screen mobile layout.

**Validation**

- Run application-page, queue, review-page, decision-controls, review-history-panel, resume-preview, and resume-pdf unit tests.
- Run `applications-queue.spec.ts` and `application-review.spec.ts`: filters/URL persistence, pagination, next review, live stale claims, confirmation/cancel/completion focus, waitlist behavior, and admin-only history must remain intact.
- Check native dialog keyboard containment and Escape/close focus restoration in Chromium; unit dialog mocks alone cannot prove native focus behavior.
- Review long names/emails/schools, every visible application state, empty/no-match/error states, and both sides of the desktop-table/mobile-card breakpoint.

### 5. `feat: unify decision email table and recovery states`

**Changes**

- Apply the shared header, table patterns, row feedback, badges, notices, and skeleton loading to `DecisionEmailQueuePage.tsx`.
- Give table headers explicit scope and a meaningful caption/accessibility name. Keep selection, applicant identity, decision, queue status, queued time, and hold controls visible and understandable.
- Preserve all row controls on small screens. Use labeled mobile rows/cards or a contained, keyboard-accessible table scroller that cannot overflow the page.
- Distinguish queued, held, sending, failed, and sent with text as well as color. Keep application decisions separate from delivery states.
- Add a local query error boundary with retry, following the Applications page pattern. Keep the page heading available during loading and failure.
- Preserve admin-only sending/holding/retry controls, selection semantics, existing disabled conditions, recently-sent limits, and exact action payloads. Preserve the distinction between queued decisions and delivered emails.

**Validation**

- Extend `decision-email-queue-page.test.tsx` for query failure/retry, status labels, table semantics, and any new mobile rendering. Retain all existing send/hold/unhold/retry/error/busy tests.
- Add `tests/e2e/decision-email-queue.spec.ts` using the existing mock: reviewer read-only view; admin selection, hold/unhold, send selected/all, retry, and sent-list updates.
- Reuse mock support; add deterministic fixtures/failure injection only for cases not currently representable, including loading, sending, and failed rows. No real emails.
- Verify the page at mobile/desktop widths and run `tests/integration/decision-email-queue.test.ts` as a delivery-contract regression check.

### 6. `style: align volunteer and management entry pages`

**Changes**

- Use the shared header and states in `StaffWorkflowPage.tsx` and `VolunteerDashboardPage.tsx`.
- Align responsibility cards, event schedules, action links, empty assignments, loading, and access notices with the dashboard visual system.
- Keep Participants and Volunteers entry pages accurate about unavailable workflows. Keep existing scanner entry pages and back links.
- Preserve event-card content, advisory scheduling, permission checks, and assigned-event links. Do not add management/scanning mutations or forms.

**Validation**

- Run `staff-routing.test.tsx` and the volunteer cases in `admin-shell.test.tsx` and `auth.spec.ts`.
- Cover no responsibilities, loading assignments, available grants, reference schedule states, revoked/restored access, and a selected event that becomes unauthorized.
- Capture mobile/desktop volunteer and management entry pages. Check that no admin links appear for volunteers and management links remain admin-only.

### 7. `test: verify dashboard responsiveness and accessibility`

**Changes**

- Complete cross-page Playwright coverage, reusing the existing specs and fixtures. Add a focused dashboard layout spec only for cases that do not fit those suites.
- Check widths of 320, 375, 768, 1024, and 1440 pixels; include a 200% zoom review, long content, header wrapping, and both account layouts.
- Verify keyboard navigation, skip link, current-page indication, visible focus, dropdown/menu dismissal, native modal focus, and reduced-motion behavior.
- Capture representative screenshots for Applications, review, Decision Emails, volunteer dashboard, Participants, and Volunteers. Screenshots are visual review evidence; only call them regression baselines if stable screenshot assertions are actually added.
- Update component/page/style documentation and the E2E coverage map for the final implementation and remaining workflow dependencies.

**Validation**

- Run the complete checks listed below. Review screenshots and contrast manually; passing behavioral tests alone does not establish visual quality or accessibility.
- Confirm ordinary navigation, filter changes, rendering, and loading recovery never invoke participant mutations or email release actions.
- Review the diff for route/policy/backend/lockfile changes and accidental removed controls. Reconcile every issue checkbox against implemented behavior and the explicit deferred interfaces.

## Final checks after implementation

Run these from the repository root in PowerShell:

```powershell
npm.cmd run check:whitespace
npm.cmd run verify:register-schema-lock
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run test:e2e
```

- Coverage must retain the existing 90% minimum for lines, statements, functions, and branches. Do not lower thresholds or exclude new dashboard logic to pass.
- `test:coverage` includes the existing in-memory backend integration tests. These preserve authorization, review, participant, volunteer, and decision-email contracts without live data.
- The default local Playwright command runs against the mock dev server. CI additionally runs Playwright against the production build using `PLAYWRIGHT_USE_BUILD=true`; that build must have been produced with the existing CI mock environment in `.github/workflows/ci.yml`. Setting the preview flag alone does not turn a normal build into a mock build.
- Require the browser runner to finish with exit code zero and complete web-server shutdown, as documented in `tests/e2e/README.md`.
- The current browser project is Chromium. Include manual Firefox/Safari checks if those browsers are part of the release requirements; do not claim automated coverage for them.
- A live-backend smoke test is not required for this frontend redesign. Any later live verification must use dedicated test accounts and must not release real queued emails.

## Acceptance and review evidence

| Issue criteria | Primary commits | Evidence |
| --- | --- | --- |
| Cohesive navigation; correct sections for each role | 1, 3 | Role/current-route tests, permission regression tests, desktop/mobile screenshots |
| Consistent header and account controls | 2, 3, 6 | Shared header adoption, account keyboard/sign-out tests, long-name/mobile review |
| Shared tables, buttons, forms, modals | 1, 2, 4, 5 | Existing application/email tables and fields, native resume dialog, inline confirmation; missing management interfaces remain deferred |
| Meaningful accessible status indicators | 1, 2, 4, 5, 6 | Visible state labels, distinct decision/delivery states, rendered contrast review |
| Desktop/mobile layout and keyboard accessibility | 3 through 7 | Viewport and overflow checks, keyboard/focus tests, modal browser checks, zoom review |
| Polished loading/empty/error states | 2, 4, 5, 6 | Contextual skeletons, readable announcements, empty-state actions, query retry tests |
| Preserved organizer workflows | 3 through 7 | Existing behavioral suites and full integration regression run; unchanged payloads and permissions |
| No unnecessary visual dependencies | All | Package/lockfile diff review; existing Tailwind, CSS, React, and inline SVG |

## Baseline already checked

The following existing unit files passed before implementation:

`admin-layout`, `admin-nav`, `admin-account-controls`, `admin-shell`, `staff-routing`,
`application-page`, `application-review-page`, `application-decision-controls`,
`decision-email-queue-page`, and `resume-preview`.

Result: **10 files, 205 tests passed** on 2026-10-25 at `9de23a9`.
Expected error-path logs were emitted by failure/retry tests. This was a focused
baseline run, not a full coverage, integration, build, or browser verification.

## Review decisions

The proposed defaults are the existing brand palette, a compact header with wrapping
section navigation, contextual skeletons, and reusable patterns for workflows that
are still placeholders. Review the design direction, seven-commit sequence, and
missing-interface acceptance limitation before implementation begins.
