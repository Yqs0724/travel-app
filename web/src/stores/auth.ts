import { create } from "zustand";
import { clearToken, getToken, isErr, setToken } from "@/api/client";
import { login as loginApi } from "@/api/trips";

type AuthState = {
  token: string | null;
  login: () => Promise<string | null>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  login: async () => {
    const res = await loginApi();
    if (isErr(res)) return res.message;
    setToken(res.data.token);
    set({ token: res.data.token });
    return null;
  },
  logout: () => {
    clearToken();
    set({ token: null });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("triptrace:auth-cleared", () => {
    useAuthStore.getState().logout();
  });
}