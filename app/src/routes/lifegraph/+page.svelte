<script lang="ts">
	import type { PageData, ActionData } from './$types';
	// export let form: ActionData;
	export let data: PageData;
	import { onMount } from "svelte";

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

  //import { event as currentEvent } from "d3-selection"; // Needed to get drag working, see: https://github.com/d3/d3/issues/2733
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

  let canvas;
  let width = 500;
  let height = 600;
  let activeNode = false;
  const color = d3.scaleOrdinal(d3.schemeCategory10)
  $: ({ nodes,links } = data);
  let showCard;
  let transform = d3.zoomIdentity;
  let simulation, context;
  let dpi = 1;
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
		  .distance(d => d.target.size * 2)
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

      if (d) activeNode = d;
      else activeNode = false;
      if (activeNode) {
        showCard = JSON.parse(
          JSON.stringify({ 
			id: activeNode.label, 
			nodeDescription: activeNode.description,
			linkDescriptions: links
				.filter(f => f.source.node_id == activeNode.node_id)
				.map(m => m.description)
		})
        );
      }
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
      context.strokeStyle = "transparent";
      context.lineWidth = 1.5;
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
//   async function onNodeSubmit(e) {
// 	const formData = new FormData(e.target);
// 	const data = {};
// 	for (let field of formData) {
// 		const [key,value] = field;
// 		data[key] = value;
// 	}
// 	const res = await fetch('/', {method: 'POST', body: JSON.stringify(data)})
// 	const json = await res.json();
// 	result = JSON.stringify(json)
//   }

</script>
<svelte:head>
	<title>Lifegraph</title>
	<meta name="description" content="Heather Bree's lifegraph" />
</svelte:head>
<svelte:window on:resize={resize} />

<div>
	<h1>Heather Bree's Lifegraph</h1>
	<div class="flex-container">
		<section id="editor" class="text-column">
			<h2>Nodes</h2>
			<form method="POST" action="?/addnode">
				<label for="node_id">node id</label>
				<input type="text" name="node_id" id="node_id" />
				<label for="label">Label</label>
				<input type="text" name="label" id="label" />
				<label for="type">Type</label>
				<input type="text" name="type" id="type" />
				<label for="label">Description</label>
				<input type="text" name="description" id="description" />
				<label for="label">Date</label>
				<input type="text" name="date" id="date" />
				<label for="label">Link</label>
				<input type="text" name="link" id="link" />
				<label for="label">image</label>
				<input type="text" name="image" id="image" />
				<label for="label">Video</label>
				<input type="text" name="video" id="video" />
				<button type="submit">Add Node</button>
			</form>
			<h2>Links</h2>
			<form method="POST" action="?/addlink">
				<label for="source">Source</label>
				<input type="text" name="source" id="source" />
				<label for="target">Target</label>
				<input type="text" name="target" id="target" />
				<label for="description">Description</label>
				<input type="text" name="description" id="description" />
				<button type="submit">Add Link</button>
			</form>
		</section>
		<section class="viz">
			<div on:resize={resize} class="container">
				{#if activeNode}
					<breadcrumb id="nodeDetails">
					<strong>{showCard.id}</strong>
					<br />
					{#if showCard.nodeDescription}
						{showCard.nodeDescription}
						<br />
					{/if}
					{#if showCard.linkDescriptions}
						{#each showCard.linkDescriptions as ldesc}
						{ldesc}
						<br />
						{/each}
					{/if}
					</breadcrumb>
				{/if}
				<canvas use:fitToContainer bind:this={canvas} />
			</div>	
		</section>	
	</div>
</div>
<style>
	div.flex-container {
		display: flex;
		flex-direction: row;
	}
	div.container {
		height: 75vh;
	}
	#nodeDetails {
		position: absolute;
		width: unset;
	}
	h2 {
		font-weight: 700;
		font-size: 1.5rem;
	}
</style>