"""Create the browser catalog from CBRE's supplied index without copying PDF content."""
from __future__ import annotations
import csv, json, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cbre-market-report-index-with-pdfs.csv"
OUT = ROOT / "public" / "data" / "catalog.json"
PDFS = ROOT / "CBRE Market Reports"

# Country centroids give national/regional reports an honest geographic anchor. Market-level
# coordinates live in data/market_coordinates.json and override those regional anchors.
COORDS = {
 "United States":(39.8,-98.6),"Canada":(56.1,-106.3),"Mexico":(23.6,-102.5),"Brazil":(-14.2,-51.9),"Chile":(-35.7,-71.5),"Argentina":(-38.4,-63.6),"Colombia":(4.6,-74.3),"Peru":(-9.2,-75.0),"Australia":(-25.3,133.8),"New Zealand":(-40.9,174.9),"China":(35.9,104.2),"Japan":(36.2,138.3),"India":(20.6,78.9),"Singapore":(1.35,103.8),"South Korea":(35.9,127.8),"Thailand":(15.9,100.9),"Vietnam":(14.1,108.3),"Indonesia":(-0.8,113.9),"Malaysia":(4.2,101.9),"Philippines":(12.9,121.8),"Hong Kong":(22.3,114.2),"Taiwan":(23.7,121.0),"United Kingdom":(55.4,-3.4),"Ireland":(53.1,-8.0),"France":(46.2,2.2),"Germany":(51.2,10.5),"Spain":(40.5,-3.7),"Italy":(41.9,12.6),"Portugal":(39.4,-8.2),"Poland":(51.9,19.1),"Czech Republic":(49.8,15.5),"Romania":(45.9,24.9),"Austria":(47.5,14.6),"Switzerland":(46.8,8.2),"Netherlands":(52.1,5.3),"Belgium":(50.5,4.5),"Sweden":(60.1,18.6),"Norway":(60.5,8.5),"Denmark":(56.3,9.5),"Finland":(61.9,25.7),"Greece":(39.1,21.8),"Turkey":(39.0,35.2),"Saudi Arabia":(23.9,45.1),"United Arab Emirates":(23.4,53.8),"Bahrain":(26.1,50.6),"Qatar":(25.4,51.2),"Egypt":(26.8,30.8),"South Africa":(-30.6,22.9),"Nigeria":(9.1,8.7),"Kenya":(-0.02,37.9),"Israel":(31.0,34.9),"Global":(0,0),"Pan Asia":(23,110)
}
def norm(v: str) -> str: return re.sub(r'[^a-z0-9]+', '', v.lower())
MARKET_COORDS_PATH = ROOT / 'data' / 'market_coordinates.json'
MARKET_COORDS = json.loads(MARKET_COORDS_PATH.read_text(encoding='utf-8')) if MARKET_COORDS_PATH.exists() else {}
def period(date: str, title: str) -> str:
    m = re.search(r'(20\d{2}).*?Q([1-4])|Q([1-4]).*?(20\d{2})', title, re.I)
    if m: return f"{m.group(1) or m.group(4)}-Q{m.group(2) or m.group(3)}"
    return (date or '')[:7]
pdf_lookup = {norm(p.stem): p.name for p in PDFS.glob('*.pdf')}
rows=[]
with SOURCE.open(encoding='utf-8-sig', newline='') as f:
  for i,r in enumerate(csv.DictReader(f)):
    country=r['country'].strip() or 'Global'; market=r['market'].strip() or country
    lat,lng=MARKET_COORDS.get(f'{market}|{country}', COORDS.get(country, COORDS.get('Global')))
    rows.append({'id':r['unique_id'] or str(i),'title':r['title'],'date':r['publish_date'],'period':period(r['publish_date'],r['title']),'region':r['region'] or 'Unclassified','country':country,'market':market,'propertyTypes':[x.strip() for x in r['property_type'].split(';') if x.strip()],'summary':r['summary'],'detailUrl':r['detail_url'],'pdfUrl':r['pdf_url'],'localPdf':pdf_lookup.get(norm(r['title'])),'lat':lat,'lng':lng})
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps({'reports':rows,'meta':{'reportCount':len(rows),'markets':len(set(r['market'] for r in rows)),'countries':len(set(r['country'] for r in rows)),'periods':sorted(set(r['period'] for r in rows if r['period']))}},ensure_ascii=False),encoding='utf-8')
print(f'Wrote {len(rows)} reports to {OUT.relative_to(ROOT)}')
