"""Convert the designated NIJI manual-input Excel workbook to JSON, using only Python standard library."""
import sys, json, re, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
X='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PK='{http://schemas.openxmlformats.org/package/2006/relationships}'

def extract(path):
 with zipfile.ZipFile(path) as z:
  names=set(z.namelist())
  wb=ET.fromstring(z.read('xl/workbook.xml'))
  rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
  relmap={x.attrib['Id']:x.attrib['Target'] for x in rels}
  strings=[]
  if 'xl/sharedStrings.xml' in names:
   root=ET.fromstring(z.read('xl/sharedStrings.xml'))
   strings=[''.join(n.text or '' for n in si.iter(X+'t')) for si in root.findall(X+'si')]
  result={}
  for sh in wb.find(X+'sheets'):
   name=sh.attrib['name'];target=relmap[sh.attrib[R+'id']].lstrip('/')
   if not target.startswith('xl/'):target='xl/'+target
   root=ET.fromstring(z.read(target));rows=[]
   for row in root.findall('.//'+X+'sheetData/'+X+'row'):
    cells={}
    for cell in row.findall(X+'c'):
     ref=cell.attrib.get('r','A1');letter=re.match(r'[A-Z]+',ref).group(0);index=0
     for c in letter:index=index*26+ord(c)-64
     kind=cell.attrib.get('t','');value=cell.find(X+'v')
     if kind=='inlineStr':
      inline=cell.find(X+'is');val=''.join(n.text or '' for n in inline.iter(X+'t')) if inline is not None else ''
     elif value is None:continue
     elif kind=='s':val=strings[int(value.text)]
     elif kind in ('str','e'):val=value.text or ''
     elif kind=='b':val=value.text=='1'
     else:
      val=value.text or ''
      if kind=='n' or not kind:
       try:val=float(val) if '.' in val else int(val)
       except ValueError:pass
     if val is not None and val!='':cells[index-1]=val
    if cells:
     size=max(cells)+1;values=[None]*size
     for idx,v in cells.items():values[idx]=v
     rows.append(values)
   result[name]=rows
 return result
if __name__=='__main__':
 if len(sys.argv)<2:sys.exit('使い方: py -3 scripts/excel-to-json.py 入力.xlsx [出力.json]')
 source=Path(sys.argv[1]);dest=Path(sys.argv[2] if len(sys.argv)>2 else 'manual-liver-input.json')
 data=extract(source)
 expected=['代表画像・プロフィール','衣装・ビジュアル','衣装差分','楽曲','活動履歴']
 if not all(n in data for n in expected):sys.exit('必要なシートがありません: '+str([n for n in expected if n not in data]))
 dest.write_text(json.dumps({'schemaVersion':1,'sourceFile':source.name,'sheets':{n:data[n] for n in expected}},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Excelを変換:', dest)
 for n in expected:print(n, len(data[n])-1, '行')
