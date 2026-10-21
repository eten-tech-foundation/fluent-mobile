from pathlib import Path
import csv,datetime,fcntl,hashlib,importlib.util,io,json,re,shlex,subprocess
P=Path(__file__).resolve().parent
A=['/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools/adb','-H','127.0.0.1','-P','5037','-s','emulator-5554']
R=Path('/Users/matt/Documents/Development/gloo/fluent-mobile')
lock=open('/tmp/fluent-device-owner.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def adb(*args):return subprocess.run(A+list(args),capture_output=True,text=True,check=True,timeout=22).stdout.strip()
def q(sql,db='databases/default/fluent.db'):
 return list(csv.DictReader(io.StringIO(adb('shell','run-as','com.eten.fluent','sqlite3','-readonly','-header','-csv',db,shlex.quote(sql)))))
def snap():
 rows=q('SELECT id,bible_text_id,recorded_by_user_id,project_unit_id,duration_ms,file_size_bytes,sync_status,local_file_path FROM recordings ORDER BY id');assert len(rows)==9 and all(r['sync_status']=='uploaded' for r in rows)
 hashes={}
 for r in rows:
  path=r['local_file_path'][7:];assert re.fullmatch('/data/user/0/com.eten.fluent/files/recordings/rec_[a-z0-9]+_[a-z0-9]+.m4a',path)
  hashes[r['id']]=adb('shell','run-as','com.eten.fluent','sha256sum',path).split()[0]
 return {'records':rows,'fileHashes':hashes}
packet=json.loads((P/'readiness.json').read_text())
for f,h in packet['hashes'].items():assert hashlib.sha256((P/f).read_bytes()).hexdigest()==h
assert hashlib.sha256((R/packet['productionExtraction']['path']).read_bytes()).hexdigest()==packet['productionExtraction']['sha256']
a={r['key']:r['value'] for r in q("SELECT key,value FROM storage WHERE key IN ('active_user_id','known_user_ids','paused_take_markers_v1')",'databases/kv/__opsqlite_storage.sqlite')}
assert a=={'active_user_id':'12','known_user_ids':'10,9,12','paused_take_markers_v1':'[]'}
assert 'running=true' not in adb('shell','cmd','appops','get','com.eten.fluent','RECORD_AUDIO')
before=snap();assert before==json.loads((P.parent/'multitake-verse1-ready/protected-nine-reference.json').read_text())
queries=json.loads((P/'queries.json').read_text())
assert all(re.match(r'^\s*(SELECT|PRAGMA)\b',s,re.I) and not re.search(r'\b(UPDATE|INSERT|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REPLACE|VACUUM)\b',s,re.I) for s in queries.values())
data={name:q(sql) for name,sql in queries.items()}
assert snap()==before
(P/'native-collector-result.json').write_text(json.dumps(data,indent=2)+'\n')
spec=importlib.util.spec_from_file_location('readonly_join_oracle',P/'oracle.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
proof=mod.verify(data);proof.update({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'serial':'emulator-5554','allNineRowsAndFilesUnchanged':True,'active12AndCacheIntact':True,'queriesExecuted':len(queries),'readonly':True,'sourceHashMatched':True,'foreignKeyViolationCount':len(data['foreignKeyCheck'])})
(P/'native-execution-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
