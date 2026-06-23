"""错题导出 PDF。用 ReportLab 内置 CID 字体 STSong-Light 渲染中文，无需外挂字体文件。"""
from io import BytesIO

from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

_FONT = "STSong-Light"
_registered = False


def _ensure_font() -> None:
    global _registered
    if not _registered:
        pdfmetrics.registerFont(UnicodeCIDFont(_FONT))
        _registered = True


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    title = ParagraphStyle("CnTitle", parent=base["Title"], fontName=_FONT, fontSize=18, spaceAfter=10)
    head = ParagraphStyle("CnHead", parent=base["Heading2"], fontName=_FONT, fontSize=12, spaceAfter=4)
    body = ParagraphStyle("CnBody", parent=base["Normal"], fontName=_FONT, fontSize=10.5,
                          leading=16, alignment=TA_LEFT, spaceAfter=2)
    return {"title": title, "head": head, "body": body}


def _escape(text: str | None) -> str:
    if not text:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_questions_pdf(questions: list[dict], with_answer: bool = True, title: str = "错题导出") -> bytes:
    """questions: 每项含 question_content/correct_answer/solution_steps/error_analysis/improvement_tips。
    with_answer=False 时只输出题面，方便打印当练习卷。"""
    _ensure_font()
    s = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm)
    flow = [Paragraph(_escape(title), s["title"]),
            Paragraph(f"共 {len(questions)} 题　{'含答案版' if with_answer else '练习版（不含答案）'}", s["body"]),
            Spacer(1, 6 * mm)]
    for i, q in enumerate(questions, 1):
        flow.append(Paragraph(f"{i}. {_escape(q.get('question_content') or q.get('original_text') or '（无题面）')}", s["head"]))
        if with_answer:
            if q.get("correct_answer"):
                flow.append(Paragraph(f"【答案】{_escape(q['correct_answer'])}", s["body"]))
            if q.get("solution_steps"):
                flow.append(Paragraph(f"【解题步骤】{_escape(q['solution_steps'])}", s["body"]))
            if q.get("error_analysis"):
                flow.append(Paragraph(f"【错因】{_escape(q['error_analysis'])}", s["body"]))
            if q.get("improvement_tips"):
                flow.append(Paragraph(f"【建议】{_escape(q['improvement_tips'])}", s["body"]))
        flow.append(Spacer(1, 5 * mm))
    doc.build(flow)
    return buf.getvalue()
