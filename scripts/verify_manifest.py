"""Check published file integrity. The manifest does not authenticate the publisher."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'MANIFEST_SHA256.json').read_text('utf8'))
errors=[]
for row in manifest['files']:
    path=(root/row['file']).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        errors.append(row['file']+': missing or invalid');continue
    if hashlib.sha256(path.read_bytes()).hexdigest()!=row['sha256']:
        errors.append(row['file']+': hash mismatch')
print(json.dumps({'checked':len(manifest['files']),'errors':errors},indent=2))
sys.exit(bool(errors))
