"""Frozen v2 account resume; contains no missing application facts or save hints."""
import os
from pathlib import Path

from reportlab.pdfgen import canvas

target = Path(__file__).resolve().parents[2] / ".local/full-stack/private/application-memory-v2/alex-example-resume.pdf"
target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
pdf = canvas.Canvas(str(target), pagesize=(612, 792), invariant=1)
pdf.setTitle("Alex Example - Resume")
pdf.setAuthor("Alex Example")
pdf.setFont("Helvetica-Bold", 22)
pdf.drawString(50, 740, "Alex Example")
pdf.setFont("Helvetica", 12)
for y, line in zip([706, 676, 656], [
    "Software Engineer",
    "Five years of TypeScript and Python experience.",
    "Builds B2B SaaS APIs and data-processing services with PostgreSQL.",
]):
    pdf.drawString(50, y, line)
pdf.save()
os.chmod(target, 0o600)
