import subprocess,pathlib,xml.etree.ElementTree as E,re,json,time
out=pathlib.Path('/Users/matt/Documents/Codex/2026-10-19/task-10/emulators/b-bible-navigation-no-autoplay-first');out.mkdir(exist_ok=True);a=['/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools/adb','-H','127.0.0.1','-P','5037','-s','emulator-5556'];t=time.monotonic();j={'serial':'emulator-5556','userId':11,'assignmentId':1183,'bibleId':178,'criterion':'D-0048-02 source-ready non-autoplay state only; not audibility/listening/feel','sourcePlayTapCount':0,'recordStartTapCount':0,'scope':'One grouped Verse and Pericope Bible-unit tap -> Record. Positive readyPlay+paused state before/after; no playing/error/loading. No sourcePlay/capture/stage/auth/download/fixture writes.','events':[]}
def save():(out/'result.json').write_text(json.dumps(j,indent=2)+'\n')
def event(s):j['events'].append({'elapsedSeconds':round(time.monotonic()-t,1),'event':s});save()
def r(*x):return subprocess.run(a+list(x),check=True,capture_output=True,timeout=20).stdout
def has(ns,id):return any(n.get('resource-id')==id for n in ns)
def dump(name):
 for attempt in range(3):
  r('shell','uiautomator','dump','/sdcard/b-noautoplay.xml');b=r('exec-out','cat','/sdcard/b-noautoplay.xml');ns=list(E.fromstring(b).iter('node'))
  if not has(ns,'loading-spinner'):break
 (out/(name+'.xml')).write_bytes(b);return ns
def tapnode(n):
 v=list(map(int,re.findall(r'\d+',n.get('bounds'))));assert len(v)==4 and v[2]>v[0] and v[3]>v[1];assert n.get('enabled')=='true';r('shell','input','tap',str((v[0]+v[2])//2),str((v[1]+v[3])//2))
def tap(ns,id):
 assert id not in ['source-audio-play','record-start-button','record-new-take-button'];xs=[n for n in ns if n.get('resource-id')==id];assert len(xs)==1,(id,len(xs));tapnode(xs[0])
def prefguard(ns):
 for id,k,v in [('settings-ui-version-legacy','selected','true'),('settings-ui-version-next','selected','false'),('settings-drafting-unit-verse','selected','true'),('settings-upload-cellular-switch','checked','false')]:assert any(n.get('resource-id')==id and n.get(k)==v for n in ns),(id,k,v)
def ready(ns,caption,receipt):
 for attempt in range(3):
  labels=[n.get('text','') for n in ns if n.get('resource-id')=='source-audio-label'];errors=[n.get('text','') for n in ns if n.get('text') in ["Couldn't load source audio",'No source audio']];assert not errors,('SOURCE_UNAVAILABLE_NO_RETRY',errors,labels)
  play=[n for n in ns if n.get('resource-id')=='source-audio-play']
  if len(play)==1 and play[0].get('enabled')=='true' and play[0].get('content-desc')=='Play source audio' and has(ns,'source-audio-paused') and not has(ns,'source-audio-loading') and not has(ns,'source-audio-play-loading'):break
  if attempt<2:ns=dump(receipt+'-bounded-settle-'+str(attempt))
 else:raise AssertionError(('SOURCE_READY_PRECONDITION_MISSING',labels))
 assert not has(ns,'source-audio-playing');assert not any(n.get('content-desc')=='Pause source audio' for n in ns);assert len(labels)==1 and caption in labels[0],(caption,labels);assert not has(ns,'record-stop-button');return ns,{'controlId':'source-audio-play','enabled':True,'a11y':'Play source audio','pausedMarker':True,'playingMarker':False,'caption':labels[0],'uiContract':'SourceAudioPlayerBar ready branch; descriptor readiness only, no guest media request/audibility proof'}
def enterSettings(ns,label):
 tap(ns,'home-settings-button');ns=dump(label+'-drawer');assert has(ns,'settings-menu-active-11');tap(ns,'settings-menu-more-settings');return dump(label+'-settings')
def openBible(ns,label):
 tap(ns,'milestone-row-19');ns=dump(label+'-chapters');tap(ns,'chapter-row-1183');ns=dump(label+'-drafting');tap(ns,'drafting-tab-bible');return dump(label+'-bible')
def home(ns,label):
 if has(ns,'drafting-header-back'):tap(ns,'drafting-header-back');ns=dump(label+'-chapters')
 if has(ns,'chapter-row-1183'):tap(ns,'stack-header-back');ns=dump(label+'-home-or-pfo')
 for i in range(2):
  if not has(ns,'prepare-offline-screen'):break
  tap(ns,'stack-header-back');ns=dump(label+'-pfo-back-'+str(i))
 assert has(ns,'home-settings-button');return ns
try:
 j['originalRadios']={k:r('shell','settings','get','global',k).decode().strip() for k in ['airplane_mode_on','wifi_on']};assert j['originalRadios']=={'airplane_mode_on':'0','wifi_on':'1'};ns=dump('original-home');assert has(ns,'home-tab-projects');ns=enterSettings(ns,'original');prefguard(ns);j['originalPreferencesVerified']=True;tap(ns,'stack-header-back');ns=dump('verse-home');ns=openBible(ns,'verse');assert any(n.get('resource-id')=='bible-verse-row-1' and n.get('content-desc')=='Verse 1, selected' for n in ns);ns,before=ready(ns,'Verse 1','verse-before');j['verse']={'before':before};event('Verse source-ready precondition verified; no Play tap')
 assert time.monotonic()-t<120;tap(ns,'bible-verse-row-2');ns=dump('verse-after-unit-tap');assert any(n.get('resource-id')=='record-verse-reference' and n.get('text')=='1 Peter 1:2' for n in ns);ns,after=ready(ns,'Verse 2','verse-after');ns=dump('verse-after-bounded-settle');ns,settled=ready(ns,'Verse 2','verse-after-settled');j['verse'].update({'recordReference':'1 Peter 1:2','after':after,'afterBoundedSettle':settled,'result':'PASS_NON_AUTOPLAY_SOURCE_READY'});(out/'verse-record-no-autoplay.png').write_bytes(r('exec-out','screencap','-p'));event('Verse1->2 opens Record2; readyPlay+paused persists after bounded settle')
 ns=home(ns,'pericope-transition');ns=enterSettings(ns,'pericope');tap(ns,'settings-drafting-unit-pericope');ns=dump('pericope-setting');assert any(n.get('resource-id')=='settings-drafting-unit-pericope' and n.get('selected')=='true' for n in ns);tap(ns,'stack-header-back');ns=dump('pericope-home');ns=openBible(ns,'pericope');ns,before=ready(ns,'Pericope 1','pericope-before');j['pericope']={'before':before};choices=[n for n in ns if n.get('clickable')=='true' and n.get('content-desc')=='1 Peter 1:3–5'];assert len(choices)==1,('Exact observed second-pericope button missing',[(n.get('resource-id'),n.get('content-desc')) for n in ns if '1 Peter 1:3' in n.get('content-desc','')]);assert time.monotonic()-t<120;event('Pericope1 source-ready and exact second-card1Peter1:3–5 observed; no Play tap');tapnode(choices[0]);ns=dump('pericope-after-unit-tap');assert any(n.get('resource-id')=='record-verse-reference' and n.get('text')=='1 Peter 1:3–5' for n in ns);ns,after=ready(ns,'Pericope 2','pericope-after');ns=dump('pericope-after-bounded-settle');ns,settled=ready(ns,'Pericope 2','pericope-settled');j['pericope'].update({'recordReference':'1 Peter 1:3–5','after':after,'afterBoundedSettle':settled,'result':'PASS_NON_AUTOPLAY_SOURCE_READY'});(out/'pericope-record-no-autoplay.png').write_bytes(r('exec-out','screencap','-p'));j['result']='PASS_BOTH_SOURCE_READY_NON_AUTOPLAY_VARIANTS';j['proofElapsedSeconds']=round(time.monotonic()-t,1);event('Both source-ready non-autoplay variants passed without Play/capture actions')
except Exception as e:j['result']='PARTIAL_OR_BLOCKED_NO_RETRY';j['error']=str(e);save()
finally:
 try:
  ns=dump('cleanup-actual');assert not has(ns,'record-stop-button') and not has(ns,'source-audio-playing');ns=home(ns,'cleanup');ns=enterSettings(ns,'cleanup');tap(ns,'settings-drafting-unit-verse');ns=dump('cleanup-verse-restored');prefguard(ns);j['originalLegacyVerseCellularOffVerified']=True;tap(ns,'stack-header-back');ns=dump('final-home');assert has(ns,'home-tab-projects');j['finalHomeVerified']=True;tap(ns,'home-settings-button');ns=dump('final-active11');assert has(ns,'settings-menu-active-11');j['active11Preserved']=True;tap(ns,'settings-menu-account-11');ns=dump('final-home-after-account');assert has(ns,'home-tab-projects');j['finalRadios']={k:r('shell','settings','get','global',k).decode().strip() for k in ['airplane_mode_on','wifi_on']};assert j['finalRadios']==j['originalRadios'];j['cleanupComplete']=True
 except Exception as e:j['cleanupError']=str(e)
 j['totalElapsedSeconds']=round(time.monotonic()-t,1);save()
print(json.dumps(j,indent=2))
