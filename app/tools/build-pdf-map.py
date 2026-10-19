#!/usr/bin/env python3
"""Gera app/data/pdf-outline.json a partir dos marcadores (outline) dos PDFs do LPI.

Uso: python tools/build-pdf-map.py [pasta_dos_pdfs]
Requer: pip install pypdf
Só guarda números de página e títulos de seção (nenhum texto do material é copiado).
"""
import json, re, sys, os
from pypdf import PdfReader

root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..')
out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'pdf-outline.json')
LESSON = re.compile(r'Li.{1,3}o \d+$')
result = {}
for exam in ('101', '102'):
    fname = f'LPI-Learning-Material-{exam}-500-pt.pdf'
    reader = PdfReader(os.path.join(root, fname))
    entries = []
    def walk(items, depth=0):
        for it in items:
            if isinstance(it, list):
                walk(it, depth + 1)
            else:
                entries.append({'depth': depth, 'title': it.title.strip(),
                                'page': reader.get_destination_page_number(it) + 1})
    walk(reader.outline)
    total = len(reader.pages)
    topics = [e for e in entries if e['depth'] == 0 and re.match(r'^T.pico \d{3}', e['title'])]
    objs = [e for e in entries if e['depth'] == 1 and re.match(r'^\d{3}\.\d ', e['title']) and not LESSON.search(e['title'])]
    for i, o in enumerate(objs):
        nxt_obj = objs[i + 1]['page'] if i + 1 < len(objs) else total + 1
        nxt_topic = [t['page'] for t in topics if t['page'] > o['page']]
        end = min([nxt_obj] + nxt_topic) - 1
        code = o['title'].split()[0]
        sections = [{'title': s['title'], 'page': s['page']}
                    for s in entries if s['depth'] >= 2 and o['page'] <= s['page'] <= end]
        result[code] = {'file': fname, 'exam': exam, 'start': o['page'], 'end': end, 'sections': sections}
    result.setdefault('_files', {})[exam] = {'file': fname, 'pages': total,
                                              'title': (reader.metadata or {}).get('/Title', '')}
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
print(f'ok: {len(result) - 1} objetivos -> {out_path}')
