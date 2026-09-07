"""Download pinned public mirror data; verify normalized CSV SHA-256 before saving."""
import base64
import hashlib
import json
import pathlib
import urllib.request

DATASETS = [
    ('BTCUSDT-1d.csv', 'marek3993/trendatlas-crypto', '09072461ec00805b7a17c68ff6f279a40807eaa1', '1be87fb911e193e729c9f24e34d0a07a28218f396db99c41091286250ad71413'),
    ('ETHUSDT-1d.csv', 'marek3993/trendatlas-crypto', 'fa0efa8f5628f0172822fa24eb30420a4cb38787', 'f6111c54cdfe595707f665c8ae2111c35195a1ddc725cee4bb7aa1784d44508d'),
    ('BTCUSDT-crosscheck.csv', 'Ruhguevara/Algorithmic_trading', 'cafaaeca41df4e0ae65ee28a25a383a4b862ba39', None),
]
for filename, repo, blob, expected in DATASETS:
    url = f'https://api.github.com/repos/{repo}/git/blobs/{blob}'
    request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Arena-research'})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    original = base64.b64decode(payload['content'])
    git_hash = hashlib.sha1(b'blob ' + str(len(original)).encode() + b'\0' + original).hexdigest()
    if git_hash != blob:
        raise SystemExit('Git blob checksum mismatch; refusing changed data.')
    raw = (original.decode('utf-8').replace('\r\n', '\n').rstrip('\n') + '\n').encode()
    if expected and hashlib.sha256(raw).hexdigest() != expected:
        raise SystemExit(f'Normalized data checksum mismatch: {filename}')
    output = pathlib.Path(__file__).parent / 'data' / filename
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(raw)
    print(f'Verified {filename}')
