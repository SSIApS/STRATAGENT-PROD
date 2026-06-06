"""
STRATAGENT -- Output Engine Router
Graduated document generation based on Convergence Index.
Path A: CONVERGENCE PROPOSAL (90-100)
Path B: MUTUAL VALUE BRIEF (75-89)
Path C: FIRST SIGNAL (60-74)
Below 60: Honest Gate
"""
import io
import os
import re
from datetime import date
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.output_agent import (
    generate_convergence_proposal,
    generate_mutual_value_brief,
    generate_first_signal,
)

router = APIRouter()

# Standard (light bg) logo for Word documents
_LOGO_PATH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", "Marketing", "Logos", "Stratagent_Orange_Standard.png"
))

DIVIDER = "-" * 70


# ---------------------------------------------------------------------------
# Footer stripping
# ---------------------------------------------------------------------------

_SSI_FOOTER_RE = re.compile(
    r'\n{0,3}(?:-{3,}\n+)?Jason L\. Smith[^\n]*\n(?:[^\n]+\n){0,5}[^\n]*STRATAGENT[^\n]*\.?',
    re.IGNORECASE,
)

def _strip_ssi_footer(text: str) -> str:
    """Remove all SSI footer blocks Gemini auto-appends from its system prompt."""
    text = _SSI_FOOTER_RE.sub('', text)
    # Remove any dangling --- dividers left at the end
    text = re.sub(r'\n+---+\s*$', '', text)
    return text.strip()


def _clean_output_text(text: str) -> str:
    """Strip footers and known Gemini placeholder artifacts."""
    if not text:
        return text
    text = _strip_ssi_footer(text)
    # Replace sender placeholder Gemini sometimes inserts
    text = re.sub(r'\[Your Name[^\]]*\]', 'Jason L. Smith | SSI ApS', text)
    # Replace date placeholder
    text = text.replace('[Current Date]', date.today().strftime('%d %B %Y'))
    return text.strip()


# ---------------------------------------------------------------------------
# Markdown → docx renderer
# ---------------------------------------------------------------------------

def _render_markdown(doc, text: str):
    """
    Parse lightweight markdown and add properly formatted content to a Word doc.
    Handles: ## H2, ### H3, #### H4, **bold**, * bullets, --- (skipped), plain text.
    """
    try:
        from docx.shared import Pt, RGBColor, Inches
    except ImportError:
        doc.add_paragraph(text)
        return

    ORANGE = RGBColor(0xE8, 0x7A, 0x00)

    def parse_inline(para, content: str):
        """Render **bold** spans as bold runs; everything else as normal."""
        parts = re.split(r'(\*\*[^*\n]+\*\*)', content)
        for part in parts:
            if part.startswith('**') and part.endswith('**'):
                run = para.add_run(part[2:-2])
                run.bold = True
            elif part:
                para.add_run(part)

    for line in text.splitlines():
        stripped = line.strip()

        # Blank lines and horizontal rules — skip (Word handles spacing)
        if not stripped or re.match(r'^[-*_]{3,}$', stripped):
            continue

        # H2  ##
        if stripped.startswith('## '):
            p = doc.add_paragraph()
            r = p.add_run(stripped[3:].strip())
            r.bold = True
            r.font.size = Pt(13)
            r.font.color.rgb = ORANGE
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)

        # H3  ###
        elif stripped.startswith('### '):
            p = doc.add_paragraph()
            r = p.add_run(stripped[4:].strip())
            r.bold = True
            r.font.size = Pt(11)
            r.font.color.rgb = ORANGE
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(3)

        # H4  ####
        elif stripped.startswith('#### '):
            p = doc.add_paragraph()
            r = p.add_run(stripped[5:].strip())
            r.bold = True
            r.font.size = Pt(10)
            r.font.color.rgb = ORANGE
            p.paragraph_format.space_before = Pt(6)

        # Bullet  * or -  (any indent depth)
        elif re.match(r'^\s{0,8}[\*\-]\s', line):
            indent_chars = len(line) - len(line.lstrip())
            depth = 1 if indent_chars >= 4 else 0
            content = re.sub(r'^\s*[\*\-]\s+', '', line)
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3 + depth * 0.22)
            p.paragraph_format.first_line_indent = Inches(-0.18)
            p.paragraph_format.space_after = Pt(2)
            p.add_run('• ')          # bullet character
            parse_inline(p, content)

        # Normal paragraph
        else:
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(5)
            parse_inline(p, stripped)


# ---------------------------------------------------------------------------
# Docx builder
# ---------------------------------------------------------------------------

def _build_docx(label, company_name, supplier_name, convergence_index, output):
    """Build a branded .docx from generated output, with proper markdown rendering."""
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor, Inches
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")

    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1.2)
        section.right_margin = Inches(1.2)

    ORANGE = RGBColor(0xE8, 0x7A, 0x00)

    # Logo
    if os.path.exists(_LOGO_PATH):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.add_run().add_picture(_LOGO_PATH, width=Inches(2.2))

    doc.add_paragraph()

    # Document title
    heading = doc.add_paragraph()
    heading.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = heading.add_run(label)
    run.bold = True
    run.font.size = Pt(20)
    run.font.color.rgb = ORANGE

    doc.add_paragraph()

    # Cover metadata
    for bold_label, value in [
        ("Prospect:", company_name),
        ("Supplier:", supplier_name),
        ("Singularity Density:", f"{convergence_index}/100"),
        ("Date:", date.today().strftime('%d %B %Y')),
        ("Prepared by:", "Jason L. Smith | Strategic Sales International ApS"),
    ]:
        m = doc.add_paragraph()
        m.add_run(bold_label + " ").bold = True
        val_run = m.add_run(value)
        if bold_label == "Singularity Density:":
            val_run.font.color.rgb = ORANGE

    doc.add_paragraph(DIVIDER)

    def add_section(title: str, body: str):
        """Add a labelled section with proper markdown rendering."""
        doc.add_paragraph()
        h = doc.add_paragraph()
        r = h.add_run(title.upper())
        r.bold = True
        r.font.size = Pt(11)
        r.font.color.rgb = ORANGE
        _render_markdown(doc, _clean_output_text(body))

    # Sections
    if output.get("email"):
        add_section("Outreach Email", output["email"])

    if output.get("brief"):
        add_section("Value Brief", output["brief"])

    if output.get("proposal"):
        add_section("Technical Proposal", output["proposal"])

    if output.get("engagement_brief"):
        add_section("Engagement Brief / RFQ Framework", output["engagement_brief"])

    if output.get("qualifying_questions"):
        qs = output["qualifying_questions"]
        doc.add_paragraph()
        h = doc.add_paragraph()
        r = h.add_run("QUALIFYING QUESTIONS")
        r.bold = True
        r.font.size = Pt(11)
        r.font.color.rgb = ORANGE
        for i, q in enumerate(qs, 1):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.1)
            p.paragraph_format.space_after = Pt(4)
            p.add_run(f"{i}. ").bold = True
            p.add_run(str(q))

    # Footer
    doc.add_paragraph()
    doc.add_paragraph(DIVIDER)
    footer_p = doc.add_paragraph()
    footer_r = footer_p.add_run(
        "Jason L. Smith | Strategic Sales International ApS\n"
        "info@strategic.dk | www.strategic-dk.com | +45 24 99 23 93\n"
        "CVR: 41945621 | Roskilde, Denmark\n"
        "STRATAGENT -- The Intelligence Behind Agentic Sales."
    )
    footer_r.font.size = Pt(9)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    profile_id: str


class ExportRequest(BaseModel):
    profile_id: str
    label: str
    company_name: str
    convergence_index: int
    supplier_name: str
    output: Dict[str, Any]


@router.post("/generate")
async def generate_output(
    payload: GenerateRequest,
    x_session_id: str = Header(...),
):
    """Generate the appropriate output based on Singularity Density score."""
    await check_and_increment(x_session_id)

    profile_doc = db.get_relationship_profile(payload.profile_id)
    if not profile_doc:
        raise HTTPException(status_code=404, detail="Relationship Profile not found")

    kb = db.get_knowledge_base(profile_doc["supplier_id"])
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    score = profile_doc.get("convergence_index", 0)
    profile = profile_doc.get("profile", {})

    if score < 60:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "Singularity Density too low to approach credibly. "
                    "Park this opportunity or find a better prospect."
                ),
                "convergence_index": score,
                "minimum_required": 60,
            }
        )

    try:
        if score >= 90:
            output = await generate_convergence_proposal(profile, kb)
            path = "A"
            label = "CONVERGENCE PROPOSAL"
        elif score >= 75:
            output = await generate_mutual_value_brief(profile, kb)
            path = "B"
            label = "MUTUAL VALUE BRIEF"
        else:
            output = await generate_first_signal(profile, kb)
            path = "C"
            label = "FIRST SIGNAL"
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini output generation failed: {type(e).__name__}: {e}"
        )

    # Strip SSI footers and placeholders from ALL text fields
    for field in ("email", "brief", "proposal", "engagement_brief"):
        if field in output and output[field]:
            output[field] = _clean_output_text(output[field])

    db.record_outcome({
        "supplier_id": profile_doc["supplier_id"],
        "profile_id": payload.profile_id,
        "company_name": profile_doc["company_name"],
        "convergence_index": score,
        "output_path": path,
        "output_label": label,
        "status": "generated",
    })

    return {
        "path": path,
        "label": label,
        "convergence_index": score,
        "company_name": profile_doc["company_name"],
        "output": output,
    }


@router.post("/export")
async def export_output(
    payload: ExportRequest,
    x_session_id: str = Header(...),
):
    """Export the current output as a branded .docx file."""
    try:
        docx_bytes = _build_docx(
            label=payload.label,
            company_name=payload.company_name,
            supplier_name=payload.supplier_name,
            convergence_index=payload.convergence_index,
            output=payload.output,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    safe = "".join(c for c in payload.company_name if c.isalnum() or c in " _-")
    safe = safe.strip().replace(" ", "_")
    label_safe = payload.label.replace(" ", "_")
    filename = "STRATAGENT_" + safe + "_" + label_safe + ".docx"
    mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type=mimetype,
        headers={"Content-Disposition": 'attachment; filename="' + filename + '"'},
    )
