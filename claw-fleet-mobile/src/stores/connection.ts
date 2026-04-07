import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { FleetApiClient } from "../api/client";
import { MockApiClient } from "../api/mock-client";

/** Union type — both real and mock clients share the same method signatures */
export type ApiClient = FleetApiClient | MockApiClient;

interface ConnectionState {
  /** null = not yet connected */
  client: ApiClient | null;
  baseUrl: string | null;
  token: string | null;
  connected: boolean;
  desktopVersion: string | null;

  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  restoreConnection: () => Promise<boolean>;
}

const STORAGE_KEY = "fleet-connection";

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  client: null,
  baseUrl: null,
  token: null,
  connected: false,
  desktopVersion: null,

  connect: async (url: string, token: string) => {
    // Mock mode: connect to "mock" to use fake data (not persisted)
    if (url === "mock") {
      const client = new MockApiClient();
      const health = await client.health();
      set({
        client,
        baseUrl: "mock",
        token: "mock",
        connected: true,
        desktopVersion: health.version,
      });
      // Don't persist mock connections
      return;
    }

    const client = new FleetApiClient(url, token);
    const health = await client.health();
    set({
      client,
      baseUrl: url,
      token,
      connected: true,
      desktopVersion: health.version,
    });
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url, token }),
    );
  },

  disconnect: () => {
    set({
      client: null,
      baseUrl: null,
      token: null,
      connected: false,
      desktopVersion: null,
    });
    AsyncStorage.removeItem(STORAGE_KEY);
  },

  restoreConnection: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const { url, token } = JSON.parse(raw);
      await get().connect(url, token);
      return true;
    } catch {
      return false;
    }
  },
}));
