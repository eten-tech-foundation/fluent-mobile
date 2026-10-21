"""Pure independent oracle over a ROOT-collected read-only JSON; no device or DB access."""
import json
import sys
from pathlib import Path

def verify(data):
    expected_ids=set(json.loads((Path(__file__).parent/'protected-nine-ids.json').read_text()))
    ca=data['role'];assert len(ca)==1;ca=ca[0]
    assert {k:str(ca[k]) for k in ['id','project_unit_id','bible_id','book_id','chapter_number','assigned_user_id','peer_checker_id','status']}=={'id':'1183','project_unit_id':'19','bible_id':'178','book_id':'60','chapter_number':'1','assigned_user_id':'10','peer_checker_id':'11','status':'draft'}
    verses=data['chapterVerses'];assert len(verses)==25
    assert sorted(int(v['verse_number']) for v in verses)==list(range(1,26))
    verse_ids=set()
    for v in verses:
        assert all(str(v[k])==str(ca[k]) for k in ['bible_id','book_id','chapter_number'])
        verse_ids.add(str(v['id']))
    assert len(verse_ids)==25
    rows=data['recordingOracle'];assert len(rows)==9 and {r['id'] for r in rows}==expected_ids
    assert all(str(r['recorded_by_user_id'])=='10' and str(r['project_unit_id'])=='19' and str(r['is_selected'])=='1' and r['sync_status']=='uploaded' for r in rows)
    proof={}
    for owner in [10,12]:
        # Independent set filtering, no reuse of SQL join/aggregate expressions.
        matching={r['id']:r for r in rows if str(r['bible_text_id']) in verse_ids
          and str(r['is_selected'])=='1' and str(r['recorded_by_user_id'])==str(owner)
          and r['project_unit_id'] in [None,'',int(ca['project_unit_id']),str(ca['project_unit_id'])]}
        pending=sum(r['sync_status'] not in ('uploaded','conflicted') for r in matching.values())
        activity=max((r['updated_at'] for r in matching.values() if r['updated_at'] is not None),default=None)
        actual=data['aggregateOwner'+str(owner)];assert len(actual)==1;actual=actual[0]
        assert str(actual['assignment_id'])=='1183'
        assert int(actual['recording_count'])==len(matching)
        assert int(actual['pending_count'])==pending
        # SQLite CLI CSV represents SQL NULL as empty string.
        assert (actual['last_recording_activity'] or None)==(activity or None)
        joined=data['matchedRowsOwner'+str(owner)]
        assert len(joined)==25
        assert {str(r['joined_bible_text_id']) for r in joined}==verse_ids
        assert {r['matched_recording_id'] for r in joined if r['matched_recording_id']}==set(matching)
        assert len(matching)==(9 if owner==10 else 0) and pending==0
        proof[str(owner)]={'recordingCount':len(matching),'pendingCount':pending,'lastActivity':activity,'productionJoinedIDsMatchIndependentOracle':True}
    return {'status':'PASS_PRODUCTION_JOIN_AND_AGGREGATE_BRANCH_ONLY','owners':proof,
      'migrationSurvivalProven':False,'fullMyWorkQueryAndUIProven':False}

if __name__=='__main__':
    assert len(sys.argv)==2,'Provide retained ROOT-collected queries.json result; this program never fetches devices.'
    print(json.dumps(verify(json.loads(Path(sys.argv[1]).read_text())),indent=2))
