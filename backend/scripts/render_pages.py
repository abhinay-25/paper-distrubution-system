import fitz # PyMuPDF
import os

pdf_path = os.path.abspath('storage/pdf-artifacts/sample_cbit_rendered.pdf')
doc = fitz.open(pdf_path)
print(f"Loaded: {pdf_path}")
print(f"Total pages: {len(doc)}")

for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    out_path = os.path.abspath(f"storage/pdf-artifacts/page_{i+1}.png")
    pix.save(out_path)
    print(f"Saved page {i+1} to {out_path} ({pix.width}x{pix.height})")

