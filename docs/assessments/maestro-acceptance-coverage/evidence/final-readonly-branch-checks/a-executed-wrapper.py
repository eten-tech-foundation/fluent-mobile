from pathlib import Path
import subprocess,json,shlex,csv,io,os,time,hashlib,fcntl,signal,re,xml.etree.ElementTree as E
P=Path('/Users/matt/Documents/Codex/2026-10-19/task-10/incomplete-coverage-readonly-a-semantic-scroll');OUT=Path('/Users/matt/Documents/Codex/2026-10-19/task-10/live-results/20261020/final-a-incomplete-coverage-542-semantic-scroll');OUT.mkdir(exist_ok=False)
REPO=Path('/Users/matt/Documents/Development/gloo/fluent-mobile');A=['/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools/adb','-H','127.0.0.1','-P','5037','-s','emulator-5554'];lock=open('/tmp/fluent-device-owner.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
report={'status':'PREFLIGHT','runtimeRevisionAttested':False,'noCaptureOrStageAction':True}
def save(): (OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n')
def adb(*args):return subprocess.run(A+list(args),capture_output=True,text=True,check=True,timeout=22).stdout.strip()
def q(sql,db='databases/default/fluent.db'):return list(csv.DictReader(io.StringIO(adb('shell','run-as','com.eten.fluent','sqlite3','-readonly','-header','-csv',db,shlex.quote(sql)))))
def accounts():return {r['key']:r['value'] for r in q("SELECT key,value FROM storage WHERE key IN ('active_user_id','known_user_ids','paused_take_markers_v1')",'databases/kv/__opsqlite_storage.sqlite')}
def snapshot():
 rows=q('SELECT id,bible_text_id,recorded_by_user_id,project_unit_id,duration_ms,file_size_bytes,sync_status,local_file_path FROM recordings ORDER BY id');assert len(rows)==9 and all(r['sync_status']=='uploaded' for r in rows)
 files={}
 for r in rows:
  path=r['local_file_path'][7:];assert re.fullmatch('/data/user/0/com.eten.fluent/files/recordings/rec_[a-z0-9]+_[a-z0-9]+.m4a',path);files[r['id']]=adb('shell','run-as','com.eten.fluent','sha256sum',path).split()[0]
 return {'records':rows,'fileHashes':files}
def dump():
 s=adb('exec-out','uiautomator','dump','--compressed','/dev/tty');assert '<?xml' in s and '</hierarchy>' in s,'ROOT_CLEANUP_REQUIRED_NATIVE_HIERARCHY_UNAVAILABLE';return E.fromstring(s[s.index('<?xml'):s.rfind('</hierarchy>')+12])
def ids(r):return {n.get('resource-id') for n in r.iter('node')}
def ready(rid):
 for _ in range(3):
  r=dump()
  if rid in ids(r):return r
 raise AssertionError('Missingpositive'+rid)
def safe(r):assert not ids(r)&{'record-stop-button','record-pause-button','record-resume-button','source-audio-playing'}
def tap(r,rid):
 safe(r);ns=[n for n in r.iter('node') if n.get('resource-id')==rid];assert len(ns)==1 and ns[0].get('clickable')=='true' and ns[0].get('enabled')=='true';a,b,c,d=map(int,re.findall(r'\d+',ns[0].get('bounds')));adb('shell','input','tap',str((a+c)//2),str((b+d)//2))
def home():
 r=dump()
 for _ in range(5):
  safe(r)
  if 'home-settings-button' in ids(r):return r
  if 'drafting-header-back' in ids(r):tap(r,'drafting-header-back')
  elif 'stack-header-back' in ids(r) and ids(r)&{'prepare-offline-screen','sync-screen','chapter-row-1183'}:tap(r,'stack-header-back')
  else:raise AssertionError('Unknownscreen_noblindBack')
  r=dump()
 raise AssertionError('Home_notready')
def switch(target):
 r=home();tap(r,'home-settings-button');r=ready('settings-menu-active-'+accounts()['active_user_id']);tap(r,'settings-menu-account-'+target);home();assert accounts()['active_user_id']==target
before=None;radios=None
try:
 packet=json.load(open(P/'readiness.json'))
 for f,h in packet['hashes'].items():assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h
 assert 'commands=66' in (P/'parser-proof.log').read_text()
 assert accounts()=={'active_user_id':'12','known_user_ids':'10,9,12','paused_take_markers_v1':'[]'}
 home();before=snapshot();radios={k:adb('shell','settings','get','global',k) for k in ['airplane_mode_on','wifi_on','mobile_data']};assert radios=={'airplane_mode_on':'0','wifi_on':'1','mobile_data':'1'}
 role=q(packet['nativeFreshReadOnlySQL']['role']);assert role==[{'id':'1183','project_unit_id':'19','bible_id':'178','book_id':'60','chapter_number':'1','assigned_user_id':'10','peer_checker_id':'11','status':'draft','project_id':'12'}]
 assert q(packet['nativeFreshReadOnlySQL']['coverage'])==[{'recorded_verses':'9'}];assert q('SELECT count(*) AS n FROM bible_texts WHERE bible_id=178 AND book_id=60 AND chapter_number=1')==[{'n':'25'}];assert q(packet['nativeFreshReadOnlySQL']['noTargetTake'])==[{'n':'0'}]
 assert q("SELECT count(*) AS n FROM recordings WHERE sync_status IN ('uploading','syncing')")==[{'n':'0'}]
 report.update(nativeBefore=before,role=role,coverage='9/25',networkOriginal=radios);save();switch('10')
 r=home();tap(r,'home-settings-button');r=ready('settings-menu-active-10');tap(r,'settings-menu-more-settings');r=ready('settings-ui-version-legacy');assert any(n.get('resource-id')=='settings-ui-version-legacy' and n.get('selected')=='true' for n in r.iter('node'));assert any(n.get('resource-id')=='settings-drafting-unit-verse' and n.get('selected')=='true' for n in r.iter('node'));tap(r,'stack-header-back');home()
 env=os.environ.copy();env.update(packet['shellGuardEnv']);env.update({'ANDROID_SERIAL':'emulator-5554','ADB_SERVER_SOCKET':'tcp:127.0.0.1:5037','MAESTRO_ENV_FILE':str(REPO/'.env.maestro.qa')});cmd=['bash','scripts/maestro-test-qa.sh',str(P/'flow.yaml'),'--test-output-dir',str(OUT/'cli')]
 for k,v in packet['shellGuardEnv'].items():cmd+=['-e',k+'='+v]
 start=time.monotonic();report['status']='CLI_RUNNING';save()
 with (OUT/'runner.log').open('w') as log:
  proc=subprocess.Popen(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=proc.wait(timeout=90);timed=False
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGTERM);code=proc.wait(timeout=8);timed=True
 report.update(exitCode=code,timedOut=timed,cliSeconds=round(time.monotonic()-start,3));save()
except Exception as e:report['error']={'type':type(e).__name__,'message':str(e)};save()
finally:
 try:
  if accounts()['active_user_id']=='10':
   r=dump();safe(r)
   refs=[n.get('text') for n in r.iter('node') if n.get('resource-id')=='record-verse-reference']
   if refs==['1 Peter 1:25'] or 'bible-tab' in ids(r):
    if 'bible-tab' not in ids(r):tap(r,'drafting-tab-bible')
    r=ready('bible-tab')
    for _ in range(5):
     if 'bible-verse-row-9' in ids(r):break
     containers=[n for n in r.iter('node') if n.get('resource-id')=='bible-tab'];assert len(containers)==1
     x1,y1,x2,y2=map(int,re.findall(r'\d+',containers[0].get('bounds')));cx=(x1+x2)//2
     adb('shell','input','swipe',str(cx),str(y1+(y2-y1)//5),str(cx),str(y1+4*(y2-y1)//5),'350');r=dump();safe(r)
    assert 'bible-verse-row-9' in ids(r),'ROOT_CLEANUP_REQUIRED_VERSE9_NOT_VISIBLE'
    tap(r,'bible-verse-row-9');r=ready('record-verse-reference');assert any(n.get('resource-id')=='record-verse-reference' and n.get('text')=='1 Peter 1:9' for n in r.iter('node'))
    report['selection9RestoredByObservedCleanup']=True
   elif refs:
    assert refs==['1 Peter 1:9'],'ROOT_CLEANUP_REQUIRED_UNKNOWN_REFERENCE'
  if accounts()['active_user_id']!='12':switch('12')
  home();report['accountsRestored']=accounts()=={'active_user_id':'12','known_user_ids':'10,9,12','paused_take_markers_v1':'[]'}
  if before is not None:report['allNineRowsAndFilesUnchanged']=snapshot()==before
  if radios is not None:report['networkUnchanged']={k:adb('shell','settings','get','global',k) for k in radios}==radios
 except Exception as e:report['cleanupError']={'type':type(e).__name__,'message':str(e)}
 report['status']='PASS_PARTIAL_VERSE_GUARD_ONLY' if report.get('exitCode')==0 and not report.get('timedOut') and report.get('accountsRestored') and report.get('allNineRowsAndFilesUnchanged') and report.get('networkUnchanged') and not report.get('cleanupError') else 'PARTIAL_OR_BLOCKED';save();print(json.dumps({k:v for k,v in report.items() if k not in ['nativeBefore','role']}))
