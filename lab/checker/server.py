#!/usr/bin/env python3
"""Verificador de desafios do laboratório LPIC-1.

Roda DENTRO do container do lab (como root) e escuta só na rede interna do compose (porta 8099).
O app web chama:
  GET  /health
  POST /setup {challenge, params}  -> executa challenges/<id>/setup.sh (prepara o cenário)
  POST /check {challenge, params}  -> executa challenges/<id>/check.sh (imprime linhas "OK|msg" / "FALHA|msg")
  POST /solve {challenge, params}  -> executa solve.sh (só com LAB_ALLOW_SOLVE=1; usado nos autotestes)
Parâmetros chegam como variáveis de ambiente P_<nome>.
"""
import json
import os
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = '/opt/lab/challenges'
ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,60}$')
KEY_RE = re.compile(r'^[a-z][a-z0-9_]{0,30}$')
VAL_RE = re.compile(r'^[A-Za-z0-9_.@:+/-]{1,80}$')
ALLOW_SOLVE = os.environ.get('LAB_ALLOW_SOLVE') == '1'
LOCK = threading.Lock()  # uma operação por vez: os cenários mexem no mesmo sistema


def run_script(name, challenge, params, timeout=45):
    path = os.path.join(ROOT, challenge, name)
    if not os.path.isfile(path):
        return 127, f'script {name} inexistente para {challenge}'
    env = {
        'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'LC_ALL': 'C', 'HOME': '/root', 'LAB_DIR': '/home/aluno/lab', 'CHALLENGE': challenge,
    }
    env.update({f'P_{k}': v for k, v in params.items()})
    try:
        # errors='replace': um script que imprima bytes não-UTF-8 não pode derrubar o verificador
        p = subprocess.run(['bash', path], cwd='/root', env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
        return p.returncode, (p.stdout + p.stderr)
    except subprocess.TimeoutExpired:
        return 124, 'tempo esgotado'


def parse_results(out):
    results = []
    for line in out.splitlines():
        if line.startswith('OK|'):
            results.append({'ok': True, 'msg': line[3:]})
        elif line.startswith('FALHA|'):
            results.append({'ok': False, 'msg': line[6:]})
    return results


class Handler(BaseHTTPRequestHandler):
    server_version = 'lab-checker'

    def log_message(self, fmt, *args):  # silencioso
        pass

    def _send(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self._send(200, {'ok': True})
        self._send(404, {'ok': False, 'erro': 'rota inexistente'})

    def do_POST(self):
        try:
            n = int(self.headers.get('content-length') or 0)
            body = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._send(400, {'ok': False, 'erro': 'JSON inválido'})
        challenge = str(body.get('challenge', ''))
        params = body.get('params') or {}
        if not ID_RE.match(challenge):
            return self._send(400, {'ok': False, 'erro': 'id de desafio inválido'})
        if not isinstance(params, dict) or not all(KEY_RE.match(str(k)) and VAL_RE.match(str(v)) for k, v in params.items()):
            return self._send(400, {'ok': False, 'erro': 'parâmetros inválidos'})
        params = {str(k): str(v) for k, v in params.items()}
        action = self.path.strip('/')
        if action not in ('setup', 'check', 'solve'):
            return self._send(404, {'ok': False, 'erro': 'rota inexistente'})
        if action == 'solve' and not ALLOW_SOLVE:
            return self._send(403, {'ok': False, 'erro': 'solve desativado'})
        try:
            with LOCK:
                rc, out = run_script(f'{action}.sh', challenge, params)
        except Exception as e:  # nunca devolver resposta vazia ao app
            return self._send(500, {'ok': False, 'erro': f'falha interna do verificador: {e}'})
        if action == 'check':
            results = parse_results(out)
            passed = rc == 0 and bool(results) and all(r['ok'] for r in results)
            return self._send(200, {'ok': True, 'passed': passed, 'results': results, 'output': out[-2000:]})
        self._send(200 if rc == 0 else 500, {'ok': rc == 0, 'output': out[-2000:], 'erro': None if rc == 0 else out[-300:]})


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8099), Handler).serve_forever()
