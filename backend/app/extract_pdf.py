from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import fitz  # PyMuPDF


@dataclass
class PageText:
    pageNumber: int
    text: str


def extract_pages(pdf_path: Path) -> list[PageText]:
    doc = fitz.open(str(pdf_path))
    pages: list[PageText] = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        text = page.get_text("text") or ""
        pages.append(PageText(pageNumber=i + 1, text=text.strip()))
    doc.close()
    return pages