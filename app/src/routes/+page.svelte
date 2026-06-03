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
	const color = d3.scaleOrdinal(d3.schemeCategory10);
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
	function simulationUpdate() {
		context.save();
		context.clearRect(0, 0, context.canvas.width, context.canvas.height);
		context.translate(transform.x, transform.y);
		context.scale(transform.k, transform.k);

		simLinks.forEach((d) => {
			context.beginPath();
			context.moveTo(d.source.x, d.source.y);
			context.lineTo(d.target.x, d.target.y);
			context.strokeStyle = '#000';
			context.lineWidth = 1;
			context.stroke();
			context.globalAlpha = 1;
		});

		nodes.forEach((d) => {
			context.beginPath();
			context.arc(d.x, d.y, d.size, 0, 2 * Math.PI);
			context.strokeStyle =
				activeNode && activeNode.node_id === d.node_id ? 'violet' : 'transparent';
			context.lineWidth = 5;
			context.stroke();
			context.fillStyle = color(d.type);
			context.fill();
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

	function resize() {
		({ width, height } = canvas);
	}
	/** @param {HTMLCanvasElement} element */
	function fitToContainer(element) {
		dpi = window.devicePixelRatio || 1;
		// Make it visually fill the positioned parent
		element.style.width = '100%';
		element.style.height = '100%';
		// ...then set the internal size to match
		element.width = element.offsetWidth * dpi;
		element.height = element.offsetHeight * dpi;
		width = element.offsetWidth * dpi;
		height = element.offsetHeight * dpi;
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
				dotColor={color('event')}
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
						<div class="legend-circle" style={`background: ${color('pillar')}`}></div>
						<h5>pillar</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style={`background: ${color('event')}`}></div>
						<h5>event</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style={`background: ${color('person')}`}></div>
						<h5>person</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style={`background: ${color('location')}`}></div>
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
				<video controls height={500} src={`${base}/images/${activeNode.media.video}`}></video>
			{/if}
			{#if activeNode.media.link}
				<iframe title={activeNode.label} height={500} width={800} src={activeNode.media.link}
				></iframe>
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
	}
	div.flex-container {
		display: flex;
		flex-direction: row;
	}
	section.timeline {
		min-width: 310px;
		max-height: 75vh;
		overflow-y: scroll;
	}
	div.container {
		height: 75vh;
	}
	div#nodeDetails {
		position: absolute;
		width: 45vw;
		min-width: 400px;
		pointer-events: none;
		border-radius: 20px;
		background-color: rgba(250, 235, 215, 0.4);
		padding: 20px;
	}
	div#nodeDetails img {
		max-width: 300px;
		max-height: 300px;
		border-radius: 20px;
		float: left;
		margin: 0 20px 20px 0;
	}
	div#nodeDetails h3 {
		margin-top: 0;
	}
	div#legend {
		display: flex;
		flex-direction: row;
		width: 500px;
		float: right;
	}
	div#legend div#linkspot {
		width: 140px;
	}
	div#legend div#linkspot button {
		border: none;
		background-color: transparent;
		font-size: 14px;
		color: white;
		text-shadow:
			2px 2px 0 #000,
			-1px -1px 0 #000,
			1px -1px 0 #000,
			-1px 1px 0 #000,
			1px 1px 0 #000;
		font-weight: 700;
		background-image: url('/images/low-poly-grid-haikei.png');
		background-size: cover;
		background-repeat: no-repeat;
		height: 30px;
		border-radius: 15px;
		margin-right: 10px;
		padding: 0 10px;
	}
	div#legend div.legend-entry {
		width: 75px;
	}
	div#legend div.legend-circle {
		width: 10px;
		height: 10px;
		border-radius: 10px;
		margin-bottom: 5px;
	}
	div#legend div.legend-entry h5 {
		margin: 0;
	}
	img.gallery {
		max-width: 50vw;
		max-height: 65vh;
	}
	button#next {
		position: absolute;
		right: 15px;
	}
</style>
