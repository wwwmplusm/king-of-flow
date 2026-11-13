"""Loopback-only web player with local song processing. Run: .venv/bin/python server.py"""
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'personal' / 'web'
JOBS = {}
LOCK = threading.Lock()
PORT = int(os.environ.get('POTOK_PORT', '8877'))
DEMUCS = os.environ.get('POTOK_DEMUCS_PYTHON', str(ROOT / '.venv-separation/bin/python'))
if not Path(DEMUCS).exists() and Path('/tmp/potok-separation-env/bin/python').exists():
    DEMUCS = '/tmp/potok-separation-env/bin/python'


def process(key, folder):
    try:
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                '-of', 'json', str(folder / 'input.audio')], capture_output=True, text=True, timeout=30, check=True)
        duration = float(json.loads(probe.stdout)['format']['duration'])
        if not 16 <= duration <= 900:
            raise ValueError('Выберите запись от 16 секунд до 15 минут.')
        JOBS[key] = {'status': 'processing', 'message': 'Удаляем голос и подбираем длинные петли. Это может занять несколько минут…'}
        env = os.environ.copy()
        env.setdefault('OMP_NUM_THREADS', '2')
        env.setdefault('NUMBA_CACHE_DIR', '/tmp/potok-numba')
        if Path('/tmp/potok-hf/hub').exists():
            env.setdefault('HF_HOME', '/tmp/potok-hf')
        with (folder / 'processing.log').open('w') as log:
            result = subprocess.run([sys.executable, str(ROOT / 'songloop.py'), str(folder / 'input.audio'),
                '--demucs-python', DEMUCS, '--out', str(folder / 'results')], stdout=log, stderr=log,
                env=env, timeout=1800)
        if result.returncode:
            raise ValueError('Не удалось подготовить петли. Попробуйте другой файл; подробности сохранены в processing.log.')
        report_path = next((folder / 'results').glob('song-*/analysis.json'))
        rows = json.loads(report_path.read_text())['candidates']
        base = '/results/' + str(report_path.parent.relative_to(DATA))
        JOBS[key] = {'status': 'done', 'candidates': [dict(start=r['start'], end=r['end'],
            url=f'{base}/{r["file"]}', warnings=r['warnings']) for r in rows]}
    except ValueError as exc:
        JOBS[key] = {'status': 'error', 'message': str(exc)}
    except Exception:
        JOBS[key] = {'status': 'error', 'message': 'Обработка не завершилась. Проверьте аудиофайл и установку Demucs.'}
    finally:
        LOCK.release()


class Handler(SimpleHTTPRequestHandler):
    def reply(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def valid_host(self):
        return self.headers.get('Host') in {f'localhost:{PORT}', f'127.0.0.1:{PORT}'}

    def do_POST(self):
        if not self.valid_host() or self.headers.get('X-Potok-Upload') != '1':
            return self.reply(403, {'message': 'Forbidden'})
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host'):
            return self.reply(403, {'message': 'Forbidden'})
        if self.path != '/api/jobs':
            return self.reply(404, {})
        try:
            size = int(self.headers.get('Content-Length', 0))
        except ValueError:
            size = 0
        if not 0 < size <= 100 * 1024 * 1024:
            return self.reply(413, {'message': 'Выберите файл размером до 100 МБ.'})
        if not LOCK.acquire(blocking=False):
            return self.reply(409, {'message': 'Уже обрабатывается композиция. Дождитесь завершения.'})
        key = uuid.uuid4().hex
        folder = DATA / key
        try:
            folder.mkdir(parents=True)
            self.connection.settimeout(60)
            with (folder / 'input.audio').open('wb') as file:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError('Incomplete upload')
                    file.write(chunk)
                    remaining -= len(chunk)
            JOBS[key] = {'status': 'queued', 'message': 'Проверяем файл…'}
            threading.Thread(target=process, args=(key, folder), daemon=True).start()
        except Exception:
            LOCK.release()
            return self.reply(400, {'message': 'Не удалось загрузить файл.'})
        self.reply(202, {'id': key})

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {})
        path = urlparse(self.path).path
        if path.startswith('/api/jobs/'):
            job = JOBS.get(path.rsplit('/', 1)[-1])
            return self.reply(200 if job else 404, job or {'message': 'Задание не найдено. Сервер мог перезапуститься.'})
        if path.startswith('/results/'):
            target = (DATA / path[len('/results/'):]).resolve()
            if not target.is_relative_to(DATA.resolve()) or target.suffix != '.wav' or not target.is_file():
                return self.reply(404, {})
        else:
            name = path.lstrip('/') or 'index.html'
            target = ROOT / name
            if '/' in name or target.suffix not in {'.html', '.js', '.css'} or not target.is_file():
                return self.reply(404, {})
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(str(target)))
        self.send_header('Content-Length', str(target.stat().st_size))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        with target.open('rb') as file:
            self.copyfile(file, self.wfile)


if __name__ == '__main__':
    print(f'Поток: http://127.0.0.1:{PORT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
