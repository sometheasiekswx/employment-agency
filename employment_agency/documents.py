"""Documents contain only confirmed selected facts and neutral application prose."""

from pathlib import Path
from html import escape
from email.message import EmailMessage
from email.policy import SMTP
import json
from .store import encode, digest

FILES = (
    "resume.pdf",
    "cover-letter.pdf",
    "resume.docx",
    "cover-letter.docx",
    "resume.tex",
    "cover-letter.tex",
    "application.eml",
    "evidence.json",
    "resume.txt",
    "cover-letter.txt",
)


def tex_escape(s):
    table = {
        "\\": r"\textbackslash{}",
        "{": r"\{",
        "}": r"\}",
        "$": r"\$",
        "&": r"\&",
        "#": r"\#",
        "%": r"\%",
        "_": r"\_",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(table.get(c, c) for c in s)


def render(directory, identity, job, facts, evidence, template="navy"):
    from docx import Document
    from docx.shared import Pt, RGBColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from pypdf import PdfReader

    p = Path(directory)
    p.mkdir(parents=True, exist_ok=False)
    name = identity.get("name", "").strip()
    if not name:
        raise ValueError("Add your name before generating")
    if not facts or any(
        not f.get("confirmed") or f.get("conflict") or f.get("retired") for f in facts
    ):
        raise ValueError("Only confirmed, conflict-free facts can be used")
    color = "17384D" if template == "navy" else "222222"
    contact = " | ".join(
        identity.get(k, "") for k in ("email", "phone") if identity.get(k)
    )
    location = identity.get("location", "")
    target = f"{job['title']} - {job['employer']}"
    resume = [
        ("title", name),
        ("contact", location),
        ("contact", contact),
    ]
    groups = {}
    for f in facts:
        label = (
            " — ".join(x for x in [f.get("association", ""), f.get("dates", "")] if x)
            or f.get("category", "Experience").title()
        )
        groups.setdefault(label, []).append(f["text"])
    for label, texts in groups.items():
        resume.append(("heading", label))
        resume.extend(("bullet", t) for t in texts)
    resume.extend(
        [("heading", "Languages"), ("text", identity["languages"])]
        if identity.get("languages")
        else []
    )
    letter = [
        ("title", name),
        ("contact", location),
        ("contact", contact),
        ("heading", "Application for " + target),
        ("text", "Dear Hiring Team,"),
        (
            "text",
            f"I am applying for the {job['title']} position at {job['employer']}. My relevant experience includes:",
        ),
    ]
    for f in facts[:4]:
        context = " — ".join(
            x for x in [f.get("association", ""), f.get("dates", "")] if x
        )
        letter.append(("bullet", (context + ": " if context else "") + f["text"]))
    letter += [
        (
            "text",
            "I would welcome the opportunity to discuss how this experience relates to your requirements. Thank you for considering my application.",
        ),
        ("text", "Kind regards,"),
        ("text", name),
    ]
    for stem, blocks, limit in [("resume", resume, 2), ("cover-letter", letter, 1)]:
        (p / (stem + ".txt")).write_text(
            "\n\n".join(t for _, t in blocks), encoding="utf-8"
        )
        d = Document()
        section = d.sections[0]
        from docx.shared import Mm

        section.top_margin = section.bottom_margin = Mm(17)
        section.left_margin = section.right_margin = Mm(18)
        d.styles["Normal"].font.name = "Calibri"
        d.styles["Normal"].font.size = Pt(10)
        styles = getSampleStyleSheet()
        styles.add(
            ParagraphStyle(
                "Contact", parent=styles["Normal"], fontSize=9, leading=12, spaceAfter=3
            )
        )
        styles["Title"].textColor = HexColor("#" + color)
        styles["Heading2"].textColor = HexColor("#" + color)
        styles["Normal"].fontSize = 10
        styles["Normal"].leading = 13
        story = []
        for typ, text in blocks:
            para = d.add_paragraph(
                text,
                "Title"
                if typ == "title"
                else "Heading 2"
                if typ == "heading"
                else "List Bullet"
                if typ == "bullet"
                else None,
            )
            if typ in ("title", "heading"):
                para.runs[0].font.color.rgb = RGBColor.from_string(color)
            sty = styles[
                "Title"
                if typ == "title"
                else "Heading2"
                if typ == "heading"
                else "Contact"
                if typ == "contact"
                else "Normal"
            ]
            story.append(
                Paragraph(
                    escape(text), sty, bulletText="•" if typ == "bullet" else None
                )
            )
            story.append(Spacer(1, 5))
        d.save(p / (stem + ".docx"))
        SimpleDocTemplate(
            str(p / (stem + ".pdf")),
            pagesize=A4,
            leftMargin=51,
            rightMargin=51,
            topMargin=48,
            bottomMargin=48,
        ).build(story)
        reader = PdfReader(p / (stem + ".pdf"))
        pages = len(reader.pages)
        extracted = " ".join(page.extract_text() for page in reader.pages)

        def squash(value):
            return "".join(value.split()).replace("–", "-").replace("—", "-")

        if any(squash(t) not in squash(extracted) for _, t in blocks):
            raise ValueError(
                "PDF font cannot faithfully render this text. Use Latin-script text or configure a Unicode-capable template before applying."
            )
        if pages > limit:
            raise ValueError(
                f"{stem} exceeds {limit} pages; shorten confirmed facts or select fewer facts"
            )
        tex = (
            r"\documentclass[10pt,a4paper]{article}"
            + "\n"
            + r"\usepackage[T1]{fontenc}\usepackage[utf8]{inputenc}\usepackage[margin=18mm]{geometry}\usepackage{xcolor}\definecolor{navy}{HTML}{"
            + color
            + "}\n"
            + r"\setlength{\parindent}{0pt}\setlength{\parskip}{7pt}\begin{document}"
            + "\n"
        )
        for typ, text in blocks:
            text = tex_escape(text)
            tex += (
                (
                    r"{\LARGE\bfseries\color{navy} " + text + "}"
                    if typ == "title"
                    else r"{\large\bfseries\color{navy} " + text + "}"
                    if typ == "heading"
                    else text
                )
                + r"\par"
                + "\n"
            )
        (p / (stem + ".tex")).write_text(
            tex + r"\end{document}" + "\n", encoding="utf-8"
        )
    msg = EmailMessage(policy=SMTP)
    if job.get("email"):
        msg["To"] = job["email"]
    msg["Subject"] = "Application for " + target + " - " + name
    if identity.get("email"):
        msg["From"] = identity["email"]
    msg["X-Unsent"] = "1"
    msg.set_content(
        f"Dear Hiring Team,\n\nPlease find my resume and cover letter attached for the {job['title']} position. I would welcome the opportunity to discuss my suitability.\n\nKind regards,\n{name}\n{contact}"
    )
    for filename in ("resume.pdf", "cover-letter.pdf"):
        msg.add_attachment(
            (p / filename).read_bytes(),
            maintype="application",
            subtype="pdf",
            filename=filename,
        )
    (p / "application.eml").write_bytes(msg.as_bytes())
    (p / "evidence.json").write_bytes(
        encode(
            {
                "job": job,
                "facts": facts,
                "matching": evidence,
                "template": template,
                "notice": "User review required. No ATS guarantee.",
            }
        )
    )
    (p / "checksums.json").write_bytes(
        encode({f: digest((p / f).read_bytes()) for f in FILES})
    )


def intact(p):
    try:
        return json.loads((p / "checksums.json").read_text(encoding="utf-8")) == {
            f: digest((p / f).read_bytes()) for f in FILES
        }
    except (OSError, ValueError):
        return False
