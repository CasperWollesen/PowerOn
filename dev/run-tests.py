"""Run the browser unit tests headlessly and report the result.

Serves the repository on a free port, loads dev/tests/index.html in headless
Chrome, and reads the JSON summary the test harness writes into the page.

    python dev/run-tests.py            # quiet unless something fails
    python dev/run-tests.py --verbose  # list every test

Set CHROME to point at a browser binary if it is not found automatically.
Exit code 0 = all tests passed.
"""

import argparse
import functools
import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CHROME_CANDIDATES = [
    os.environ.get('CHROME'),
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]


def find_chrome():
    for candidate in CHROME_CANDIDATES:
        if not candidate:
            continue
        if os.path.isfile(candidate):
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    return None


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def run(verbose=False):
    chrome = find_chrome()
    if not chrome:
        print('No Chrome or Edge found. Set CHROME=/path/to/chrome', file=sys.stderr)
        return 2

    port = free_port()
    handler = functools.partial(QuietHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    url = f'http://127.0.0.1:{port}/dev/tests/index.html'
    with tempfile.TemporaryDirectory() as profile:
        try:
            result = subprocess.run(
                [
                    chrome,
                    '--headless=new',
                    '--disable-gpu',
                    '--no-sandbox',
                    '--disable-extensions',
                    f'--user-data-dir={profile}',
                    '--virtual-time-budget=20000',
                    '--dump-dom',
                    url,
                ],
                capture_output=True,
                text=True,
                timeout=180,
                encoding='utf-8',
                errors='replace',
            )
        except subprocess.TimeoutExpired:
            print('Chrome timed out', file=sys.stderr)
            return 2
        finally:
            server.shutdown()

    match = re.search(r'<pre id="results-json">(.*?)</pre>', result.stdout, re.S)
    if not match:
        print('No test results in the page. Chrome output:', file=sys.stderr)
        print(result.stdout[-3000:], file=sys.stderr)
        print(result.stderr[-2000:], file=sys.stderr)
        return 2

    summary = json.loads(match.group(1))
    if verbose or summary['failed']:
        for failure in summary['failures']:
            print(f"FAIL [{' '.join(failure['reqIds'])}] {failure['name']}\n      {failure['error']}")
    print(
        f"{summary['passed']}/{summary['total']} tests passed, "
        f"{len(summary['requirements'])} requirements covered"
    )
    return 1 if summary['failed'] else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verbose', action='store_true', help='list failures in detail')
    args = parser.parse_args()
    sys.exit(run(verbose=args.verbose))
