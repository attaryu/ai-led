"""Convert PAPER_EQUILIBRIUM.md → PDF with Equilibrium-style formatting.

Uses weasyprint (no LaTeX needed). Output: PAPER_EQUILIBRIUM.pdf.
"""
import re
from pathlib import Path

import markdown
from weasyprint import HTML, CSS

HERE = Path(__file__).parent
md_path = HERE / "PAPER_EQUILIBRIUM.md"
pdf_path = HERE / "PAPER_EQUILIBRIUM.pdf"

md_text = md_path.read_text(encoding="utf-8")
# Strip the HTML comment header (build instructions) so it doesn't render
md_text = re.sub(r"<!--.*?-->", "", md_text, count=1, flags=re.DOTALL).lstrip()

html_body = markdown.markdown(
    md_text,
    extensions=["tables", "fenced_code", "sane_lists"],
)

# Equilibrium-style CSS: Calibri 11pt body, A4 margins, centered title, etc.
css = CSS(string="""
@page {
    size: A4;
    margin: 2.5cm 2cm;
    @top-left { content: ""; }
    @top-right {
        content: "Published by University of Muhammadiyah Makassar";
        font-family: Calibri, "Trebuchet MS", sans-serif;
        font-size: 8pt; color: #666;
    }
    @bottom-center {
        content: counter(page);
        font-family: Calibri, sans-serif; font-size: 9pt;
    }
}
body {
    font-family: Calibri, "Trebuchet MS", "Segoe UI", sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    text-align: justify;
}
h1 {
    font-size: 14pt;
    font-weight: bold;
    text-align: center;
    margin: 1em 0 0.6em;
}
h2 {
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    margin: 1em 0 0.4em;
    page-break-after: avoid;
}
h3 {
    font-size: 11pt;
    font-weight: bold;
    margin: 0.8em 0 0.3em;
    page-break-after: avoid;
}
p { margin: 0 0 0.6em; }
table {
    border-collapse: collapse;
    margin: 0.6em auto;
    font-size: 9.5pt;
    width: 100%;
    page-break-inside: avoid;
}
th, td {
    border: 1px solid #888;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
}
th { background: #f0f0f0; font-weight: bold; }
code {
    font-family: "Consolas", "Courier New", monospace;
    font-size: 9.5pt;
    background: #f6f6f6;
    padding: 0 3px;
}
hr {
    border: 0;
    border-top: 1px solid #ccc;
    margin: 1em 0;
}
em { font-style: italic; }
strong { font-weight: bold; }
ul, ol { margin: 0 0 0.6em 1.5em; padding: 0; }
li { margin-bottom: 0.2em; }

/* Section-specific styling */
h2:first-of-type { margin-top: 0; }

/* Daftar pustaka — hanging indent */
h2 + p, h2 + p + p, h2 + p + p + p {
    text-indent: 0;
}
""")

html_full = f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body>{html_body}</body></html>"""

HTML(string=html_full).write_pdf(pdf_path, stylesheets=[css])
print(f"→ Wrote {pdf_path} ({pdf_path.stat().st_size // 1024} KB)")
