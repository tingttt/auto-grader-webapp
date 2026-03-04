import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body

from .extract_pdf import extract_pages
import json
from .index_store import add_document, list_by_module, get_by_id, delete_document, now_iso, update_status
from .code_zip import unzip_to_dir, iter_flat_files, generate_concat_pdf

DATA_DIR = Path(os.getenv("DATA_DIR", "/data")).resolve()
INDEX_PATH = DATA_DIR / "index.json"
UPLOADS_DIR = DATA_DIR / "uploads"
PDF_DIR = DATA_DIR / "pdf"

EXTRACT_DIR = DATA_DIR / "extract"
EXTRACT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {".pdf", ".docx", ".doc"}

app = FastAPI(title="Auto Grader Backend", version="0.1.0")


# Allow your React dev server to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve PDFs as static files
PDF_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(DATA_DIR)), name="files")


@app.get("/health")
def health():
    return {"ok": True}


def _save_upload(file: UploadFile, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)


def _convert_word_to_pdf(input_path: Path, output_dir: Path) -> Path:
    """
    Uses LibreOffice (soffice) headless to convert doc/docx -> pdf.
    Returns the path to the generated PDF.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # LibreOffice command
    # --headless: no UI
    # --convert-to pdf: convert
    # --outdir: output directory
    cmd = [
        "soffice",
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        str(output_dir),
        str(input_path),
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="LibreOffice (soffice) not found in container.")
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Word->PDF conversion failed: {e.stderr or e.stdout or 'unknown error'}",
        )

    # LibreOffice outputs with same stem name but .pdf
    expected_pdf = output_dir / f"{input_path.stem}.pdf"
    if not expected_pdf.exists():
        # Sometimes LO outputs slightly different naming; try to find newest pdf
        pdfs = sorted(output_dir.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not pdfs:
            raise HTTPException(status_code=500, detail="Conversion finished but no PDF was produced.")
        return pdfs[0]

    return expected_pdf


@app.post("/upload")
def upload_document(
    module_id: str = Form(...),
    student_name: str = Form(""),
    file: UploadFile = File(...),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Use PDF/DOCX/DOC.")

    doc_id = str(uuid4())
    module_safe = module_id.replace("/", "_").replace("\\", "_").strip() or "unknown"

    # Save original
    original_path = UPLOADS_DIR / module_safe / doc_id / f"original{ext}"
    _save_upload(file, original_path)

    # Convert if needed
    if ext == ".pdf":
        pdf_path = PDF_DIR / module_safe / doc_id / "document.pdf"
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original_path, pdf_path)
    else:
        outdir = PDF_DIR / module_safe / doc_id
        converted_pdf = _convert_word_to_pdf(original_path, outdir)
        pdf_path = outdir / "document.pdf"
        # normalize name
        shutil.copyfile(converted_pdf, pdf_path)

    # Return a URL your React app can load
    pdf_url = f"http://localhost:8000/files/pdf/{module_safe}/{doc_id}/document.pdf"

    doc_record = {
    "documentId": doc_id,
    "moduleId": module_id,
    "studentName": student_name,
    "originalFilename": file.filename,
    "sourceType": "doc",  # includes pdf/doc/docx in your current logic
    "createdAt": now_iso(),
    "pdfUrl": pdf_url,
    "paths": {
        "original": str(original_path),
        "pdf": str(pdf_path),
    },
    "status": {"converted": True, "extracted": False},
    }
    add_document(INDEX_PATH, doc_record)


    return {
        "documentId": doc_id,
        "moduleId": module_id,
        "studentName": student_name,
        "pdfUrl": pdf_url,
        "stored": {
            "original": str(original_path),
            "pdf": str(pdf_path),
        },
    }

@app.post("/upload-code-zip")
def upload_code_zip(
    module_id: str = Form(...),
    student_name: str = Form(""),
    file: UploadFile = File(...),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext != ".zip":
        raise HTTPException(status_code=400, detail="Only .zip is supported for code submissions.")

    doc_id = str(uuid4())
    module_safe = module_id.replace("/", "_").replace("\\", "_").strip() or "unknown"

    # Save zip
    zip_path = UPLOADS_DIR / module_safe / doc_id / "submission.zip"
    _save_upload(file, zip_path)

    # Unzip
    extract_dir = UPLOADS_DIR / module_safe / doc_id / "unzipped"
    unzip_to_dir(zip_path, extract_dir)

    # Flatten + generate pdf
    files = sorted(list(iter_flat_files(extract_dir)))
    
    pdf_out_dir = PDF_DIR / module_safe / doc_id
    pdf_out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = pdf_out_dir / "document.pdf"

    title = Path(file.filename or "submission.zip").stem
    generate_concat_pdf(files=files, base_root=extract_dir, pdf_path=pdf_path, title=title)

    pdf_url = f"http://localhost:8000/files/pdf/{module_safe}/{doc_id}/document.pdf"
    
    doc_record = {
        "documentId": doc_id,
        "moduleId": module_id,
        "studentName": student_name,
        "originalFilename": file.filename,
        "sourceType": "zip",
        "createdAt": now_iso(),
        "pdfUrl": pdf_url,
        "paths": {
            "original": str(zip_path),
            "pdf": str(pdf_path),
        },
        "status": {"converted": True, "extracted": False},
        "extra": {"fileCount": len(files)},
    }
    add_document(INDEX_PATH, doc_record)

    return {
        "documentId": doc_id,
        "moduleId": module_id,
        "studentName": student_name,
        "pdfUrl": pdf_url,
        "type": "code_zip",
    }

@app.post("/documents/{document_id}/extract")
def extract_document(document_id: str, payload: dict = Body(...)):
    """
    payload: { "moduleId": "module-1" }
    Extract per-page text and store JSON under /data/extract/<module>/<documentId>.json
    """
    module_id = payload.get("moduleId")
    if not module_id:
        raise HTTPException(status_code=400, detail="moduleId is required")

    module_safe = module_id.replace("/", "_").replace("\\", "_").strip() or "unknown"
    pdf_path = PDF_DIR / module_safe / document_id / "document.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF not found for documentId={document_id}")

    pages = extract_pages(pdf_path)

    out_path = EXTRACT_DIR / module_safe
    out_path.mkdir(parents=True, exist_ok=True)
    json_path = out_path / f"{document_id}.json"

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "documentId": document_id,
                "moduleId": module_id,
                "pages": [{"pageNumber": p.pageNumber, "text": p.text} for p in pages],
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    update_status(INDEX_PATH, document_id, {"extracted": True})
    return {
        "documentId": document_id,
        "moduleId": module_id,
        "pageCount": len(pages),
        "savedTo": str(json_path),
    }


@app.get("/documents/{document_id}/pages")
def get_extracted_pages(document_id: str, module_id: str):
    """
    module_id passed as query param for now:
    /documents/<id>/pages?module_id=module-1
    """
    module_safe = module_id.replace("/", "_").replace("\\", "_").strip() or "unknown"
    json_path = EXTRACT_DIR / module_safe / f"{document_id}.json"
    if not json_path.exists():
        raise HTTPException(status_code=404, detail="No extraction found. Run /extract first.")

    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    return data

@app.get("/modules/{module_id}/documents")
def list_documents(module_id: str):
    docs = list_by_module(INDEX_PATH, module_id)
    return {"moduleId": module_id, "documents": docs}


@app.get("/documents/{document_id}")
def get_document(document_id: str):
    doc = get_by_id(INDEX_PATH, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@app.delete("/documents/{document_id}")
def delete_document_api(document_id: str):
    doc = delete_document(INDEX_PATH, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Optional: delete files on disk (safe best-effort)
    try:
        import shutil
        paths = doc.get("paths") or {}
        pdf_path = paths.get("pdf")
        orig_path = paths.get("original")
        # delete document folder if possible
        if pdf_path:
            shutil.rmtree(Path(pdf_path).parent, ignore_errors=True)
        if orig_path:
            shutil.rmtree(Path(orig_path).parent, ignore_errors=True)
    except Exception:
        pass

    return {"deleted": True, "documentId": document_id}