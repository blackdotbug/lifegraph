# Lifegraph

An interactive visualization of a life as a graph of **nodes** (pillars, events, people,
locations) and the **links** between them, with a chronological timeline and "bonus content"
modal. Built with SvelteKit + Svelte 5 (runes) and a D3 force-directed canvas, deployed as a
static site to GitHub Pages.

## Data

The site reads two JSON files, baked in at build time:

- `src/lib/data/personal.lifegraph-nodes.json` — `{ node_id, label, type, description?, date?, media? }`
  - `type` is one of `pillar | event | person | location`
  - `date` (events only) is a `"yyyy-MM-dd"` string
  - `media` is an optional `{ image?, video?, link?, gallery?: string[] }`
- `src/lib/data/personal.lifegraph-links.json` — `{ source, target, description? }` where
  `source`/`target` are `node_id`s

There is no database and no runtime backend — these files are the source of truth. Images live
in `static/images/`.

## Developing

```bash
npm install
npm run dev            # http://localhost:5173
```

Useful scripts: `npm run check` (type-check), `npm run lint`, `npm run format`, `npm test`
(Playwright + Vitest).

## Editing data: the admin tool

While the dev server is running, open **http://localhost:5173/admin** to add, edit, and delete
nodes and links through a form UI. It writes the JSON files directly (no database), with:

- auto-generated `node_id`s (`node_NN`)
- link source/target validation and cascade-on-delete
- output formatted with the project's Prettier config, so edits produce minimal diffs

The admin is **local-only** — it is powered by a dev-only Vite plugin
(`vite-plugin-lifegraph-admin.ts`, `apply: 'serve'`) and the `/admin` route is excluded from the
production build, so it never ships to GitHub Pages.

After editing, the running graph hot-reloads. To publish your changes:

```bash
git add src/lib/data/*.json
git commit -m "Update lifegraph data"
git push               # push to main
```

Pushing to `main` triggers the **Deploy to GitHub Pages** GitHub Action
(`.github/workflows/deploy.yml`), which builds the site and publishes it to the `deploy`
branch that Pages serves. No manual build/copy needed — you can also re-run it from the
Actions tab via "Run workflow".

## Building

```bash
npm run build          # static site → ./build (uses @sveltejs/adapter-static)
npm run preview        # preview the production build (served under /lifegraph)
```

The production base path is `/lifegraph` (for GitHub Pages); in dev it is `/`.
