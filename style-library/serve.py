"""Loopback-only gallery with allowlisted source files and byte-range video seeking."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import argparse, json, mimetypes, re
from library import BASE, STUDIO, catalog, entry_map, reference_brief, context_handoff, site_settings
from project_index import public_index, get_file, get_asset
from review_actions import apply_decision, ReviewError
from security import registered_file, MEDIA, NOTES
from reference_intake import save as save_reference, current as reference_state, visibility_state, set_visibility, IntakeError
from feedback import save as save_feedback, current as feedback_state, save_link as save_feedback_link, change as change_feedback, FeedbackError
from reference_notes import save as save_reference_note, current as reference_notes_state, handoff as reference_handoff, NoteError
from reference_preview import save as save_reference_preview, PreviewError
from project_tools import state as project_tools_state, open_editor, ToolsError

from project_script import current as script_state, save as save_script

class Handler(SimpleHTTPRequestHandler):
    def trusted(self, write=False):
        hosts = self.headers.get_all('Host', [])
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if len(hosts) != 1 or hosts[0] not in allowed:
            self.send_error(403); return False
        origin = self.headers.get('Origin')
        if (self.headers.get('Sec-Fetch-Site') == 'cross-site' or
                (origin is not None and origin != 'http://' + hosts[0]) or
                (write and origin != 'http://' + hosts[0])):
            self.send_error(403); return False
        return True

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
        super().end_headers()

    def do_POST(self):
        if self.path == '/project-script':
            if not self.trusted(write=True):return
            if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length',[]))!=1:return self.send_error(400)
            if self.headers.get('X-Studio-Action')!='project-script':return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=262144:return self.send_error(413)
                result=save_script(json.loads(self.rfile.read(size)))
            except json.JSONDecodeError:return self.json_error(400,'Use a valid script save request.')
            except (FeedbackError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'The script could not be saved. Existing scripts and your draft are preserved.')
            return self.text(json.dumps(result),'application/json',False)

        if self.path in {'/reference-preview','/open-editor'}:
            if not self.trusted(write=True):return
            if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length',[]))!=1:return self.send_error(400)
            action='reference-preview' if self.path=='/reference-preview' else 'open-editor'
            if self.headers.get('X-Studio-Action')!=action:return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=4096:return self.send_error(413)
                body=json.loads(self.rfile.read(size))
                result=save_reference_preview(body) if action=='reference-preview' else open_editor(body)
            except json.JSONDecodeError:return self.json_error(400,'Use a valid studio request.')
            except (PreviewError,IntakeError,ToolsError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'This action is unavailable. Your saved work is preserved.')
            return self.text(json.dumps(result),'application/json',False)
        if self.path in {'/reference-notes','/reference-handoff'}:
            if not self.trusted(write=True):return
            if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length',[]))!=1:return self.send_error(400)
            action='reference-note' if self.path=='/reference-notes' else 'reference-handoff'
            if self.headers.get('X-Studio-Action')!=action:return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=(16384 if action=='reference-note' else 262144):return self.send_error(413)
                body=json.loads(self.rfile.read(size))
                result=save_reference_note(body) if action=='reference-note' else reference_handoff(body,'http://'+self.headers['Host'])
            except json.JSONDecodeError:return self.json_error(400,'Use a valid reference note request.')
            except (NoteError,FeedbackError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'Reference notes are unavailable. Existing notes and your draft are preserved.')
            return self.text(json.dumps(result),'application/json',False)
        if self.path == '/reference-visibility':
            if not self.trusted(write=True):return
            if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length',[]))!=1:return self.send_error(400)
            if self.headers.get('X-Studio-Action')!='reference-visibility':return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=4096:return self.send_error(413)
                result=set_visibility(json.loads(self.rfile.read(size)))
            except json.JSONDecodeError:return self.json_error(400,'Use a valid library request.')
            except (IntakeError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'The library could not be changed. Your references are preserved.')
            return self.text(json.dumps(result),'application/json',False)
        if not self.trusted(write=True): return
        if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length', [])) != 1:
            return self.send_error(400)
        if self.path == '/feedback-note':
            if self.headers.get('X-Studio-Action')!='feedback-note':return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=16384:return self.send_error(413)
                result=change_feedback(json.loads(self.rfile.read(size)))
            except json.JSONDecodeError:return self.json_error(400,'Use a valid JSON feedback change.')
            except (FeedbackError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'Feedback could not be changed. Existing notes and your draft are preserved.')
            return self.text(json.dumps(result),'application/json',False)
        if self.path == '/feedback-link':
            if not self.trusted(write=True):return
            if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length',[]))!=1:return self.send_error(400)
            if self.headers.get('X-Studio-Action')!='feedback-link':return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1048576:return self.send_error(413)
                result=save_feedback_link(json.loads(self.rfile.read(size)))
            except json.JSONDecodeError:return self.json_error(400,'Use a valid JSON feedback selection.')
            except (FeedbackError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'The feedback link could not be prepared. Your saved notes are preserved.')
            return self.text(json.dumps(result),'application/json',False)
        if self.path == '/feedback':
            if not self.trusted(write=True):return
            if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length',[]))!=1:return self.send_error(400)
            if self.headers.get('X-Studio-Action')!='feedback':return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=16384:return self.send_error(413)
                body=json.loads(self.rfile.read(size))
                result=save_feedback(body)
            except json.JSONDecodeError:return self.json_error(400,'Use a valid JSON feedback request.')
            except (FeedbackError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'Feedback could not be saved. Existing notes were preserved; try again.')
            return self.text(json.dumps(result),'application/json',False)
        if self.path == '/references':
            if self.headers.get('X-Studio-Action')!='reference':return self.send_error(403)
            if self.headers.get_content_type()!='application/json':return self.send_error(415)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=16384:return self.send_error(413)
                body=json.loads(self.rfile.read(size))
            except (ValueError,TypeError):return self.json_error(400,'Use a valid JSON reference request.')
            try:result=save_reference(body)
            except IntakeError as error:return self.json_error(error.status,str(error))
            except ReviewError as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'The reference could not be saved. Check the local library and try again.')
            return self.text(json.dumps(result),'application/json',False)
        if self.path == '/review-action':
            host = self.headers.get('Host', '')
            allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            if (host not in allowed or self.headers.get('Origin') != 'http://' + host or
                self.headers.get('Sec-Fetch-Site') == 'cross-site' or
                self.headers.get('X-Studio-Action') != 'review'):
                return self.send_error(403)
            if self.headers.get_content_type() != 'application/json':
                return self.send_error(415)
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 8192: return self.send_error(413)
                body = json.loads(self.rfile.read(size))
            except (ValueError, TypeError):
                return self.json_error(400, 'Use a valid JSON review request.')
            try:
                result = apply_decision(body)
            except ReviewError as error:
                return self.json_error(error.status, str(error))
            except (ValueError, TypeError, KeyError, OSError):
                return self.json_error(503, 'The project metadata could not be saved. Ask your assistant to check its current files and approval journal.')
            return self.text(json.dumps(result), 'application/json', False)
        if self.path != '/context': return self.send_error(404)
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.send_error(403)
        if self.headers.get_content_type() != 'application/json':
            return self.send_error(415, 'Use application/json.')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 65536: return self.send_error(413)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict) or set(body) - {'ids', 'notes', 'mode'}:
                raise ValueError()
            base_url = origin or f'http://127.0.0.1:{self.server.server_port}'
            text = context_handoff(body.get('ids'), body.get('notes'), body.get('mode', 'short'), base_url=base_url)
        except (ValueError, TypeError, KeyError):
            return self.send_error(400, 'Choose valid references, examples and notes (1000 characters per field).')
        return self.text(text, 'text/plain; charset=utf-8', False)

    def do_HEAD(self): self.respond(head=True)
    def do_GET(self): self.respond(head=False)
    def respond(self, head=False):
        if not self.trusted(): return
        route=urlparse(self.path); path=unquote(route.path)
        if path=='/project-tools':
            if not self.trusted():return
            try:
                query=parse_qs(route.query,keep_blank_values=True)
                if set(query)!={'project','artifact'} or any(len(v)!=1 for v in query.values()):return self.send_error(400)
                return self.text(json.dumps(project_tools_state(query['project'][0],query['artifact'][0])),'application/json',head)
            except ToolsError as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'The project tools are unavailable. Your work is preserved.')
        if path=='/reference-notes':
            if not self.trusted():return
            try:
                query=parse_qs(route.query,keep_blank_values=True)
                return self.text(json.dumps(reference_notes_state(query.get('id',[''])[0],query.get('example',[None])[0])),'application/json',head)
            except (NoteError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'Reference notes are unavailable. Existing notes are preserved.')
        if path=='/reference-visibility':
            if not self.trusted():return
            try:return self.text(json.dumps(visibility_state(parse_qs(route.query).get('id',[''])[0])),'application/json',head)
            except (IntakeError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'The reference is unavailable.')
        if path=='/project-script':
            if not self.trusted():return
            try:
                query=parse_qs(route.query,keep_blank_values=True)
                return self.text(json.dumps(script_state(query.get('project',[''])[0],query.get('version',[None])[0])),'application/json',head)
            except (FeedbackError,ReviewError) as error:return self.json_error(error.status,str(error))
            except (OSError,ValueError,TypeError,KeyError):return self.json_error(503,'Saved scripts are unavailable. Existing files are preserved.')
        if path=='/feedback':
            if not self.trusted():return
            try:return self.text(json.dumps(feedback_state(parse_qs(route.query).get('project',[''])[0], parse_qs(route.query,keep_blank_values=True).get('selection',[None])[0])),'application/json',head)
            except (FeedbackError,ReviewError) as error:return self.json_error(error.status,str(error)) if not head else self.send_error(error.status)
            except (OSError,ValueError,TypeError,KeyError):return self.send_error(503,'Saved feedback is unavailable.')
        if path=='/reference-state':
            try:return self.text(json.dumps(reference_state(parse_qs(route.query).get('id',[''])[0])),'application/json',head)
            except IntakeError as error:return self.json_error(error.status,str(error)) if not head else self.send_error(error.status)
            except (OSError,ValueError,TypeError,KeyError):return self.send_error(503,'The reference details are unavailable.')
        if path == '/projects.json' or path.startswith('/project-files/') or path.startswith('/project-assets/'):
            host = self.headers.get('Host', '')
            allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            if host not in allowed or self.headers.get('Sec-Fetch-Site') == 'cross-site':
                return self.send_error(403)
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + host:
                return self.send_error(403)
            try:
                if path == '/projects.json':
                    return self.text(json.dumps(public_index()), 'application/json', head)
                parts = path.strip('/').split('/')
                if len(parts) != 3: raise ValueError()
                filename, mime = (get_asset if path.startswith('/project-assets/') else get_file)(parts[1], parts[2])
                return self.file(filename, head, content_type=mime)
            except (KeyError, IndexError, StopIteration, ValueError, OSError):
                return self.send_error(404, 'This project checkpoint is unavailable. Read its current project notes.')
        if path=='/api/health':return self.text(json.dumps({'app':'ai-video-studio','root':str(BASE)}),'application/json',head)
        if path=='/catalog.json':return self.text(json.dumps(catalog()),'application/json',head)
        if path=='/site-settings.json':return self.text(json.dumps(site_settings()),'application/json',head)
        if path=='/brief':
            try:
                ids=parse_qs(route.query).get('ids',[''])[0].split(',')
                return self.text(reference_brief(ids),'text/plain; charset=utf-8',head)
            except (KeyError,ValueError):return self.send_error(400,'Choose valid video, technique and example ids.')
        if path.startswith('/media/'):
            e=entry_map().get(path.removeprefix('/media/'))
            try:
                return self.file(registered_file(STUDIO, e['media_path'], MEDIA), head) if e and e.get('media_path') else self.send_error(404)
            except (ValueError, OSError): return self.send_error(404)
        if path.startswith('/slides/'):
            parts=path.strip('/').split('/')
            try:
                if len(parts)!=3:raise ValueError()
                e=entry_map()[parts[1]]
                if not re.fullmatch(r'0|[1-9][0-9]*', parts[2]): raise ValueError()
                index=int(parts[2])
                if e.get('asset_type')!='carousel' or not 0<=index<len(e['slides']):raise ValueError()
                return self.file(registered_file(STUDIO,e['slides'][index]['path'],MEDIA),head)
            except (KeyError,IndexError,ValueError,OSError):return self.send_error(404)
        if path.startswith('/download/'):
            e=entry_map().get(path.removeprefix('/download/'))
            try:
                return self.file(registered_file(STUDIO,e['archive_path'],{'.zip'}),head) if e and e.get('archive_path') else self.send_error(404)
            except (ValueError, OSError): return self.send_error(404)
        if path.startswith('/notes/'):
            parts=path.strip('/').split('/')
            try:
                if len(parts)!=3 or not re.fullmatch(r'0|[1-9][0-9]*',parts[2]): raise ValueError()
                e=entry_map()[parts[1]]; filename=e['notes'][int(parts[2])]
                return self.file(registered_file(STUDIO,filename,NOTES),head,content_type='text/plain; charset=utf-8')
            except (KeyError,IndexError,ValueError,OSError):return self.send_error(404)
        filename=(BASE/'dist'/('index.html'if path=='/'else path.lstrip('/'))).resolve()
        if not filename.is_relative_to((BASE/'dist').resolve()) or (BASE/'dist').is_symlink():return self.send_error(403)
        return self.file(filename,head)

    def text(self,body,content_type,head):
        data=body.encode();self.send_response(200);self.send_header('Content-Type',content_type);self.send_header('Content-Length',len(data));self.send_header('Cache-Control','no-cache');self.end_headers()
        if not head:self.wfile.write(data)

    def json_error(self, status, message):
        data = json.dumps({'error': message}).encode()
        self.send_response(status);self.send_header('Content-Type', 'application/json');self.send_header('Content-Length', len(data));self.send_header('Cache-Control', 'no-store');self.end_headers();self.wfile.write(data)

    def file(self,filename,head=False,content_type=None):
        if not filename.is_file():return self.send_error(404)
        size=filename.stat().st_size;start=0;end=size-1;status=200
        request=self.headers.get('Range')
        if request:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',request)
            if not match or not any(match.groups()):return self.range_error(size)
            if match[1]:start=int(match[1]);end=min(int(match[2])if match[2]else end,end)
            else:start=max(0,size-int(match[2]))
            if start>=size or start>end:return self.range_error(size)
            status=206
        self.send_response(status);self.send_header('Content-Type',content_type or mimetypes.guess_type(filename)[0]or'application/octet-stream');self.send_header('Accept-Ranges','bytes');self.send_header('Content-Length',end-start+1);self.send_header('Cache-Control','no-cache')
        if status==206:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        if not head:
            try:
                with filename.open('rb')as f:
                    f.seek(start);remaining=end-start+1
                    while remaining>0:
                        data=f.read(min(256*1024,remaining))
                        if not data:break
                        self.wfile.write(data);remaining-=len(data)
            except (BrokenPipeError,ConnectionResetError):pass

    def range_error(self,size):
        self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4870);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(json.dumps({'url':f'http://127.0.0.1:{args.port}','app':'ai-video-studio'}),flush=True)
    server.serve_forever()
