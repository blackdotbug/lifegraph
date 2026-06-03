import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import prettier from 'prettier';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
	AdminError,
	prepareNode,
	upsertNode,
	prepareLink,
	planNodeDelete,
	type LifeNode,
	type LifeLink
} from './src/lib/admin/operations';

/**
 * Dev-only admin backend for editing the lifegraph data files.
 *
 * `apply: 'serve'` means this NEVER runs during `vite build`, so the static
 * GitHub Pages output is completely untouched and the write endpoints cannot
 * exist in production. It exposes a tiny JSON API under /__admin/api that the
 * /admin route talks to. All validation/normalization lives in
 * src/lib/admin/operations.ts (pure + unit-tested); this file is just IO.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'src', 'lib', 'data');
const NODES_FILE = join(DATA_DIR, 'personal.lifegraph-nodes.json');
const LINKS_FILE = join(DATA_DIR, 'personal.lifegraph-links.json');

async function readJson<T>(file: string): Promise<T> {
	return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
}

/**
 * Write JSON atomically (temp file + rename to avoid truncation), formatted with the
 * repo's own Prettier config. Feeding Prettier the tab-expanded form keeps objects
 * multi-line (objectWrap: 'preserve') while inlining short arrays, so an edit touches
 * only the changed entry and always passes `prettier --check`.
 */
async function writeJson(file: string, data: unknown): Promise<void> {
	const config = await prettier.resolveConfig(file);
	const formatted = await prettier.format(JSON.stringify(data, null, '\t'), {
		...config,
		parser: 'json',
		filepath: file
	});
	const tmp = `${file}.tmp`;
	await fs.writeFile(tmp, formatted, 'utf-8');
	await fs.rename(tmp, file);
}

async function readData() {
	const [nodes, links] = await Promise.all([
		readJson<LifeNode[]>(NODES_FILE),
		readJson<LifeLink[]>(LINKS_FILE)
	]);
	return { nodes, links };
}

function send(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(body));
}

// Request bodies are arbitrary client JSON; validated in the handlers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readBody(req: IncomingMessage): Promise<any> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	const raw = Buffer.concat(chunks).toString('utf-8');
	return raw ? JSON.parse(raw) : {};
}

export function lifegraphAdmin(): Plugin {
	return {
		name: 'lifegraph-admin',
		apply: 'serve',
		configureServer(server: ViteDevServer) {
			server.middlewares.use('/__admin/api', (req, res) => {
				handle(req, res).catch((err) => {
					const status = err instanceof AdminError ? err.status : 500;
					if (status >= 500) server.config.logger.error(`[lifegraph-admin] ${err?.stack ?? err}`);
					send(res, status, { error: String(err?.message ?? err) });
				});
			});
		}
	};
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
	// req.url is relative to the /__admin/api mount point.
	const url = new URL(req.url ?? '/', 'http://localhost');
	const path = url.pathname.replace(/\/$/, '') || '/';
	const method = req.method ?? 'GET';

	if (method === 'GET' && path === '/data') {
		return send(res, 200, await readData());
	}

	if (method === 'POST' && path === '/node') {
		const { node } = await readBody(req);
		const { nodes, links } = await readData();
		const saved = prepareNode(node, nodes);
		const next = upsertNode(nodes, saved);
		await writeJson(NODES_FILE, next);
		return send(res, 200, { nodes: next, links, saved });
	}

	if (method === 'POST' && path === '/node/delete') {
		const { node_id, cascade } = await readBody(req);
		const { nodes, links } = await readData();
		const plan = planNodeDelete(nodes, links, node_id, !!cascade);
		if (!plan.blocked) {
			await writeJson(NODES_FILE, plan.nodes);
			if (cascade) await writeJson(LINKS_FILE, plan.links);
		}
		return send(res, 200, plan);
	}

	if (method === 'POST' && path === '/link') {
		const { link, index } = await readBody(req);
		const { nodes, links } = await readData();
		const prepared = prepareLink(link, nodes);
		const next = links.slice();
		if (typeof index === 'number' && index >= 0 && index < next.length) next[index] = prepared;
		else next.push(prepared);
		await writeJson(LINKS_FILE, next);
		return send(res, 200, { nodes, links: next });
	}

	if (method === 'POST' && path === '/link/delete') {
		const { index } = await readBody(req);
		const { nodes, links } = await readData();
		if (typeof index !== 'number' || index < 0 || index >= links.length) {
			throw new AdminError(`Invalid link index: ${index}.`);
		}
		const next = links.slice();
		next.splice(index, 1);
		await writeJson(LINKS_FILE, next);
		return send(res, 200, { nodes, links: next });
	}

	send(res, 404, { error: `Unknown admin endpoint: ${method} ${path}` });
}
