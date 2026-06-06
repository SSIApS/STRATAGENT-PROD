"""
STRATAGENT -- Supplier Reports Router
Three endpoints:
  POST /api/supplier-reports/{id}/qa         -- Q&A against KB
  GET  /api/supplier-reports/{id}/audit      -- Intelligence Audit Report
  GET  /api/supplier-reports/{id}/synthesis  -- Capability Synthesis Report
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.supplier_report_agent import (
    answer_question,
    generate_audit_report,
    generate_synthesis_report,
)

router = APIRouter()


class QARequest(BaseModel):
    question: str


class BrandingOverride(BaseModel):
    prepared_by: str | None = None
    ssi_name: str | None = None
    ssi_email: str | None = None
    ssi_phone: str | None = None
    ssi_web: str | None = None


@router.post("/{supplier_id}/qa")
async def kb_qa(
    supplier_id: str,
    payload: QARequest,
    x_session_id: str = Header(...),
):
    """Answer a question grounded in a specific supplier KB."""
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    result = await answer_question(payload.question.strip(), kb)
    return result


@router.get("/{supplier_id}/audit")
async def kb_audit(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """Generate a structured Intelligence Audit Report for the supplier KB."""
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    report = await generate_audit_report(kb)
    return report


@router.get("/{supplier_id}/synthesis")
async def kb_synthesis(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """
    Generate a branded Capability Intelligence Report for the supplier.
    Returns structured JSON ready for rendering as HTML or Word doc.
    """
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    report = await generate_synthesis_report(kb)
    return report
