/*
 * Pure data operations for the local admin tool. Kept free of filesystem/IO so
 * they can be unit-tested directly; the dev-only Vite plugin
 * (vite-plugin-lifegraph-admin.ts) wraps these with read/write.
 */

export type Media = {
	image?: string;
	video?: string;
	link?: string;
	gallery?: string[];
};
export type LifeNode = {
	node_id: string;
	label: string;
	type: 'pillar' | 'event' | 'person' | 'location';
	description?: string;
	date?: string;
	media?: Media;
};
export type LifeLink = { source: string; target: string; description?: string };

export const TYPES = new Set(['pillar', 'event', 'person', 'location']);

/** A validation failure that maps to HTTP 400 (vs. an unexpected 500). */
export class AdminError extends Error {
	status = 400;
}

/** Next id of the form node_NN based on the current max (not array length — survives deletes). */
export function nextNodeId(nodes: LifeNode[]): string {
	let max = 0;
	for (const n of nodes) {
		const m = /^node_(\d+)$/.exec(n.node_id ?? '');
		if (m) max = Math.max(max, parseInt(m[1], 10));
	}
	return `node_${String(max + 1).padStart(2, '0')}`;
}

/** Strip empty media fields so the files stay tidy; return undefined if nothing left. */
export function cleanMedia(media: Media | undefined): Media | undefined {
	if (!media) return undefined;
	const out: Media = {};
	if (media.image?.trim()) out.image = media.image.trim();
	if (media.video?.trim()) out.video = media.video.trim();
	if (media.link?.trim()) out.link = media.link.trim();
	const gallery = (media.gallery ?? []).map((g) => g.trim()).filter(Boolean);
	if (gallery.length) out.gallery = gallery;
	return Object.keys(out).length ? out : undefined;
}

/** Validate + normalize an incoming node. Generates an id for new nodes. Throws AdminError. */
export function prepareNode(input: LifeNode, nodes: LifeNode[]): LifeNode {
	if (!input || typeof input.label !== 'string' || !input.label.trim()) {
		throw new AdminError('Node requires a non-empty label.');
	}
	if (!TYPES.has(input.type)) {
		throw new AdminError(
			`Node type must be one of pillar/event/person/location (got "${input.type}").`
		);
	}
	const node: LifeNode = {
		node_id: input.node_id || nextNodeId(nodes),
		label: input.label.trim(),
		type: input.type,
		description: (input.description ?? '').trim()
	};
	if (input.type === 'event' && input.date) node.date = input.date;
	const media = cleanMedia(input.media);
	if (media) node.media = media;
	return node;
}

/** Insert or replace a node by node_id, returning a new array. */
export function upsertNode(nodes: LifeNode[], node: LifeNode): LifeNode[] {
	const idx = nodes.findIndex((n) => n.node_id === node.node_id);
	if (idx < 0) return [...nodes, node];
	const next = nodes.slice();
	next[idx] = node;
	return next;
}

/** Validate + normalize an incoming link against existing nodes. Throws AdminError. */
export function prepareLink(input: LifeLink, nodes: LifeNode[]): LifeLink {
	const ids = new Set(nodes.map((n) => n.node_id));
	if (!input || !ids.has(input.source)) {
		throw new AdminError(`Unknown source node: "${input?.source}".`);
	}
	if (!ids.has(input.target)) throw new AdminError(`Unknown target node: "${input.target}".`);
	if (input.source === input.target) {
		throw new AdminError('A link cannot connect a node to itself.');
	}
	return {
		source: input.source,
		target: input.target,
		description: (input.description ?? '').trim()
	};
}

export type DeletePlan = {
	nodes: LifeNode[];
	links: LifeLink[];
	blocked?: boolean;
	referencingLinks?: number;
	message?: string;
};

/**
 * Plan a node deletion. If the node is referenced by links and cascade is false,
 * returns { blocked: true } leaving data unchanged. With cascade, removes the node
 * and its links.
 */
export function planNodeDelete(
	nodes: LifeNode[],
	links: LifeLink[],
	nodeId: string,
	cascade: boolean
): DeletePlan {
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
	return {
		nodes: nodes.filter((n) => n.node_id !== nodeId),
		links: cascade ? links.filter((l) => l.source !== nodeId && l.target !== nodeId) : links
	};
}
