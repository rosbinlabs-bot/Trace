# Trace PMT — Cloud Project Delivery Management

A React + TypeScript + Vite port of the Trace PMT prototype (Powered by Rosbin Labs).

## Stack

- **Vite** — dev server & build
- **React 19 + TypeScript**
- **React Router** — one URL per screen (`/dashboard`, `/projects`, `/phases`, ...)
- **Tailwind CSS** — utility styling, with a `.dark`-class based dark mode

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build to dist/
npm run preview  # preview the production build locally
```

## Project structure

```
src/
  shared.tsx        // mock data, React contexts, icons, and shared UI primitives
                     // (Card, Badge, Icon, form fields, notification feed, phase widgets, etc.)
  App.tsx            // routing + app shell (sidebar, header, role switcher, dark mode)
  main.tsx           // React entry point
  index.css          // Tailwind directives + dark-mode overrides
  screens/           // one file per nav item (Dashboard, ProjectMaster, Phases, Reports, ...)
```

## Notes on this port

This started as a single-file HTML prototype (in-browser Babel + CDN React/Tailwind). It's been
split into a proper module structure:

- All mock/seed data, React contexts, and shared UI components live in `src/shared.tsx` and are
  imported into screens as `import * as S from '../shared'` (referenced as `S.PROJECTS`, `S.Card`,
  etc.) — this mirrors how the original file had everything in one global scope.
- Each nav item is its own screen component under `src/screens/`, wired to a route in `App.tsx`
  instead of the old in-memory `active` screen switch.
- Data is still all in-memory mock data (matches the original prototype) — no backend is wired up
  yet. `src/shared.tsx` is the place to swap in real API calls later.
- TypeScript is configured permissively (`strict: false`, liberal use of `any` on the mock data
  shapes) to keep the port faithful to the original JS without a full type-modeling pass. Tightening
  types incrementally (starting with the core `Project`/`Phase`/`Milestone` shapes) is a natural
  next step.
