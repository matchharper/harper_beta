"""Test-only oracle: execute the original pure Worker functions, no DB/provider."""
import ast
import __future__
import hashlib
import json
import math
import re
import sys
from collections.abc import Mapping, Sequence
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

root = Path(sys.argv[1])
scope = dict(globals())

def load(path, names=None):
    tree = ast.parse((root / path).read_text())
    nodes = [n for n in tree.body if isinstance(n, (ast.Assign, ast.AnnAssign)) or
             isinstance(n, ast.FunctionDef) and (names is None or n.name in names)]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec', flags=__future__.annotations.compiler_flag), scope)

load('opp/utils/llm_input_text.py')
original_document = scope['evidence_document']
scope['evidence_document'] = lambda sections: original_document(sections, now=datetime.fromisoformat('2026-11-02T15:30:00+00:00'))
load('opp/matching/text.py', {'profile_text'})
load('opp/matching/company_requested.py', {'score_profile', 'evaluation_text'})
load('opp/matching/company_requested_decisions.py', {'build_request', 'parse_assessment'})
data = json.load(sys.stdin)
source = data['source']
for key in ('salary_min', 'salary_max'):
    if source['role'].get(key) is not None:
        source['role'][key] = float(source['role'][key])
requests = [scope['build_request'](stage, scope['evaluation_text'](source, stage=stage), source['role'].get('criteria', [])) for stage in (1, 2)]
fingerprint = hashlib.sha256(json.dumps({'input': source, 'model': scope['MODEL'], 'prompt': scope['PROMPT_VERSION']}, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
print(json.dumps({'requests': requests, 'fingerprint': fingerprint,
    'assessments': [scope['parse_assessment'](i + 1, raw, source['role'].get('criteria', [])) for i, raw in enumerate(data['responses'])]}, ensure_ascii=False))
