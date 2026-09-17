// Deliberately restricted to our documented simulator format, never a payment/deep-link redirect.
export function parseChargerQr(raw: string) {
  try {
    const url = new URL(raw);
    const keys = [...url.searchParams.keys()];
    if (raw.length > 500 || url.protocol !== "uei-demo:" || url.hostname !== "charger" || url.pathname || url.hash || url.username || url.password || url.port ||
      keys.length !== 4 || new Set(keys).size !== 4 || keys.some(k => !["provider", "item", "lat", "lon"].includes(k))) throw new Error();
    const providerId = url.searchParams.get("provider")!;
    const itemId = url.searchParams.get("item")!;
    const lat = url.searchParams.get("lat")!;
    const lon = url.searchParams.get("lon")!;
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!/^sim-[ab]$/.test(providerId) || ![`${providerId}-ccs`, `${providerId}-chademo`].includes(itemId) || !lat.trim() || !lon.trim() ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error();
    return { providerId, itemId, latitude, longitude };
  } catch {
    throw new Error("This QR code is not a supported demo charger. Choose a charger from search instead.");
  }
}
