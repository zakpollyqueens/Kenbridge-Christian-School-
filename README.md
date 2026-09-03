# Kenbridge Christian School

This repository contains the Kenbridge Christian School public website (static pages under `page/`, `css/`, `js/`, and `images/`) and a small Express backend API in `backend/`.

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

- Option 1 (local static server):

```bash
# from repository root
npx http-server -c-1 -p 8080
# open http://localhost:8080
```

- Option 2 (use a static hosting provider):

Deploy the `index.html`, `page/`, `css/`, `js/`, and `images/` folders to your static host (GitHub Pages, Netlify, Render static site, etc.).

## What I added

- `privacy.html` and `terms.html` — simple privacy policy and terms pages referenced by the footer.
- `LICENSE` — MIT license.
- `README.md` — expanded with run instructions.
- `robots.txt` and `sitemap.xml` (see below).

## Next recommended improvements

- Add `privacy.html` and `terms.html` links in a consistent place in the footer if needed (pages currently link to `/privacy.html` and `/terms.html`).
- Add Open Graph and Twitter meta tags to improve link previews.
- Consider serving a favicon and adding <link rel="icon"> to page heads.
- Make the front-end API base configurable (currently some pages use a hard-coded API_BASE). See `page/articles.html` for an example.

## Contact

For questions about this repository contact the site maintainer (email present in `page/contact.html`).
