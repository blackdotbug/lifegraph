import { describe, it, expect } from 'vitest';
import {
	nextNodeId,
	cleanMedia,
	prepareNode,
	upsertNode,
	prepareLink,
	planNodeDelete,
	AdminError,
	type LifeNode,
	type LifeLink
} from './operations';

const nodes: LifeNode[] = [
	{ node_id: 'node_01', label: 'education', type: 'pillar' },
	{ node_id: 'node_05', label: 'an event', type: 'event', date: '2020-01-01' },
	{ node_id: 'node_12', label: 'a person', type: 'person' }
];

describe('nextNodeId', () => {
	it('returns max + 1, zero-padded (not array length, survives deletes)', () => {
		expect(nextNodeId(nodes)).toBe('node_13');
	});
	it('starts at node_01 for an empty set', () => {
		expect(nextNodeId([])).toBe('node_01');
	});
	it('ignores non-conforming ids', () => {
		expect(nextNodeId([{ node_id: 'weird', label: 'x', type: 'pillar' }])).toBe('node_01');
	});
});

describe('cleanMedia', () => {
	it('drops empty/whitespace fields', () => {
		expect(cleanMedia({ image: 'a.jpg', video: ' ', link: '' })).toEqual({ image: 'a.jpg' });
	});
	it('returns undefined when nothing remains', () => {
		expect(cleanMedia({ image: '', gallery: [] })).toBeUndefined();
	});
	it('trims and filters gallery entries', () => {
		expect(cleanMedia({ gallery: [' a.jpg ', '', 'b.jpg'] })).toEqual({
			gallery: ['a.jpg', 'b.jpg']
		});
	});
});

describe('prepareNode', () => {
	it('generates an id for a new node and trims fields', () => {
		const n = prepareNode(
			{ label: '  New  ', type: 'pillar', description: ' d ' } as LifeNode,
			nodes
		);
		expect(n.node_id).toBe('node_13');
		expect(n.label).toBe('New');
		expect(n.description).toBe('d');
	});
	it('keeps date only for events', () => {
		const ev = prepareNode({ label: 'e', type: 'event', date: '2021-05-01' } as LifeNode, nodes);
		expect(ev.date).toBe('2021-05-01');
		const loc = prepareNode(
			{ label: 'l', type: 'location', date: '2021-05-01' } as LifeNode,
			nodes
		);
		expect(loc.date).toBeUndefined();
	});
	it('rejects empty labels and bad types', () => {
		expect(() => prepareNode({ label: '  ', type: 'pillar' } as LifeNode, nodes)).toThrow(
			AdminError
		);
		// @ts-expect-error testing invalid type
		expect(() => prepareNode({ label: 'x', type: 'nope' }, nodes)).toThrow(/pillar\/event/);
	});
});

describe('upsertNode', () => {
	it('appends a new node', () => {
		const out = upsertNode(nodes, { node_id: 'node_99', label: 'z', type: 'pillar' });
		expect(out).toHaveLength(4);
	});
	it('replaces an existing node in place', () => {
		const out = upsertNode(nodes, { node_id: 'node_01', label: 'renamed', type: 'pillar' });
		expect(out).toHaveLength(3);
		expect(out.find((n) => n.node_id === 'node_01')?.label).toBe('renamed');
	});
});

describe('prepareLink', () => {
	it('accepts a valid link and trims description', () => {
		const l = prepareLink({ source: 'node_01', target: 'node_05', description: ' x ' }, nodes);
		expect(l).toEqual({ source: 'node_01', target: 'node_05', description: 'x' });
	});
	it('rejects unknown source/target', () => {
		expect(() => prepareLink({ source: 'node_77', target: 'node_01' } as LifeLink, nodes)).toThrow(
			/Unknown source/
		);
		expect(() => prepareLink({ source: 'node_01', target: 'node_77' } as LifeLink, nodes)).toThrow(
			/Unknown target/
		);
	});
	it('rejects self-links', () => {
		expect(() => prepareLink({ source: 'node_01', target: 'node_01' } as LifeLink, nodes)).toThrow(
			/itself/
		);
	});
});

describe('planNodeDelete', () => {
	const links: LifeLink[] = [
		{ source: 'node_01', target: 'node_05' },
		{ source: 'node_12', target: 'node_01' }
	];
	it('blocks deletion when links reference the node and cascade is off', () => {
		const plan = planNodeDelete(nodes, links, 'node_01', false);
		expect(plan.blocked).toBe(true);
		expect(plan.referencingLinks).toBe(2);
		expect(plan.nodes).toHaveLength(3); // unchanged
	});
	it('cascades: removes the node and its links', () => {
		const plan = planNodeDelete(nodes, links, 'node_01', true);
		expect(plan.blocked).toBeFalsy();
		expect(plan.nodes.some((n) => n.node_id === 'node_01')).toBe(false);
		expect(plan.links).toHaveLength(0);
	});
	it('deletes cleanly when nothing references the node', () => {
		const plan = planNodeDelete(nodes, [], 'node_05', false);
		expect(plan.blocked).toBeFalsy();
		expect(plan.nodes.some((n) => n.node_id === 'node_05')).toBe(false);
		expect(plan.links).toHaveLength(0);
	});
});
