import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import { uploadDocument, uploadCodeZip } from "../api";

type RejectedItem = { name: string; type: string; reason: string };

const ACCEPT_DOC_EXT = [".pdf", ".doc", ".docx"] as const;
const ACCEPT_CODE_EXT = [".zip"] as const;

type UploadKind = "doc" | "zip";

type UploadResult = {
  name: string;
  documentId: string;
  kind: UploadKind;
  // Optional extras to display later
  pdfUrl?: string;
  studentName?: string;
  moduleId?: string;
};

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function category(file: File): UploadKind | "reject" {
  const ext = getExt(file.name);
  if (ACCEPT_DOC_EXT.includes(ext as any)) return "doc";
  if (ACCEPT_CODE_EXT.includes(ext as any)) return "zip";
  return "reject";
}

export default function ModuleUploadsPage() {
  const { moduleId = "module-1" } = useParams();
  const [studentName, setStudentName] = useState("");
  const [uploading, setUploading] = useState(false);

  const [accepted, setAccepted] = useState<File[]>([]);
  const [rejected, setRejected] = useState<RejectedItem[]>([]);
  const [messages, setMessages] = useState<string[]>([]);

  const [results, setResults] = useState<UploadResult[]>([]);

  const acceptHint = useMemo(
    () => `Accepted: ${[...ACCEPT_DOC_EXT, ...ACCEPT_CODE_EXT].join(", ")}`,
    []
  );

  // Dropzone accept map (improves file-picker UX + early filtering)
  const acceptMap = useMemo(
    () => ({
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/zip": [".zip"],
    }),
    []
  );

  // Validator enforces extension even when MIME is empty or wrong.
  const extSet = useMemo(
    () => new Set<string>([...ACCEPT_DOC_EXT, ...ACCEPT_CODE_EXT]),
    []
  );

  function extValidator(file: File) {
    const ext = getExt(file.name);
    if (!extSet.has(ext)) {
      return {
        code: "file-invalid-type",
        message: `Not accepted: .${ext || "unknown"} (${acceptHint})`,
      };
    }
    return null;
  }

  const dz = useDropzone({
    multiple: true,
    accept: acceptMap as any,
    validator: extValidator,
    onDrop: (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      // Add accepted files to queue
      if (acceptedFiles.length) {
        setAccepted((prev) => [...prev, ...acceptedFiles]);
      }

      // Add rejected files to rejected list (with detailed reasons)
      if (fileRejections.length) {
        const nextRejected: RejectedItem[] = fileRejections.map((r) => ({
          name: r.file.name,
          type: r.file.type || "(unknown)",
          reason: r.errors.map((e) => e.message).join("; "),
        }));
        setRejected((prev) => [...prev, ...nextRejected]);
      }
    },
  });

  async function runUploadQueue() {
    if (!accepted.length) return;

    setUploading(true);
    setMessages([]);

    const batchResults: UploadResult[] = [];

    try {
      for (const f of accepted) {
        const kind = category(f);

        if (kind === "reject") {
          setRejected((prev) => [
            ...prev,
            { name: f.name, type: f.type || "(unknown)", reason: `Rejected by rules. ${acceptHint}` },
          ]);
          setMessages((prev) => [...prev, `⚠️ ${f.name} rejected (unexpected type)`]);
          continue;
        }

        try {
          if (kind === "doc") {
            const res = await uploadDocument({ moduleId, studentName, file: f });
            setMessages((prev) => [...prev, `✅ ${f.name} → PDF ready (${res.documentId})`]);

            batchResults.push({
              name: f.name,
              documentId: res.documentId,
              kind,
              pdfUrl: res.pdfUrl,        // if your API returns it
              studentName,
              moduleId,
            });
          } else if (kind === "zip") {
            const res = await uploadCodeZip({ moduleId, studentName, file: f });
            setMessages((prev) => [...prev, `✅ ${f.name} → Code PDF ready (${res.documentId})`]);

            batchResults.push({
              name: f.name,
              documentId: res.documentId,
              kind,
              pdfUrl: res.pdfUrl,        // if your API returns it
              studentName,
              moduleId,
            });
          }
        } catch (e: any) {
          setMessages((prev) => [
            ...prev,
            `❌ ${f.name} failed: ${e?.message ?? "unknown error"}`,
          ]);
          // continue to next file
        }
      }

      // Append results once (dedupe by documentId)
      if (batchResults.length) {
        setResults((prev) => {
          const seen = new Set(prev.map((r) => r.documentId));
          const merged = [...prev];
          for (const r of batchResults) {
            if (!seen.has(r.documentId)) merged.push(r);
          }
          return merged;
        });
      }

      // Clear accepted after the whole queue finishes
      setAccepted([]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ padding: 16, height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>Uploads</div>
        <div style={{ opacity: 0.7 }}>Module: {moduleId}</div>

        <input
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          placeholder="student name (optional)"
          style={{ padding: "6px 8px" }}
        />

        <button onClick={runUploadQueue} disabled={uploading || !accepted.length}>
          {uploading ? "Uploading..." : `Upload ${accepted.length} file(s)`}
        </button>

        <button onClick={() => setAccepted([])} disabled={uploading || !accepted.length}>
          Clear queue
        </button>

        <button onClick={() => setRejected([])} disabled={uploading || !rejected.length}>
          Clear rejected
        </button>
      </div>

      <div
        {...dz.getRootProps()}
        style={{
          marginTop: 14,
          border: "2px dashed #ccc",
          borderRadius: 10,
          padding: 18,
          cursor: "pointer",
          background: "#fafafa",
        }}
      >
        <input {...dz.getInputProps()} />
        <div style={{ fontWeight: 600 }}>
          {dz.isDragActive ? "Drop files here…" : "Drag & drop files here, or click to select"}
        </div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>{acceptHint}</div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          PDF/DOC/DOCX = homework docs • ZIP = programming submission → we will generate a PDF
        </div>
      </div>

      {/* Queue + rejected */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minHeight: 160 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Upload queue ({accepted.length})</div>
          {accepted.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No files queued.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {accepted.map((f, idx) => (
                <li key={`${f.name}-${idx}`}>
                  {f.name} <span style={{ opacity: 0.6 }}>({getExt(f.name)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minHeight: 160 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Rejected files ({rejected.length})
          </div>
          {rejected.length === 0 ? (
            <div style={{ opacity: 0.7 }}>None 🎉</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {rejected.map((r, idx) => (
                <li key={`${r.name}-${idx}`}>
                  <b>{r.name}</b> — {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Results (management list) */}
      <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Uploaded documents ({results.length})</div>

        {results.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No uploaded documents yet.</div>
        ) : (
          <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 2fr 1fr",
                gap: 0,
                fontWeight: 700,
                padding: "10px 12px",
                borderBottom: "1px solid #eee",
                background: "#fafafa",
              }}
            >
              <div>File</div>
              <div>Type</div>
              <div>Document ID</div>
              <div>Action</div>
            </div>

            {results.map((r) => (
              <div
                key={r.documentId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 2fr 1fr",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f2f2f2",
                  alignItems: "center",
                }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                <div style={{ opacity: 0.8 }}>{r.kind}</div>
                <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                   <a href={r.pdfUrl} target="_blank" rel="noreferrer">{r.documentId}</a>
                </div>
                <div>
                  <Link to={`/viewer/${r.documentId}?moduleId=${encodeURIComponent(moduleId)}`}>Open Viewer</Link>s
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log */}
      <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Log</div>
        {messages.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No actions yet.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}