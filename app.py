import json
import os
import re
import threading
import urllib.request
import urllib.error
import webbrowser
import zipfile
import io
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import quote, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_PATH = os.path.join(BASE_DIR, 'settings.json')

ALLOWED_OUTPUT_FORMATS = {
    'mp3_44100_128', 'mp3_44100_192', 'mp3_44100_64', 'mp3_22050_32',
    'pcm_44100', 'pcm_22050', 'pcm_16000'
}
ALLOWED_MODELS = {
    'eleven_v3', 'eleven_multilingual_v2', 'eleven_turbo_v2_5',
    'eleven_turbo_v2', 'eleven_monolingual_v1'
}
MAX_POST_BYTES = 1_000_000
MAX_SEGMENTS = 100
MAX_PARTS = 500
MAX_PART_CHARS = 5_000
MAX_TOTAL_CHARS = 200_000


STATIC_DIR = os.path.join(BASE_DIR, 'static')

class Handler(BaseHTTPRequestHandler):
    zip_buffer = None
    zip_filename = 'vox_batch_output.zip'
    cancel_requested = False

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/':
            self._serve_asset(os.path.join(STATIC_DIR, 'index.html'), 'text/html; charset=utf-8')
        elif path == '/static/favicon.png':
            self._serve_asset(os.path.join(STATIC_DIR, 'favicon.png'), 'image/png')
        elif path == '/static/logo.png':
            self._serve_asset(os.path.join(STATIC_DIR, 'logo.png'), 'image/png')
        elif path == '/static/style.css':
            self._serve_asset(os.path.join(STATIC_DIR, 'style.css'), 'text/css; charset=utf-8')
        elif path == '/static/app.js':
            self._serve_asset(os.path.join(STATIC_DIR, 'app.js'), 'application/javascript; charset=utf-8')
        elif path == '/api/settings':
            self._json(200, self._load_settings())
        elif path == '/api/download':
            if Handler.zip_buffer:
                self.send_response(200)
                self.send_header('Content-Type', 'application/zip')
                self.send_header('Content-Disposition', f'attachment; filename="{Handler.zip_filename}"')
                self.end_headers()
                self.wfile.write(Handler.zip_buffer)
                Handler.zip_buffer = None
            else:
                self.send_response(404)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
        except ValueError:
            self._json(400, {'error': 'Invalid Content-Length'})
            return
        if length > MAX_POST_BYTES:
            self._json(413, {'error': 'Request too large'})
            return
        try:
            body = self.rfile.read(length)
            data = json.loads(body or b'{}')
        except json.JSONDecodeError:
            self._json(400, {'error': 'Invalid JSON'})
            return
        if not isinstance(data, dict):
            self._json(400, {'error': 'JSON body must be an object'})
            return

        if self.path == '/api/voices':
            self._handle_voices(data)
        elif self.path == '/api/subscription':
            self._handle_subscription(data)
        elif self.path == '/api/cancel':
            Handler.cancel_requested = True
            self._json(200, {'ok': True})
        elif self.path == '/api/settings':
            self._save_settings(data)
            self._json(200, {'ok': True})
        elif self.path == '/api/generate':
            try:
                self._handle_generate(data)
            except ValueError as e:
                self._json(400, {'error': str(e)})
        else:
            self._json(404, {'error': 'Not found'})

    def _serve_asset(self, path, content_type):
        if not os.path.exists(path):
            self.send_response(404)
            self.end_headers()
            return
        with open(path, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _load_settings(self):
        if not os.path.exists(SETTINGS_PATH):
            return {}
        try:
            with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
                settings = json.load(f)
        except (OSError, json.JSONDecodeError):
            return {}
        if isinstance(settings, dict):
            settings.pop('api_key', None)
            return settings
        return {}

    def _save_settings(self, data):
        allowed = {
            'output_format', 'versions', 'max_chars', 'last_voice_id',
            'voice_settings', 'model_id', 'speed', 'stability',
            'similarity', 'style_exaggeration', 'speaker_boost',
            'zip_filename', 'filename_pattern', 'include_manifest'
        }
        settings = {k: v for k, v in data.items() if k in allowed}
        settings.pop('api_key', None)
        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2)

    def _http_error_text(self, err):
        detail = ''
        try:
            detail = err.read().decode('utf-8', errors='replace').strip()
        except Exception:
            detail = ''
        return f'HTTP {err.code}' + (f': {detail}' if detail else '')

    def _float_range(self, data, key, default, min_value, max_value):
        try:
            value = float(data.get(key, default))
        except (TypeError, ValueError):
            raise ValueError(f'Invalid {key}')
        if not min_value <= value <= max_value:
            raise ValueError(f'{key} is out of range')
        return value

    def _validate_generate_payload(self, data):
        api_key = str(data.get('api_key', '')).strip()
        voice_id = str(data.get('voice_id', '')).strip()
        model_id = str(data.get('model_id', '')).strip()
        output_format = str(data.get('output_format', 'mp3_44100_128')).strip()
        zip_filename = str(data.get('zip_filename', 'vox_batch_output')).strip() or 'vox_batch_output'
        filename_pattern = str(data.get('filename_pattern', 'slug_index_take')).strip()
        if not api_key:
            raise ValueError('API key is required')
        if not re.fullmatch(r'[\w-]{8,128}', voice_id):
            raise ValueError('Invalid voice_id')
        if model_id not in ALLOWED_MODELS:
            raise ValueError('Invalid model_id')
        if output_format not in ALLOWED_OUTPUT_FORMATS:
            raise ValueError('Invalid output_format')
        if filename_pattern not in {'slug_index_take', 'name_part_take', 'index_name_part_take'}:
            raise ValueError('Invalid filename_pattern')
        try:
            versions = int(data.get('versions', 2))
        except (TypeError, ValueError):
            raise ValueError('Invalid versions')
        if not 1 <= versions <= 10:
            raise ValueError('versions is out of range')

        raw_segments = data.get('segments')
        if not isinstance(raw_segments, list) or not raw_segments:
            raise ValueError('segments are required')
        if len(raw_segments) > MAX_SEGMENTS:
            raise ValueError('Too many segments')

        segments = []
        total_parts = 0
        total_chars = 0
        for raw_seg in raw_segments:
            if not isinstance(raw_seg, dict):
                raise ValueError('Invalid segment')
            name = str(raw_seg.get('name', '')).strip()
            parts = raw_seg.get('parts')
            if not name or not isinstance(parts, list) or not parts:
                raise ValueError('Invalid segment')
            clean_parts = []
            for part in parts:
                part_text = str(part).strip()
                if not part_text:
                    continue
                if len(part_text) > MAX_PART_CHARS:
                    raise ValueError('Segment part is too long')
                clean_parts.append(part_text)
                total_chars += len(part_text)
            if clean_parts:
                segments.append({'name': name[:120], 'parts': clean_parts})
                total_parts += len(clean_parts)
        if not segments:
            raise ValueError('segments are required')
        if total_parts > MAX_PARTS:
            raise ValueError('Too many segment parts')
        if total_chars > MAX_TOTAL_CHARS:
            raise ValueError('Script is too large')

        return {
            'api_key': api_key,
            'voice_id': voice_id,
            'model_id': model_id,
            'stability': self._float_range(data, 'stability', 0.5, 0.0, 1.0),
            'similarity': self._float_range(data, 'similarity', 0.75, 0.0, 1.0),
            'style_exaggeration': self._float_range(data, 'style_exaggeration', 0.0, 0.0, 1.0),
            'speed': self._float_range(data, 'speed', 1.0, 0.7, 2.0),
            'speaker_boost': bool(data.get('speaker_boost', True)),
            'output_format': output_format,
            'versions': versions,
            'zip_filename': zip_filename,
            'filename_pattern': filename_pattern,
            'include_manifest': bool(data.get('include_manifest', True)),
            'segments': segments
        }

    def _handle_voices(self, data):
        api_key = str(data.get('api_key', '')).strip()
        if not api_key:
            self._json(400, {'error': 'API key is required'})
            return
        req = urllib.request.Request(
            'https://api.elevenlabs.io/v1/voices',
            headers={'xi-api-key': api_key}
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                resp = json.loads(r.read())
            voices = [{'id': v['voice_id'], 'name': v['name']} for v in resp.get('voices', [])]
            self._json(200, {'voices': voices})
        except urllib.error.HTTPError as e:
            self._json(200, {'error': self._http_error_text(e)})
        except (urllib.error.URLError, TimeoutError) as e:
            self._json(200, {'error': str(e)})

    def _handle_subscription(self, data):
        api_key = str(data.get('api_key', '')).strip()
        if not api_key:
            self._json(400, {'error': 'API key is required'})
            return
        req = urllib.request.Request(
            'https://api.elevenlabs.io/v1/user/subscription',
            headers={'xi-api-key': api_key}
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                resp = json.loads(r.read())
            self._json(200, {
                'character_count': resp.get('character_count', 0),
                'character_limit': resp.get('character_limit', 0),
                'tier': resp.get('tier', '')
            })
        except urllib.error.HTTPError as e:
            self._json(200, {'error': self._http_error_text(e)})
        except (urllib.error.URLError, TimeoutError) as e:
            self._json(200, {'error': str(e)})

    def _handle_generate(self, data):
        import time
        payload_data = self._validate_generate_payload(data)
        api_key = payload_data['api_key']
        voice_id = payload_data['voice_id']
        model_id = payload_data['model_id']
        stability = payload_data['stability']
        similarity = payload_data['similarity']
        style_exag = payload_data['style_exaggeration']
        speed = payload_data['speed']
        speaker_boost = payload_data['speaker_boost']
        output_format = payload_data['output_format']
        versions = payload_data['versions']
        zip_filename = payload_data['zip_filename']
        filename_pattern = payload_data['filename_pattern']
        include_manifest = payload_data['include_manifest']
        segments = payload_data['segments']
        Handler.cancel_requested = False

        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson')
        self.send_header('Transfer-Encoding', 'chunked')
        self.end_headers()

        zip_buf = io.BytesIO()

        def send_msg(obj):
            line = (json.dumps(obj) + '\n').encode('utf-8')
            try:
                self.wfile.write(f'{len(line):X}\r\n'.encode())
                self.wfile.write(line)
                self.wfile.write(b'\r\n')
                self.wfile.flush()
            except (BrokenPipeError, ConnectionError, OSError):
                pass

        def sanitize(name):
            cleaned = re.sub(r'[^\w\s\-]', '', name).strip()
            return cleaned or 'segment'

        def slugify(name):
            cleaned = re.sub(r'[^\w\s\-]', '', name).strip().lower()
            cleaned = re.sub(r'[\s\-]+', '_', cleaned)
            return cleaned or 'segment'

        def make_audio_filename(seg_name, seg_index, part_index, take_index):
            if filename_pattern == 'name_part_take':
                base = f"{sanitize(seg_name)} {part_index} ({take_index})"
            elif filename_pattern == 'index_name_part_take':
                base = f"{seg_index:02d}_{slugify(seg_name)}_{part_index:02d}_take_{take_index:02d}"
            else:
                base = f"{slugify(seg_name)}_{part_index:02d}_take_{take_index:02d}"
            return f"{base}.{ext}"

        def safe_zip_filename(name):
            if name.lower().endswith('.zip'):
                name = name[:-4]
            cleaned = re.sub(r'[^\w\s\-]', '', name).strip()
            cleaned = re.sub(r'[\s\-]+', '_', cleaned)
            return (cleaned or 'vox_batch_output') + '.zip'

        ext = 'wav' if output_format.startswith('pcm') else 'mp3'
        url = f'https://api.elevenlabs.io/v1/text-to-speech/{quote(voice_id)}?output_format={quote(output_format)}'
        voice_settings = {
            'stability': stability
        } if model_id == 'eleven_v3' else {
            'stability': stability,
            'similarity_boost': similarity,
            'style': style_exag,
            'use_speaker_boost': speaker_boost,
            'speed': speed
        }

        manifest = {
            'app': 'Vox Batch',
            'model_id': model_id,
            'output_format': output_format,
            'versions': versions,
            'filename_pattern': filename_pattern,
            'voice_settings': voice_settings,
            'files': []
        }

        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for si, seg in enumerate(segments, start=1):
                if Handler.cancel_requested:
                    send_msg({'type': 'cancelled'})
                    break
                seg_name = sanitize(seg['name'])
                for pi, part_text in enumerate(seg['parts']):
                    for take_index in range(1, versions + 1):
                        if Handler.cancel_requested:
                            send_msg({'type': 'cancelled'})
                            break
                        audio_filename = make_audio_filename(seg_name, si, pi + 1, take_index)
                        manifest_entry = {
                            'file': audio_filename,
                            'segment': seg['name'],
                            'segment_index': si,
                            'chunk_index': pi + 1,
                            'take': take_index,
                            'characters': len(part_text),
                            'ok': False
                        }
                        try:
                            payload = json.dumps({
                                'text': part_text,
                                'model_id': model_id,
                                'voice_settings': voice_settings
                            }).encode('utf-8')
                            req = urllib.request.Request(
                                url, data=payload,
                                headers={
                                    'xi-api-key': api_key,
                                    'Content-Type': 'application/json',
                                    'Accept': 'audio/wav' if ext == 'wav' else 'audio/mpeg'
                                },
                                method='POST'
                            )
                            with urllib.request.urlopen(req, timeout=60) as r:
                                audio = r.read()
                            zf.writestr(audio_filename, audio)
                            manifest_entry['ok'] = True
                            send_msg({'type': 'progress', 'ok': True, 'file': audio_filename})
                        except urllib.error.HTTPError as e:
                            error_text = self._http_error_text(e)
                            manifest_entry['error'] = error_text
                            send_msg({'type': 'progress', 'ok': False, 'file': audio_filename, 'error': error_text})
                        except (urllib.error.URLError, TimeoutError, OSError) as e:
                            manifest_entry['error'] = str(e)
                            send_msg({'type': 'progress', 'ok': False, 'file': audio_filename, 'error': str(e)})
                        manifest['files'].append(manifest_entry)
                        time.sleep(0.3)
                    if Handler.cancel_requested:
                        break
                if Handler.cancel_requested:
                    break

            if include_manifest:
                zf.writestr('manifest.json', json.dumps(manifest, indent=2))

        Handler.zip_buffer = zip_buf.getvalue()
        Handler.zip_filename = safe_zip_filename(zip_filename)
        if not Handler.cancel_requested:
            send_msg({'type': 'done'})
        try:
            self.wfile.write(b'0\r\n\r\n')
        except (BrokenPipeError, ConnectionError, OSError):
            pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    port = 7842
    server = HTTPServer(('127.0.0.1', port), Handler)
    url = f'http://localhost:{port}'
    print(f'Vox Batch running: {url}')
    print('Stop: Ctrl+C')
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
