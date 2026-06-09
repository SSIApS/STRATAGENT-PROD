"""
STRATAGENT -- Output Engine Router
Graduated document generation based on Singularity Density (SD) score.
Path A: CONVERGENCE PROPOSAL (90-100)
Path B: MUTUAL VALUE BRIEF (75-89)
Path C: FIRST SIGNAL (60-74)
"""
import io
import os
import re
from datetime import date
from typing import Any, Dict

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

_LOGO_PATH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", "Marketing", "Logos", "Stratagent_Orange_Standard.png"
))

ORANGE     = None   # set lazily inside functions after docx import
DARK_GREY  = None
LIGHT_GREY = None

# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------

_SSI_FOOTER_RE = re.compile(
    r'\n{0,3}(?:-{3,}\n+)?Jason L\. Smith[^\n]*\n(?:[^\n]+\n){0,5}[^\n]*STRATAGENT[^\n]*\.?',
    re.IGNORECASE,
)

def _clean(text: str) -> str:
    """Strip Gemini auto-footers and known placeholder artifacts."""
    if not text:
        return text
    # Remove all SSI footer blocks
    text = _SSI_FOOTER_RE.sub('', text)
    # Remove dangling dividers
    text = re.sub(r'\n+---+\s*$', '', text)
    # Replace sender placeholder
    text = re.sub(r'\[Your Name[^\]]*\]', 'Jason L. Smith | SSI ApS', text)
    # Replace date placeholders with actual date
    for ph in ('[Current Date]', '[Date]', '[date]'):
        text = text.replace(ph, date.today().strftime('%d %B %Y'))
    return text.strip()


# ---------------------------------------------------------------------------
# Markdown → docx renderer
# ---------------------------------------------------------------------------

def _render_markdown(doc, text: str):
    """Parse lightweight markdown → properly formatted Word content."""
    from docx.shared import Pt, RGBColor, Inches

    ORANGE_C = RGBColor(0xE8, 0x7A, 0x00)

    def parse_inline(para, content: str):
        parts = re.split(r'(\*\*[^*\n]+\*\*)', content)
        for part in parts:
            if part.startswith('**') and part.endswith('**'):
                run = para.add_run(part[2:-2])
                run.bold = True
            elif part:
                para.add_run(part)

    for line in text.splitlines():
        stripped = line.strip()

        if not stripped or re.match(r'^[-*_]{3,}$', stripped):
            continue

        if stripped.startswith('## '):
            p = doc.add_paragraph()
            r = p.add_run(stripped[3:].strip())
            r.bold = True; r.font.size = Pt(13); r.font.color.rgb = ORANGE_C
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)

        elif stripped.startswith('### '):
            p = doc.add_paragraph()
            r = p.add_run(stripped[4:].strip())
            r.bold = True; r.font.size = Pt(11); r.font.color.rgb = ORANGE_C
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(3)

        elif stripped.startswith('#### '):
            p = doc.add_paragraph()
            r = p.add_run(stripped[5:].strip())
            r.bold = True; r.font.size = Pt(10); r.font.color.rgb = ORANGE_C
            p.paragraph_format.space_before = Pt(6)

        elif re.match(r'^\s{0,8}[\*\-]\s', line):
            depth = 1 if (len(line) - len(line.lstrip())) >= 4 else 0
            content = re.sub(r'^\s*[\*\-]\s+', '', line)
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3 + depth * 0.22)
            p.paragraph_format.first_line_indent = Inches(-0.18)
            p.paragraph_format.space_after = Pt(2)
            p.add_run('• ')
            parse_inline(p, content)

        else:
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(5)
            parse_inline(p, stripped)


# ---------------------------------------------------------------------------
# Docx helpers
# ---------------------------------------------------------------------------

def _shade_cell(cell, hex_color: str):
    """Apply background fill to a table cell via OOXML."""
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)


def _cell_text(cell, text: str, bold=False, color=None, size_pt=10, align='left'):
    """Set text in a table cell with formatting."""
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    p = cell.paragraphs[0]
    p.clear()
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(size_pt)
    if color:
        run.font.color.rgb = RGBColor(*bytes.fromhex(color))
    align_map = {
        'left': WD_ALIGN_PARAGRAPH.LEFT,
        'right': WD_ALIGN_PARAGRAPH.RIGHT,
        'center': WD_ALIGN_PARAGRAPH.CENTER,
    }
    p.alignment = align_map.get(align, WD_ALIGN_PARAGRAPH.LEFT)


def _sd_bar(score: int, total_blocks: int = 20) -> str:
    """Return a Unicode block progress bar for the SD score."""
    filled = round(score / 100 * total_blocks)
    return '█' * filled + '░' * (total_blocks - filled)


def _sd_label(score: int) -> str:
    if score >= 90: return 'CONVERGENCE READY'
    if score >= 75: return 'VALUE BRIEF READY'
    if score >= 60: return 'FIRST SIGNAL'
    return 'PARKED'


# ---------------------------------------------------------------------------
# Main docx builder
# ---------------------------------------------------------------------------

def _signal_strength_color(strength: str) -> str:
    """Map a buying-signal strength to a hex accent color for the docx."""
    s = (strength or '').upper()
    if s == 'HIGH':
        return 'B23B00'
    if s == 'MEDIUM':
        return 'E87A00'
    return '9A9A9A'


def _build_docx(label: str, company_name: str, supplier_name: str,
                convergence_index: int, output: dict,
                buying_signals=None, score_reasoning=None,
                what_would_improve=None) -> bytes:
    """Build a premium branded .docx from generated output."""
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor, Inches, Mm
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
    except ImportError:
        raise RuntimeError("python-docx not installed.")

    ORANGE_C  = RGBColor(0xE8, 0x7A, 0x00)   # #E87A00
    WHITE_C   = RGBColor(0xFF, 0xFF, 0xFF)
    DARK_C    = RGBColor(0x1A, 0x1A, 0x1A)

    doc = Document()

    # Page setup -- A4, narrow margins (0.5in / ~1.27cm all round, matches Word's
    # "Narrow" preset) so briefs print cleanly on A4 paper with maximum content area
    for sec in doc.sections:
        sec.page_width    = Mm(210)
        sec.page_height   = Mm(297)
        sec.top_margin    = Inches(0.5)
        sec.bottom_margin = Inches(0.5)
        sec.left_margin   = Inches(0.5)
        sec.right_margin  = Inches(0.5)

    # ── COVER BLOCK ──────────────────────────────────────────────────────────

    # Logo row
    if os.path.exists(_LOGO_PATH):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.add_run().add_picture(_LOGO_PATH, width=Inches(2.2))
    else:
        p = doc.add_paragraph()
        r = p.add_run('STRATAGENT')
        r.bold = True; r.font.size = Pt(18); r.font.color.rgb = ORANGE_C

    doc.add_paragraph()  # spacer

    # Document label in large orange
    h = doc.add_paragraph()
    r = h.add_run(label)
    r.bold = True; r.font.size = Pt(24); r.font.color.rgb = ORANGE_C

    doc.add_paragraph()  # spacer

    # Cover metadata table: 2 cols × 5 rows
    tbl = doc.add_table(rows=5, cols=2)
    tbl.style = 'Table Grid'

    meta_rows = [
        ('PROSPECT',          company_name,   True),
        ('SUPPLIER',          supplier_name,  False),
        ('SINGULARITY DENSITY', f'{convergence_index}/100 — {_sd_label(convergence_index)}', False),
        ('DATE',              date.today().strftime('%d %B %Y'), False),
        ('PREPARED BY',       'Jason L. Smith | Strategic Sales International ApS', False),
    ]

    for i, (lbl, val, highlight) in enumerate(meta_rows):
        label_cell = tbl.rows[i].cells[0]
        value_cell = tbl.rows[i].cells[1]

        _shade_cell(label_cell, 'F5F5F5')
        _cell_text(label_cell, lbl, bold=True, size_pt=8.5, color='6B6B6B')

        if highlight:
            _shade_cell(value_cell, 'FFF8F0')
            _cell_text(value_cell, val, bold=True, size_pt=10.5, color='E87A00')
        else:
            _cell_text(value_cell, val, size_pt=10)

    # SD score bar row — spans full width
    bar_row = tbl.add_row()
    bar_cell = bar_row.cells[0].merge(bar_row.cells[1])
    _shade_cell(bar_cell, '1A1A1A')
    bar_p = bar_cell.paragraphs[0]
    bar_p.clear()
    bar_run = bar_p.add_run(_sd_bar(convergence_index))
    bar_run.font.size = Pt(10)
    bar_run.font.color.rgb = ORANGE_C
    bar_p.alignment = WD_ALIGN_PARAGRAPH.LEFT

    doc.add_paragraph()  # spacer after cover table

    # Horizontal rule
    hr = doc.add_paragraph()
    hr_run = hr.add_run('─' * 72)
    hr_run.font.size = Pt(8)
    hr_run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

    doc.add_paragraph()  # spacer

    # ── SECTIONS ─────────────────────────────────────────────────────────────

    def add_section(title: str, body: str):
        """Add a section with an orange-shaded header bar and rendered body."""
        # Section header — shaded table cell
        sh_tbl = doc.add_table(rows=1, cols=1)
        sh_tbl.style = 'Table Grid'
        sh_cell = sh_tbl.rows[0].cells[0]
        _shade_cell(sh_cell, 'E87A00')
        sh_p = sh_cell.paragraphs[0]
        sh_p.clear()
        sh_run = sh_p.add_run(title.upper())
        sh_run.bold = True
        sh_run.font.size = Pt(10)
        sh_run.font.color.rgb = WHITE_C

        doc.add_paragraph()  # spacer after header

        _render_markdown(doc, _clean(body))

        doc.add_paragraph()  # spacer after section

        # Section separator
        sep = doc.add_paragraph()
        sep_run = sep.add_run('─' * 72)
        sep_run.font.size = Pt(8)
        sep_run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

        doc.add_paragraph()  # spacer

    if output.get('email'):
        add_section('Outreach Email', output['email'])

    if output.get('brief'):
        add_section('Value Brief', output['brief'])

    if output.get('proposal'):
        add_section('Technical Proposal', output['proposal'])

    if output.get('engagement_brief'):
        add_section('Engagement Brief / RFQ Framework', output['engagement_brief'])

    if output.get('qualifying_questions'):
        qs = output['qualifying_questions']
        # Header
        qh_tbl = doc.add_table(rows=1, cols=1)
        qh_tbl.style = 'Table Grid'
        qh_cell = qh_tbl.rows[0].cells[0]
        _shade_cell(qh_cell, 'E87A00')
        qh_p = qh_cell.paragraphs[0]
        qh_run = qh_p.add_run('QUALIFYING QUESTIONS')
        qh_run.bold = True; qh_run.font.size = Pt(10)
        qh_run.font.color.rgb = WHITE_C

        doc.add_paragraph()
        for i, q in enumerate(qs, 1):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.1)
            p.paragraph_format.space_after = Pt(5)
            num_run = p.add_run(f'{i}.  ')
            num_run.bold = True
            num_run.font.color.rgb = ORANGE_C
            p.add_run(str(q))
        doc.add_paragraph()

    if buying_signals:
        bs_tbl = doc.add_table(rows=1, cols=1)
        bs_tbl.style = 'Table Grid'
        bs_cell = bs_tbl.rows[0].cells[0]
        _shade_cell(bs_cell, 'E87A00')
        bs_p = bs_cell.paragraphs[0]
        bs_p.clear()
        bs_run = bs_p.add_run('BUYING SIGNALS DETECTED')
        bs_run.bold = True; bs_run.font.size = Pt(10)
        bs_run.font.color.rgb = WHITE_C

        doc.add_paragraph()
        for sig in buying_signals:
            if not isinstance(sig, dict):
                continue
            sig_type = str(sig.get('type') or 'SIGNAL').upper()
            strength = str(sig.get('strength') or '').upper()
            description = sig.get('signal') or ''
            timing = sig.get('timing')
            source = sig.get('source')

            head_p = doc.add_paragraph()
            head_p.paragraph_format.space_before = Pt(6)
            head_p.paragraph_format.space_after = Pt(1)
            type_run = head_p.add_run(sig_type)
            type_run.bold = True
            type_run.font.size = Pt(9)
            type_run.font.color.rgb = ORANGE_C
            if strength:
                head_p.add_run('   ')
                strength_run = head_p.add_run(f'{strength} STRENGTH')
                strength_run.bold = True
                strength_run.font.size = Pt(8)
                strength_run.font.color.rgb = RGBColor(*bytes.fromhex(_signal_strength_color(strength)))

            if description:
                body_p = doc.add_paragraph()
                body_p.paragraph_format.left_indent = Inches(0.15)
                body_p.paragraph_format.space_after = Pt(2)
                body_p.add_run(str(description))

            extra_bits = []
            if timing:
                extra_bits.append(f'Timing: {timing}')
            if source:
                extra_bits.append(f'Source: {source}')
            if extra_bits:
                meta_p = doc.add_paragraph()
                meta_p.paragraph_format.left_indent = Inches(0.15)
                meta_p.paragraph_format.space_after = Pt(4)
                meta_run = meta_p.add_run('  |  '.join(extra_bits))
                meta_run.italic = True
                meta_run.font.size = Pt(8.5)
                meta_run.font.color.rgb = RGBColor(0x6B, 0x6B, 0x6B)

        doc.add_paragraph()
        sep = doc.add_paragraph()
        sep_run = sep.add_run('─' * 72)
        sep_run.font.size = Pt(8)
        sep_run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)
        doc.add_paragraph()

    if score_reasoning:
        rs_tbl = doc.add_table(rows=1, cols=1)
        rs_tbl.style = 'Table Grid'
        rs_cell = rs_tbl.rows[0].cells[0]
        _shade_cell(rs_cell, 'E87A00')
        rs_p = rs_cell.paragraphs[0]
        rs_p.clear()
        rs_run = rs_p.add_run('WHY THIS SCORE -- SINGULARITY DENSITY REASONING')
        rs_run.bold = True; rs_run.font.size = Pt(10)
        rs_run.font.color.rgb = WHITE_C

        doc.add_paragraph()
        reason_p = doc.add_paragraph()
        reason_p.paragraph_format.space_after = Pt(6)
        reason_p.add_run(str(score_reasoning))

        if what_would_improve:
            imp_head = doc.add_paragraph()
            imp_head.paragraph_format.space_before = Pt(4)
            imp_head_run = imp_head.add_run('What would raise this score:')
            imp_head_run.bold = True
            imp_head_run.font.size = Pt(9.5)
            imp_head_run.font.color.rgb = ORANGE_C

            imp_p = doc.add_paragraph()
            imp_p.paragraph_format.left_indent = Inches(0.15)
            imp_p.add_run(str(what_would_improve))

        doc.add_paragraph()
        sep = doc.add_paragraph()
        sep_run = sep.add_run('─' * 72)
        sep_run.font.size = Pt(8)
        sep_run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)
        doc.add_paragraph()

    # ── SINGLE FOOTER ────────────────────────────────────────────────────────
    doc.add_paragraph()
    ft_p = doc.add_paragraph()
    ft_run = ft_p.add_run(
        'Jason L. Smith  |  Strategic Sales International ApS\n'
        'info@strategic.dk  |  www.strategic-dk.com  |  +45 24 99 23 93\n'
        'CVR: 41945621  |  Roskilde, Denmark\n'
        'STRATAGENT — The Intelligence Behind Agentic Sales'
    )
    ft_run.font.size = Pt(8.5)
    ft_run.font.color.rgb = RGBColor(0x9A, 0x9A, 0x9A)

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
    include_buying_signals: bool = False
    include_reasoning: bool = False


@router.post('/generate')
async def generate_output(payload: GenerateRequest, x_session_id: str = Header(...)):
    await check_and_increment(x_session_id)

    profile_doc = db.get_relationship_profile(payload.profile_id)
    if not profile_doc:
        raise HTTPException(status_code=404, detail='Relationship Profile not found')

    kb = db.get_knowledge_base(profile_doc['supplier_id'])
    if not kb:
        raise HTTPException(status_code=404, detail='Knowledge Base not found')

    score = profile_doc.get('convergence_index', 0)
    profile = profile_doc.get('profile', {})

    # Attach buying_signals from profile doc if not nested
    if 'buying_signals' not in profile and 'buying_signals' in profile_doc:
        profile['buying_signals'] = profile_doc['buying_signals']

    if score < 60:
        raise HTTPException(status_code=400, detail={
            'message': 'Singularity Density too low to approach credibly.',
            'convergence_index': score,
            'minimum_required': 60,
        })

    try:
        if score >= 90:
            output = await generate_convergence_proposal(profile, kb)
            path, label = 'A', 'CONVERGENCE PROPOSAL'
        elif score >= 75:
            output = await generate_mutual_value_brief(profile, kb)
            path, label = 'B', 'MUTUAL VALUE BRIEF'
        else:
            output = await generate_first_signal(profile, kb)
            path, label = 'C', 'FIRST SIGNAL'
    except Exception as e:
        raise HTTPException(status_code=500,
            detail=f'Gemini generation failed: {type(e).__name__}: {e}')

    # Clean all text fields
    for field in ('email', 'brief', 'proposal', 'engagement_brief'):
        if output.get(field):
            output[field] = _clean(output[field])

    db.record_outcome({
        'supplier_id': profile_doc['supplier_id'],
        'profile_id': payload.profile_id,
        'company_name': profile_doc['company_name'],
        'convergence_index': score,
        'output_path': path,
        'output_label': label,
        'status': 'generated',
    })

    return {
        'path': path, 'label': label,
        'convergence_index': score,
        'company_name': profile_doc['company_name'],
        'output': output,
    }


@router.post('/export')
async def export_output(payload: ExportRequest, x_session_id: str = Header(...)):
    buying_signals = None
    score_reasoning = None
    what_would_improve = None

    if payload.include_buying_signals or payload.include_reasoning:
        profile_doc = db.get_relationship_profile(payload.profile_id)
        if profile_doc:
            profile = profile_doc.get('profile', {})
            if payload.include_buying_signals:
                signals = profile.get('buying_signals') or profile_doc.get('buying_signals')
                if signals:
                    buying_signals = signals
            if payload.include_reasoning:
                ci = profile.get('convergence_index') or {}
                if isinstance(ci, dict):
                    score_reasoning = ci.get('reasoning')
                    what_would_improve = ci.get('what_would_improve_it')

    try:
        docx_bytes = _build_docx(
            label=payload.label,
            company_name=payload.company_name,
            supplier_name=payload.supplier_name,
            convergence_index=payload.convergence_index,
            output=payload.output,
            buying_signals=buying_signals,
            score_reasoning=score_reasoning,
            what_would_improve=what_would_improve,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    safe = ''.join(c for c in payload.company_name if c.isalnum() or c in ' _-').strip().replace(' ', '_')
    filename = f'STRATAGENT_{safe}_{payload.label.replace(" ", "_")}.docx'
    mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type=mimetype,
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )
