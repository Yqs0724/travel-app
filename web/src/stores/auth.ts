import { create } from "zustand";
import { clearToken, getToken, isErr, setToken } from "@/api/client";
import { login as loginApi } from "@/api/trips";

type AuthState = {
  token: string | null;
  login: (password: string) => Promise<string | null>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  login: async (password) => {
    const res = await loginApi(password);
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
