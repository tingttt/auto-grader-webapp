import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import Editor from "@monaco-editor/react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString();

type PageData = { pageNumber: number; text: string };

const API = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export default function ViewerPage() {
    const { documentId = "" } = useParams();
    const [search] = useSearchParams();
    const moduleId = search.get("moduleId") || "module-1"; // for now

    const [numPages, setNumPages] = useState(0);
    const [pages, setPages] = useState<PageData[]>([]);
    const [selectedPage, setSelectedPage] = useState(1);
    const [editorValue, setEditorValue] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const pdfScrollRef = useRef<HTMLDivElement | null>(null);
    const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

    // UX controls
    const [showAllPages, setShowAllPages] = useState(true);
    const [scale, setScale] = useState(1.0); // 1.0 = 100%
    const [showLineNumbers, setShowLineNumbers] = useState(false); // those "serial numbers"

    // Construct PDF URL based on your backend storage convention
    const pdfUrl = `${API}/files/pdf/${encodeURIComponent(moduleId)}/${encodeURIComponent(
        documentId
    )}/document.pdf`;

    const selected = useMemo(
        () => pages.find((p) => p.pageNumber === selectedPage),
        [pages, selectedPage]
    );

    useEffect(() => {
        setEditorValue(selected?.text ?? "");
    }, [selected?.text]);

    useEffect(() => {
        if (showAllPages) {
            // slight delay so pages render before scrolling
            const t = setTimeout(() => scrollToPage(selectedPage), 50);
            return () => clearTimeout(t);
        }
    }, [showAllPages, selectedPage, numPages]);
    function onPdfLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    async function runExtractAndLoad() {
        setLoading(true);
        setMsg("");
        try {
            // run extract
            const r1 = await fetch(`${API}/documents/${documentId}/extract`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ moduleId }),
            });
            if (!r1.ok) throw new Error(await r1.text());

            // fetch extracted pages
            const r2 = await fetch(
                `${API}/documents/${documentId}/pages?module_id=${encodeURIComponent(moduleId)}`
            );
            if (!r2.ok) throw new Error(await r2.text());
            const data = await r2.json();

            setPages(data.pages || []);
            setSelectedPage(1);
            setMsg(`✅ Extracted ${data.pages?.length ?? 0} pages`);
        } catch (e: any) {
            setMsg(`❌ ${e?.message ?? "Extraction failed"}`);
        } finally {
            setLoading(false);
        }
    }

    // Helpful range clamp
    function clamp(n: number, min: number, max: number) {
        return Math.max(min, Math.min(max, n));
    }

    function scrollToPage(pageNumber: number) {
        const el = pageRefs.current[pageNumber];
        if (!el) return;

        // Scroll inside the PDF column smoothly
        el.scrollIntoView({
            behavior: "smooth",
            block: "start",
            inline: "nearest",
        });
    }

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            {/* Top bar */}
            <div
                style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #eee",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                }}
            >
                <Link to={`/modules/${moduleId}/uploads`}>← Back</Link>
                <div style={{ fontWeight: 700 }}>Viewer</div>
                <div style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}>
                    {documentId}
                </div>

                <button onClick={runExtractAndLoad} disabled={loading}>
                    {loading ? "Extracting..." : pages.length ? "Re-extract" : "Extract page text"}
                </button>

                {/* Toggle: show all vs selected */}
                <button onClick={() => setShowAllPages((v) => !v)}>
                    {showAllPages ? "Show selected page" : "Show all pages"}
                </button>

                {/* Zoom */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                        onClick={() => setScale((s) => clamp(Number((s - 0.1).toFixed(2)), 0.6, 2.0))}
                    >
                        −
                    </button>
                    <div style={{ width: 60, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(scale * 100)}%
                    </div>
                    <button
                        onClick={() => setScale((s) => clamp(Number((s + 0.1).toFixed(2)), 0.6, 2.0))}
                    >
                        +
                    </button>
                </div>

                {/* Editor line numbers toggle (the “serial number” you asked about) */}
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                        type="checkbox"
                        checked={showLineNumbers}
                        onChange={(e) => setShowLineNumbers(e.target.checked)}
                    />
                    Line numbers
                </label>

                <div style={{ marginLeft: "auto", opacity: 0.8 }}>{msg}</div>
            </div>

            {/* Main area: IMPORTANT minHeight: 0 so scroll works */}
            <div
                style={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    display: "grid",
                    gridTemplateColumns: "240px 1fr 1fr",
                }}
            >
                {/* Sidebar */}
                <div style={{ borderRight: "1px solid #eee", overflow: "auto", minHeight: 0 }}>
                    <div style={{ padding: 10, fontWeight: 700 }}>Pages</div>

                    {pages.length === 0 ? (
                        <div style={{ padding: 10, opacity: 0.7 }}>
                            Click <b>Extract page text</b> to load text for each page.
                        </div>
                    ) : (
                        pages.map((p) => (
                            <div
                                key={p.pageNumber}
                                onClick={() => {
                                    setSelectedPage(p.pageNumber);
                                    // If we are showing all pages, scroll to it
                                    if (showAllPages) scrollToPage(p.pageNumber);
                                }}
                                style={{
                                    padding: "10px 12px",
                                    cursor: "pointer",
                                    background: p.pageNumber === selectedPage ? "#f2f2f2" : "transparent",
                                    borderBottom: "1px solid #f6f6f6",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 8,
                                }}
                            >
                                <span>Page {p.pageNumber}</span>
                                <span style={{ opacity: 0.55, fontSize: 12 }}>
                                    {(p.text?.length ?? 0) > 0 ? "✅" : "—"}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {/* PDF column */}
                <div ref={pdfScrollRef} style={{ overflowY: "auto", minHeight: 0, padding: 12 }}>
                    <Document file={pdfUrl} onLoadSuccess={onPdfLoadSuccess} loading="Loading PDF...">
                        {showAllPages ? (
                            Array.from({ length: numPages }, (_, i) => (
                                <div
                                    key={i + 1}
                                    ref={(node) => {
                                        pageRefs.current[i + 1] = node;
                                    }}
                                    style={{
                                        marginBottom: 18,
                                        padding: 10,
                                        border: i + 1 === selectedPage ? "2px solid #ddd" : "1px solid #eee",
                                        borderRadius: 10,
                                        background: "#fff",
                                        cursor: "pointer",
                                    }}
                                    onClick={() => setSelectedPage(i + 1)}
                                >
                                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                                        Page {i + 1}
                                    </div>
                                    <Page pageNumber={i + 1} scale={scale} />
                                </div>
                            ))
                        ) : (
                            <div
                                style={{
                                    padding: 10,
                                    border: "1px solid #eee",
                                    borderRadius: 10,
                                    background: "#fff",
                                }}
                            >
                                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                                    Page {selectedPage}
                                </div>
                                <Page pageNumber={selectedPage} scale={scale} />
                            </div>
                        )}
                    </Document>
                </div>

                {/* Editor column */}
                <div
                    style={{
                        borderLeft: "1px solid #eee",
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                    }}
                >
                    <div style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                        <div style={{ fontWeight: 700 }}>Extracted text (editable)</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Selected page: {selectedPage}</div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                            The “serial numbers” are editor <b>line numbers</b>. You can toggle them above.
                        </div>
                    </div>

                    <div style={{ flex: "1 1 auto", minHeight: 0 }}>
                        <Editor
                            height="100%"
                            defaultLanguage="markdown"
                            value={editorValue}
                            onChange={(v) => setEditorValue(v ?? "")}
                            options={{
                                wordWrap: "on",
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineNumbers: showLineNumbers ? "on" : "off",
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}