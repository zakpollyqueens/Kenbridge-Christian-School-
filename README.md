# Kenbridge Christian School

This repository contains the Kenbridge Christian School public website (static pages under `page/`, `css/`, `js/`, and `images/`) and a small Express backend API in `backend/`.

## Live website

- Cloudflare Pages: https://kenbridge-christian-school.pages.dev/

## Quick start

Requirements: Node.js 18+ and npm

Run the backend API (development):

```bash
cd backend
npm install
# start the server
npm run dev
```

The backend listens on the port configured in `.env` or default 5000. See `backend/.env.example` for environment variables.

Serve the static site:

- Option 1 (local static server): `npx http-server -c-1 -p 8080`
- Option 2: Cloudflare Pages serves the root `index.html` and its static assets.

## Backend note

The Express API is a separate deployment component. The Cloudflare Pages project currently hosts the public static frontend; API compatibility, environment variables, and endpoints must be audited before moving the backend to Cloudflare Workers. Do not assume that the backend is migrated merely because the frontend is hosted on Pages.

## Contact

For questions about this repository contact the site maintainer (email present in `page/contact.html`).
