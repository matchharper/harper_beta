"""Build the bound Google Apps Script from the reviewed Sheet contract.

The generated file contains no credentials. Each authorized user stores their
scoped GTM connection in Apps Script UserProperties at runtime.
"""

from pathlib import Path
import argparse
import json


ROOT = Path(__file__).resolve().parent


def build() -> str:
    config = json.loads((ROOT / 'sheet-columns.json').read_text())
    bridge = (ROOT / 'sheets-bridge.gs').read_text()
    encoded = json.dumps(config, ensure_ascii=False, separators=(',', ':'))
    return f'const GTM_TABLES={encoded};\n\n{bridge}'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    content = build()
    if args.output:
        args.output.write_text(content)
    else:
        print(content, end='')


if __name__ == '__main__':
    main()
