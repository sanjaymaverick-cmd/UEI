import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EventSource from "react-native-sse";
import { accessToken, api, apiUrl } from "./api";
import type { Order } from "./types";

export function useOrder(id: string) {
  const cache = useQueryClient();
  const [connected, setConnected] = useState(false);
  const cursor = useRef({ transactionId: "", value: "0" });
  const query = useQuery({
    queryKey: ["order", id], queryFn: () => api<Order>(`/orders/${id}`),
    // Polling also refreshes expired credentials and recovers missed events after app suspension.
    refetchInterval: 3000,
  });
  const transactionId = query.data?.transactionId;
  const token = accessToken();
  useEffect(() => {
    if (!transactionId || !token) return;
    if (cursor.current.transactionId !== transactionId) cursor.current = { transactionId, value: "0" };
    let stream: EventSource<"transition"> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const close = () => { clearTimeout(timer); stream?.removeAllEventListeners(); stream?.close(); setConnected(false); };
    const open = () => {
      close();
      if (disposed || AppState.currentState === "background") return;
      stream = new EventSource<"transition">(`${apiUrl}/v1/transactions/${transactionId}/events`, {
        headers: { Authorization: `Bearer ${accessToken()}`, "Last-Event-ID": cursor.current.value }, pollingInterval: 0,
      });
      stream.addEventListener("open", () => setConnected(true));
      stream.addEventListener("transition", event => {
        if (event.lastEventId) cursor.current.value = event.lastEventId;
        void cache.invalidateQueries({ queryKey: ["order", id] });
      });
      stream.addEventListener("error", () => {
        close();
        void cache.invalidateQueries({ queryKey: ["order", id] });
        timer = setTimeout(open, 3000);
      });
    };
    open();
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") { void cache.invalidateQueries({ queryKey: ["order", id] }); open(); }
      else close();
    });
    return () => { disposed = true; close(); listener.remove(); };
  }, [transactionId, token, cache, id]);
  return { ...query, connected };
}
