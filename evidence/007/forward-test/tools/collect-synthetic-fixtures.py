# FIXTURE SYNTHETIQUE: lit des donnees fictives; n execute aucun produit.
import json, sys
from pathlib import Path
f=Path(sys.argv[1])
v=json.loads(f.read_text())
assert v['fixture'] is True
rows=v['pairs']
print(json.dumps({'fixture': True, 'samples':len(rows), 'baselineMeanMinutes':sum(x['baselineMinutes'] for x in rows)/len(rows), 'candidateMeanMinutes':sum(x['candidateMinutes'] for x in rows)/len(rows), 'gainMinutes':sum(x['baselineMinutes']-x['candidateMinutes'] for x in rows)/len(rows), 'lostUserFiles':sum(len(set(x['filesBefore'])-set(x['filesAfter'])) for x in rows)}, indent=2))
