import * as SecureStore from "expo-secure-store";
export type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; role: string };
};
const key = "uei.session";
export const sessionStorage = {
  async read(): Promise<Session | null> {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  async write(session: Session) {
    await SecureStore.setItemAsync(key, JSON.stringify(session));
  },
  async clear() {
    await SecureStore.deleteItemAsync(key);
  },
};
