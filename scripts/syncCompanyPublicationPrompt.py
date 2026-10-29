"""Port the Worker's interactive writer verbatim; --check verifies current parity.
No model call, production access or Python dependency in the web runtime.
"""
import ast, json, pathlib, sys
from types import SimpleNamespace
root = pathlib.Path(__file__).resolve().parents[1]
worker = root.parent / 'harper_worker'
namespace = {'Mapping': dict, 'COMPANY_CANDIDATE_PRESENTATION_CALL': 'company_candidate_presentation', 'INPUT_TEXT_VERSION': 'matching-readable-input-v1'}
for path, names in [('opp/company_first_search/writing_contract.py', {'TLDR_WRITING', 'HARPER_NOTE_WRITING'}), ('opp/matching/presentation.py', {'SYSTEM', 'write_presentation'})]:
    tree = ast.parse((worker / path).read_text())
    tree.body = [n for n in tree.body if (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)) or (isinstance(n, ast.FunctionDef) and n.name in names)]
    exec(compile(tree, path, 'exec'), namespace)
class Captured(Exception): pass
prompts = []
def capture(value):
    prompts.append(value['system'])
    raise Captured()
namespace['content_fingerprint'] = capture
for has_scores in [True, False]:
    try:
        namespace['write_presentation'](SimpleNamespace(config_summary=lambda: {'llmCalls': {'company_candidate_presentation': {}}}),
            SimpleNamespace(criteria=[{'name':'fixture','criteria':'evidence'}], name='Role', description='',request='Brief',behavior_context='',salary='',role_id='role'),
            SimpleNamespace(profile_text='Profile',talent_id='talent'), None,
            assessment={'criteria': [{'name':'fixture','score':.7,'label':'good'}]} if has_scores else {}, search_brief=[],output_locale='ko')
    except Captured: pass
left, right = prompts
prefix = 0
while left[prefix] == right[prefix]: prefix += 1
suffix = 0
while left[-suffix-1] == right[-suffix-1]: suffix += 1
# Keep readable whole-line boundaries.
prefix = left.rfind('\n', 0, prefix) + 1
suffix = len(left) - left.index('\n', len(left)-suffix) - 1
parts = {'BASE':left[:prefix], 'WITH_SCORES':left[prefix:-suffix], 'WITHOUT_SCORES':right[prefix:-suffix], 'END':left[-suffix:]}
def literal(v): return '`' + v.replace('\\','\\\\').replace('`','\\`').replace('${','\\${') + '`'
output = '// Generated from harper_worker/opp/matching/presentation.py by scripts/syncCompanyPublicationPrompt.py.\n'
output += '\n'.join(f'const {k} = {literal(v)};\n' for k,v in parts.items())
output += '\nexport const publicationSystem = (hasScores: boolean) => BASE + (hasScores ? WITH_SCORES : WITHOUT_SCORES) + END;\n'
path = root/'src/lib/companyFirstSearch/publication/prompt.generated.ts'
if '--check' in sys.argv:
    assert path.read_text() == output, 'Worker writer prompt changed; regenerate the web port and review the difference'
    print('Worker/web interactive system prompts match exactly (with and without scores).')
else: path.write_text(output)
