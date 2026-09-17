interface LeafletMarker {
  addTo(map: LeafletMap): LeafletMarker;
  bindPopup(html: string): LeafletMarker;
}
interface LeafletTileLayer {
  addTo(map: LeafletMap): LeafletTileLayer;
}
interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  remove(): void;
}
interface LeafletStatic {
  map(el: HTMLElement): LeafletMap;
  tileLayer(
    url: string,
    options: { attribution: string; maxZoom?: number },
  ): LeafletTileLayer;
  marker(
    latlng: [number, number],
    options?: { title?: string },
  ): LeafletMarker;
}
declare global {
  interface Window {
    L?: LeafletStatic;
  }
}
export {};
