"""Collection writes use temporary owner files; catalog/media/notes never change."""
import copy
import http.client
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid
from unittest.mock import patch
import project_index as index
import review_actions as storage
import saved_collections as collections
from serve import Handler


class QuietHandler(Handler):
    def log_message(self, *args): pass


class CollectionsTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve();self.base=self.root/'style-library';self.base.mkdir()
        self.catalog=self.base/'catalog.json';self.registry=self.base/'projects.json';self.registry.write_text('{"projects":[]}', encoding='utf-8')
        self.data={'entries':[{'id':'one','version':'V01','media_path':'references/one/source.mp4','source_sha256':'a'*64,'source_url':None,'duration':10},
                              {'id':'two','version':'V01','media_path':'references/two/source.mp4','source_sha256':'b'*64,'source_url':None,'duration':10},
                              {'id':'slides','version':'V01','asset_type':'carousel','slides':[{'path':'references/slides/one.png','sha256':'c'*64},{'path':'references/slides/two.png','sha256':'d'*64}]}],
                   'techniques':[{'id':'tech-reveal','examples':[{'id':'example-one','style_id':'one','start':1,'end':3,'source_version':'V01','source_path':'references/one/source.mp4','source_sha256':'a'*64},
                                                                    {'id':'example-two','style_id':'two','start':4,'end':7,'source_version':'V01','source_path':'references/two/source.mp4','source_sha256':'b'*64}]}]}
        self.catalog.write_text(json.dumps(self.data), encoding='utf-8');(self.base/'reference-notes.json').write_text('{"notes":[{"text":"Keep my edit direction"}]}', encoding='utf-8')
        self.patches=[patch.object(index,'STUDIO',self.root),patch.object(index,'REGISTRY',self.registry),patch.object(storage,'BASE',self.base),patch.object(storage,'CATALOG',self.catalog),patch.object(storage,'JOURNALS',self.base/'runtime/review-actions')]
        for p in self.patches:p.start()

    def tearDown(self):
        for p in self.patches:p.stop()
        self.tmp.cleanup()

    def member(self,kind='example',**kw):
        raw={'kind':kind}|({'technique_id':'tech-reveal','example_id':'example-one'} if kind=='example' else {'reference_id':'one'})|kw
        return collections.resolve(raw,self.data,False)

    def save(self,action,**kw):
        return collections.save({'action':action,'revision':collections.current()['revision'],'request_id':str(uuid.uuid4()),**kw})

    def create(self,members=None):
        return self.save('create',name='Hooks to try',members=members if members is not None else [self.member()])

    def test_read_does_not_create_or_seed_owner_records(self):
        self.assertEqual(collections.current()['collections'],[]);self.assertFalse((self.base/'collections.json').exists())

    def test_exact_membership_is_deduplicated_and_owner_files_stay_byte_identical(self):
        before={p:p.read_bytes() for p in [self.catalog,self.registry,self.base/'reference-notes.json']}
        result=self.create();c=result['collections'][0];self.assertEqual(len(c['members']),1)
        self.assertEqual(c['members'][0]['example_id'],'example-one')
        self.save('add',id=c['id'],members=[self.member(),self.member(example_id='example-two')])
        self.assertEqual(len(collections.current()['collections'][0]['members']),2)
        for p,b in before.items():self.assertEqual(p.read_bytes(),b)

    def test_rename_remove_undo_delete_restore_keep_recoverable_history(self):
        c=self.create()['collections'][0];cid=c['id']
        self.save('rename',id=cid,name='New openings')
        result=self.save('remove',id=cid,members=[c['members'][0]]);now=result['collections'][0]
        self.assertFalse(now['members']);self.save('undo_remove',id=cid,index=len(now['history'])-1)
        self.assertEqual(len(collections.current()['collections'][0]['members']),1)
        self.save('delete',id=cid);self.assertTrue(collections.current()['collections'][0]['deleted_at'])
        self.save('restore',id=cid);now=collections.current()['collections'][0]
        self.assertNotIn('deleted_at',now);self.assertEqual(now['name'],'New openings');self.assertEqual(now['id'],cid)
        self.assertEqual(now['history'][0]['before']['name'],'Hooks to try')

    def test_repeated_request_does_not_restore_deleted_collection_and_changed_reuse_is_rejected(self):
        body={'action':'create','revision':None,'request_id':str(uuid.uuid4()),'name':'One','members':[self.member()]}
        c=collections.save(body)['collections'][0];self.save('delete',id=c['id'])
        result=collections.save(body);self.assertTrue(result['duplicate']);self.assertTrue(result['collections'][0]['deleted_at'])
        with self.assertRaises(storage.ReviewError):collections.save(body|{'name':'Another'})

    def test_stale_collection_or_changed_source_never_overwrites_members(self):
        c=self.create()['collections'][0];revision=collections.current()['revision'];self.save('rename',id=c['id'],name='Renamed')
        with self.assertRaises(storage.ReviewError):collections.save({'action':'rename','revision':revision,'request_id':str(uuid.uuid4()),'id':c['id'],'name':'Old draft'})
        old=self.member();self.data['techniques'][0]['examples'][0]['end']=4;self.catalog.write_text(json.dumps(self.data), encoding='utf-8')
        before=(self.base/'collections.json').read_bytes()
        with self.assertRaisesRegex(storage.ReviewError,'source changed'):self.save('add',id=c['id'],members=[old])
        self.assertEqual(before,(self.base/'collections.json').read_bytes())

    def test_slide_and_moment_members_keep_exact_positions_without_edit_notes(self):
        slide=self.member('slide',reference_id='slides',slide=2);moment=self.member('moment',time=2.125)
        c=self.create([slide,moment])['collections'][0]
        self.assertEqual(c['members'][0]['slide'],2);self.assertEqual(c['members'][1]['time'],2.125)
        self.assertNotIn('text',c['members'][1])
        for raw in [self.member()|{'text':'edit direction'},{'kind':'moment','reference_id':'one','time':float('nan')}]:
            with self.assertRaises(storage.ReviewError):collections.resolve(raw,self.data)

    def test_unavailable_member_can_be_removed_and_restored_without_widening_scope(self):
        c=self.create()['collections'][0];self.data['entries']=[];self.catalog.write_text(json.dumps(self.data), encoding='utf-8')
        result=self.save('remove',id=c['id'],members=c['members']);index_=len(result['collections'][0]['history'])-1
        self.save('undo_remove',id=c['id'],index=index_);self.assertEqual(collections.current()['collections'][0]['members'],c['members'])

    def test_pack_memberships_do_not_change_provenance_or_personal_collections(self):
        personal=self.create()['collections'][0];before=self.catalog.read_bytes()
        manifest={'pack_id':'creator-pack-one','name':'Creator Pack 1','version':'1','members':[{'kind':'example','technique_id':'tech-reveal','example_id':'example-two'}]}
        result=collections.import_pack(manifest);pack=next(c for c in result['collections'] if c['kind']=='pack')
        self.assertEqual(len(pack['members']),1);self.assertEqual(pack['members'][0]['example_id'],'example-two')
        self.save('delete',id=pack['id']);collections.import_pack(manifest|{'version':'2'})
        now=collections.current()['collections'];self.assertEqual(next(c for c in now if c['kind']=='personal'),personal)
        self.assertTrue(next(c for c in now if c['kind']=='pack')['deleted_at']);self.assertEqual(self.catalog.read_bytes(),before)

    def test_source_changes_during_commit_preserve_the_original_collection(self):
        c=self.create()['collections'][0];before=(self.base/'collections.json').read_bytes();commit=storage.commit
        def changed(*args):
            self.catalog.write_text(json.dumps(self.data|{'owner_update':True}), encoding='utf-8');return commit(*args)
        with patch.object(storage,'commit',side_effect=changed),self.assertRaises(storage.ReviewError):self.save('add',id=c['id'],members=[self.member(example_id='example-two')])
        self.assertEqual((self.base/'collections.json').read_bytes(),before)

    def test_http_guards_and_no_raw_owner_file_route(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),QuietHandler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            host=f'127.0.0.1:{server.server_port}'
            for path,headers,expected in [('/collections',{'Origin':'https://evil.example'},403),('/collections.json',{},404),('/collections?path=outside',{},400)]:
                conn=http.client.HTTPConnection(host);conn.request('GET',path,headers=headers);r=conn.getresponse();self.assertEqual(r.status,expected);r.read();conn.close()
            body=json.dumps({'action':'create','revision':None,'request_id':str(uuid.uuid4()),'name':'Test','members':[]})
            conn=http.client.HTTPConnection(host);conn.request('POST','/collections',body,{'Origin':'http://'+host,'Content-Type':'application/json','X-Studio-Action':'wrong'});r=conn.getresponse();self.assertEqual(r.status,403);r.read();conn.close()
        finally:server.shutdown();server.server_close();thread.join()
