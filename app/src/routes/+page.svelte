<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import nodeData from '$lib/data/personal.lifegraph-nodes.json';
	import links from '$lib/data/personal.lifegraph-links.json';
	import Modal from '$lib/Modal.svelte';
	import { DateTime } from 'luxon';
	import scrollIntoView from 'scroll-into-view-if-needed';
	import { zoom, zoomIdentity } from 'd3-zoom';
	import { select, selectAll, pointer } from 'd3-selection';
	import { drag } from 'd3-drag';
	import {
		forceSimulation,
		forceLink,
		forceManyBody,
		forceCenter,
		forceCollide,
		forceX,
		forceY
	} from 'd3-force';
	let d3 = {
		zoom,
		zoomIdentity,
		select,
		selectAll,
		pointer,
		drag,
		forceSimulation,
		forceLink,
		forceManyBody,
		forceCenter,
		forceCollide,
		forceX,
		forceY
	};
	import Timeline from '$lib/Timeline.svelte';

	// Events store date as a normalized "yyyy-MM-dd" string.
	/** @param {any} n */
	function getDateOnly(n) {
		return n.date;
	}

	// IMPORTANT: `nodes` and `simLinks` are plain consts, NOT $state/$derived.
	// d3-force takes ownership of these exact objects for the simulation's lifetime
	// (it mutates x/y/vx/vy on nodes and replaces simLinks' source/target with node
	// refs). Wrapping them in reactivity would hand d3 stale object identities and
	// freeze/desync the canvas. They are load-time constants — keep them plain.
	// Node radius in CSS px (the canvas is DPI-scaled). MIN_NODE keeps low-degree
	// nodes tappable on mobile; hubs grow with incoming links.
	const MIN_NODE = 8;
	/** @type {any[]} */
	const nodes = nodeData.map((node) => {
		const linkCount = links.filter((l) => l.target === node.node_id).length;
		return { ...node, size: Math.max(MIN_NODE, linkCount * 3 + 4) };
	});
	/** @type {any[]} */
	const simLinks = links.map((l) => ({ ...l }));

	const events = nodeData
		.filter((n) => n.type === 'event')
		.map((n) => {
			const dateLuxon = DateTime.fromFormat(getDateOnly(n), 'yyyy-MM-dd');
			return {
				...n,
				dateLuxon,
				dateString: dateLuxon.toLocaleString({ month: 'short', year: 'numeric' })
			};
		})
		.sort((a, b) => b.dateLuxon.toMillis() - a.dateLuxon.toMillis());

	let showModal = $state(false);
	/** @type {HTMLCanvasElement} */
	let canvas;
	let width = 500;
	let height = 600;
	/** @type {any} */
	let activeNode = $state(null);
	/** @type {any} */
	let showCard = $state();
	let transform = d3.zoomIdentity;
	/** @type {any} */
	let simulation;
	/** @type {CanvasRenderingContext2D} */
	let context;
	let dpi = 1;
	// Height reserved at the bottom of the graph for the legend, so nodes never
	// settle or get dragged underneath it. Measured from the rendered legend.
	let legendInset = 0;
	function measureLegend() {
		const el = document.getElementById('legend');
		legendInset = el ? el.offsetHeight : 0;
	}
	// Repulsion scaled to the available area so the graph spreads enough to read
	// the links on desktop without flinging nodes against the walls on mobile.
	function chargeStrength() {
		const area = width * Math.max(1, height - legendInset);
		return -Math.max(28, Math.min(110, area / 3800));
	}
	let index = $state(0);
	let images = [''];
	const next = () => {
		index = (index + 1) % images.length;
	};
	const prev = () => {
		index = (index - 1 + images.length) % images.length;
	};
	onMount(() => {
		dpi = window.devicePixelRatio || 1;
		context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
		resize();
		simulation = d3
			.forceSimulation(nodes)
			.force(
				'link',
				d3
					.forceLink(simLinks)
					.id((/** @type {any} */ d) => d.node_id)
					// Cap link length so a hub's many leaf nodes don't fling out to the
					// walls on the smaller mobile canvas.
					.distance((/** @type {any} */ d) => Math.min(60, d.target.size * 2 + 8))
			)
			// Repulsion spreads nodes apart so the links are readable...
			.force('charge', d3.forceManyBody().strength(chargeStrength()))
			.force(
				'collide',
				d3.forceCollide((/** @type {any} */ d) => d.size + 2)
			)
			.force('center', d3.forceCenter(width / 2, (height - legendInset) / 2))
			// ...while a gentle pull toward the center of the usable area keeps the
			// whole graph centered rather than drifting to one side.
			.force('x', d3.forceX(width / 2).strength(0.03))
			.force('y', d3.forceY((height - legendInset) / 2).strength(0.03))
			.on('tick', simulationUpdate);

		d3.select(context.canvas).on('click', (event) => {
			const d = simulation.find(
				transform.invertX(event.offsetX),
				transform.invertY(event.offsetY),
				34
			);

			setShowCard(d);
		});

		d3.select(/** @type {any} */ (canvas))
			.call(
				d3
					.drag()
					.container(canvas)
					.subject(dragsubject)
					.on('start', dragstarted)
					.on('drag', dragged)
					.on('end', dragended)
			)
			.call(
				d3
					.zoom()
					.scaleExtent([1 / 10, 8])
					.on('zoom', zoomed)
			);
	});
	/** @param {any} node */
	function setShowCard(node) {
		activeNode = node || null;
		if (activeNode) {
			showCard = {
				id: activeNode.label,
				nodeDescription: activeNode.description,
				linkDescriptions: simLinks
					.filter((l) => (l.source.node_id ?? l.source) === activeNode.node_id)
					.map((l) => l.description),
				media: activeNode.media
			};
			if (activeNode.media?.gallery) {
				images = activeNode.media.gallery;
				index = 0;
			}
			const timelineNode = document.getElementById(activeNode.node_id);
			if (timelineNode) {
				scrollIntoView(timelineNode, { scrollMode: 'if-needed', behavior: 'smooth' });
			}
		}
		// Repaint in both cases so deselecting (activeNode → null) clears the
		// selection ring from the previously selected node.
		simulationUpdate();
	}

	// Whether the active node has any "bonus content" worth opening the modal for.
	const hasBonus = $derived(
		!!(
			activeNode &&
			(activeNode.media?.link || activeNode.media?.video || activeNode.media?.gallery)
		)
	);
	// Read the active theme's colors from CSS custom properties so the canvas
	// stays in sync with the rest of the page (and with theme switches).
	function palette() {
		const s = getComputedStyle(document.documentElement);
		/** @param {string} name @param {string} fallback */
		const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
		return {
			pillar: v('--type-pillar', '#888'),
			event: v('--type-event', '#888'),
			person: v('--type-person', '#888'),
			location: v('--type-location', '#888'),
			selected: v('--selected', 'violet'),
			edge: v('--edge', 'rgba(0,0,0,0.25)'),
			glow: parseFloat(v('--node-glow', '0'))
		};
	}

	function simulationUpdate() {
		if (!context) return;
		const p = palette();
		// Keep nodes inside the card (and above the legend) so they settle within
		// bounds. Clamp in CSS-pixel space, accounting for radius.
		const bottom = height - legendInset;
		nodes.forEach((d) => {
			d.x = Math.max(d.size, Math.min(width - d.size, d.x));
			d.y = Math.max(d.size, Math.min(bottom - d.size, d.y));
		});
		// Reset to the DPI-scaled base transform, clear, then apply pan/zoom.
		context.setTransform(dpi, 0, 0, dpi, 0, 0);
		context.clearRect(0, 0, width, height);
		context.save();
		context.translate(transform.x, transform.y);
		context.scale(transform.k, transform.k);

		simLinks.forEach((d) => {
			context.beginPath();
			context.moveTo(d.source.x, d.source.y);
			context.lineTo(d.target.x, d.target.y);
			context.strokeStyle = p.edge;
			context.lineWidth = 1;
			context.stroke();
			context.globalAlpha = 1;
		});

		nodes.forEach((d) => {
			const fill = p[/** @type {'pillar'|'event'|'person'|'location'} */ (d.type)] || '#888';
			const isActive = activeNode && activeNode.node_id === d.node_id;
			// Soft glow on dark themes (--node-glow > 0); none on light themes.
			context.shadowBlur = p.glow;
			context.shadowColor = p.glow ? fill : 'transparent';
			context.beginPath();
			context.arc(d.x, d.y, d.size, 0, 2 * Math.PI);
			context.fillStyle = fill;
			context.fill();
			context.shadowBlur = 0;
			context.shadowColor = 'transparent';
			if (isActive) {
				context.beginPath();
				context.arc(d.x, d.y, d.size + 2, 0, 2 * Math.PI);
				context.strokeStyle = p.selected;
				context.lineWidth = 4;
				context.stroke();
			}
		});
		context.restore();
	}

	/** @param {any} currentEvent */
	function zoomed(currentEvent) {
		transform = currentEvent.transform;
		simulationUpdate();
	}

	// Use the d3-force simulation to locate the node
	/** @param {any} currentEvent */
	function dragsubject(currentEvent) {
		const node = simulation.find(
			transform.invertX(currentEvent.x),
			transform.invertY(currentEvent.y),
			34
		);
		if (node) {
			node.x = transform.applyX(node.x);
			node.y = transform.applyY(node.y);
		}
		return node;
	}

	/** @param {any} currentEvent */
	function dragstarted(currentEvent) {
		if (!currentEvent.active) simulation.alphaTarget(0.3).restart();
		currentEvent.subject.fx = transform.invertX(currentEvent.subject.x);
		currentEvent.subject.fy = transform.invertY(currentEvent.subject.y);
	}

	/** @param {any} currentEvent */
	function dragged(currentEvent) {
		// Clamp the drag target to the card bounds (above the legend) so a node
		// can't be dragged out or under the legend.
		const r = currentEvent.subject.size;
		const bottom = height - legendInset;
		currentEvent.subject.fx = Math.max(r, Math.min(width - r, transform.invertX(currentEvent.x)));
		currentEvent.subject.fy = Math.max(r, Math.min(bottom - r, transform.invertY(currentEvent.y)));
	}

	/** @param {any} currentEvent */
	function dragended(currentEvent) {
		if (!currentEvent.active) simulation.alphaTarget(0);
		currentEvent.subject.fx = null;
		currentEvent.subject.fy = null;
	}

	/**
	 * Size the canvas to its container. `width`/`height` track the CSS-pixel size;
	 * the backing store is DPI-scaled and the context is scaled by `dpi` at draw time,
	 * so the whole simulation (positions, sizes, hit-testing) works in CSS pixels.
	 */
	/** @param {HTMLCanvasElement} [element] */
	function sizeCanvas(element = canvas) {
		if (!element) return;
		dpi = window.devicePixelRatio || 1;
		element.style.width = '100%';
		element.style.height = '100%';
		width = element.offsetWidth;
		height = element.offsetHeight;
		element.width = width * dpi;
		element.height = height * dpi;
	}

	// use: action — initial sizing before the simulation is created.
	/** @param {HTMLCanvasElement} element */
	function fitToContainer(element) {
		sizeCanvas(element);
	}

	// Re-size the canvas AND re-center/relayout the simulation on resize or
	// orientation change. (Previously only the width/height vars were updated,
	// so the canvas went blurry and the graph drifted off-center.)
	function resize() {
		sizeCanvas();
		measureLegend();
		if (simulation) {
			const cy = (height - legendInset) / 2;
			simulation.force('charge', d3.forceManyBody().strength(chargeStrength()));
			simulation.force('center', d3.forceCenter(width / 2, cy));
			simulation.force('x', d3.forceX(width / 2).strength(0.03));
			simulation.force('y', d3.forceY(cy).strength(0.03));
			simulation.alpha(0.3).restart();
		}
		simulationUpdate();
	}
</script>

<svelte:head>
	<title>Heather Bree's Lifegraph</title>
	<meta
		name="description"
		content="An interactive graph of Heather Bree's life — the people, places, events, and pillars that shaped it, and how they connect."
	/>
	<meta property="og:title" content="Heather Bree's Lifegraph" />
	<meta
		property="og:description"
		content="An interactive graph of Heather Bree's life — the people, places, events, and pillars that shaped it, and how they connect."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://justheatherbree.com/lifegraph/" />
	<meta name="twitter:card" content="summary" />
</svelte:head>
<svelte:window onresize={resize} />

<div>
	<h1>Heather Bree's Lifegraph</h1>
	<div class="board">
		<section class="viz">
			<div class="container">
				{#if activeNode}
					<div id="nodeDetails">
						{#if showCard.media?.image}
							<img src={`${base}/images/${showCard.media.image}`} alt={showCard.id} />
						{/if}
						<h3>{showCard.id}</h3>
						{#if showCard.nodeDescription}
							<p>
								{showCard.nodeDescription}
							</p>
						{/if}
						{#if showCard.linkDescriptions}
							{#each showCard.linkDescriptions as ldesc}
								<p>
									{ldesc}
								</p>
							{/each}
						{/if}
						{#if hasBonus}
							<button class="bonus" onclick={() => (showModal = true)}>bonus content!</button>
						{/if}
					</div>
				{/if}
				<canvas use:fitToContainer bind:this={canvas}></canvas>
				<div id="legend">
					<div class="legend-entry">
						<div class="legend-circle" style="background: var(--type-pillar)"></div>
						<h5>pillar</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style="background: var(--type-event)"></div>
						<h5>event</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style="background: var(--type-person)"></div>
						<h5>person</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style="background: var(--type-location)"></div>
						<h5>location</h5>
					</div>
				</div>
			</div>
		</section>
		<section class="timeline">
			<Timeline
				{events}
				activeId={activeNode ? activeNode.node_id : null}
				onselect={setShowCard}
				dotColor="var(--type-event)"
			/>
		</section>
	</div>
	<Modal bind:showModal>
		{#if activeNode?.media}
			{#if activeNode.media.video}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video class="bonus-media" controls src={`${base}/images/${activeNode.media.video}`}
				></video>
			{/if}
			{#if activeNode.media.link}
				<iframe class="bonus-media" title={activeNode.label} src={activeNode.media.link}></iframe>
			{/if}
			{#if activeNode.media.gallery}
				<div class="gallery-viewer">
					{#if activeNode.media.gallery.length > 1}
						<button class="nav prev" onclick={prev} aria-label="Previous image">‹</button>
					{/if}
					<img class="gallery" src={`${base}/images/${activeNode.media.gallery[index]}`} alt="" />
					{#if activeNode.media.gallery.length > 1}
						<button class="nav next" onclick={next} aria-label="Next image">›</button>
					{/if}
				</div>
			{/if}
		{/if}
	</Modal>
</div>

<style>
	/* Title sits on an opaque plate so it stays legible over the wallpaper. */
	h1 {
		width: fit-content;
		max-width: 100%;
		box-sizing: border-box;
		margin: 0.5rem auto 1.5rem;
		text-align: center;
		font-size: clamp(1.5rem, 4vw, 2.5rem);
		letter-spacing: -0.01em;
		padding: 0.3rem 1.4rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		box-shadow: var(--shadow);
	}
	/* One opaque card holds the graph (left) and the timeline (right). */
	div.board {
		display: flex;
		flex-direction: row;
		height: 78vh;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	section.viz {
		flex: 1 1 auto;
		min-width: 0;
		position: relative;
	}
	div.container {
		position: relative;
		height: 100%;
		overflow: hidden;
	}
	div.container canvas {
		display: block;
	}
	/* Timeline lives in the same card, on the right, with its scrollbar at the edge. */
	section.timeline {
		flex: 0 0 300px;
		height: 100%;
		overflow-y: auto;
		padding: 0.75rem 0.5rem 0.75rem 0.75rem;
		border-left: 1px solid var(--border);
	}
	div#nodeDetails {
		position: absolute;
		top: 0;
		left: 0;
		max-width: min(46ch, 90%);
		pointer-events: none;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		padding: 1.25rem;
		margin: 0.75rem;
		backdrop-filter: blur(4px);
	}
	div#nodeDetails img {
		max-width: 40%;
		max-height: 260px;
		border-radius: calc(var(--radius) - 4px);
		float: left;
		margin: 0 1rem 0.5rem 0;
	}
	div#nodeDetails h3 {
		margin-top: 0;
		font-size: 1.3rem;
	}
	div#nodeDetails p {
		font-size: 0.95rem;
		margin: 0.5rem 0;
	}
	/* The bonus-content button lives in the details panel (which is pointer-events:none,
	   so the button re-enables itself). clear: both drops it below the floated image. */
	div#nodeDetails .bonus {
		pointer-events: auto;
		clear: both;
		margin-top: 0.5rem;
		border: none;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		font-size: 0.85rem;
		border-radius: 999px;
		padding: 0.4rem 1.1rem;
		cursor: pointer;
		box-shadow: var(--shadow);
	}
	div#nodeDetails .bonus:hover {
		filter: brightness(1.08);
	}
	div#legend {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem 1rem;
		padding: 0.6rem 0.9rem;
		/* Purely a key — let canvas clicks pass through it. */
		pointer-events: none;
	}
	div#legend div.legend-entry {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	div#legend div.legend-circle {
		width: 11px;
		height: 11px;
		border-radius: 50%;
	}
	div#legend div.legend-entry h5 {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text);
	}
	.bonus-media {
		display: block;
		width: min(80vw, 800px);
		max-width: 100%;
		height: auto;
		aspect-ratio: 16 / 9;
		border: none;
		border-radius: calc(var(--radius) - 4px);
	}
	/* Fixed-size viewport so the modal doesn't resize as you page through images
	   of different dimensions; each image scales to fit inside it. */
	.gallery-viewer {
		position: relative;
		width: min(80vw, 760px);
		height: min(68vh, 600px);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	img.gallery {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: calc(var(--radius) - 4px);
	}
	.gallery-viewer .nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 42px;
		height: 42px;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.85);
		color: var(--text);
		font-size: 1.6rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow);
	}
	.gallery-viewer .nav:hover {
		background: var(--accent);
		color: #fff;
	}
	.gallery-viewer .prev {
		left: 10px;
	}
	.gallery-viewer .next {
		right: 10px;
	}

	/* Stack to a single column on small screens (graph on top, timeline below). */
	@media (max-width: 768px) {
		div.board {
			flex-direction: column;
			height: auto;
		}
		section.viz {
			height: 56vh;
		}
		section.timeline {
			flex: none;
			height: auto;
			max-height: 38vh;
			border-left: none;
			border-top: 1px solid var(--border);
		}
		div#nodeDetails {
			max-width: calc(100% - 1.5rem);
		}
		div#nodeDetails img {
			max-width: 35%;
		}
	}
</style>
