"""Recompute operational metrics from the complete published comparison."""
from pathlib import Path
import json,statistics
root=Path(__file__).resolve().parents[1]
rows=json.loads((root/'evaluation/mission50-comparison.json').read_text('utf8'))['records']
output={}
for phase in ['before','after']:
    data=[r[phase] for r in rows]
    output[phase]={'cases':len(data),'http_200':sum(r['http_status']==200 for r in data),
        'non_200':sum(r['http_status']!=200 for r in data),
        'nonempty_answers':sum(r['answer_chars']>0 for r in data),
        'median_seconds':round(statistics.median(r['seconds'] for r in data if isinstance(r['seconds'],(int,float))),2)}
expected=json.loads((root/'evaluation/summary.json').read_text('utf8'))
assert all(output[p]==expected[p] for p in output),'Published summary mismatch'
print(json.dumps(output,indent=2))
print('Operational metrics only; not an accuracy score.')
