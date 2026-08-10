"""Fast, resumable Gemini extraction for the complete local CBRE PDF library.

Uses a bounded worker pool, rate-limit-aware retries, request timeouts, atomic
writes, and per-page provenance. Completed files are never submitted again.
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]; PDF_DIR=ROOT/'CBRE Market Reports'; OUT=ROOT/'data'/'extractions'; FAILURES=ROOT/'logs'/'extraction-failures.jsonl'
SCHEMA='''Return JSON only: {"report_summary":string,"observations":[{"metric":string,"value":number|null,"value_text":string,"unit":string,"currency":string|null,"period":string|null,"geography":string|null,"property_type":string|null,"source_page":number,"source_label":string,"confidence":0.0}]}. Extract only explicit numeric observations. Never infer values from chart shapes. Every observation must cite its source page.'''
print_lock=threading.Lock()
class RateLimiter:
    """Evenly spaces requests so the worker pool sustains, rather than bursts past, quota."""
    def __init__(self, requests_per_minute:int):
        self.spacing=60/max(1,requests_per_minute); self.next_allowed=0.0; self.lock=threading.Lock()
    def wait(self):
        with self.lock:
            now=time.monotonic(); scheduled=max(now,self.next_allowed); self.next_allowed=scheduled+self.spacing
        delay=scheduled-now
        if delay>0: time.sleep(delay)

def load_env():
    p=ROOT/'.env'
    if p.exists():
        for line in p.read_text(encoding='utf8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k,v=line.split('=',1); os.environ.setdefault(k.strip(),v.strip().strip('"\''))
def safe_name(p:Path): return hashlib.sha256(str(p).encode()).hexdigest()[:16]
def report_prompt(pdf:Path):
    # PDF attachment retains every chart/diagram. Text provides a compact fallback/index.
    reader=PdfReader(str(pdf)); text=[]
    for no,page in enumerate(reader.pages,1):
        page_text=(page.extract_text() or '').strip()
        if page_text: text.append(f'--- PAGE {no} ---\n{page_text[:7000]}')
    return f'{SCHEMA}\nReport: {pdf.name}\n\n'+'\n'.join(text[:12])
def is_retryable(error:Exception):
    return any(token in str(error).lower() for token in ('429','rate','resource_exhausted','deadline','timeout','timed out','500','502','503','504','unavailable','connection'))
def extract(pdf:Path,args,limiter:RateLimiter):
    from google import genai
    from google.genai import types
    for attempt in range(1,args.retries+1):
        try:
            # Client is local to this worker so concurrent requests do not share transport state.
            client=genai.Client(api_key=os.environ['GEMINI_API_KEY'],http_options=types.HttpOptions(timeout=args.timeout*1000))
            contents=[report_prompt(pdf)]
            if args.visual: contents.append(types.Part.from_bytes(data=pdf.read_bytes(),mime_type='application/pdf'))
            limiter.wait()
            response=client.models.generate_content(model=args.model,contents=contents)
            raw=re.sub(r'^```(?:json)?|```$','',response.text.strip(),flags=re.M).strip(); data=json.loads(raw)
            data.update({'source_file':pdf.name,'source_sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'extracted_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'model':args.model,'visual_pdf_attached':args.visual})
            target=OUT/f'{safe_name(pdf)}.json'; temp=target.with_suffix('.tmp')
            temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8'); temp.replace(target)
            return True,len(data.get('observations',[])),attempt,''
        except Exception as exc:
            if attempt==args.retries or not is_retryable(exc): return False,0,attempt,str(exc)
            requested=re.search(r'retry in ([\d.]+)s',str(exc),re.I)
            delay=max(min(60,2**attempt),float(requested.group(1)) if requested else 0)+((hash(pdf.name)%1000)/1000)
            with print_lock: print(f'RETRY {pdf.name} attempt {attempt}/{args.retries} in {delay:.1f}s: {exc}',flush=True)
            time.sleep(delay)
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--limit',type=int); ap.add_argument('--force',action='store_true'); ap.add_argument('--model',default='gemini-3.5-flash-lite'); ap.add_argument('--visual',action='store_true'); ap.add_argument('--workers',type=int,default=8,help='Concurrent Gemini requests (default: 8).'); ap.add_argument('--rpm',type=int,default=15,help='Gemini request quota per minute (default: 15).'); ap.add_argument('--retries',type=int,default=6); ap.add_argument('--timeout',type=int,default=120,help='Per-request timeout in seconds.'); args=ap.parse_args()
    load_env()
    if not os.getenv('GEMINI_API_KEY'): raise SystemExit('GEMINI_API_KEY is required in .env or environment.')
    try: from google import genai # noqa: F401
    except ImportError: raise SystemExit('Install dependencies: pip install pypdf google-genai')
    OUT.mkdir(parents=True,exist_ok=True); FAILURES.parent.mkdir(parents=True,exist_ok=True)
    pending=[p for p in sorted(PDF_DIR.glob('*.pdf')) if args.force or not (OUT/f'{safe_name(p)}.json').exists()]
    if args.limit: pending=pending[:args.limit]
    limiter=RateLimiter(args.rpm)
    print(f'Starting {len(pending)} reports with {args.workers} workers, paced at {args.rpm} requests/minute; timeout={args.timeout}s.',flush=True)
    completed=failed=0
    with ThreadPoolExecutor(max_workers=max(1,args.workers),thread_name_prefix='gemini') as pool:
        futures={pool.submit(extract,p,args,limiter):p for p in pending}
        for future in as_completed(futures):
            pdf=futures[future]
            try: ok,count,attempt,error=future.result()
            except Exception as exc: ok,count,attempt,error=False,0,0,str(exc)
            if ok:
                completed+=1; print(f'OK {completed+failed}/{len(pending)} | {pdf.name} | {count} observations | attempt {attempt}',flush=True)
            else:
                failed+=1; record=json.dumps({'file':pdf.name,'error':error,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
                with FAILURES.open('a',encoding='utf8') as f: f.write(record+'\n')
                print(f'FAILED {completed+failed}/{len(pending)} | {pdf.name} | {error}',flush=True)
    print(f'Finished: {completed} completed, {failed} failed. Re-run to retry failures.',flush=True)
if __name__=='__main__': main()
