import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import EventSource from "react-native-sse";
import { api, apiUrl, accessToken, logout, setSession } from "./api";
import type { Session } from "./platform/session";
import type { Make, Vehicle, Search, Order, Routes } from "./types";
import { Button, Copy, Feedback, Field, Page, Title, styles } from "./ui";
type Screen<K extends keyof Routes> = NativeStackScreenProps<Routes, K>;

export function PhoneScreen({ navigation }: Screen<"Phone">) {
  const [phone, setPhone] = useState("+91");
  const request = useMutation({
    mutationFn: () => api("/auth/request-otp", { phone }),
    onSuccess: () => navigation.navigate("Otp", { phone }),
  });
  return (
    <Page>
      <Title>Find your next charge</Title>
      <Copy>Sign in with your Indian mobile number.</Copy>
      <Field
        label="Mobile number (+91…)"
        value={phone}
        onChangeText={setPhone}
        numeric
      />
      <Button
        title="Send code"
        disabled={request.isPending || !/^\+91[6-9]\d{9}$/.test(phone)}
        onPress={() => request.mutate()}
      />
      <Feedback loading={request.isPending} error={request.error} />
      <Copy>
        Development demo. No SMS is sent. Use the code configured by your
        developer.
      </Copy>
    </Page>
  );
}
export function OtpScreen({ route }: Screen<"Otp">) {
  const [otp, setOtp] = useState("");
  const verify = useMutation({
    mutationFn: async () =>
      setSession(
        await api<Session>("/auth/verify-otp", {
          phone: route.params.phone,
          otp,
        }),
      ),
  });
  const resend = useMutation({
    mutationFn: () => api("/auth/request-otp", { phone: route.params.phone }),
  });
  return (
    <Page>
      <Title>Enter your code</Title>
      <Copy>{route.params.phone}</Copy>
      <Field label="Six-digit code" value={otp} onChangeText={setOtp} numeric />
      <Button
        title="Continue"
        disabled={verify.isPending || !/^\d{6}$/.test(otp)}
        onPress={() => verify.mutate()}
      />
      <Button
        title="Request another code"
        disabled={resend.isPending}
        onPress={() => resend.mutate()}
      />
      <Feedback
        loading={verify.isPending}
        error={verify.error ?? resend.error}
      />
      {resend.isSuccess && <Copy>A new development code is ready.</Copy>}
    </Page>
  );
}
export function VehiclesScreen({ navigation }: Screen<"Vehicles">) {
  const cache = useQueryClient();
  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const catalogue = useQuery({
    queryKey: ["catalogue"],
    queryFn: () => api<Make[]>("/vehicles/catalogue"),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<Vehicle[]>("/vehicles"),
  });
  const save = useMutation({
    mutationFn: (variantId: string) =>
      api<Vehicle>("/vehicles", { variantId, nickname: "My EV" }),
    onSuccess: (value) => {
      void cache.invalidateQueries({ queryKey: ["vehicles"] });
      navigation.navigate("Home", { vehicleId: value.id });
    },
  });
  const make = catalogue.data?.find((value) => value.id === makeId);
  const model = make?.models.find((value) => value.id === modelId);
  return (
    <Page>
      <Title>Your vehicle</Title>
      <Copy>We’ll show chargers compatible with your selected vehicle.</Copy>
      <Feedback
        loading={catalogue.isLoading || vehicles.isLoading || save.isPending}
        error={catalogue.error ?? vehicles.error ?? save.error}
      />
      {vehicles.data?.map((vehicle) => (
        <Button
          key={vehicle.id}
          title={`${vehicle.nickname} · ${vehicle.variant.model.name}`}
          onPress={() => navigation.navigate("Home", { vehicleId: vehicle.id })}
        />
      ))}
      <Copy>Add a vehicle — demonstration catalogue</Copy>
      {catalogue.data?.map((value) => (
        <Button
          key={value.id}
          title={`${makeId === value.id ? "✓ " : ""}${value.name}`}
          onPress={() => {
            setMakeId(value.id);
            setModelId("");
          }}
        />
      ))}
      {make?.models.map((value) => (
        <Button
          key={value.id}
          title={`${modelId === value.id ? "✓ " : ""}${value.name}`}
          onPress={() => setModelId(value.id)}
        />
      ))}
      {model?.variants.map((value) => (
        <Button
          key={value.id}
          title={`Save ${value.name} (${value.connectors.map((c) => c.connector).join(", ")})`}
          disabled={save.isPending}
          onPress={() => save.mutate(value.id)}
        />
      ))}
      <Button
        title="Activity"
        onPress={() => navigation.navigate("Activity")}
      />
      <Button title="Profile" onPress={() => navigation.navigate("Profile")} />
    </Page>
  );
}
export function HomeScreen({ navigation, route }: Screen<"Home">) {
  const [latitude, setLatitude] = useState("12.9716");
  const [longitude, setLongitude] = useState("77.5946");
  const search = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/charging/search", {
        vehicleId: route.params.vehicleId,
        latitude: Number(latitude),
        longitude: Number(longitude),
      }),
    onSuccess: (value) =>
      navigation.navigate("Chargers", {
        searchId: value.id,
        vehicleId: route.params.vehicleId,
      }),
  });
  return (
    <Page>
      <Title>Find a compatible charger</Title>
      <Copy>
        Demo location: Bengaluru. Map and device location are planned; you can
        enter coordinates below.
      </Copy>
      <Field label="Latitude" value={latitude} onChangeText={setLatitude} />
      <Field label="Longitude" value={longitude} onChangeText={setLongitude} />
      <Button
        title="Search chargers"
        disabled={search.isPending || !latitude.trim() || !longitude.trim()}
        onPress={() => search.mutate()}
      />
      <Feedback loading={search.isPending} error={search.error} />
      <Button
        title="Scan a charger QR"
        onPress={() => navigation.navigate("Scanner")}
      />
      <Copy>Simulated stations and prices. No real charging or payment.</Copy>
    </Page>
  );
}
export function ChargersScreen({ navigation, route }: Screen<"Chargers">) {
  const query = useQuery({
    queryKey: ["search", route.params.searchId],
    queryFn: () =>
      api<Search>(`/charging/search/${route.params.searchId}/results`),
    refetchInterval: (query) =>
      query.state.data?.status === "COMPLETE" ? false : 1000,
  });
  return (
    <Page>
      <Title>Compatible chargers</Title>
      <Feedback loading={query.isLoading} error={query.error} />
      {query.error && (
        <Button title="Try again" onPress={() => void query.refetch()} />
      )}
      <Copy>
        {query.data?.status === "SEARCHING"
          ? "Looking for chargers… results may arrive in stages."
          : (query.data?.message ?? "Search complete")}
      </Copy>
      {query.data?.results.map((charger) => (
        <View style={styles.card} key={charger.id}>
          <Title>{charger.name}</Title>
          <Copy>
            {charger.connector} · ₹{(charger.pricePaise / 100).toFixed(2)} / kWh
            (demo)
          </Copy>
          <Button
            title="View charger"
            onPress={() =>
              navigation.navigate("Detail", {
                charger,
                vehicleId: route.params.vehicleId,
              })
            }
          />
        </View>
      ))}
    </Page>
  );
}
export function DetailScreen({ navigation, route }: Screen<"Detail">) {
  const key = useRef(randomUUID());
  const { charger, vehicleId } = route.params;
  const select = useMutation({
    mutationFn: () =>
      api<Order>(
        "/orders",
        { discoveryResultId: charger.id, vehicleId },
        key.current,
      ),
    onSuccess: (value) => navigation.navigate("Quote", { orderId: value.id }),
  });
  return (
    <Page>
      <Title>{charger.name}</Title>
      <Copy>{charger.connector} · compatible with your vehicle.</Copy>
      <Copy>
        Request a fresh quote before continuing. Displayed rates are simulated.
      </Copy>
      <Button
        title="Get quote"
        disabled={select.isPending}
        onPress={() => select.mutate()}
      />
      <Feedback loading={select.isPending} error={select.error} />
    </Page>
  );
}
export function QuoteScreen({ route }: Screen<"Quote">) {
  const key = useRef(randomUUID());
  const payKey = useRef(randomUUID());
  const cache = useQueryClient();
  const id = route.params.orderId;
  const query = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<Order>(`/orders/${id}`),
    refetchInterval: (query) =>
      ["INITIALIZED", "CONFIRMED", "FAILED"].includes(
        query.state.data?.state ?? "",
      )
        ? false
        : 1500,
  });
  const init = useMutation({
    mutationFn: () => api<Order>(`/orders/${id}/init`, {}, key.current),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["order", id] }),
  });
  const pay = useMutation({
    mutationFn: () => api<Order>(`/orders/${id}/pay`, {}, payKey.current),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["order", id] }),
  });
  useEffect(() => {
    if (!query.data?.transactionId) return;
    const stream = new EventSource<"transition">(
      `${apiUrl}/v1/transactions/${query.data.transactionId}/events`,
      {
        headers: { Authorization: `Bearer ${accessToken()}` },
        pollingInterval: 5000,
      },
    );
    stream.addEventListener("transition", () => {
      void cache.invalidateQueries({ queryKey: ["order", id] });
    });
    return () => stream.close();
  }, [query.data?.transactionId, cache, id]);
  const order = query.data;
  const quote = order?.quotes[0];
  return (
    <Page>
      <Title>Your charging quote</Title>
      <Feedback
        loading={query.isLoading || init.isPending || pay.isPending}
        error={query.error ?? init.error ?? pay.error}
      />
      {order?.needsReconciliation && (
        <Copy>
          Confirmation is taking longer than expected. We’re checking its
          status. Please avoid creating another order.
        </Copy>
      )}
      {order?.state === "SELECT_PENDING" && (
        <Copy>Waiting for your quote…</Copy>
      )}
      {quote && (
        <>
          <Title>₹{(quote.amountPaise / 100).toFixed(2)}</Title>
          <Copy>
            Valid until {new Date(quote.expiresAt).toLocaleTimeString()}
          </Copy>
        </>
      )}
      {order?.state === "SELECTED" && (
        <Button
          title="Continue with this quote"
          disabled={
            init.isPending ||
            !quote ||
            new Date(quote.expiresAt).getTime() <= Date.now()
          }
          onPress={() => init.mutate()}
        />
      )}
      {order?.state === "INIT_PENDING" && <Copy>Preparing your order…</Copy>}
      {order?.state === "INITIALIZED" && (
        <>
          <Title>Order ready</Title>
          <Copy>
            Payment method: {order.paymentTerms?.method}.{" "}
            {order.paymentTerms?.prepayment
              ? "Prepayment is required."
              : "No prepayment is required."}
          </Copy>
          <Button
            title="Approve UPI payment"
            disabled={pay.isPending}
            onPress={() => pay.mutate()}
          />
        </>
      )}
      {order?.state === "PAYMENT_PENDING" && (
        <Copy>Authorizing your UPI payment…</Copy>
      )}
      {order?.state === "CONFIRM_PENDING" && (
        <Copy>Confirming your order with the charging provider…</Copy>
      )}
      {order?.state === "CONFIRMED" && (
        <>
          <Title>Order confirmed</Title>
          {order.payment && (
            <Copy>
              Paid ₹{(order.payment.amountPaise / 100).toFixed(2)} via{" "}
              {order.payment.method}.
            </Copy>
          )}
          <Copy>
            This demo ends here. Charging start is outside this milestone.
          </Copy>
        </>
      )}
      {order?.state === "FAILED" && (
        <Copy>
          {order.payment?.state === "FAILED"
            ? "Your payment could not be authorized. Return to search and try again."
            : "The provider could not prepare this order. Return to search and try another charger."}
        </Copy>
      )}
      <Button title="Refresh status" onPress={() => void query.refetch()} />
    </Page>
  );
}
export function ActivityScreen({ navigation }: Screen<"Activity">) {
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: () => api<Order[]>("/orders"),
  });
  return (
    <Page>
      <Title>Your activity</Title>
      <Feedback loading={query.isLoading} error={query.error} />
      {query.data?.length === 0 && <Copy>No orders yet.</Copy>}
      {query.data?.map((order) => (
        <Button
          key={order.id}
          title={`Order ${order.id.slice(0, 8)} · ${order.state.replaceAll("_", " ").toLowerCase()}`}
          onPress={() => navigation.navigate("Quote", { orderId: order.id })}
        />
      ))}
    </Page>
  );
}
export function ProfileScreen() {
  const signOut = useMutation({ mutationFn: logout });
  return (
    <Page>
      <Title>Profile</Title>
      <Copy>Local development account</Copy>
      <Button
        title="Sign out"
        disabled={signOut.isPending}
        onPress={() => signOut.mutate()}
      />
      <Feedback error={signOut.error} />
    </Page>
  );
}
export function ScannerScreen() {
  return (
    <Page>
      <Title>Scan a charger</Title>
      <Text style={styles.text}>
        QR scanning will be available when verified charger QR formats are
        connected. Choose a charger from search for this demo.
      </Text>
    </Page>
  );
}
export function ActiveChargingScreen() {
  return (
    <Page>
      <Title>Charging</Title>
      <Copy>
        Live charging is outside this milestone. No charger has been started.
      </Copy>
    </Page>
  );
}
