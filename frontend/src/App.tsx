import { Routes, Route, Navigate, Link } from "react-router-dom";
import ModuleUploadsPage from "./pages/ModuleUploadsPage";
import ViewerPage from "./pages/ViewerPage";
import ModuleDashboardPage from "./pages/ModuleDashboardPage";

export default function App() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 10, borderBottom: "1px solid #eee", display: "flex", gap: 12 }}>
        <Link to="/modules/module-1/uploads">Module Uploads</Link>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/modules/module-1/uploads" replace />} />
          <Route path="/modules/:moduleId/uploads" element={<ModuleUploadsPage />} />
          <Route path="/viewer/:documentId" element={<ViewerPage />} />
          <Route path="/modules/:moduleId/dashboard" element={<ModuleDashboardPage />} />
        </Routes>
      </div>
    </div>
  );
}