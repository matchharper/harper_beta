"""Compare PDF_EQUIVALENCE_TEST outputs using Poppler and pypdf.

Usage: python3 scripts/comparePdfRenders.py [output/pdf/equivalence]
Dependencies: pdftoppm (Poppler), pypdf. No production data is embedded here.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from pypdf import PdfReader

root = Path(sys.argv[1] if len(sys.argv) > 1 else "output/pdf/equivalence")
report = []
for original in sorted(root.glob("*-inline.pdf")):
    name = original.name.removesuffix("-inline.pdf")
    changed = root / f"{name}-external.pdf"
    readers = [PdfReader(original), PdfReader(changed)]
    assert len(readers[0].pages) == len(readers[1].pages), f"Page count changed: {name}"
    for path in [original, changed]:
        subprocess.run(["pdftoppm", "-png", "-r", "144", str(path), str(path.with_suffix(""))], check=True)
    pages = []
    for index, (before, after) in enumerate(zip(readers[0].pages, readers[1].pages), 1):
        suffix = str(index).zfill(len(str(len(readers[0].pages))))
        images = [root / f"{name}-{mode}-{suffix}.png" for mode in ["inline", "external"]]
        assert images[0].read_bytes() == images[1].read_bytes(), f"Page pixels changed: {name} {index}"
        assert before.extract_text() == after.extract_text(), f"PDF text changed: {name} {index}"
        def links(page):
            return [(str(a.get_object().get("/Rect")), str(a.get_object().get("/A")), str(a.get_object().get("/Dest"))) for a in page.get("/Annots", [])]
        assert links(before) == links(after), f"PDF links changed: {name} {index}"
        assert before.get_contents().get_data() == after.get_contents().get_data(), f"Page content stream changed: {name} {index}"
        pages.append({"page": index, "pngSha256": hashlib.sha256(images[0].read_bytes()).hexdigest(),
                      "pixelsEqual": True, "textEqual": True, "linksEqual": True, "contentStreamEqual": True})
    def without_timestamps(path):
        return re.sub(rb"/(?:CreationDate|ModDate) \([^)]*\)", b"", path.read_bytes())
    report.append({"document": name, "pages": pages,
                   "pdfBytesEqualExceptCreationTimestamps": without_timestamps(original) == without_timestamps(changed)})
assert report, "No PDF pairs found"
output = root / "comparison.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"documents": len(report), "pages": sum(len(item["pages"]) for item in report),
                  "allPixelsTextLinksAndContentStreamsEqual": True,
                  "allPdfBytesEqualExceptCreationTimestamps": all(item["pdfBytesEqualExceptCreationTimestamps"] for item in report),
                  "report": str(output)}))
