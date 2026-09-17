"""Local development server that disables HTTP caching.

Browsers cache ES modules aggressively; with Python's plain http.server an edited
module may not be picked up on reload. Run from the repo root:

    python dev/serve.py            # http://127.0.0.1:8123
    python dev/serve.py 9000
"""

import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler)
    print(f'Serving PowerOn on http://127.0.0.1:{port}/')
    server.serve_forever()


if __name__ == '__main__':
    main()
