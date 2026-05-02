declare module 'shp-write' {
  export interface ShpWriteDownloadOptions {
    folder?: string;
    types?: Record<string, string>;
  }

  export function download(geojson: GeoJSON.GeoJSON, options?: ShpWriteDownloadOptions): void;
}
