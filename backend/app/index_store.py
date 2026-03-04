from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"documents": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        # if corrupted, don't crash the server
        return {"documents": []}

def _write_json_atomic(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def load_index(index_path: Path) -> Dict[str, Any]:
    return _read_json(index_path)

def add_document(index_path: Path, doc: Dict[str, Any]) -> Dict[str, Any]:
    data = _read_json(index_path)
    docs: List[Dict[str, Any]] = data.get("documents", [])

    # Dedup by documentId
    docs = [d for d in docs if d.get("documentId") != doc.get("documentId")]
    docs.append(doc)

    # Sort newest first
    docs.sort(key=lambda d: d.get("createdAt", ""), reverse=True)

    data["documents"] = docs
    _write_json_atomic(index_path, data)
    return doc

def list_by_module(index_path: Path, module_id: str) -> List[Dict[str, Any]]:
    data = _read_json(index_path)
    docs: List[Dict[str, Any]] = data.get("documents", [])
    return [d for d in docs if d.get("moduleId") == module_id]

def get_by_id(index_path: Path, document_id: str) -> Optional[Dict[str, Any]]:
    data = _read_json(index_path)
    for d in data.get("documents", []):
        if d.get("documentId") == document_id:
            return d
    return None

def update_status(index_path: Path, document_id: str, status_patch: Dict[str, Any]) -> None:
    data = _read_json(index_path)
    updated = False
    for d in data.get("documents", []):
        if d.get("documentId") == document_id:
            status = d.get("status") or {}
            status.update(status_patch)
            d["status"] = status
            updated = True
            break
    if updated:
        _write_json_atomic(index_path, data)

def delete_document(index_path: Path, document_id: str) -> Optional[Dict[str, Any]]:
    data = _read_json(index_path)
    docs: List[Dict[str, Any]] = data.get("documents", [])
    target = None
    new_docs = []
    for d in docs:
        if d.get("documentId") == document_id:
            target = d
        else:
            new_docs.append(d)
    if target:
        data["documents"] = new_docs
        _write_json_atomic(index_path, data)
    return target