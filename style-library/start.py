"""Start or reuse this gallery, without changing production preview processes."""
from pathlib import Path
import json,sys,subprocess,socket,time,urllib.request
BASE=Path(__file__).resolve().parent;run=BASE/'runtime';run.mkdir(exist_ok=True);state=run/'server.json'
def write_launcher(url):
    # A double-clicked HTML file cannot fetch the gallery's API/media routes.
    # Keep its redirect aligned with the actual verified server, including a
    # fallback port, while preserving the requested view or exact reference.
    script='if(location.protocol === "file:"){location.replace('+json.dumps(url+'/')+' + location.search + location.hash);}\n'
    (BASE/'dist/launch.js').write_text(script)
if state.exists():
    old=json.loads(state.read_text())
    try:
        info=json.load(urllib.request.urlopen(old['url']+'/api/health',timeout=1))
        if info.get('root')==str(BASE):write_launcher(old['url']);print(json.dumps(old));sys.exit(0)
    except Exception:pass
port=4870
while True:
    with socket.socket()as s:
        s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
        try:s.bind(('127.0.0.1',port));break
        except OSError:port+=1
log=(run/'server.log').open('a')
process=subprocess.Popen([sys.executable,str(BASE/'serve.py'),'--port',str(port)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
url=f'http://127.0.0.1:{port}'
for _ in range(40):
    try:
        info=json.load(urllib.request.urlopen(url+'/api/health',timeout=.3))
        if info.get('root')==str(BASE):break
    except Exception:time.sleep(.1)
else:raise RuntimeError('Gallery did not become ready; see runtime/server.log.')
result={'url':url,'pid':process.pid,'root':str(BASE),'host':'127.0.0.1'};state.write_text(json.dumps(result,indent=2)+'\n');write_launcher(url);print(json.dumps(result))
