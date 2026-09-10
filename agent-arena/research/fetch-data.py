"""Fetch the exact public historical data blob used in validation (no credentials)."""
import base64, hashlib, json, pathlib, urllib.request
url = 'https://api.github.com/repos/fiit-ba/ML-for-arbitrage-in-cryptoexchanges/git/blobs/b858a91a338ae43c63711274d6d22793f754dd0a'
request = urllib.request.Request(url, headers={'User-Agent': 'Agent-Arena-validation'})
with urllib.request.urlopen(request, timeout=60) as response:
    payload = json.load(response)
raw = base64.b64decode(payload['content']).rstrip(b'\n') + b'\n'
expected = 'a9d71708dcd996a317e30626e201124dfd596480dc920eef56f66b762b71004a'
if hashlib.sha256(raw).hexdigest() != expected:
    raise SystemExit('Dataset checksum mismatch; refusing changed data.')
output = pathlib.Path(__file__).parent / 'data' / 'BTCUSDT-5m.csv'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(raw)
print(f'Verified dataset saved to {output}')
