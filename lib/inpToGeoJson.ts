import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import dagre from 'dagre';
import { LinkElement, NetworkData, NodeElement } from '../types/epanet';
import { buildGeoTransform, GeoTransform } from './geoTransform';

export interface NodeFeatureProps {
  id: string;
  kind: 'junction' | 'reservoir' | 'tank';
  elevation?: number;
  demand?: number;
  pattern?: string;
  head?: number;
  initLevel?: number;
  minLevel?: number;
  maxLevel?: number;
  diameter?: number;
  pressure?: number;
  hydraulicHead?: number;
  actualDemand?: number;
  pressureAlert?: 'negative' | 'low' | null;
}

export interface LinkFeatureProps {
  id: string;
  kind: 'pipe' | 'pump' | 'valve';
  node1: string;
  node2: string;
  length?: number;
  diameter?: number;
  roughness?: number;
  minorLoss?: number;
  status?: string;
  valveType?: string;
  setting?: number | string;
  elevation?: number;
  parameters?: string;
  flow?: number;
  velocity?: number;
  headloss?: number;
  resultStatus?: string;
  velocityAlert?: 'high' | null;
}

export interface NetworkGeoJson {
  nodes: FeatureCollection<Point, NodeFeatureProps>;
  links: FeatureCollection<LineString, LinkFeatureProps>;
  specialLinks: FeatureCollection<Point, LinkFeatureProps>;
  bounds: [number, number, number, number] | null;
  transform: GeoTransform;
}

function pressureAlertOf(pressure?: number): NodeFeatureProps['pressureAlert'] {
  if (typeof pressure !== 'number') return null;
  if (pressure < 0) return 'negative';
  if (pressure < 10) return 'low';
  return null;
}

function velocityAlertOf(velocity?: number): LinkFeatureProps['velocityAlert'] {
  if (typeof velocity !== 'number') return null;
  if (Math.abs(velocity) > 3) return 'high';
  return null;
}

function nodeProps(node: NodeElement): NodeFeatureProps {
  return {
    id: node.id,
    kind: node.type as NodeFeatureProps['kind'],
    elevation: node.elevation,
    demand: node.demand,
    pattern: node.pattern,
    head: node.head,
    initLevel: node.initLevel,
    minLevel: node.minLevel,
    maxLevel: node.maxLevel,
    diameter: node.diameter,
    pressure: node.pressure,
    hydraulicHead: node.hydraulicHead,
    actualDemand: node.actualDemand,
    pressureAlert: pressureAlertOf(node.pressure),
  };
}

function linkProps(link: LinkElement): LinkFeatureProps {
  return {
    id: link.id,
    kind: link.type as LinkFeatureProps['kind'],
    node1: link.node1,
    node2: link.node2,
    length: link.length,
    diameter: link.diameter,
    roughness: link.roughness,
    minorLoss: link.minorLoss,
    status: link.status,
    valveType: link.valveType,
    setting: link.setting,
    elevation: link.elevation,
    parameters: link.parameters,
    flow: link.flow,
    velocity: link.velocity,
    headloss: link.headloss,
    resultStatus: link.resultStatus,
    velocityAlert: velocityAlertOf(link.velocity),
  };
}

function resolveNodeCoordinates(data: NetworkData): Record<string, { x: number; y: number }> {
  const nodeIds = Object.keys(data.nodes);
  const missingAny = nodeIds.some((id) => !data.nodes[id].coordinates);

  if (!missingAny) {
    const coords: Record<string, { x: number; y: number }> = {};
    for (const id of nodeIds) {
      const c = data.nodes[id].coordinates;
      if (c) coords[id] = { x: c.x, y: c.y };
    }
    return coords;
  }

  // Match the same fallback behavior used in the INP map tab.
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 100 });

  for (const id of nodeIds) {
    graph.setNode(id, { width: 40, height: 40 });
  }

  for (const link of Object.values(data.links)) {
    if (!data.nodes[link.node1] || !data.nodes[link.node2]) continue;
    graph.setEdge(link.node1, link.node2);
  }

  dagre.layout(graph);

  const coords: Record<string, { x: number; y: number }> = {};
  for (const id of nodeIds) {
    const position = graph.node(id) as { x?: number; y?: number } | undefined;
    coords[id] = {
      x: typeof position?.x === 'number' ? position.x : 0,
      y: typeof position?.y === 'number' ? position.y : 0,
    };
  }
  return coords;
}

export function networkToGeoJson(data: NetworkData): NetworkGeoJson {
  const coords = resolveNodeCoordinates(data);
  const points = Object.values(coords).map(({ x, y }) => ({ x, y }));
  const transform = buildGeoTransform(points);

  const nodeFeatures: Feature<Point, NodeFeatureProps>[] = [];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let hasBounds = false;

  for (const node of Object.values(data.nodes)) {
    const c = coords[node.id];
    if (!c) continue;
    const [lng, lat] = transform.toLngLat(c.x, c.y);
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    hasBounds = true;
    nodeFeatures.push({
      type: 'Feature',
      id: node.id,
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: nodeProps(node),
    });
  }

  const linkFeatures: Feature<LineString, LinkFeatureProps>[] = [];
  const specialLinkFeatures: Feature<Point, LinkFeatureProps>[] = [];

  for (const link of Object.values(data.links)) {
    const a = coords[link.node1];
    const b = coords[link.node2];
    if (!a || !b) continue;

    const aLngLat = transform.toLngLat(a.x, a.y);
    const bLngLat = transform.toLngLat(b.x, b.y);
    const props = linkProps(link);

    linkFeatures.push({
      type: 'Feature',
      id: link.id,
      geometry: { type: 'LineString', coordinates: [aLngLat, bLngLat] },
      properties: props,
    });

    if (link.type === 'pump' || link.type === 'valve') {
      specialLinkFeatures.push({
        type: 'Feature',
        id: `${link.id}::sym`,
        geometry: {
          type: 'Point',
          coordinates: [
            (aLngLat[0] + bLngLat[0]) / 2,
            (aLngLat[1] + bLngLat[1]) / 2,
          ],
        },
        properties: props,
      });
    }
  }

  return {
    nodes: { type: 'FeatureCollection', features: nodeFeatures },
    links: { type: 'FeatureCollection', features: linkFeatures },
    specialLinks: { type: 'FeatureCollection', features: specialLinkFeatures },
    bounds: hasBounds ? [west, south, east, north] : null,
    transform,
  };
}
