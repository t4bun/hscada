import { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);
  const signIn = (data) => {
    if (data.token) localStorage.setItem("hmi_token", data.token);
    setUser(data);
  };
  const signOut = async () => {
    await api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("hmi_token");
    setUser(false);
  };
  return <AuthCtx.Provider value={{ user, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="h-screen grid place-items-center bg-[#0B0F17] text-slate-500 font-mono text-sm">Memeriksa sesi...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
