import config from "./app.json";
export default {
  ...config.expo,
  android: {
    ...config.expo.android,
    ...(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ? { config: { googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY } } } : {}),
  },
};
