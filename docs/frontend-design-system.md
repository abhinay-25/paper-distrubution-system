# Frontend Design System and Structure

Step 2 foundation. Stack: React 19, TypeScript 6, Vite 8, Tailwind CSS 4 (CSS-first config), React Router 7.

## Design principles
- Warm off-white canvas, never pure white. Soft near-white cards, charcoal text, warm-gray borders.
- One restrained accent (deep green) for primary actions, active state and focus.
- "Frosted" translucency (`.glass`) only on the header, drawer, and nothing else. It falls back to a solid surface when `backdrop-filter` is unsupported or `prefers-reduced-transparency` is set.
- Honesty: no invented data. Unbuilt features are marked "Soon"/"Planned" and are not links.
- Accessible by default: visible focus ring, 44px touch targets on small screens, labels tied to inputs, status shown with text and icon (not color alone), reduced-motion respected, skip link, landmarks.

## Design tokens
All tokens are in [`frontend/src/index.css`](../frontend/src/index.css) under `@theme`. Change them there only.

| Group | Tokens |
|---|---|
| Surfaces | `canvas #f4f3ef`, `canvas-deep`, `surface #fbfaf8`, `surface-raised` |
| Text | `ink #1d1d1f`, `ink-soft`, `ink-muted`, `ink-faint` |
| Borders | `line`, `line-strong` |
| Accent | `accent #2d6a5d`, `accent-hover`, `accent-soft`, `accent-ink` |
| Semantic | `success`, `warning`, `danger` (+ `-soft`, `danger-hover`) |
| Type | `text-page-title`, `text-section`, `text-body`, `text-support`, `text-label`, `text-meta` |
| Radius | `rounded-control` (10px), `rounded-card` (16px), `rounded-panel` (20px) |
| Elevation | `shadow-card`, `shadow-overlay` |
| Font | Inter Variable, self-hosted via `@fontsource-variable/inter` (no external font CDN) |

Rebrand: edit [`src/config/app.ts`](../frontend/src/config/app.ts) (name, tagline).

## Directory structure
```
frontend/src/
  app/router.tsx            route table (shell + overview + not-found)
  config/app.ts             product identity
  config/navigation.ts      grouped navigation model
  components/layout/        AppShell, Header, SidebarNav, Brand
  components/ui/            Button, FormControls, Card, Badge, Feedback, Table
  lib/cn.ts                 class-name helper
  pages/                    OverviewPage, NotFoundPage
  index.css                 tokens + global styles
```

## Components
- `Button` (primary / secondary / outline / destructive; sm / md)
- `TextInput`, `Select`, `TextArea` (label, helper text and error wired with `aria-describedby` / `aria-invalid`)
- `Card`, `CardBody`, `PageHeader` (the page's only `h1`), `SectionHeader`
- `Badge` (neutral / accent / success / warning / danger)
- `EmptyState`, `ErrorMessage` (`role="alert"`), `Skeleton`, `Spinner`
- `Table`, `Th`, `Td` (horizontally scrollable wrapper)

Intentionally not built: dialogs, breadcrumbs, toasts, dropdown menus (not needed by the shell yet).

## Navigation and routing
`config/navigation.ts` defines groups and items. An item is `available` (has a route, rendered with `NavLink`) or `planned` (rendered as a non-interactive entry with a "Soon" tag). To add a feature: add its route under the shell in `app/router.tsx` and flip its nav item to `available` with a `to`. Showing or hiding items is presentation only, not authorization.

On screens below 1024px the sidebar becomes a drawer: focus moves into it, Tab is trapped, Escape/overlay/link click closes it, and focus returns to the menu button.

## Dependencies added in Step 2
| Package | Why |
|---|---|
| `tailwindcss`, `@tailwindcss/vite` | Styling system (v4, Vite plugin; supports Vite 8) |
| `react-router-dom` | Routing and not-found handling |
| `lucide-react` | Small, tree-shaken icon set (avoids hand-drawing icons) |
| `@fontsource-variable/inter` | Self-hosted font; no third-party requests |

## Known limitations
- Only the Overview route exists; header has no user menu/notifications/institution switcher (deliberately, until authentication exists).
- No automated frontend tests yet (no test runner installed); verification was build, lint and manual browser checks.
