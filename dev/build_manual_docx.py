
# -*- coding: utf-8 -*-
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ROOT = r"E:\DS chat manager"
OUT = os.path.join(ROOT, "使用说明.docx")
FONT_CN = "微软雅黑"
FONT_MONO = "Consolas"
ACCENT = RGBColor(0x2F, 0x4F, 0xB8)
GREY = RGBColor(0x66, 0x6C, 0x78)

doc = Document()

# ---- 页面 ----
sec = doc.sections[0]
sec.page_width = Cm(21)
sec.page_height = Cm(29.7)
sec.top_margin = Cm(2.2)
sec.bottom_margin = Cm(2.0)
sec.left_margin = Cm(2.4)
sec.right_margin = Cm(2.4)

def set_style_font(style, size, bold=False, color=None, name=FONT_CN):
    style.font.name = name
    style.font.size = Pt(size)
    style.font.bold = bold
    if color is not None:
        style.font.color.rgb = color
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), name)
    rfonts.set(qn("w:ascii"), name)
    rfonts.set(qn("w:hAnsi"), name)

normal = doc.styles["Normal"]
set_style_font(normal, 10.5)
normal.paragraph_format.space_after = Pt(4)
normal.paragraph_format.line_spacing = 1.35

set_style_font(doc.styles["Heading 1"], 16, True, ACCENT)
doc.styles["Heading 1"].paragraph_format.space_before = Pt(16)
doc.styles["Heading 1"].paragraph_format.space_after = Pt(8)

set_style_font(doc.styles["Heading 2"], 12.5, True, RGBColor(0x22, 0x2A, 0x38))
doc.styles["Heading 2"].paragraph_format.space_before = Pt(10)
doc.styles["Heading 2"].paragraph_format.space_after = Pt(4)

def p(text="", size=None, bold=False, color=None, align=None, space_after=None, indent=None):
    par = doc.add_paragraph()
    run = par.add_run(text)
    if size:
        run.font.size = Pt(size)
    if bold:
        run.bold = True
    if color is not None:
        run.font.color.rgb = color
    if align is not None:
        par.alignment = align
    if space_after is not None:
        par.paragraph_format.space_after = Pt(space_after)
    if indent is not None:
        par.paragraph_format.left_indent = Cm(indent)
    return par

def bullet(text, bold_prefix=None):
    par = doc.add_paragraph(style="List Bullet")
    par.paragraph_format.space_after = Pt(2)
    if bold_prefix:
        r = par.add_run(bold_prefix)
        r.bold = True
    par.add_run(text)
    return par

def numbered(text):
    par = doc.add_paragraph(style="List Number")
    par.paragraph_format.space_after = Pt(2)
    par.add_run(text)
    return par

def shade(paragraph, color="F2F4F8"):
    pPr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    pPr.append(shd)

def quote(text):
    par = doc.add_paragraph()
    par.paragraph_format.left_indent = Cm(0.4)
    par.paragraph_format.space_before = Pt(6)
    par.paragraph_format.space_after = Pt(8)
    run = par.add_run(text)
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x8A, 0x4B, 0x2A)
    shade(par, "FBF3E8")
    return par

def code(text):
    par = doc.add_paragraph()
    par.paragraph_format.left_indent = Cm(0.4)
    par.paragraph_format.space_before = Pt(4)
    par.paragraph_format.space_after = Pt(8)
    run = par.add_run(text)
    run.font.name = FONT_MONO
    run.font.size = Pt(9.5)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), FONT_MONO)
    rfonts.set(qn("w:hAnsi"), FONT_MONO)
    rfonts.set(qn("w:eastAsia"), FONT_CN)
    shade(par, "F4F5F7")
    return par

def heading(text, level=1):
    return doc.add_heading(text, level=level)

def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = t.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = ""
        par = hdr[i].paragraphs[0]
        run = par.add_run(h)
        run.bold = True
        run.font.size = Pt(10)
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear"); shd.set(qn("w:fill"), "E8EDF7")
        hdr[i]._tc.get_or_add_tcPr().append(shd)
    for row in rows:
        cells = t.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ""
            par = cells[i].paragraphs[0]
            run = par.add_run(str(val))
            run.font.size = Pt(9.5)
            par.paragraph_format.space_after = Pt(1)
    if widths:
        t.autofit = False
        tblPr = t._tbl.tblPr
        layout = OxmlElement("w:tblLayout")
        layout.set(qn("w:type"), "fixed")
        tblPr.append(layout)
        tblW = OxmlElement("w:tblW")
        tblW.set(qn("w:w"), str(int(sum(widths) * 567)))
        tblW.set(qn("w:type"), "dxa")
        tblPr.append(tblW)
        grid = t._tbl.find(qn("w:tblGrid"))
        if grid is not None:
            for i, col in enumerate(grid.findall(qn("w:gridCol"))):
                if i < len(widths):
                    col.set(qn("w:w"), str(int(widths[i] * 567)))
        for i, w in enumerate(widths):
            t.columns[i].width = Cm(w)
        for r in t.rows:
            for i, w in enumerate(widths):
                r.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t

def figure(path, caption, width_cm=15.4):
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return
    par = doc.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    par.paragraph_format.space_before = Pt(6)
    par.paragraph_format.space_after = Pt(2)
    par.add_run().add_picture(full, width=Cm(width_cm))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(10)
    r = cap.add_run(caption)
    r.font.size = Pt(9)
    r.font.color.rgb = GREY
    r.italic = True

# ---- 页脚 ----
footer_p = sec.footer.paragraphs[0]
footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = footer_p.add_run("DeepSeek 对话文件夹 · 使用说明 v0.3.1    |    第 ")
fr.font.size = Pt(8.5); fr.font.color.rgb = GREY
fld = OxmlElement("w:fldSimple"); fld.set(qn("w:instr"), "PAGE")
footer_p._p.append(fld)
fr2 = footer_p.add_run(" 页")
fr2.font.size = Pt(8.5); fr2.font.color.rgb = GREY

# ================= 正文 =================
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
tr = title.add_run("DeepSeek 对话文件夹")
tr.bold = True
tr.font.size = Pt(26)
tr.font.color.rgb = ACCENT
title.paragraph_format.space_before = Pt(30)
title.paragraph_format.space_after = Pt(2)

sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
sr = sub.add_run("使用说明")
sr.font.size = Pt(15)
sr.font.color.rgb = RGBColor(0x44, 0x4C, 0x5C)
sub.paragraph_format.space_after = Pt(4)

meta = doc.add_paragraph()
meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
mr = meta.add_run("版本 0.3.1    ·    Chrome / Edge 桌面版    ·    chat.deepseek.com")
mr.font.size = Pt(9.5)
mr.font.color.rgb = GREY
meta.paragraph_format.space_after = Pt(18)

p("在 DeepSeek 网页版的侧栏里加一层「文件夹」，把历史对话按项目、主题、课程分门别类。"
  "原生对话列表的结构和交互完全不变，所有数据只存在你自己的浏览器里。",
  size=10.5)

# 目录
heading("目录", 2)
toc = ["一、它能做什么", "二、安装", "三、界面导览", "四、基本操作", "五、管理文件夹",
       "六、新对话提示", "七、备份与迁移", "八、开关与卸载", "九、数据与隐私",
       "十、常见问题", "十一、诊断命令", "十二、快捷键"]
for item in toc:
    par = doc.add_paragraph()
    par.paragraph_format.left_indent = Cm(0.6)
    par.paragraph_format.space_after = Pt(1)
    r = par.add_run(item)
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor(0x3A, 0x42, 0x52)

doc.add_page_break()

# 一
heading("一、它能做什么", 1)
for line in [
    ("文件夹数量不限：", "随时新建、改名、置顶、排序、删除"),
    ("归类：", "把任意对话拖进文件夹，一个对话只属于一个文件夹"),
    ("查看：", "点开文件夹只看这一类对话，点一下正常打开"),
    ("零侵入：", "不改变 DeepSeek 原生对话列表的结构和交互"),
    ("纯本地：", "不联网、不读对话正文、不碰账号凭证"),
]:
    bullet(line[1], line[0])
figure("dev/preview.png", "图 1　侧栏「文件夹」入口与文件夹数量角标")

# 二
heading("二、安装", 1)
numbered("打开 chrome://extensions（Edge 则是 edge://extensions）")
numbered("右上角打开「开发者模式」")
numbered("点左上角「加载已解压的扩展程序」")
numbered("选择本项目的 extension 目录（能直接看到 manifest.json、src、icons 的那一层）")
numbered("打开 https://chat.deepseek.com ，刷新页面")
quote("注意：选到上一层「DS chat manager」会提示 Manifest file is missing；"
      "装完必须刷新页面，content script 才会注入。")

# 三
heading("三、界面导览", 1)
heading("1. 侧栏入口", 2)
p("在「历史对话 / 置顶」列表的正上方多了一行「文件夹」，右侧数字是文件夹总数。点一下打开面板，"
  "再点一下、点面板外或按 Esc 关闭。")
heading("2. 面板", 2)
table(["位置", "内容"], [
    ["顶部", "标题（进入文件夹后显示文件夹名，左侧有返回箭头）、关闭按钮"],
    ["中间", "文件夹列表，或某个文件夹里的对话"],
    ["底部", "「＋ 新建文件夹」和「⋯（更多）」"],
], widths=[3.2, 12.2])

# 四
heading("四、基本操作", 1)
heading("新建文件夹", 2)
p("点侧栏「文件夹」打开面板 → 底部「＋ 新建文件夹」→ 输入名字后回车（Esc 取消）。"
  "名字重复会提示，最多 24 个字。")
heading("把对话放进文件夹", 2)
p("方式一：拖拽（推荐）", bold=True, space_after=2)
p("按住左侧某条对话不放，拖到面板里的文件夹上（文件夹会高亮），松手即可，"
  "会提示「已放入「工作」」。面板没开时，开始拖动的瞬间会自动弹出。", indent=0.5)
p("方式二：右键", bold=True, space_after=2)
p("在对话上点右键 →「移动到文件夹」→ 点文件夹名。已归类的会打 ✓，下方还有「移出文件夹」。", indent=0.5)
figure("dev/preview-menu.png", "图 2　右键对话的「移动到文件夹」菜单")
heading("查看与移出", 2)
p("点文件夹进入文件夹视图，列表按加入时间倒序排列，点任意一条即正常打开该对话。"
  "鼠标移到条目上，右侧出现「移出」，点了就回到未归类——只是解除归类，对话本身不会被删除。")
figure("dev/preview-folder.png", "图 3　文件夹视图与条目上的「移出」")

# 五
heading("五、管理文件夹", 1)
p("鼠标移到文件夹行，右侧出现「⋯」，点开是完整菜单：")
figure("dev/preview-folder-menu.png", "图 4　文件夹操作菜单")
table(["菜单项", "说明"], [
    ["重命名", "行内变输入框，改名后回车保存，Esc 取消"],
    ["置顶 / 取消置顶", "置顶的排在最前，左侧小图标变成 ★"],
    ["上移 / 下移", "手动调整顺序（只影响未置顶的组内顺序）"],
    ["删除文件夹", "行内二次确认；里面的对话不会被删，只会回到未归类"],
], widths=[3.6, 11.8])
figure("dev/preview-delete-confirm.png", "图 5　删除文件夹的行内二次确认")

# 六
heading("六、新对话提示", 1)
p("页面打开后新建的对话，会在右下角弹出一张小卡片，问你要不要放进文件夹：")
figure("dev/preview-prompt.png", "图 6　新对话提示卡片")
bullet("点任意文件夹名，直接放入")
bullet("点「忽略」关掉；20 秒不操作自动收起")
bullet("只对页面打开之后新建的对话提示，历史对话不会弹")
bullet("关闭方式：面板底部「⋯」→「新对话时询问」，点一下切换勾选")

# 七
heading("七、备份与迁移", 1)
p("面板底部「⋯」里有两项：")
figure("dev/preview-foot-menu.png", "图 7　更多菜单：导出 / 导入 / 新对话提示开关")
table(["功能", "说明"], [
    ["导出备份", "下载一个 dscm-backup-日期.json，含全部文件夹、归类与设置"],
    ["导入备份…", "选择 JSON 文件导入，会覆盖当前数据（有二次确认）"],
], widths=[3.6, 11.8])
quote("重要：在 chrome://extensions 里「移除」扩展，Chrome 会连带清空它的全部存储，"
      "重装回来就是空的——这不是 bug，是浏览器规则。想保留数据请用 ⟳ 重载；"
      "确实要重装，先导出备份。")

# 八
heading("八、开关与卸载", 1)
p("临时关闭：点浏览器工具栏上的扩展图标。一下隐藏侧栏入口（图标出现 OFF 角标），"
  "再一下恢复显示。数据完全不受影响。", bold=False)
p("彻底不用：chrome://extensions → 移除。页面恢复原样、无残留，但数据会一起清空，"
  "介意的话先导出备份。")

# 九
heading("九、数据与隐私", 1)
table(["项目", "说明"], [
    ["存了什么", "文件夹名称、顺序与置顶、对话 id → 文件夹 的映射、对话标题快照"],
    ["存在哪", "浏览器本地 chrome.storage.local"],
    ["上传吗", "不上传、不联网，扩展没有任何网络请求"],
    ["读正文吗", "不读，只读取列表里的标题文字和链接地址"],
    ["账号凭证", "不接触"],
    ["权限", "只需 storage 与 chat.deepseek.com 的页面权限"],
], widths=[3.4, 12.0])

# 十
heading("十、常见问题", 1)
qa = [
    ("Q：装好了，侧栏没出现「文件夹」？",
     "先确认刷新过页面，再确认地址栏是 chat.deepseek.com；仍不行按 F12 打开控制台执行 DSCM.inspect()，把结果反馈。"),
    ("Q：入口位置压住了别的按钮？",
     "0.3.1 会自动测量原生按钮位置并向下避让；如果仍然重叠，截图反馈即可。"),
    ("Q：改了对话的名字，文件夹里的没变，或者记录没了？",
     "0.3.1 已处理：改名会重建会话（id 变化），现在会把归类关系迁到新 id 上。极端情况下执行 DSCM.diag() 查看最近的迁移/删除记录。"),
    ("Q：在 DeepSeek 里删了对话，文件夹里还留着？",
     "删除同步有 6 秒缓冲（避免把改名误判成删除），最多约 9 秒生效，会弹提示。"),
    ("Q：深色模式正常吗？", "面板和入口会跟随页面的深浅色自动切换。"),
    ("Q：能同步到别的电脑吗？", "不能自动同步，用「导出 / 导入」手动搬。"),
]
for q, a in qa:
    par = doc.add_paragraph()
    par.paragraph_format.space_before = Pt(6)
    par.paragraph_format.space_after = Pt(1)
    r = par.add_run(q)
    r.bold = True
    r.font.size = Pt(10.5)
    par2 = doc.add_paragraph()
    par2.paragraph_format.left_indent = Cm(0.3)
    r2 = par2.add_run(a)
    r2.font.size = Pt(10)
    r2.font.color.rgb = RGBColor(0x3A, 0x42, 0x52)

# 十一
heading("十一、诊断命令", 1)
p("在 DeepSeek 页面按 F12 打开控制台，执行：")
code("DSCM.inspect()   // 入口是否注入、找到几条对话、列表容器是谁\nDSCM.diag()      // 最近 40 条「迁移 / 删除」事件")
p("把输出反馈，基本能直接定位问题。")

# 十二
heading("十二、快捷键", 1)
table(["按键", "作用"], [
    ["Esc", "关闭面板 / 关闭菜单 / 取消新建或改名"],
    ["Enter", "确认新建、改名"],
    ["右键对话", "打开「移动到文件夹」菜单"],
], widths=[4.0, 11.4])

doc.add_paragraph()
end = doc.add_paragraph()
end.alignment = WD_ALIGN_PARAGRAPH.CENTER
er = end.add_run("— 文档随版本更新，当前对应 v0.3.1 —")
er.font.size = Pt(9)
er.font.color.rgb = GREY

doc.save(OUT)
print("saved:", OUT, os.path.getsize(OUT), "bytes")
