<script lang="ts">
	import { onMount } from "svelte";
	import { base } from "$app/paths";
	import nodeData from "$lib/data/personal.lifegraph-nodes.json";
	import links from "$lib/data/personal.lifegraph-links.json";
	import Modal from "$lib/Modal.svelte";
	import { DateTime } from "luxon";
	import scrollIntoView from "scroll-into-view-if-needed";
	import { scaleLinear, scaleOrdinal } from "d3-scale";
	import { zoom, zoomIdentity } from "d3-zoom";
	import { schemeCategory10 } from "d3-scale-chromatic";
	import { select, selectAll, pointer } from "d3-selection";
	import { drag } from "d3-drag";
	import {
		forceSimulation,
		forceLink,
		forceManyBody,
		forceCenter,
		forceCollide,
	} from "d3-force";
	import type {
		Simulation,
		SimulationNodeDatum,
		SimulationLinkDatum,
	} from "d3-force";

	// keep using the existing d3 helper object but type it as any to avoid retyping
	const d3: any = {
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
		forceCollide,
	};
	import {
		Timeline,
		TimelineItem,
		TimelineSeparator,
		TimelineDot,
		TimelineConnector,
		TimelineContent,
		TimelineOppositeContent
	} from 'svelte-vertical-timeline';
	// --- Types for nodes & links (extend d3-force types) ---
	type Media = { image?: string; video?: string; link?: string; gallery?: string[] };

	interface RawNode {
		_id: { $oid: string };
		node_id: string;
		label: string;
		type: string;
		description: string;
		media: Media;
		date?: { $date: string } | string;
	}

	interface Node extends SimulationNodeDatum {
		node_id: string;
		label: string;
		type: string;
		description: string;
		media: Media;
		date?: { $date: string } | string;
		size: number;
		dateLuxon?: any;
		dateString?: string;
	}

	interface LinkDatum extends SimulationLinkDatum<Node> {
		source: string | Node;
		target: string | Node;
		description?: string;
	}

	const rawNodes = nodeData as RawNode[];
	const rawLinks = links as unknown as LinkDatum[];

	let nodes: Node[] = rawNodes.map(n => {
		const node: Node = { ...(n as any), size: 4 } as Node;
		const linkCount = rawLinks.filter(f => (typeof f.target === 'string' ? f.target : (f.target as Node).node_id) == node.node_id).length;
		node.size = linkCount ? (linkCount * 3) + 4 : 4;
		return node;
	});

	let events: Node[] = rawNodes
		.filter(f => f.type === "event")
		.map(m => {
			const mm = { ...(m as any) } as Node;
			if (mm.date && typeof mm.date !== 'string' && (mm.date as any).$date) {
				mm.dateLuxon = DateTime.fromFormat((mm.date as any).$date.split("T")[0], "yyyy-MM-dd");
				mm.dateString = mm.dateLuxon.toLocaleString({ month: "short", year: "numeric" });
			} else {
				mm.dateLuxon = null;
				mm.dateString = '';
			}
			return mm;
		})
		.sort((a, b) => (b.dateLuxon?.toMillis ? b.dateLuxon.toMillis() : 0) - (a.dateLuxon?.toMillis ? a.dateLuxon.toMillis() : 0));

	let showModal = false;
	let canvas: HTMLCanvasElement | null = null;
	let width = 500;
	let height = 600;
	let activeNode: Node | null = null;
	const color = d3.scaleOrdinal(d3.schemeCategory10);
	let showCard: { id: string; nodeDescription?: string; linkDescriptions?: string[]; media?: Media } | null = null;
	let transform: any = d3.zoomIdentity;
	let simulation: Simulation<Node, LinkDatum> | null = null;
	let context: CanvasRenderingContext2D | null = null;
	let dpi = 1;
	let index = 0;
	let images: string[] = [];
	const next = () => {
		index = (index + 1) % images.length
	}
	onMount(() => {
		dpi = window.devicePixelRatio || 1;
		if (!canvas) return;
		context = canvas.getContext("2d");
		if (!context) return;
		resize();
		// initialize simulation (use rawLinks which may reference node ids or node objects)
		simulation = d3.forceSimulation(nodes) as Simulation<Node, LinkDatum>;
		simulation
			.force(
				"link",
				d3
					.forceLink(rawLinks as any)
					.id((d: Node) => d.node_id)
					.distance((d: any) => (d.target as Node).size * 2.5)
			)
			.force("charge", d3.forceManyBody().strength(-5))
			.force("collide", d3.forceCollide((d: Node) => d.size))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.on("tick", simulationUpdate);

		if (context && simulation) {
			d3.select(context.canvas).on("click", (event: any) => {
				const d = simulation!.find(
					transform.invertX(event.offsetX * dpi),
					transform.invertY(event.offsetY * dpi),
					50
				);

				setShowCard(d ?? null);
			});

			// guard canvas when calling drag/zoom
			if (canvas) {
				const canvasSelection = d3.select(/** @type {any} */ (canvas));
				canvasSelection
					.call(
						d3
						.drag()
						.container(/** @type {any} */ (canvas))
						.subject(dragsubject)
						.on("start", dragstarted)
						.on("drag", dragged)
						.on("end", dragended)
					)
					.call(
						d3
						.zoom()
						.scaleExtent([1 / 10, 8])
						.on("zoom", zoomed)
					);
			}
		}
	});
	function setShowCard(node: Node | null) {
		activeNode = node;
		if (activeNode) {
			showCard = JSON.parse(
				JSON.stringify({ 
					id: activeNode.label, 
					nodeDescription: activeNode.description,
					linkDescriptions: (rawLinks as LinkDatum[])
						.filter(f => (typeof f.source === 'string' ? f.source : (f.source as Node).node_id) == activeNode!.node_id)
						.map(m => m.description),
					media: activeNode.media
				})
			);
			let linkspot = document.querySelector("div#linkspot button");
			if (linkspot) {
				if (activeNode.media?.link || activeNode.media?.video || activeNode.media?.gallery) {
					linkspot.classList.remove("hidden");
				} else {
					linkspot.classList.add("hidden");
				}
			}
			if (activeNode.media?.gallery) {
				images = activeNode.media.gallery;
			}
			simulationUpdate();
			let allButtons = document.querySelectorAll("section.timeline button");
			allButtons.forEach((b) => b.classList.remove("violet"));
			let timelineNode = document.getElementById(activeNode.node_id)
			if (timelineNode) {
				timelineNode.classList.add("violet");
				scrollIntoView(timelineNode, {scrollMode: "if-needed", behavior: "smooth"})
			}
		}
	}
	function simulationUpdate() {
		const ctx = /** @type {CanvasRenderingContext2D | null} */ (context);
		if (!ctx) return;
		ctx.save();
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.translate(transform.x, transform.y);
		ctx.scale(transform.k, transform.k);

		const linkList = rawLinks as LinkDatum[];
		linkList.forEach((d) => {
			const s = typeof d.source === 'string' ? nodes.find(n => n.node_id === d.source) : (d.source as Node);
			const t = typeof d.target === 'string' ? nodes.find(n => n.node_id === d.target) : (d.target as Node);
			if (!s || !t) return;
			ctx.beginPath();
			ctx.moveTo(s.x ?? 0, s.y ?? 0);
			ctx.lineTo(t.x ?? 0, t.y ?? 0);
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.globalAlpha = 1;
		});

		const nodeList = nodes as Node[];
		nodeList.forEach((d, i) => {
			ctx.beginPath();
			ctx.arc(d.x ?? 0, d.y ?? 0, d.size ?? 4, 0, 2 * Math.PI);
			ctx.strokeStyle = activeNode && activeNode.node_id === d.node_id ? "violet" : "transparent";
			ctx.lineWidth = 5;
			ctx.stroke();
			ctx.fillStyle = color(d.type);
			ctx.fill();
		});
		ctx.restore();
	}

	function zoomed(currentEvent: any) {
		transform = currentEvent.transform;
		simulationUpdate();
	}

	// Use the d3-force simulation to locate the node
	function dragsubject(currentEvent: any): Node | undefined {
		const node = simulation!.find(
			transform.invertX(currentEvent.x * dpi),
			transform.invertY(currentEvent.y * dpi),
			50
		) as Node | undefined;
		if (node) {
			node.x = transform.applyX(node.x);
			node.y = transform.applyY(node.y);
		}
		return node;
	}

	function dragstarted(currentEvent: any) {
		if (!currentEvent.active) simulation!.alphaTarget(0.3).restart();
		currentEvent.subject.fx = transform.invertX(currentEvent.subject.x);
		currentEvent.subject.fy = transform.invertY(currentEvent.subject.y);
	}

	function dragged(currentEvent: any) {
		currentEvent.subject.fx = transform.invertX(currentEvent.x);
		currentEvent.subject.fy = transform.invertY(currentEvent.y);
	}

	function dragended(currentEvent: any) {
		if (!currentEvent.active) simulation!.alphaTarget(0);
		currentEvent.subject.fx = null;
		currentEvent.subject.fy = null;
	}

	function resize() {
		if (!canvas) return;
		({ width, height } = canvas);
	}
	function fitToContainer(element: HTMLCanvasElement) {
		dpi = window.devicePixelRatio || 1;
		// Make it visually fill the positioned parent
		element.style.width = "100%";
		element.style.height = "100%";
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
<svelte:window on:resize={resize} />

<div>
	<h1>Heather Bree's Lifegraph</h1>
	<div class="flex-container">
		<section class="timeline">
			<Timeline>
				{#each events as event}
					<button on:click={() => setShowCard(event)} id={event.node_id}>
						<TimelineItem>
							<TimelineOppositeContent slot="opposite-content">
								<p>{event.dateString}</p>
							</TimelineOppositeContent>
							<TimelineSeparator>
								<TimelineDot style={`background-color: ${color("event")}; border-color: ${color("event")}`}/>
								<TimelineConnector />
							</TimelineSeparator>
							<TimelineContent>
								<p>{event.label}</p>
							</TimelineContent>
						</TimelineItem>
					</button>
				{/each}
			</Timeline>
		</section>
		<section class="viz">
			<div on:resize={resize} class="container">
				{#if showCard}
					<div id="nodeDetails">
						{#if showCard.media?.image}
							<img src={`${base}/images/${showCard.media.image}`} alt={showCard?.id || ''}/>
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
				<canvas use:fitToContainer bind:this={canvas} />
				<div id="legend">
					<div id="linkspot"><button class="hidden" on:click={() => (showModal = true)}>bonus content!</button></div>
					<div class="legend-entry">
						<div class="legend-circle" style={`background: ${color("pillar")}`}></div><h5>pillar</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style={`background: ${color("event")}`}></div><h5>event</h5>						
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style={`background: ${color("person")}`}></div><h5>person</h5>
					</div>
					<div class="legend-entry">
						<div class="legend-circle" style={`background: ${color("location")}`}></div><h5>location</h5>
					</div>
				</div>
			</div>	
		</section>	
	</div>
	<Modal bind:showModal>
		{#if activeNode && activeNode.media}
			{#if activeNode.media.video}
					<video
						controls
						height={500} 
						src={`${base}/images/${activeNode.media.video}`}>
						<!-- captions track (if available) -->
						<track kind="captions" />
					</video>
				{/if}
			{#if activeNode.media.link}
					<iframe
						title={activeNode.label || 'embedded content'}
						height={500}
						width={800} 
						src={activeNode.media.link} />
				{/if}
			{#if activeNode.media.gallery}
				{#each [activeNode.media.gallery[index]] as src (index)}
					<img class="gallery" src={`${base}/images/${src}`} alt="" />
				{/each}
				<button id="next" on:click={next}>Next!</button>
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
 		gap: 1rem;
 	}
 	section.timeline {
 		min-width: 310px;
 		max-height: 75vh;
 		overflow-y: scroll;
 	}
 	section.timeline button {
 		background: none;
 		border: none;
 		width: 275px;
 	}
 	section.timeline button p {
 		margin: 0;
 	}
 	div.container {
 		height: 75vh;
 		position: relative;
 	}
 	div#nodeDetails {
 		position: absolute;
 		width: 45vw;
 		min-width: 400px;
 		pointer-events: none;
 		border-radius: 20px;
 		background-color: rgba(250, 235, 215, 0.4);
 		padding: 20px;
 		z-index: 5;
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
 		align-items: center;
 		gap: 0.5rem;
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
 		background-image: url("/images/low-poly-grid-haikei.png");
 		background-size: cover;
 		background-repeat: no-repeat;
 		height: 30px;
 		border-radius: 15px;
 		margin-right: 10px;
 		padding: 0 10px;
 	}
 	div#legend div#linkspot button.hidden {
 		display: none;
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

 	/* Mobile responsive overrides */
 	@media (max-width: 768px) {
 		div.flex-container {
 			flex-direction: column;
 		}
 		section.timeline {
 			min-width: auto;
 			max-height: 40vh;
 			overflow-y: auto;
 			width: 100%;
 		}
 		section.timeline button {
 			width: 100%;
 			text-align: left;
 		}
 		div.container {
 			height: 55vh;
 			width: 100%;
 		}
 		div#nodeDetails {
 			position: relative;
 			width: calc(100% - 2rem);
 			min-width: unset;
 			margin: 0.5rem auto;
 			pointer-events: auto;
 		}
 		div#nodeDetails img {
 			max-width: 40vw;
 			float: none;
 			display: block;
 			margin: 0 auto 1rem;
 		}
 		div#legend {
 			width: 100%;
 			float: none;
 			flex-wrap: wrap;
 			justify-content: flex-start;
 		}
 		div#legend div.legend-entry {
 			width: auto;
 			margin-right: 1rem;
 		}
 	}
</style>
