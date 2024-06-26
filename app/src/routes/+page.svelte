<script>
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
	$: nodes = nodeData.map(node => {
		let linkCount = links.filter(f => f.target == node.node_id).length;
		node.size = linkCount ? (linkCount*3)+4 : 4;
		return node;
	})
	$: events = nodeData.filter(f => f.type === "event").map(m => {
		m.dateLuxon = DateTime.fromFormat(m.date.$date.split("T")[0], "yyyy-MM-dd");
		m.dateString = m.dateLuxon.toLocaleString({month: "short", year: "numeric"});
		return m;
	}).sort((a,b)=> b.dateLuxon - a.dateLuxon);
	let showModal = false;
	let canvas;
	let width = 500;
	let height = 600;
	let activeNode = false;
	const color = d3.scaleOrdinal(d3.schemeCategory10)
	let showCard;
	let transform = d3.zoomIdentity;
	let simulation, context;
	let dpi = 1;
	let index = 0
	let images = [""];
	const next = () => {
		index = (index + 1) % images.length
	}
	onMount(() => {
		dpi = window.devicePixelRatio || 1;
		context = canvas.getContext("2d");
		resize();
		simulation = d3
		.forceSimulation(nodes)
		.force(
			"link",
			d3
			.forceLink(links)
			.id((d) => d.node_id)
			.distance(d => d.target.size * 2.5)
		)
		.force("charge", d3.forceManyBody().strength(-5))
		.force("collide", d3.forceCollide(d => d.size))
		.force("center", d3.forceCenter(width / 2, height / 2))
		.on("tick", simulationUpdate);

		d3.select(context.canvas).on("click", (event) => {
			const d = simulation.find(
				transform.invertX(event.offsetX * dpi),
				transform.invertY(event.offsetY * dpi),
				50
			);

			setShowCard(d);
		});

		d3.select(canvas)
		.call(
			d3
			.drag()
			.container(canvas)
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
	});
	function setShowCard(node) {
		if (node) activeNode = node;
		else activeNode = false;
		if (activeNode) {
			showCard = JSON.parse(
				JSON.stringify({ 
					id: activeNode.label, 
					nodeDescription: activeNode.description,
					linkDescriptions: links
						.filter(f => f.source.node_id == activeNode.node_id)
						.map(m => m.description),
					media: activeNode.media
				})
			);
			let linkspot = document.querySelector("div#linkspot button");
			if (activeNode.media?.link || activeNode.media?.video || activeNode.media?.gallery) {
				linkspot.classList.remove("hidden");
			} else {
				linkspot.classList.add("hidden");
			}
			if (activeNode.media.gallery) {
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
		context.save();
		context.clearRect(0, 0, context.canvas.width, context.canvas.height);
		context.translate(transform.x, transform.y);
		context.scale(transform.k, transform.k);

		links.forEach((d) => {
			context.beginPath();
			context.moveTo(d.source.x, d.source.y);
			context.lineTo(d.target.x, d.target.y);
			context.strokeStyle = "#000";
			context.lineWidth = 1;
			context.stroke();
			context.globalAlpha = 1;
		});

		nodes.forEach((d, i) => {
			context.beginPath();
			context.arc(d.x, d.y, d.size, 0, 2 * Math.PI);
			context.strokeStyle = activeNode && activeNode.node_id === d.node_id ? "violet" : "transparent";
			context.lineWidth = 5;
			context.stroke();
			context.fillStyle = color(d.type);
			context.fill();
		});
		context.restore();
	}

	function zoomed(currentEvent) {
		transform = currentEvent.transform;
		simulationUpdate();
	}

	// Use the d3-force simulation to locate the node
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

	function dragstarted(currentEvent) {
		if (!currentEvent.active) simulation.alphaTarget(0.3).restart();
		currentEvent.subject.fx = transform.invertX(currentEvent.subject.x);
		currentEvent.subject.fy = transform.invertY(currentEvent.subject.y);
	}

	function dragged(currentEvent) {
		currentEvent.subject.fx = transform.invertX(currentEvent.x);
		currentEvent.subject.fy = transform.invertY(currentEvent.y);
	}

	function dragended(currentEvent) {
		if (!currentEvent.active) simulation.alphaTarget(0);
		currentEvent.subject.fx = null;
		currentEvent.subject.fy = null;
	}

	function resize() {
		({ width, height } = canvas);
	}
	function fitToContainer(element) {
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
				{#if activeNode}
					<div id="nodeDetails">
						{#if showCard.media?.image}
							<img src={`${base}/images/${showCard.media.image}`}/>
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
		{#if activeNode.media}
			{#if activeNode.media.video}
				<video
					controls
					height={500} 
					src={`${base}/images/${activeNode.media.video}`} />
			{/if}
			{#if activeNode.media.link}
				<iframe
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
</style>
