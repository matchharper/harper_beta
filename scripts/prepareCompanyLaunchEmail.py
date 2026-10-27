"""Render the approved Slack package; no email is sent by this script.

Run with SUPABASE_SERVICE_ROLE_KEY in the environment (same signing key as web).
Recipient data and rendered output must stay in the ignored .local directory.
"""
import argparse
import base64
import csv
import hashlib
import hmac
import html
import json
import os
import re
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlencode


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ('style', 'title'):
            self.skip = True
        if tag in ('p', 'div', 'br', 'tr'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('style', 'title'):
            self.skip = False
        if tag in ('p', 'div', 'tr'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--directory', required=True)
    p.add_argument('--test-to', required=True)
    p.add_argument('--test-origin', default='https://matchharper.com')
    args = p.parse_args()
    root = Path(args.directory)
    original = root / 'original'
    output = root / 'prepared'
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    secret = os.environ['SUPABASE_SERVICE_ROLE_KEY'].encode()
    rows = list(csv.DictReader((original / 'recipients.csv').open()))
    recipients = [r['to'].lower() for r in rows]
    if len(set(recipients)) != len(recipients):
        raise ValueError('Duplicate recipient: review before preparing delivery')

    def render(row, index, test=False):
        variant = row['html_version'].split(' (')[0]
        content = (original / variant).read_text()
        content = content.replace('내일(10월 23일)', '오늘(10월 27일)')
        content = content.replace('10월 31일', '11월 5일')
        if row['group'] == 'E':
            content = content.replace('[담당자명]님, 안녕하세요. 지난 [문의월] Harper 사이트에 남겨주신 문의로 연락드려요.', '구열님, 안녕하세요. Harper 소식 전해드리려고 메일 드려요.')
        content = content.replace('[담당자명]님', html.escape('호진님' if test else row['greeting([담당자명]님)']))
        content = content.replace('[회사명]', html.escape('Harper' if test else row['company([회사명])']))
        content = content.replace('[문의월]', html.escape('10월' if test else row['[문의월] (D만)']))
        identity = hashlib.sha256((args.test_to if test else row['to']).lower().encode()).hexdigest()[:24]
        payload = 'early_teams_202610.' + identity
        sig = base64.urlsafe_b64encode(hmac.new(secret, ('billing-promotion-v1:' + payload).encode(), hashlib.sha256).digest()).decode().rstrip('=')
        origin = args.test_origin if test else 'https://matchharper.com'
        link = origin + '/api/billing/promotion?' + urlencode({'token': payload + '.' + sig})
        content = content.replace('https://matchharper.com/ko/company#company-pricing', link)
        # Preserve image bytes, but deliver them as MIME inline parts for Gmail.
        attachments = []
        def image(match):
            mime, encoded = match.groups()
            ext = 'png' if mime == 'image/png' else 'jpg'
            cid = 'harper-launch-' + str(len(attachments))
            attachments.append({'filename': cid + '.' + ext, 'content': encoded, 'content_type': mime, 'content_id': cid})
            return 'src="cid:' + cid + '"'
        content = re.sub(r'src="data:(image/(?:png|jpeg));base64,([^"]+)"', image, content)
        plain = PlainText()
        plain.feed(content)
        text = re.sub(r'\n\s*\n+', '\n\n', ''.join(plain.parts)).strip() + '\n\n시작하기: ' + link
        subject = row['subject']
        mail = {'from': 'Chris Heo <chris@matchharper.com>', 'reply_to': 'chris@matchharper.com', 'to': [args.test_to if test else row['to']], 'subject': subject, 'html': content, 'text': text, 'attachments': attachments}
        if row['cc'] and not test:
            mail['cc'] = [row['cc']]
        key = ('test-' if test else 'recipient-') + str(index).zfill(2)
        (output / (key + '.json')).write_text(json.dumps(mail, ensure_ascii=False, indent=2))
        preview = content
        for a in attachments:
            preview = preview.replace('cid:' + a['content_id'], 'data:' + a['content_type'] + ';base64,' + a['content'])
        (output / (key + '.html')).write_text(preview)
        return {'file': key + '.json', 'group': row['group'], 'to': mail['to'][0]}

    manifest = {'campaign': 'company-launch-20261027', 'production': [], 'test': []}
    for i, row in enumerate(rows, 1):
        manifest['production'].append(render(row, i))
    for i, group in enumerate(('A', 'C', 'D'), 1):
        manifest['test'].append(render(next(r for r in rows if r['group'] == group), i, True))
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    (output / 'package.md').write_text((original / 'package.md').read_text().replace('2026-10-22', '2026-10-27').replace('내일(10월 23일)', '오늘(10월 27일)').replace('10월 31일', '11월 5일'))
    for path in root.rglob('*'):
        os.chmod(path, 0o700 if path.is_dir() else 0o600)
    print(f'Prepared {len(rows)} individual customer emails and 3 test versions. No sends.')


if __name__ == '__main__':
    main()
