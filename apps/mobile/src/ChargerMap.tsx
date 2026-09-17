import { Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { Charger } from "./types";
import { Copy } from "./ui";

export function ChargerMap({ chargers, onSelect }: { chargers: Charger[]; onSelect: (charger: Charger) => void }) {
  const first = chargers[0];
  if (!first) return null;
  if (Platform.OS === "android" && !process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY)
    return <Copy>Map preview needs the Android Maps key. Charger details and directions remain available.</Copy>;
  return <MapView style={{ height: 240, width: "100%" }} initialRegion={{ latitude: Number(first.latitude), longitude: Number(first.longitude), latitudeDelta: 0.04, longitudeDelta: 0.04 }}>
    {chargers.map(charger => <Marker key={charger.id} coordinate={{ latitude: Number(charger.latitude), longitude: Number(charger.longitude) }} title={charger.name} description={charger.connector} onCalloutPress={() => onSelect(charger)} />)}
  </MapView>;
}
