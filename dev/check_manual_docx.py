
# -*- coding: utf-8 -*-
from docx import Document
import os
p = r"E:\DS chat manager\使用说明.docx"
d = Document(p)
heads = [x.text for x in d.paragraphs if x.style.name.startswith("Heading")]
imgs = len(d.inline_shapes)
tables = len(d.tables)
print("paragraphs:", len(d.paragraphs))
print("headings:", len(heads))
print("first headings:", heads[:6])
print("images:", imgs, "tables:", tables)
print("size MB:", round(os.path.getsize(p)/1024/1024, 2))
# 抽查表格内容
for i, t in enumerate(d.tables):
    print("table", i, "rows", len(t.rows), "cols", len(t.columns), "| hdr:", [c.text for c in t.rows[0].cells])
