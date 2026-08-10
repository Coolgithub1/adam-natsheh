"""Publish completed extraction results for the Atlas UI, retaining page-level provenance."""
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'data'/'extractions'; OUT=ROOT/'public'/'data'/'observations.json'
items=[]
for f in SRC.glob('*.json'):
    data=json.loads(f.read_text(encoding='utf8'))
    for o in data.get('observations',[]):
        if o.get('value') is not None: items.append({**o,'source_file':data['source_file'],'visual_pdf_attached':data.get('visual_pdf_attached',False)})
OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(items,ensure_ascii=False),encoding='utf8')
print(f'Published {len(items)} observations from {len(list(SRC.glob("*.json")))} reports')
