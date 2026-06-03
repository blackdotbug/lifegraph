<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import nodeData from '$lib/data/personal.lifegraph-nodes.json';
	import links from '$lib/data/personal.lifegraph-links.json';
	import Modal from '$lib/Modal.svelte';
	import { DateTime } from 'luxon';
	import scrollIntoView from 'scroll-into-view-if-needed';
	import { scaleLinear, scaleOrdinal } from 'd3-scale';
	import { zoom, zoomIdentity } from 'd3-zoom';
	import { schemeCategory10 } from 'd3-scale-chromatic';
	import { select, selectAll, pointer } from 'd3-selection';
	import { drag } from 'd3-drag';
	import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
	let d3 = {
		zoom,
		zoomIdentity,
		scaleLinear,
		scaleOrdinal,
		schemeCategory10,
		select,
		selectAll,
		pointer,
		drag,
		forceSimulation,
		forceLink,
		forceManyBody,
		forceCenter,
		forceCollide
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
	/** @type {any[]} */
	const nodes = nodeData.map((node) => {
		const linkCount = links.filter((l) => l.target === node.node_id).length;
		return { ...node, size: linkCount ? linkCount * 3 + 4 : 4 };
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
	let index = $state(0);
	let images = [''];
	const next = () => {
		index = (index + 1) % images.length;
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
					.distance((/** @type {any} */ d) => d.target.size * 2.5)
			)
			.force('charge', d3.forceManyBody().strength(-5))
			.force(
				'collide',
				d3.forceCollide((/** @type {any} */ d) => d.size)
			)
			.force('center', d3.forceCenter(width / 2, height / 2))
			.on('tick', simulationUpdate);

		d3.select(context.canvas).on('click', (event) => {
			const d = simulation.find(
				transform.invertX(event.offsetX * dpi),
				transform.invertY(event.offsetY * dpi),
				50
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
			}
			simulationUpdate();
			const timelineNode = document.getElementById(activeNode.node_id);
			if (timelineNode) {
				scrollIntoView(timelineNode, { scrollMode: 'if-needed', behavior: 'smooth' });
			}
		}
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
		context.save();
		context.clearRect(0, 0, context.canvas.width, context.canvas.height);
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
			transform.invertX(currentEvent.x * dpi),
			transform.invertY(currentEvent.y * dpi),
			50
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
		currentEvent.subject.fx = transform.invertX(currentEvent.x);
		currentEvent.subject.fy = transform.invertY(currentEvent.y);
	}

	/** @param {any} currentEvent */
	function dragended(currentEvent) {
		if (!currentEvent.active) simulation.alphaTarget(0);
		currentEvent.subject.fx = null;
		currentEvent.subject.fy = null;
	}

	/** Size the canvas backing store to its container at the current DPI. */
	/** @param {HTMLCanvasElement} [element] */
	function sizeCanvas(element = canvas) {
		if (!element) return;
		dpi = window.devicePixelRatio || 1;
		element.style.width = '100%';
		element.style.height = '100%';
		element.width = element.offsetWidth * dpi;
		element.height = element.offsetHeight * dpi;
		width = element.width;
		height = element.height;
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
		if (simulation) {
			simulation.force('center', d3.forceCenter(width / 2, height / 2));
			simulation.alpha(0.3).restart();
		}
		simulationUpdate();
	}
</script>

<svelte:head>
	<title>Lifegraph</title>
	<meta name="description" content="Heather Bree's lifegraph" />
</svelte:head>
<svelte:window onresize={resize} />

<div>
	<h1>Heather Bree's Lifegraph</h1>
	<div class="flex-container">
		<section class="timeline">
			<Timeline
				{events}
				activeId={activeNode ? activeNode.node_id : null}
				onselect={setShowCard}
				dotColor="var(--type-event)"
			/>
		</section>
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
					</div>
				{/if}
				<canvas use:fitToContainer bind:this={canvas}></canvas>
				<div id="legend">
					<div id="linkspot">
						{#if hasBonus}
							<button onclick={() => (showModal = true)}>bonus content!</button>
						{/if}
					</div>
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
				{#each [activeNode.media.gallery[index]] as src (index)}
					<img class="gallery" src={`${base}/images/${src}`} alt="" />
				{/each}
				<button id="next" onclick={next}>Next!</button>
			{/if}
		{/if}
	</Modal>
</div>

<style>
	h1 {
		width: 100%;
		text-align: center;
		font-size: clamp(1.8rem, 4vw, 2.8rem);
		letter-spacing: -0.01em;
		margin: 0.5rem 0 1.25rem;
	}
	div.flex-container {
		display: flex;
		flex-direction: row;
		gap: 1.25rem;
		align-items: stretch;
	}
	section.timeline {
		flex: 0 0 300px;
		max-height: 78vh;
		overflow-y: auto;
		padding: 0.5rem 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	section.viz {
		flex: 1 1 auto;
		min-width: 0;
	}
	div.container {
		position: relative;
		height: 78vh;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
		background: var(--surface);
	}
	div.container canvas {
		display: block;
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
	div#legend {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		padding: 0.6rem 0.9rem;
	}
	div#legend div#linkspot {
		margin-right: auto;
	}
	div#legend div#linkspot button {
		border: none;
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		font-size: 0.85rem;
		height: 32px;
		border-radius: 999px;
		padding: 0 1rem;
		cursor: pointer;
		box-shadow: var(--shadow);
	}
	div#legend div#linkspot button:hover {
		filter: brightness(1.08);
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
	img.gallery {
		display: block;
		max-width: min(80vw, 700px);
		max-height: 65vh;
		height: auto;
		border-radius: calc(var(--radius) - 4px);
	}
	button#next {
		position: absolute;
		right: 15px;
	}

	/* Stack to a single column on small screens. */
	@media (max-width: 768px) {
		div.flex-container {
			flex-direction: column;
		}
		section.timeline {
			flex: none;
			width: 100%;
			max-height: 40vh;
			box-sizing: border-box;
		}
		div.container {
			height: 62vh;
		}
		div#nodeDetails {
			max-width: calc(100% - 1.5rem);
		}
		div#nodeDetails img {
			max-width: 35%;
		}
	}
</style>
