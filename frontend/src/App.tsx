import { useEffect, useMemo, useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { Document, Page, pdfjs } from "react-pdf";
import Editor from "@monaco-editor/react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";


pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type PageData = {
  pageNumber: number;
  extractedText: string;
};

const mockPages: PageData[] = Array.from({ length: 6 }).map((_, i) => ({
  pageNumber: i + 1,
  extractedText: `Page ${i + 1} extracted text...\n\n(Backend will fill this per-page.)`,
}));

export default function App() {
  const [pdfUrl] = useState("/sample.pdf");
  const [numPages, setNumPages] = useState<number>(0);
  const [pages, setPages] = useState<PageData[]>(mockPages);
  const [selectedPage, setSelectedPage] = useState<number>(1);

  const selected = useMemo(
    () => pages.find((p) => p.pageNumber === selectedPage),
    [pages, selectedPage]
  );

  const [editorValue, setEditorValue] = useState<string>("");

  // when page changes, load that page text into editor
  useEffect(() => {
    setEditorValue(selected?.extractedText ?? "");
  }, [selected?.extractedText]);

  function onPdfLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);

    // In real app, you'd fetch extracted pages from backend.
    // Here we ensure mock matches PDF page count if different.
    setPages((prev) => {
      if (prev.length === numPages) return prev;
      return Array.from({ length: numPages }).map((_, i) => ({
        pageNumber: i + 1,
        extractedText: `Page ${i + 1} extracted text...\n\n(Backend will fill this per-page.)`,
      }));
    });
  }

  // save edits back to state (later we will POST to backend)
  function saveEditorToPage() {
    setPages((prev) =>
      prev.map((p) =>
        p.pageNumber === selectedPage ? { ...p, extractedText: editorValue } : p
      )
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #ddd",
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 700 }}>Auto Grader — PDF Preview + Extraction</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Selected page: {selectedPage}/{numPages || "?"}
          </div>
          <button onClick={saveEditorToPage}>Save text</button>
        </div>
      </div>

      {/* Main */}
      <Group orientation="horizontal" style={{ flex: 1 }}>
        {/* Left: Page list */}
        <Panel defaultSize={18} minSize={12}>
          <div style={{ height: "100%", borderRight: "1px solid #eee" }}>
            <div style={{ padding: 10, fontWeight: 600 }}>Pages</div>
            <div style={{ overflow: "auto", height: "calc(100% - 40px)" }}>
              {pages.map((p) => (
                <div
                  key={p.pageNumber}
                  onClick={() => setSelectedPage(p.pageNumber)}
                  style={{
                    cursor: "pointer",
                    padding: "10px 12px",
                    background:
                      p.pageNumber === selectedPage ? "#f2f2f2" : "transparent",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  Page {p.pageNumber}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Separator style={{ width: 6, background: "#f0f0f0" }} />

        {/* Middle: PDF preview */}
        <Panel defaultSize={42} minSize={25}>
          <div style={{ height: "100%", overflow: "auto", padding: 12 }}>
            <Document file={pdfUrl} onLoadSuccess={onPdfLoadSuccess}>
              {Array.from({ length: numPages }, (_, idx) => {
                const pageNumber = idx + 1;
                const isSelected = pageNumber === selectedPage;
                return (
                  <div
                    key={pageNumber}
                    style={{
                      marginBottom: 16,
                      padding: 8,
                      border: isSelected ? "2px solid #333" : "1px solid #ddd",
                      borderRadius: 8,
                    }}
                    onClick={() => setSelectedPage(pageNumber)}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                      Page {pageNumber}
                    </div>
                    <Page pageNumber={pageNumber} width={520} />
                  </div>
                );
              })}
            </Document>
          </div>
        </Panel>

        <Separator style={{ width: 6, background: "#f0f0f0" }} />

        {/* Right: Extracted text editor */}
        <Panel defaultSize={40} minSize={25}>
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 10, borderBottom: "1px solid #eee" }}>
              <div style={{ fontWeight: 600 }}>Extracted text (editable)</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Later: this comes from backend per page
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <Editor
                height="100%"
                defaultLanguage="markdown"
                value={editorValue}
                onChange={(v) => setEditorValue(v ?? "")}
                options={{
                  wordWrap: "on",
                  minimap: { enabled: false },
                  fontSize: 13,
                }}
              />
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}