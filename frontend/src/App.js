import "@/App.css";
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, Protected } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Projects from "@/pages/Projects";
import Editor from "@/pages/Editor";
import ProjectConfig from "@/pages/ProjectConfig";
import Runtime from "@/pages/Runtime";

const seg = () => window.location.pathname.split("/")[1] || "";

const EngineerRoutes = () => (
  <AuthProvider>
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/projects" element={<Protected><Projects /></Protected>} />
      <Route path="/projects/:id/editor" element={<Protected><Editor /></Protected>} />
      <Route path="/projects/:id/config" element={<Protected><ProjectConfig /></Protected>} />
      <Route path="/preview/:id" element={<Protected><Runtime mode="preview" /></Protected>} />
      <Route path="/view/:slug" element={<Runtime mode="public" />} />
    </Routes>
  </AuthProvider>
);

const NoApp = () => (
  <div data-testid="no-default-app" className="min-h-screen grid place-items-center bg-[#0B0F17] text-slate-400 text-sm px-6 text-center">
    Belum ada aplikasi HMI yang dipublish untuk alamat ini.
  </div>
);

function App() {
  const [boot, setBoot] = useState(null);
  useEffect(() => {
    api.get("/boot", { params: { seg: seg() } }).then((r) => setBoot(r.data)).catch(() => setBoot({ hide: false, engineer: true }));
  }, []);
  if (!boot) return <div className="min-h-screen bg-[#0B0F17]" />;
  const operator = boot.hide && !boot.engineer;
  return (
    <BrowserRouter basename={boot.hide && boot.engineer ? `/${seg()}` : undefined}>
      {operator ? (
        <Routes>
          <Route path="/view/:slug" element={<Runtime mode="public" />} />
          <Route path="*" element={boot.default_slug ? <Runtime mode="public" slugOverride={boot.default_slug} /> : <NoApp />} />
        </Routes>
      ) : <EngineerRoutes />}
      <Toaster theme="dark" position="bottom-right" richColors />
    </BrowserRouter>
  );
}

export default App;
