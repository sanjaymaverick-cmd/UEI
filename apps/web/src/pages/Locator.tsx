import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { request } from "../api";
import { SignInPanel } from "../SignInPanel";
import type { AccountContext } from "../Layout";

type Vehicle = {
  id: string;
  nickname: string;
  variant: { id: string; name: string; model: { name: string } };
};
type CatalogueVariant = { id: string; name: string };
type CatalogueModel = { id: string; name: string; variants: CatalogueVariant[] };
type CatalogueMake = { id: string; name: string; models: CatalogueModel[] };
type SearchResult = {
  providerId: string;
  itemId: string;
  name: string;
  connector: string;
  pricePaise: number;
  latitude: string;
  longitude: string;
};
type SearchStatus = {
  id: string;
  status: "SEARCHING" | "COMPLETE";
  message: string | null;
  results: SearchResult[];
};

export function Locator() {
  const { user, setUser } = useOutletContext<AccountContext>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchId, setSearchId] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);

  const vehicles = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => request<Vehicle[]>("/vehicles"),
    enabled: !!user,
  });
  const catalogue = useQuery({
    queryKey: ["catalogue"],
    queryFn: () => request<CatalogueMake[]>("/vehicles/catalogue"),
    enabled: !!user && (vehicles.data?.length ?? 0) === 0,
  });
  const saveVehicle = useMutation({
    mutationFn: () =>
      request<Vehicle>("/vehicles", { variantId: selectedVariantId, nickname }),
    onSuccess: () => {
      setNickname("");
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err: Error) => setError(err.message),
  });
  const search = useMutation({
    mutationFn: () => {
      if (!coords) throw new Error("Share your location first.");
      return request<{ id: string }>("/charging/search", {
        vehicleId: selectedVehicleId,
        ...coords,
      });
    },
    onSuccess: (value) => setSearchId(value.id),
    onError: (err: Error) => setError(err.message),
  });
  const results = useQuery({
    queryKey: ["search-results", searchId],
    queryFn: () => request<SearchStatus>(`/charging/search/${searchId}/results`),
    enabled: !!searchId,
    refetchInterval: (query) => (query.state.data?.status === "COMPLETE" ? false : 1500),
  });

  useEffect(() => {
    if (!vehicles.data || vehicles.data.length === 0) return;
    setSelectedVehicleId((current) => current || vehicles.data![0]!.id);
  }, [vehicles.data]);

  useEffect(() => {
    const list = results.data?.results ?? [];
    if (!mapRef.current || !window.L || list.length === 0) return;
    const map = window.L.map(mapRef.current).setView(
      [Number(list[0]!.latitude), Number(list[0]!.longitude)],
      13,
    );
    window.L
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      })
      .addTo(map);
    for (const item of list) {
      window.L
        .marker([Number(item.latitude), Number(item.longitude)])
        .addTo(map)
        .bindPopup(`<strong>${item.name}</strong><br/>${item.connector} · ₹${(item.pricePaise / 100).toFixed(2)}`);
    }
    return () => map.remove();
  }, [results.data]);

  if (!user)
    return (
      <section className="section shell">
        <h2>Find a charger</h2>
        <SignInPanel
          message="Sign in with Google to search the live charging network."
          setUser={setUser}
        />
      </section>
    );

  return (
    <section className="section shell">
      <h2>Find a charger</h2>
      <p className="lede">Search live chargers compatible with your vehicle.</p>
      {error && <p className="notice error">{error}</p>}

      {vehicles.data?.length === 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>Add your vehicle</h3>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              saveVehicle.mutate();
            }}
          >
            <label>
              Vehicle
              <select
                value={selectedVariantId}
                onChange={(event) => setSelectedVariantId(event.target.value)}
                required
              >
                <option value="">Choose a model</option>
                {catalogue.data?.map((make) =>
                  make.models.map((model) =>
                    model.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {make.name} {model.name} · {variant.name}
                      </option>
                    )),
                  ),
                )}
              </select>
            </label>
            <label>
              Nickname
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="My car"
                required
              />
            </label>
            <button className="btn btn-primary" disabled={saveVehicle.isPending}>
              Save vehicle
            </button>
          </form>
        </div>
      )}

      {(vehicles.data?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>Search nearby</h3>
          <div className="form">
            <label>
              Vehicle
              <select
                value={selectedVehicleId}
                onChange={(event) => setSelectedVehicleId(event.target.value)}
              >
                {vehicles.data?.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.nickname} — {vehicle.variant.model.name} {vehicle.variant.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                navigator.geolocation.getCurrentPosition(
                  (position) =>
                    setCoords({
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                    }),
                  () => setError("Could not read your location."),
                )
              }
            >
              📍 {coords ? "Location shared" : "Share my location"}
            </button>
            <button
              className="btn btn-primary"
              disabled={search.isPending || !coords}
              onClick={() => search.mutate()}
            >
              Search chargers
            </button>
          </div>
        </div>
      )}

      {searchId && (
        <>
          {results.data?.status === "SEARCHING" && <p>Searching nearby providers…</p>}
          {results.data?.message && <p className="notice error">{results.data.message}</p>}
          {(results.data?.results.length ?? 0) > 0 && (
            <>
              <div className="map-panel" ref={mapRef} />
              <div className="results">
                {results.data?.results.map((item) => (
                  <div className="result-card" key={`${item.providerId}-${item.itemId}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <div className="meta">
                        {item.connector} · ₹{(item.pricePaise / 100).toFixed(2)}
                      </div>
                    </div>
                    <Link
                      className="btn btn-ghost"
                      to={`/community?providerId=${item.providerId}&itemId=${item.itemId}&name=${encodeURIComponent(item.name)}`}
                    >
                      Reviews
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
