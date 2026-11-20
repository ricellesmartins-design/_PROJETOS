"""Gera os modelos usados nas exportações a partir das planilhas oficiais, removendo
dados pessoais (autores, atividades, assinatura digitalizada) e mantendo 100% da
formatação (estilos, tema, colunas, mesclagens, rodapé, logos e checkboxes).

Uso: python3 scripts/sanitize_templates.py <SE-PL-0510.xlsx> <ADM-PF158.xlsx>
"""
import re, sys, zipfile

src_ativ, src_fer = sys.argv[1], sys.argv[2]
OUT = 'src/templates/'

# 1) Relatório de atividades: partes reutilizadas pelo gerador.
z = zipfile.ZipFile(src_ativ)
sheet = z.read('xl/worksheets/sheet6.xml').decode('utf-8')  # aba oficial ativa (colunas de estimativa F:H ocultas)
sheet = re.sub(r'<sheetData>.*</sheetData>', '<sheetData/>', sheet, flags=re.S)
sheet = sheet.replace('<legacyDrawingHF r:id="rId3"/>', '')
sheet = sheet.replace(' r:id="rId1"/><headerFooter>', '/><headerFooter>')  # sem printerSettings
sheet = sheet.replace('&amp;G', '')  # remove imagem de assinatura do rodapé
# a formatação condicional é reinserida pelo gerador com o intervalo real de linhas
sheet = re.sub(r'<conditionalFormatting .*?</conditionalFormatting>', '', sheet, flags=re.S)
sheet = re.sub(r'<extLst>.*</extLst>', '', sheet, flags=re.S)
sheet = re.sub(r'<selection [^>]*/>', '<selection activeCell="A5" sqref="A5"/>', sheet)
# formatação condicional do centro de custo (validação contra a aba Planilha1) vinda da aba ativa
s6 = z.read('xl/worksheets/sheet6.xml').decode('utf-8')
ext = re.search(r'<extLst>.*</extLst>', s6, re.S).group(0)
cf = re.search(r'<conditionalFormatting .*?</conditionalFormatting>', s6, re.S).group(0)
open(OUT + 'atividades_cf.xml', 'w').write(cf + '\n' + ext)
open(OUT + 'atividades_sheet.xml', 'w').write(sheet)
open(OUT + 'atividades_styles.xml', 'wb').write(z.read('xl/styles.xml'))
open(OUT + 'atividades_theme.xml', 'wb').write(z.read('xl/theme/theme1.xml'))
open(OUT + 'atividades_drawing.xml', 'wb').write(z.read('xl/drawings/drawing6.xml'))
open(OUT + 'logo-idg-default.png', 'wb').write(z.read('xl/media/image1.png'))

# 2) Formulário de férias: arquivo completo, sem metadados pessoais/SharePoint.
zf = zipfile.ZipFile(src_fer)
out = zipfile.ZipFile(OUT + 'ADM-PF158.xlsx', 'w', zipfile.ZIP_DEFLATED)
for info in zf.infolist():
    n = info.filename
    if n.startswith('customXml/') or n in ('docProps/custom.xml', 'xl/calcChain.xml'):
        continue
    data = zf.read(n)
    if n == '[Content_Types].xml':
        t = data.decode()
        t = re.sub(r'<Override PartName="/(customXml/[^"]+|docProps/custom.xml|xl/calcChain.xml)"[^>]*/>', '', t)
        data = t.encode()
    elif n == '_rels/.rels':
        data = re.sub(r'<Relationship [^>]*Target="docProps/custom.xml"/>', '', data.decode()).encode()
    elif n == 'xl/_rels/workbook.xml.rels':
        data = re.sub(r'<Relationship [^>]*Target="(\.\./customXml/[^"]+|calcChain.xml)"/>', '', data.decode()).encode()
    elif n == 'docProps/core.xml':
        t = data.decode()
        t = re.sub(r'<dc:creator>.*?</dc:creator>', '<dc:creator>IDG Engenharia</dc:creator>', t)
        t = re.sub(r'<cp:lastModifiedBy>.*?</cp:lastModifiedBy>', '<cp:lastModifiedBy>IDG Engenharia</cp:lastModifiedBy>', t)
        data = t.encode()
    elif n == 'xl/workbook.xml':
        data = re.sub(r'<mc:AlternateContent .*?</mc:AlternateContent>', '', data.decode(), flags=re.S).encode()
    out.writestr(info, data)
out.close()
open(OUT + 'selos-iso-default.png', 'wb').write(zipfile.ZipFile(src_fer).read('xl/media/image1.png'))
print('ok')
