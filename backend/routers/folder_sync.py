"""
STRATAGENT — Folder Sync Router
Scans local Suppliers/ and Products/ folders for files dropped offline,
ingests PDFs and images into the matching Knowledge Base.

Subfolder -> Intelligence category mapping:
  Case Studies   -> case_studies, reference_projects
  Certifications -> certifications
  Product        -> product_catalogue, technical_datasheets
  Prospects      -> skipped (Field Intelligence data, not KB)
  Campaigns      -> competitive_positioning
  Markets        -> operational_context
"""
import os
import base64
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from config import LOCAL_SUPPLIERS_ROOT, LOCAL_PRODUCTS_ROOT
from services import firestore as db
from agents.extraction_agent import extract_from_pdf, score_intelligence_depth

router = APIRouter()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
PDF_EXTENSION = ".pdf"

SUBFOLDER_FOCUS_MAP = {
    "case studies": "case_studies",
    "certifications": "certifications",
    "product": "product_catalogue",
    "campaigns": "competitive_positioning",
    "markets": "operational_context",
}


def _get_all_supplier_folders(root: str) -> list[dict]:
    """List all company folders under root."""
    result = []
    try:
        for name in sorted(os.listdir(root)):
            full_path = os.path.join(root, name)
            if os.path.isdir(full_path) and not name.startswith("."):
                result.append({"name": name, "path": full_path})
    except FileNotFoundError:
        pass
    return result


def _list_files_in_folder(folder_path: str) -> list[dict]:
    """Walk a supplier folder and return all ingestable files with their subfolder context."""
    files = []
    try:
        for subfolder in os.listdir(folder_path):
            sub_path = os.path.join(folder_path, subfolder)
            if not os.path.isdir(sub_path):
                continue
            if subfolder.lower() == "prospects":
                continue  # Prospects are Field Intelligence data, not KB
            focus = SUBFOLDER_FOCUS_MAP.get(subfolder.lower(), "")
            for fname in os.listdir(sub_path):
                fpath = os.path.join(sub_path, fname)
                if not os.path.isfile(fpath):
                    continue
                ext = Path(fname).suffix.lower()
                if ext == PDF_EXTENSION or ext in IMAGE_EXTENSIONS:
                    files.append({
                        "path": fpath,
                        "filename": fname,
                        "subfolder": subfolder,
                        "focus_element": focus,
                        "type": "pdf" if ext == PDF_EXTENSION else "image",
                    })
    except FileNotFoundError:
        pass
    return files


@router.get("/discover")
async def discover_unregistered_folders():
    """
    Scan both Suppliers/ and Products/ for folders that don't yet have a KB.
    Returns a list of folder names ready to onboard.
    """
    existing_kbs = db.list_knowledge_bases()
    registered_names = {kb.get("company_name", "").lower() for kb in existing_kbs}

    unregistered = []
    for root, category in [(LOCAL_SUPPLIERS_ROOT, "supplier"), (LOCAL_PRODUCTS_ROOT, "product")]:
        for folder in _get_all_supplier_folders(root):
            if folder["name"].lower() not in registered_names:
                files = _list_files_in_folder(folder["path"])
                unregistered.append({
                    "name": folder["name"],
                    "category": category,
                    "path": folder["path"],
                    "files_available": len(files),
                    "pdfs": sum(1 for f in files if f["type"] == "pdf"),
                    "images": sum(1 for f in files if f["type"] == "image"),
                })

    return {"unregistered": unregistered, "count": len(unregistered)}


@router.post("/{supplier_id}/sync")
async def sync_local_folder(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """
    Sync files from the local folder matching this supplier's company_name.
    Scans Suppliers/{company_name}/ and Products/{company_name}/ for new PDFs and images.
    Skips files already recorded in the KB documents list.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    company_name = kb.get("company_name", "")
    already_ingested = set(kb.get("documents", []))

    # Find the matching local folder
    folder_path = None
    for root in [LOCAL_SUPPLIERS_ROOT, LOCAL_PRODUCTS_ROOT]:
        candidate = os.path.join(root, company_name)
        if os.path.isdir(candidate):
            folder_path = candidate
            break
        # Try case-insensitive match
        try:
            for entry in os.listdir(root):
                if entry.lower() == company_name.lower() and os.path.isdir(os.path.join(root, entry)):
                    folder_path = os.path.join(root, entry)
                    break
        except FileNotFoundError:
            pass
        if folder_path:
            break

    if not folder_path:
        return {
            "status": "no_folder",
            "message": f"No local folder found for '{company_name}'. Create Suppliers/{company_name}/ to use folder sync.",
            "ingested": [],
            "skipped": 0,
        }

    files = _list_files_in_folder(folder_path)
    new_files = [f for f in files if f["filename"] not in already_ingested]

    if not new_files:
        return {
            "status": "up_to_date",
            "message": f"All {len(files)} file(s) in {company_name} folder already ingested.",
            "ingested": [],
            "skipped": len(files),
        }

    profile = kb.get("profile", {})
    ingested = []
    errors = []

    for file_info in new_files:
        try:
            if file_info["type"] == "pdf":
                with open(file_info["path"], "rb") as f:
                    content = f.read()
                extracted = await extract_from_pdf(content, company_name)
                # Merge with focus element context
                focus = file_info.get("focus_element", "")
                for key, value in extracted.items():
                    if not value:
                        continue
                    if focus and key == focus:
                        # Prioritise focused content
                        profile[key] = (profile.get(key, "") + "\n\n" + value).strip()
                    elif not profile.get(key):
                        profile[key] = value
                    else:
                        profile[key] = profile[key] + "\n\n" + value
                ingested.append({"file": file_info["filename"], "type": "pdf", "subfolder": file_info["subfolder"]})

            elif file_info["type"] == "image":
                with open(file_info["path"], "rb") as f:
                    content = f.read()
                ext = Path(file_info["filename"]).suffix.lower()
                content_type_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                                    ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}
                content_type = content_type_map.get(ext, "image/jpeg")
                image_id = str(uuid.uuid4())
                product_name = Path(file_info["filename"]).stem  # filename without extension
                db.save_product_image(image_id, {
                    "image_id": image_id,
                    "supplier_id": supplier_id,
                    "product_name": product_name,
                    "brand": company_name,
                    "tags": file_info["subfolder"],
                    "filename": file_info["filename"],
                    "content_type": content_type,
                    "data": base64.b64encode(content).decode("utf-8"),
                    "source": "folder_sync",
                })
                ingested.append({"file": file_info["filename"], "type": "image", "subfolder": file_info["subfolder"]})

        except Exception as e:
            errors.append({"file": file_info["filename"], "error": str(e)})

    # Recalculate scores and save
    scores = score_intelligence_depth(profile)
    total = sum(scores.values())
    db.save_knowledge_base(supplier_id, {
        "profile": profile,
        "intelligence_depth": {"scores": scores, "total": total},
        "documents": list(already_ingested) + [f["filename"] for f in ingested],
    })

    return {
        "status": "synced",
        "folder": folder_path,
        "ingested": ingested,
        "ingested_count": len(ingested),
        "skipped": len(files) - len(new_files),
        "errors": errors,
        "intelligence_depth": {"scores": scores, "total": total},
    }
