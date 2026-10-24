# B1184 two retained takes — playback verified; drawer unproved
Completed direct/native runtime batch; no full Maestro automation PASS. Original interrupted receipt preserved in ATTEMPT1-INTERRUPTED.md.
## Exact target and captures
B5556,user11,project12/milestone19/assignment1184/Bible178/1Peter2:1(text34869). HostmicOFF acknowledged and keptOFF. Original partialnativeattempt produced retained0byteAAC; no savedrow. Replacementapproval allowed2ADDITIONALactualStarts, both nowused, no moreStarts.
- rec_mvizptmz_n8fvbz1t:50563ms,uploaded,sha2567ab03fabfd3a601430289ba0b690a14ed090c3784a344fffbee0f1747077b677.
- rec_mvj04utl_0pmdryiq:69785ms,uploaded,sha2561d092891d6ed8d4f130031e963cdd7e30f618270226507a3592bdedab3eb233b.
Both durations exceededunder30target. Watchdog UIA couldnotreachidlewhileanimatedcapture; rootusedvisuallyconfirmedStop. Best-effortcapfailures retained, notcalledunder30success. GuardreadinessreservationswithNOStart (clockTypeError,expiredReady) retainedseparately; nevercountedassavedcapturesorusedtobypassactualStartbudget. No forcedSync:normalQAautomaticuploadscompleted.
## B0017 nativebehavior
Actualsaved-take-onlysequence: playTake1 showsPause+0:01/0:50; pauseTake1 showsPlaywithfrozen0:02; resumeTake1thenswitchTake2whileplaying showsTake1Play/reset0:00,Take2Pause+0:01/1:09; pauseTake2 showsPlay+0:02; switchbackTake1 showsPause+0:01,Take2Play/reset0:00; finalpauseboth. SourceaudioPlayneverpressed, selectradiosneverpressed.
Evidence PNGs play-take1,pause-take1,switch-playing-take2,pause-take2,switch-back-take1 +after-playback.xml. Scopedlogsinceplaybackstartepoch1792641039:703postwindowlines,0MaximumUpdateDepthmatches. No erroroverlay/crash; stableRecordview throughout. No freshcaptureforplayback.
## B0016 qualification
NOT proved. Leftedgegestures triggeredAndroidBacknavigation/RecordinginprogressResumeDiscarddialog, notdrawer. Rootcorrected viaResume(normalexistingtake,neverDiscard)thenStop. Images showactiveRecord andbeforeRemoveguard butnotvaliddrawer/Settingsmatrix. DoNOTclaimdrawerPASSorproductFAIL;keepmissingtrue draweractive/paused/MoreSettingsassertions. No newcapturebudget.
## Preservation/cleanup
BothM4Ahashesunchangedafterplayback; firsthashsamebeforesecondtake. FirstzeroAAC files/Audio/recording-746a3734-01a2-4b20-87f0-dbc5f12f0776.aac remains0byte/mtime1792636575. OriginalB3cachehashesallidentical,nofilesadded/removed. Originalprefsactive11known11,9Verse/cellularfalseequal.2recordingsuploaded,downloadqueue0,claims0. No network/Androidpermission/assignment/stage/deletion actions. No humanlistening/knownsignalclaim.
AutomaticPFOresurfacedonBack; dismissedwithoutDownload. closed-home11.xml verifiesHome/drawerclosed/noPFO. Bthenforce-stoppedafteridlecleanup forAsharedMetrobundleisolation;userdata/emulatorpreserved. Aoriginal11takes/cache230untouchedbythisbatch. Bothglobaldevicesretain13savedtakesaggregate,plusoriginal0byteartifact.
## Layer distinction
B0017 behaviorverified usingmanual/nativecontrols+screens/logs. Watchdog/flowpermanentautomation remainsNOTrepeatablyvalidated; initialtimeouts/defaultclock/UIAsingleowner/NewTake-mismatchreceiptsretained. No publicwrites/PR/merge/deploy.
