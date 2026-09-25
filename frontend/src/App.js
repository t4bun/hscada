import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, Protected } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Projects from "@/pages/Projects";
import Editor from "@/pages/Editor";
import ProjectConfig from "@/pages/ProjectConfig";
import Runtime from "@/pages/Runtime";

function App() {
  return (
    <BrowserRouter>
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
        <Toaster theme="dark" position="bottom-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
