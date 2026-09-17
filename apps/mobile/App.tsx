import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { restoreSession, watchSession } from "./src/api";
import type { Session } from "./src/platform/session";
import type { Routes } from "./src/types";
import * as Screens from "./src/screens";
import { Copy, Page, Title } from "./src/ui";
const cache = new QueryClient({
  defaultOptions: { queries: { retry: 1 }, mutations: { retry: false } },
});
const Stack = createNativeStackNavigator<Routes>();
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const unwatch = watchSession((value) => {
      setSession((previous) => {
        if (previous?.user.id !== value?.user.id) cache.clear();
        return value;
      });
    });
    void restoreSession()
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => {
      unwatch();
      subscription.remove();
    };
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={cache}>
        {!ready ? (
          <Page>
            <Title>UEI Charging</Title>
            <Copy>Opening your account…</Copy>
          </Page>
        ) : (
          <NavigationContainer>
            <Stack.Navigator
              screenOptions={{
                headerStyle: { backgroundColor: "#f5f8f7" },
                headerTintColor: "#102c29",
              }}
            >
              {!session ? (
                <>
                  <Stack.Screen
                    name="Phone"
                    component={Screens.PhoneScreen}
                    options={{ title: "Welcome" }}
                  />
                  <Stack.Screen
                    name="Otp"
                    component={Screens.OtpScreen}
                    options={{ title: "Verification" }}
                  />
                </>
              ) : (
                <>
                  <Stack.Screen
                    name="Vehicles"
                    component={Screens.VehiclesScreen}
                  />
                  <Stack.Screen name="Home" component={Screens.HomeScreen} />
                  <Stack.Screen
                    name="Chargers"
                    component={Screens.ChargersScreen}
                  />
                  <Stack.Screen
                    name="Detail"
                    component={Screens.DetailScreen}
                  />
                  <Stack.Screen name="Quote" component={Screens.QuoteScreen} />
                  <Stack.Screen
                    name="Activity"
                    component={Screens.ActivityScreen}
                  />
                  <Stack.Screen
                    name="Profile"
                    component={Screens.ProfileScreen}
                  />
                  <Stack.Screen
                    name="Scanner"
                    component={Screens.ScannerScreen}
                  />
                  <Stack.Screen
                    name="ActiveCharging"
                    component={Screens.ActiveChargingScreen}
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
