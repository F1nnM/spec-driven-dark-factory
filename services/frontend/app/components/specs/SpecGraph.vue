<script setup lang="ts">
import type { SpecFile } from '@spec-factory/shared'

const props = defineProps<{
  specs: SpecFile[]
}>()

interface Node {
  id: string
  title: string
  fulfillment: string
  x: number
  y: number
}

interface Edge {
  from: string
  to: string
}

const svgWidth = 800
const svgHeight = 400

const graphData = computed(() => {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const specMap = new Map(props.specs.map((s) => [s.meta.id, s]))

  // Build edges
  for (const spec of props.specs) {
    for (const dep of spec.meta.depends_on) {
      if (specMap.has(dep)) {
        edges.push({ from: spec.meta.id, to: dep })
      }
    }
  }

  // Topological layering: specs with no dependencies go first
  const layers: string[][] = []
  const assigned = new Set<string>()
  const ids = props.specs.map((s) => s.meta.id)

  // Layer 0: no dependencies
  const layer0 = ids.filter(
    (id) => !props.specs.find((s) => s.meta.id === id)?.meta.depends_on.length,
  )
  if (layer0.length > 0) {
    layers.push(layer0)
    layer0.forEach((id) => assigned.add(id))
  }

  // Subsequent layers: specs whose dependencies are all assigned
  let safety = 10
  while (assigned.size < ids.length && safety-- > 0) {
    const nextLayer = ids.filter(
      (id) =>
        !assigned.has(id) &&
        (specMap.get(id)?.meta.depends_on ?? []).every((dep) => assigned.has(dep)),
    )
    if (nextLayer.length === 0) {
      // Remaining specs have circular deps or missing deps; add them all
      const remaining = ids.filter((id) => !assigned.has(id))
      layers.push(remaining)
      remaining.forEach((id) => assigned.add(id))
      break
    }
    layers.push(nextLayer)
    nextLayer.forEach((id) => assigned.add(id))
  }

  // Position nodes in layers
  const layerGap = svgWidth / (layers.length + 1)
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]
    const nodeGap = svgHeight / (layer.length + 1)
    for (let ni = 0; ni < layer.length; ni++) {
      const id = layer[ni]
      const spec = specMap.get(id)!
      nodes.push({
        id,
        title: spec.meta.title,
        fulfillment: spec.meta.fulfillment,
        x: layerGap * (li + 1),
        y: nodeGap * (ni + 1),
      })
    }
  }

  return { nodes, edges }
})

const nodeMap = computed(() => {
  return new Map(graphData.value.nodes.map((n) => [n.id, n]))
})

function fulfillmentColor(f: string): string {
  switch (f) {
    case 'fulfilled':
      return '#22c55e'
    case 'partial':
      return '#eab308'
    case 'unfulfilled':
      return '#ef4444'
    default:
      return '#6b7280'
  }
}
</script>

<template>
  <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 overflow-x-auto">
    <svg
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      class="w-full"
      style="min-width: 600px"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#4b5563" />
        </marker>
      </defs>

      <!-- Edges -->
      <line
        v-for="(edge, i) in graphData.edges"
        :key="'edge-' + i"
        :x1="nodeMap.get(edge.from)?.x ?? 0"
        :y1="nodeMap.get(edge.from)?.y ?? 0"
        :x2="nodeMap.get(edge.to)?.x ?? 0"
        :y2="nodeMap.get(edge.to)?.y ?? 0"
        stroke="#4b5563"
        stroke-width="1.5"
        marker-end="url(#arrowhead)"
      />

      <!-- Nodes -->
      <g v-for="node in graphData.nodes" :key="node.id">
        <circle
          :cx="node.x"
          :cy="node.y"
          r="20"
          :fill="fulfillmentColor(node.fulfillment)"
          fill-opacity="0.2"
          :stroke="fulfillmentColor(node.fulfillment)"
          stroke-width="2"
        />
        <text
          :x="node.x"
          :y="node.y + 32"
          text-anchor="middle"
          class="fill-gray-400 text-[10px]"
        >
          {{ node.title.length > 20 ? node.title.slice(0, 18) + '...' : node.title }}
        </text>
        <text
          :x="node.x"
          :y="node.y + 5"
          text-anchor="middle"
          class="fill-white text-[9px] font-medium"
        >
          {{ node.id.length > 12 ? node.id.slice(0, 10) + '..' : node.id }}
        </text>
      </g>
    </svg>
  </div>
</template>
