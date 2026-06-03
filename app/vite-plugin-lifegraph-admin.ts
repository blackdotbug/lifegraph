import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import prettier from 'prettier';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Dev-only admin backend for editing the lifegraph data files.
 *
 * `apply: 'serve'` means this NEVER runs during `vite build`, so the static
 * GitHub Pages output is completely untouched and the write endpoints cannot
 * exist in production. It exposes a tiny JSON API under /__admin/api that the
 * /admin route talks to.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'src', 'lib', 'data');
const NODES_FILE = join(DATA_DIR, 'personal.lifegraph-nodes.json');
const LINKS_FILE = join(DATA_DIR, 'personal.lifegraph-links.json');

type Media = {
	image?: string;
	video?: string;
	link?: string;
	gallery?: string[];
};
type LifeNode = {
	node_id: string;
	label: string;
	type: 'pillar' | 'event' | 'person' | 'location';
	description?: string;
	date?: string;
	media?: Media;
};
type LifeLink = { source: string; target: string; description?: string };

/** A validation failure that maps to HTTP 400 (vs. an unexpected 500). */
class AdminError extends Error {
	status = 400;
}

async function readJson<T>(file: string): Promise<T> {
	return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
}

/**
 * Write JSON atomically (temp file + rename to avoid truncation), formatted with the
 * repo's own Prettier config. Running it through Prettier (rather than JSON.stringify)
 * guarantees admin edits produce minimal diffs and always pass `prettier --check` —
 * matching tab indent, inline short arrays, trailing newline, etc.
 */
async function writeJson(file: string, data: unknown): Promise<void> {
	const config = await prettier.resolveConfig(file);
	// Feed Prettier the tab-expanded form: its JSON `objectWrap: 'preserve'` then keeps
	// objects multi-line (matching the existing files) while still inlining short arrays,
	// so an edit touches only the changed entry.
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

/** Next id of the form node_NN based on the current max (not array length — survives deletes). */
function nextNodeId(nodes: LifeNode[]): string {
	let max = 0;
	for (const n of nodes) {
		const m = /^node_(\d+)$/.exec(n.node_id ?? '');
		if (m) max = Math.max(max, parseInt(m[1], 10));
	}
	return `node_${String(max + 1).padStart(2, '0')}`;
}

/** Strip empty media fields so the files stay tidy; return undefined if nothing left. */
function cleanMedia(media: Media | undefined): Media | undefined {
	if (!media) return undefined;
	const out: Media = {};
	if (media.image?.trim()) out.image = media.image.trim();
	if (media.video?.trim()) out.video = media.video.trim();
	if (media.link?.trim()) out.link = media.link.trim();
	const gallery = (media.gallery ?? []).map((g) => g.trim()).filter(Boolean);
	if (gallery.length) out.gallery = gallery;
	return Object.keys(out).length ? out : undefined;
}

function send(res: ServerResponse, status: number, body: unknown): void {
	const json = JSON.stringify(body);
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(json);
}

// Request bodies are arbitrary client JSON; validated in the handlers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readBody(req: IncomingMessage): Promise<any> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	const raw = Buffer.concat(chunks).toString('utf-8');
	return raw ? JSON.parse(raw) : {};
}

const TYPES = new Set(['pillar', 'event', 'person', 'location']);

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
		return send(res, 200, await upsertNode(node));
	}

	if (method === 'POST' && path === '/node/delete') {
		const { node_id, cascade } = await readBody(req);
		return send(res, 200, await deleteNode(node_id, !!cascade));
	}

	if (method === 'POST' && path === '/link') {
		const { link, index } = await readBody(req);
		return send(res, 200, await upsertLink(link, index));
	}

	if (method === 'POST' && path === '/link/delete') {
		const { index } = await readBody(req);
		return send(res, 200, await deleteLink(index));
	}

	send(res, 404, { error: `Unknown admin endpoint: ${method} ${path}` });
}

async function upsertNode(input: LifeNode) {
	if (!input || typeof input.label !== 'string' || !input.label.trim()) {
		throw new AdminError('Node requires a non-empty label.');
	}
	if (!TYPES.has(input.type)) {
		throw new AdminError(
			`Node type must be one of pillar/event/person/location (got "${input.type}").`
		);
	}
	const { nodes, links } = await readData();

	const node: LifeNode = {
		node_id: input.node_id || nextNodeId(nodes),
		label: input.label.trim(),
		type: input.type,
		description: (input.description ?? '').trim()
	};
	if (input.type === 'event' && input.date) node.date = input.date;
	const media = cleanMedia(input.media);
	if (media) node.media = media;

	const idx = nodes.findIndex((n) => n.node_id === node.node_id);
	if (idx >= 0) nodes[idx] = node;
	else nodes.push(node);

	await writeJson(NODES_FILE, nodes);
	return { nodes, links, saved: node };
}

async function deleteNode(nodeId: string, cascade: boolean) {
	const { nodes, links } = await readData();
	const refs = links.filter((l) => l.source === nodeId || l.target === nodeId);
	if (refs.length && !cascade) {
		return {
			nodes,
			links,
			blocked: true,
			referencingLinks: refs.length,
			message: `${refs.length} link(s) reference ${nodeId}. Delete them too (cascade) or remove them first.`
		};
	}
	const nextNodes = nodes.filter((n) => n.node_id !== nodeId);
	const nextLinks = cascade
		? links.filter((l) => l.source !== nodeId && l.target !== nodeId)
		: links;

	await writeJson(NODES_FILE, nextNodes);
	if (cascade) await writeJson(LINKS_FILE, nextLinks);
	return { nodes: nextNodes, links: nextLinks };
}

async function upsertLink(input: LifeLink, index: number | undefined) {
	const { nodes, links } = await readData();
	const ids = new Set(nodes.map((n) => n.node_id));
	if (!input || !ids.has(input.source))
		throw new AdminError(`Unknown source node: "${input?.source}".`);
	if (!ids.has(input.target)) throw new AdminError(`Unknown target node: "${input.target}".`);
	if (input.source === input.target)
		throw new AdminError('A link cannot connect a node to itself.');

	const link: LifeLink = {
		source: input.source,
		target: input.target,
		description: (input.description ?? '').trim()
	};
	if (typeof index === 'number' && index >= 0 && index < links.length) links[index] = link;
	else links.push(link);

	await writeJson(LINKS_FILE, links);
	return { nodes, links };
}

async function deleteLink(index: number) {
	const { nodes, links } = await readData();
	if (typeof index !== 'number' || index < 0 || index >= links.length) {
		throw new AdminError(`Invalid link index: ${index}.`);
	}
	links.splice(index, 1);
	await writeJson(LINKS_FILE, links);
	return { nodes, links };
}
