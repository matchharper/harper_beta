"""Small client for the scoped GTM RPC; no database administrator credentials required.

  python3 scripts/contents-engine/client.py --request request.json
  python3 scripts/contents-engine/client.py --action list --entity gtm_creators
  python3 scripts/contents-engine/client.py --rpc gtm_outreach_prepare --request outreach.json

Config: GTM_CONFIG or ~/.config/harper/contents-engine.json (owner-readable only).
Keys: supabase_url, anon_key, token. Keep the file outside the repository.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import ssl
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def call_api(payload, config=None, rpc_name='gtm_api'):
    if config is None:
        path = Path(os.environ.get('GTM_CONFIG', '~/.config/harper/contents-engine.json')).expanduser()
        if path.stat().st_mode & 0o077:
            raise RuntimeError('GTM config must be readable only by its owner (chmod 600).')
        config = json.loads(path.read_text())
    request = {f'p_{key}': value for key, value in payload.items()}
    request['p_token'] = config['token']
    if not rpc_name.startswith('gtm_'):
        raise RuntimeError('Only scoped GTM RPCs are supported.')
    http = Request(config['supabase_url'].rstrip('/') + '/rest/v1/rpc/' + rpc_name,
                   data=json.dumps(request).encode(), method='POST',
                   headers={'apikey': config['anon_key'], 'Content-Type': 'application/json'})
    try:
        # macOS Python installations may lack a configured root certificate bundle.
        # Retain full TLS verification using certifi when it is installed.
        try:
            import certifi
            context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            context = ssl.create_default_context()
        with urlopen(http, timeout=60, context=context) as response:
            return json.load(response)
    except HTTPError as exc:
        body = json.loads(exc.read().decode())
        raise RuntimeError(f"GTM API {exc.code}: {body.get('message', 'request failed')}") from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', type=Path)
    parser.add_argument('--rpc', default='gtm_api')
    parser.add_argument('--action', choices=['list', 'get', 'today', 'performance', 'overview'])
    parser.add_argument('--entity')
    parser.add_argument('--id')
    parser.add_argument('--data', default='{}')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    payload = json.loads(args.request.read_text()) if args.request else {
        'action': args.action, 'entity': args.entity, 'id': args.id, 'data': json.loads(args.data),
    }
    rpc_name = payload.pop('rpc', args.rpc)
    if rpc_name == 'gtm_api' and not payload.get('action'):
        parser.error('Provide --request or --action.')
    result = call_api(payload, rpc_name=rpc_name)
    content = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(content+'\n')
    else:
        print(content)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
