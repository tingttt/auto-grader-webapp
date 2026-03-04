import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type DocItem = {
  documentId: string;
  moduleId: string;
  studentName?: string;
  originalFilename?: string;
  sourceType?: "doc" | "zip";
  createdAt?: string;
  pdfUrl?: string;
  status?: { converted?: boolean; extracted?: boolean };
};

export default function ModuleDashboardPage() {
  const { moduleId = "module-1" } = useParams();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch(`${API}/modules/${encodeURIComponent(moduleId)}/documents`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setDocs(data.documents || []);
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(documentId: string) {
    if (!confirm("Delete this document from dashboard and disk?")) return;
    try {
      const r = await fetch(`${API}/documents/${documentId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      setDocs((prev) => prev.filter((d) => d.documentId !== documentId));
    } catch (e: any) {
      alert(e?.message ?? "Delete failed");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Module Dashboard</div>
        <div style={{ opacity: 0.7 }}>Module: {moduleId}</div>
        <button onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Link to={`/modules/${moduleId}/uploads`}>Uploads</Link>
        </div>
      </div>

      {msg && <div style={{ marginTop: 12, color: "crimson" }}>{msg}</div>}

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 2fr 0.8fr 1.2fr 1fr 1.2fr",
            padding: "10px 12px",
            background: "#fafafa",
            fontWeight: 700,
            borderBottom: "1px solid #eee",
          }}
        >
          <div>Student</div>
          <div>Original file</div>
          <div>Type</div>
          <div>Status</div>
          <div>Uploaded</div>
          <div>Actions</div>
        </div>

        {docs.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.7 }}>No documents yet.</div>
        ) : (
          docs.map((d) => (
            <div
              key={d.documentId}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 2fr 0.8fr 1.2fr 1fr 1.2fr",
                padding: "10px 12px",
                borderBottom: "1px solid #f3f3f3",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {d.studentName || <span style={{ opacity: 0.6 }}>(unknown)</span>}
              </div>

              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {d.originalFilename || <span style={{ opacity: 0.6 }}>(no name)</span>}
              </div>

              <div style={{ opacity: 0.8 }}>{d.sourceType}</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span>{d.status?.converted ? "✅ Converted" : "— Converted"}</span>
                <span>{d.status?.extracted ? "✅ Extracted" : "— Extracted"}</span>
              </div>

              <div style={{ opacity: 0.8, fontSize: 12 }}>
                {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link to={`/viewer/${d.documentId}?moduleId=${encodeURIComponent(moduleId)}`}>
                  Viewer
                </Link>
                {d.pdfUrl ? (
                  <a href={d.pdfUrl} target="_blank" rel="noreferrer">
                    PDF
                  </a>
                ) : (
                  <span style={{ opacity: 0.5 }}>PDF</span>
                )}
                <button onClick={() => onDelete(d.documentId)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}