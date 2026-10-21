"""Synthetic technical workflow. Never approves or modifies an owner's project."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
PY=ROOT/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')

def run(args, capture=False):
    return subprocess.run([str(a) for a in args],cwd=ROOT,check=True,capture_output=capture,text=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--skip-render',action='store_true');args=parser.parse_args()
    project=ROOT/'projects/setup-demo'
    if project.exists():
        report=ROOT/'runtime/smoke-report.json'
        if not report.exists():raise RuntimeError('An incomplete setup demo exists. Inspect its failed run; use a fresh checkout for a new smoke test. No files were overwritten.')
        saved=json.loads(report.read_text())
        if not saved.get('raw_unchanged') or (not args.skip_render and not saved.get('motion_rendered')):
            raise RuntimeError('The previous smoke run did not complete the requested checks. Use a fresh checkout; existing files were preserved.')
        print('The completed setup demo already exists and was preserved. This did not rerun the checks. Inspect runtime/smoke-report.json or use a fresh checkout for a new smoke run.')
        return
    run([sys.executable,'scripts/studio.py','new','setup-demo'])
    source=project/'raw/synthetic.mp4'
    run(['ffmpeg','-nostdin','-v','error','-n','-f','lavfi','-i','testsrc2=size=360x640:rate=30:duration=4','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source])
    # Record generated provenance and source hash just as an imported source would.
    info=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',source],True).stdout)
    (project/'media-manifest.json').write_text(json.dumps({'version':1,'sources':[{'file':'raw/synthetic.mp4','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':source.stat().st_size,'probe':info,'provenance':'Local FFmpeg testsrc2 and sine generators; no human speech.'}]},indent=2)+'\n')
    plan=json.loads((project/'edit-plan.json').read_text());plan['output']={'width':360,'height':640,'fps':30}
    plan['cuts']=[{'beat_id':'first','source':'raw/synthetic.mp4','source_in':.2,'source_out':1.4,'text':'Synthetic first cut.','reason':'Technical timing fixture, no performance judgment.'},{'beat_id':'second','source':'raw/synthetic.mp4','source_in':2,'source_out':3.2,'text':'Synthetic second cut.','reason':'Verify a deliberate gap removal.'}]
    (project/'edit-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
    run([PY,'scripts/studio.py','prepare',project,source,'--interval','1','--max-frames','4'])
    run([PY,'scripts/studio.py','assemble',project])
    assembly=project/'exports/assembly-v01.mp4'
    result=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',assembly],True).stdout)
    if abs(float(result['format']['duration'])-2.4)>.05:raise RuntimeError('Assembly duration mismatch')
    if not {'audio','video'}.issubset({s['codec_type'] for s in result['streams']}):raise RuntimeError('Missing assembly audio/video')
    current=assembly;version='V01';rendered=False
    if not args.skip_render:
        sample=ROOT/'examples/studio-check';(sample/'output').mkdir(exist_ok=True)
        run([sys.executable,'scripts/hf.py','check',sample])
        rendered_path=sample/'output/studio-check.mp4'
        if rendered_path.exists():raise RuntimeError('Sample output exists; use a fresh checkout rather than overwrite it')
        run([sys.executable,'scripts/hf.py','render',sample,'--workers','1','--fps','30','--crf','18','--output',rendered_path])
        probe=json.loads(run(['ffprobe','-v','error','-show_format','-of','json',rendered_path],True).stdout)
        if abs(float(probe['format']['duration'])-5)>.05:raise RuntimeError('Motion render duration mismatch')
        current=project/'exports/render-check-v01.mp4';shutil.copy2(rendered_path,current);rendered=True
    frame=project/'graphics/check-frame.png'
    run(['ffmpeg','-nostdin','-v','error','-n','-ss','2','-i',current,'-frames:v','1',frame])
    (project/'STATUS.md').write_text('# Synthetic setup demo\n\nCurrent: technical checks ready for review.\nNo human speech/performance reviewed. No approval or publication.\nThe spoken cut is a generated pattern/tone; the motion render is a separate synthetic composition.\n')
    (project/'STORYBOARD.md').write_text('# Technical storyboard\n\nActual rendered frame: graphics/check-frame.png.\nThis is a synthetic technical illustration, not a creator storyboard or approved creative direction.\n')
    seed={'id':'setup-demo-reference','collection':'mine','version':version,'title':'Your studio is ready','subtitle':'Synthetic local setup check','creator':'Demo','creator_id':'demo','summary':'Generated technical sample; replace with your own creative work.','tags':['Synthetic sample'],'palette':['#191b1e','#f3eee5','#f2734f'],'traits':{'Motion':'Local paused GSAP timeline'},'keep':['Use your own content.'],'avoid':['Do not treat a technical sample as a performance review.'],'moments':[],'notes':['projects/setup-demo/STATUS.md'],'evidence':'Local generated patterns and authored typography; no creator footage.','media_path':str(current.relative_to(ROOT)),'duration':5 if rendered else 2.4}
    item={'id':'setup-demo','title':'Your first studio check','subtitle':'Synthetic setup demo','format':'video','state':'review','stage':'refine','summary':'Synthetic two-cut assembly and optional local motion render. No human speech or automatic approval.','next_step':'Inspect the actual sample, then try approve/reopen on this demo if you want to test the workflow.','primary_artifact':'review','cover_path':'graphics/check-frame.png','reference_id':'setup-demo-reference','reference_entry':seed,'reference_poster_source':'graphics/check-frame.png','source_notes':[{'label':'Current status','path':'STATUS.md'},{'label':'Review notes','path':'review-notes.md'}],'artifacts':[{'id':'review','label':'Synthetic review','type':'video','path':str(current.relative_to(project)),'version':version,'role':'current','approval_kind':'final','description':'Technical sample only. No music or human speech.'},{'id':'assembly','label':'Two-cut assembly','type':'video','path':'exports/assembly-v01.mp4','version':'V01','role':'assembly','description':'Generated pattern and tone, with a removed source gap.'},{'id':'board','label':'Actual check frame','type':'board','version':'V01','role':'storyboard','frames':[{'path':'graphics/check-frame.png','title':'Local rendered technical frame','note':'A sample frame, not a complete creator storyboard.'}]}]}
    descriptor=project/'studio-entry.json';descriptor.write_text(json.dumps(item,indent=2)+'\n')
    run([sys.executable,'scripts/register.py','project',descriptor,'--replace'])
    out=ROOT/'runtime';out.mkdir(exist_ok=True)
    (out/'smoke-report.json').write_text(json.dumps({'synthetic':True,'assembly_seconds':2.4,'audio_video_present':True,'raw_unchanged':hashlib.sha256(source.read_bytes()).hexdigest()==json.loads((project/'media-manifest.json').read_text())['sources'][0]['sha256'],'motion_rendered':rendered,'project':'setup-demo','approved':False,'limits':['No human speech/take-selection/transcription/creative-quality test','No fresh assistant or second-machine pilot']},indent=2)+'\n')
    print('Synthetic smoke passed. No project approved. Open the studio to inspect the demo.')

if __name__=='__main__':main()
