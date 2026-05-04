'use client';

import { useState, useCallback } from 'react';
import type { StyleSpecification } from 'maplibre-gl';

export type Basemap = 'blank' | 'osm' | 'dark' | 'satellite';

export interface LayerVisibility {
  junctions: boolean;
  reservoirs: boolean;
  tanks: boolean;
  pipes: boolean;
  pumps: boolean;
  valves: boolean;
  sectors: boolean;
  results: boolean;
  smartSensors: boolean;
}

export type EditMode = 'select' | 'move' | 'addNode' | 'addPipe' | 'addValve' | 'delete' | 'drawPolygon' | 'inspectCoord';

export const DEFAULT_LAYERS: LayerVisibility = {
  junctions: true,
  reservoirs: true,
  tanks: true,
  pipes: true,
  pumps: true,
  valves: true,
  sectors: true,
  results: true,
  smartSensors: true,
};

export function useMapState() {
  const [basemap, setBasemap] = useState<Basemap>('osm');
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [editMode, setEditMode] = useState<EditMode>('select');

  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return {
    basemap, setBasemap,
    layers, toggleLayer, setLayers,
    editMode, setEditMode,
  };
}

// Note: cast em cada entrada para evitar widening dos literais 'raster'.
export const BASEMAP_STYLES: Record<Basemap, StyleSpecification> = {
  blank: {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'blank-white',
        type: 'background',
        paint: { 'background-color': '#ffffff' },
      },
    ],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  } as StyleSpecification,
  osm: {
    version: 8,
    sources: {
      'osm-raster': {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'osm-raster', type: 'raster', source: 'osm-raster' }],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  } as StyleSpecification,
  dark: {
    version: 8,
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap, © CARTO',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'carto-dark', type: 'raster', source: 'carto-dark' }],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  } as StyleSpecification,
  satellite: {
    version: 8,
    sources: {
      'esri-sat': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles © Esri',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'esri-sat', type: 'raster', source: 'esri-sat' }],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  } as StyleSpecification,
} as Record<Basemap, StyleSpecification>;
