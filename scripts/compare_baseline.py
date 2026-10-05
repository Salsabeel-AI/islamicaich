from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parents[1]
m=json.loads((r/'challenge/baseline/manifest.json').read_text('utf8'))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
changed=[];unchanged=[];missing=[]
for item in m['files']:
    old=r/'challenge/baseline/app'/item['file'];new=r/'app'/item['file']
    assert digest(old)==item['published_content_sha256'],item['file']
    if not new.exists():missing.append(item['file'])
    elif old.read_bytes().replace(b'\r\n',b'\n')==new.read_bytes().replace(b'\r\n',b'\n'):unchanged.append(item['file'])
    else:changed.append(item['file'])
known={x['file'] for x in m['files']}
added=[p.relative_to(r/'app').as_posix() for p in (r/'app').rglob('*') if p.is_file() and 'node_modules' not in p.parts and p.relative_to(r/'app').as_posix() not in known]
print(json.dumps({'baseline_files':len(m['files']),'changed':changed,'unchanged_count':len(unchanged),'missing':missing,'added_or_excluded_from_baseline':added,'scope':'application source comparison; does not establish authorship date of every changed byte'},ensure_ascii=False,indent=2))
