"""Source completion, draft isolation and approvals use disposable owner records."""
import copy
import hashlib
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import project_index as index
import review_actions as reviews
import technique_upkeep as upkeep
import technique_examples
from serve import Handler


class QuietHandler(Handler):
    def log_message(self, *args): pass


class TechniqueUpkeepTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve(); self.base = self.root/'style-library'; self.base.mkdir()
        self.project = self.root/'projects/demo'; self.project.mkdir(parents=True)
        for name, data in [('review.mp4',b'new export'),('old.mp4',b'old export'),('frame.png',b'poster'),('STATUS.md',b'Review'),('review-notes.md',b'History')]:
            (self.project/name).write_bytes(data)
        self.p = {'id':'demo','title':'Demo','format':'video','state':'review','stage':'refine','summary':'Review',
                  'next_step':'Review','primary_artifact':'v2','reference_id':'demo-video','cover_path':'frame.png',
                  'source_notes':[{'path':n,'label':n,'sha256':upkeep.digest(self.project/n)} for n in ['STATUS.md','review-notes.md']],
                  'artifacts':[{'id':'v2','type':'video','version':'V02','path':'review.mp4','duration':10,'role':'current','label':'Review','approval_kind':'final'},
                               {'id':'v1','type':'video','version':'V01','path':'old.mp4','duration':10,'role':'history','label':'Earlier'}]}
        self.entry = {'id':'demo-video','title':'Demo video','subtitle':'Fixture','collection':'mine','project_id':'demo',
                      'media_path':'projects/demo/old.mp4','version':'V01','duration':10,'review_status':'preferred',
                      'creator':'Fixture','creator_id':'fixture','poster':'assets/posters/demo.png','summary':'Original',
                      'tags':[],'palette':['#222222'],'traits':{},'keep':[],'avoid':[],'notes':[],
                      'moments':[{'time':2,'label':'Reveal'}],'evidence':'Observed fixture','reference_note':'Keep my note'}
        self.catalog = self.base/'catalog.json'; self.registry = self.base/'projects.json'
        self.data = {'schema_version':4,'entries':[self.entry],'techniques':[],'removed_references':{}}
        self.save()
        self.patches = [patch.object(index,'STUDIO',self.root),patch.object(index,'REGISTRY',self.registry),
                        patch.object(reviews,'BASE',self.base),patch.object(reviews,'CATALOG',self.catalog),
                        patch.object(reviews,'JOURNALS',self.base/'runtime/review-actions'),
                        patch.object(technique_examples.prepare_assets,'poster',side_effect=self.poster)]
        for p in self.patches:p.start()
        self.family={'id':'tech-reveal','title':'Reveal','category':'Motion','summary':'Reveal','direction':'Show one card',
                     'aliases':[],'keep':[],'avoid':[],'evidence':'Synthetic source'}
        self.example={'id':'demo-reveal-v2','label':'Card reveal','start':1,'end':3,'poster_at':2,
                      'poster':'assets/techniques/demo-v2.jpg','evidence':'Observed fixture'}

    def tearDown(self):
        for p in self.patches:p.stop()
        self.tmp.cleanup()

    def save(self):
        self.catalog.write_text(json.dumps(self.data), encoding='utf-8');self.registry.write_text(json.dumps({'schema_version':1,'projects':[self.p]}), encoding='utf-8')

    def poster(self,source,relative,time):
        target=self.base/'dist'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b'fixture poster')

    def prepare(self):
        entry=self.entry|{'version':'V02','media_path':'projects/demo/review.mp4'}
        e=self.root/'entry.json';e.write_text(json.dumps(entry), encoding='utf-8');p=self.root/'examples.json';p.write_text(json.dumps([{'family':self.family,'example':self.example}]), encoding='utf-8')
        return upkeep.prepare('demo','v2',e,p)

    def approve(self):
        return reviews.apply_decision({'project_id':'demo','artifact_id':'v2','action':'approve',
                                      'revision':index.revision(self.p),'request_id':str(uuid.uuid4())})

    def test_candidates_use_only_representatives_and_exclude_removed_and_complete(self):
        self.assertEqual([i['id'] for i in upkeep.discover()['items']],['reference:demo-video'])
        self.entry['technique_review_sha256']=self.entry['source_sha256']=upkeep.digest(self.project/'old.mp4');self.save()
        self.assertEqual(upkeep.discover()['items'],[])
        (self.project/'old.mp4').write_bytes(b'changed source')
        self.assertEqual(len(upkeep.discover()['items']),1)
        self.data['removed_references']={'demo-video':{'removed_at':'retained'}};self.p['state']='final';self.save()
        self.assertEqual(upkeep.discover()['items'],[])

    def test_missing_finished_project_is_one_candidate_not_six_drafts(self):
        self.data['entries']=[];self.p['state']='final'
        self.p['artifacts'] += [self.p['artifacts'][1]|{'id':'draft-'+str(i),'version':'V'+str(i)} for i in range(3,7)]
        self.save();items=upkeep.discover()['items']
        self.assertEqual(len(items),1);self.assertEqual(items[0]['artifact_id'],'v2')
        self.p['state']='review';self.save();self.assertEqual(upkeep.discover()['items'],[])

    def test_old_pending_reference_does_not_hide_a_recorded_finished_project(self):
        self.entry['review_status']='review_pending';self.p['state']='final';self.save()
        items=upkeep.discover()['items'];self.assertEqual(len(items),1)
        self.assertEqual(items[0]['id'],'project:demo@v2')

    def test_copy_preserves_owner_bytes_and_rejects_changed_source_or_duplicate(self):
        item=upkeep.discover()['items'][0];body={'items':[{k:item[k] for k in ['id','revision']}]}
        before=self.catalog.read_bytes();result=upkeep.handoff(body,'http://127.0.0.1:1')
        self.assertIn(item['source']['source_sha256'],result['text']);self.assertIn('#style=demo-video',result['text'])
        self.assertIn('Studio folder: '+str(self.root),result['text'])
        self.assertEqual(before,self.catalog.read_bytes());self.assertFalse((self.project/'approval-state.json').exists())
        with self.assertRaises(reviews.ReviewError):upkeep.handoff({'items':body['items']*2},'http://fixture')
        (self.project/'old.mp4').write_bytes(b'new bytes')
        with self.assertRaisesRegex(reviews.ReviewError,'changed'):upkeep.handoff(body,'http://fixture')

    def test_preparation_stays_private_until_exact_approval_and_keeps_prior_links(self):
        old={'id':'old-example','style_id':'demo-video','source_version':'V01','source_path':self.entry['media_path'],
             'source_sha256':upkeep.digest(self.project/'old.mp4'),'start':1,'end':2,'poster':'assets/techniques/old.jpg'}
        self.data['techniques']=[self.family|{'examples':[old],'default_example':'old-example'}];self.save()
        before=self.catalog.read_bytes();result=self.prepare();self.assertFalse(result['published'])
        self.assertEqual(before,self.catalog.read_bytes());self.assertTrue(index.review_options(self.p)['techniques']['prepared'])
        self.approve();data=json.loads(self.catalog.read_text(encoding='utf-8'));current=next(e for e in data['entries'] if e['id']=='demo-video')
        self.assertEqual(current['version'],'V02');self.assertEqual(current['technique_review_sha256'],upkeep.digest(self.project/'review.mp4'))
        self.assertEqual(current['reference_note'],'Keep my note')
        examples=data['techniques'][0]['examples'];self.assertEqual(len(examples),2)
        self.assertNotEqual(examples[0]['style_id'],'demo-video');self.assertEqual(examples[0]['id'],'old-example')
        self.assertEqual(examples[1]['style_id'],'demo-video');self.assertEqual(upkeep.discover()['items'],[])
        self.assertEqual((self.project/'old.mp4').read_bytes(),b'old export')

    def test_prepared_plan_changes_require_a_fresh_approval_review(self):
        self.prepare();before=index.revision(self.p)
        path=self.project/'technique-plan.json';data=json.loads(path.read_text(encoding='utf-8'))
        data['plans'][-1]['examples'][0]['example']['label']='Updated direction'
        path.write_text(json.dumps(data), encoding='utf-8')
        self.assertNotEqual(before,index.revision(self.p))
        with self.assertRaisesRegex(reviews.ReviewError,'changed'):
            reviews.apply_decision({'project_id':'demo','artifact_id':'v2','action':'approve',
                                    'revision':before,'request_id':str(uuid.uuid4())})
        self.assertFalse((self.project/'approval-state.json').exists())

    def test_changed_export_does_not_publish_stale_preparation(self):
        self.prepare();(self.project/'review.mp4').write_bytes(b'later export bytes')
        self.assertFalse(index.review_options(self.p)['techniques']['prepared'])
        self.approve();data=json.loads(self.catalog.read_text(encoding='utf-8'))
        self.assertFalse(data['techniques']);self.assertEqual(len(upkeep.discover()['items']),1)

    def test_completed_zero_technique_source_is_not_repeated(self):
        self.entry['source_sha256']=self.entry['technique_review_sha256']=upkeep.digest(self.project/'old.mp4');self.save()
        self.assertEqual(upkeep.discover()['items'],[])

    def test_http_origin_guards_and_read_only_copy(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),QuietHandler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            host=f'127.0.0.1:{server.server_port}';origin='http://'+host
            item=upkeep.discover()['items'][0];body=json.dumps({'items':[{k:item[k] for k in ['id','revision']}]})
            for sent_origin,expected in [('https://evil.example',403),(origin,200)]:
                conn=http.client.HTTPConnection(host);conn.request('POST','/technique-request',body,{'Origin':sent_origin,'Content-Type':'application/json','X-Studio-Action':'technique-request'})
                response=conn.getresponse();self.assertEqual(response.status,expected);response.read();conn.close()
            conn=http.client.HTTPConnection(host);conn.request('GET','/technique-candidates?path=outside');r=conn.getresponse();self.assertEqual(r.status,400);r.read();conn.close()
        finally:server.shutdown();server.server_close();thread.join()
