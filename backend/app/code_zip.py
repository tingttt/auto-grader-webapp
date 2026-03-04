from __future__ import annotations
from pathlib import Path
from zipfile import ZipFile
import os

from charset_normalizer import from_bytes
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


TEXT_EXTS = {
    ".txt", ".md", ".java", ".py", ".js", ".ts", ".tsx", ".jsx",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".php",
    ".html", ".css", ".json", ".yml", ".yaml", ".xml", ".sql",
    ".gradle", ".sh", ".bat", ".ps1",
}

SKIP_DIRS = {"node_modules", ".git", "__pycache__", "dist", "build", ".idea", ".vscode"}
SKIP_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".class", ".jar", ".exe", ".dll"}


def unzip_to_dir(zip_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_dir = out_dir.resolve()

    with ZipFile(zip_path, "r") as z:
        for info in z.infolist():
            # skip directories
            if info.is_dir():
                continue

            dest = (out_dir / info.filename).resolve()

            # ZipSlip protection
            if not str(dest).startswith(str(out_dir)):
                continue

            dest.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(dest, "wb") as dst:
                dst.write(src.read())


def iter_flat_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            yield p

MAX_FILE_BYTES = 2_000_000  # 2MB

def read_text_file(p: Path) -> str:
    if p.stat().st_size > MAX_FILE_BYTES:
        return "<<Skipped: file too large>>"
    raw = p.read_bytes()
    guess = from_bytes(raw).best()
    if guess is None:
        return raw.decode("utf-8", errors="replace")
    return str(guess)


def generate_concat_pdf(files: list[Path], base_root: Path, pdf_path: Path, title: str) -> None:
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    width, height = letter
    margin = 50
    y = height - margin

    def new_page():
        nonlocal y
        c.showPage()
        y = height - margin

    def draw_line(line: str, indent: int = 0):
        nonlocal y
        # basic line wrapping
        max_chars = 95 - indent
        chunks = [line[i:i+max_chars] for i in range(0, len(line), max_chars)] or [""]
        for ch in chunks:
            if y < margin:
                new_page()
            c.drawString(margin + indent * 10, y, ch)
            y -= 12

    # Title page
    c.setFont("Helvetica-Bold", 14)
    c.drawString(margin, y, f"Code Submission: {title}")
    y -= 24
    c.setFont("Helvetica", 10)
    c.drawString(margin, y, "Concatenated source files (generated from ZIP).")
    y -= 24
    new_page()

    for p in files:
        rel = str(p.relative_to(base_root))
        ext = p.suffix.lower()

        if ext in SKIP_EXTS:
            continue
        if ext not in TEXT_EXTS and ext != "":
            continue

        try:
            content = read_text_file(p)
        except Exception as e:
            content = f"<<Failed to read file: {e}>>"

        c.setFont("Helvetica-Bold", 12)
        draw_line(f"FILE: {rel}")
        c.setFont("Helvetica", 9)
        draw_line("-" * 80)
        for line in content.splitlines():
            draw_line(line, indent=0)
        draw_line("")
        new_page()

    c.save()