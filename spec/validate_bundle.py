"""Validate the v2 design package and compile the supplied examples.

This checks design/data consistency and runs the education reference suite.
Full-game acceptance requirements remain for the game implementation.
Run: python validate_bundle.py
"""
from __future__ import annotations
from collections import Counter
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def determine_template(p: dict[str, Any]) -> str:
    role, industry = p['role_family'], p['industry']
    if role == 'hr': return 'T08'
    if role == 'testing': return 'T07'
    if role == 'sales': return 'T06'
    if role == 'management': return 'T05'
    if industry == 'consulting': return 'T09'
    if industry == 'manufacturing' and role in {'hardware_rd','general_rd'}: return 'T04'
    if p['ownership'] in {'state_owned','central_state_owned'} and role == 'administration': return 'T02'
    if p['ownership'] == 'foreign_owned' and role in {'product','project'}: return 'T03'
    if p['company_stage'] == 'startup' and p['annual_equity_cny'] > 0: return 'T10'
    if industry in {'internet','gaming'} and role in {'development','algorithm'}: return 'T01'
    return 'T00'


def compile_offer(p: dict[str, Any], benefit_id: str | None,
                  catalog: dict[str, Any]) -> dict[str, Any]:
    required_enum_fields=('company_display_name','ownership','industry','company_stage','role_family')
    for key in required_enum_fields:
        if not isinstance(p.get(key),str) or not p[key]:
            raise ValueError(f'{key}: a confirmed nonempty string is required')
    numeric_fields=('monthly_fixed_cny','guaranteed_months','annual_fixed_allowance_cny',
                    'annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny')
    for key in numeric_fields:
        v=p.get(key)
        if type(v) is not int or v < 0:
            raise ValueError(f'{key}: a confirmed nonnegative integer is required')
    annual_fixed=p['monthly_fixed_cny']*p['guaranteed_months']+p['annual_fixed_allowance_cny']
    annual_package=annual_fixed+p['annual_target_bonus_cny']+p['annual_equity_cny']
    if annual_package <= 0:
        raise ValueError('annual package must be positive')
    tier=next(t for t in catalog['salary_tiers']
              if annual_package>=t['min_cny'] and
              (t['max_exclusive_cny'] is None or annual_package<t['max_exclusive_cny']))
    template_id=determine_template(p)
    t=next(x for x in catalog['offer_templates'] if x['id']==template_id)
    c=tier['time_cost']
    attack=max(1,c+t['attack_delta']);health=max(1,c+t['health_delta'])
    if benefit_id is not None:
        valid_ids={b['id'] for b in catalog['benefits']}
        if benefit_id not in valid_ids or benefit_id not in p.get('confirmed_benefits',[]):
            raise ValueError('benefit must be valid and confirmed in this profile')
        if health>1: health-=1
        else: attack-=1
        if attack<1: raise ValueError('benefit price would produce invalid base stats')
    canonical={'profile':p,'benefit_id':benefit_id,'rules_version':catalog['rules_version']}
    digest=hashlib.sha256(json.dumps(canonical,ensure_ascii=False,sort_keys=True,
                                   separators=(',',':')).encode()).hexdigest()
    return {'rules_version':catalog['rules_version'],'annual_fixed_cny':annual_fixed,
            'annual_package_cny':annual_package,'template_id':template_id,'benefit_id':benefit_id,
            'original_time':c,'base_attack':attack,'base_max_health':health,
            'career_tags':t['career_tags'],'definition_hash':digest}


def main() -> None:
    import re
    import subprocess
    import sys
    from datetime import datetime, timezone
    def load(name: str) -> Any:
        return json.loads((ROOT/name).read_text(encoding='utf-8'))
    r=load('rules_catalog.json');e=load('education_catalog.json')
    examples=load('example_offers.json');combos=load('data/education_combinations.json')
    assets=load('art/asset_manifest.json');tokens=load('data/runtime_tokens.json')
    assert r['rules_version']==e['rules_version']=='2.0.0'
    assert r['heroes']==e['primary'],'Hero definitions diverge between catalogs'
    assert len(e['primary'])==10 and len(e['secondary'])==11
    ids=[v['id'] for key in ['heroes','offer_templates','benefits','base_cards','flex_cards'] for v in r[key]]
    ids += [s['id'] for s in e['secondary']]+[t['id'] for t in tokens]
    assert len(ids)==len(set(ids)),'Cross-catalog gameplay IDs must be unique'
    assert len(r['base_cards'])==24 and len(r['flex_cards'])==6
    assert len(r['offer_templates'])==11 and len(r['benefits'])==7
    assert r['base_deck_size']+r['flex_deck_size']==r['deck_size']==15
    assert r['hero_skill_uses_per_own_turn']==e['shared_rules']['shared_action_limit_per_own_turn']==1
    primary_ids={x['id'] for x in e['primary']};secondary_ids={x['id'] for x in e['secondary']}
    assert {(x['primary_id'],x['secondary_id']) for x in combos} == {(p,s) for p in primary_ids for s in secondary_ids}
    assert len(combos)==110 and all(x['gameplay_bonus'] is None for x in combos)
    assert all(s['unlock_round']==4 and s['uses_per_match']==1 for s in e['secondary'])
    assert len({x['id'] for x in combos})==110
    base_ids={x['id'] for x in r['base_cards']};flex_ids={x['id'] for x in r['flex_cards']}
    for name,deck in r['base_deck_presets'].items():
        assert len(deck)==12 and max(Counter(deck).values())<=2,name
        assert set(deck)<=base_ids,name
    for p in load('data/loadout_presets.json'):
        assert len(p['base_deck'])==12 and max(Counter(p['base_deck']).values())<=2,p['id']
        assert set(p['base_deck'])<=base_ids
        assert len(p['default_flex'])==3 and len(set(p['default_flex']))==3
        assert set(p['default_flex'])<=flex_ids
        assert len(p['offer_ids'])==3 and len(set(p['offer_ids']))==3
        assert set(p['offer_ids'])<={x['id'] for x in examples}
        assert p['primary_id'] in primary_ids and p['secondary_id'] in secondary_ids
    stat_combinations=0
    for tier in r['salary_tiers']:
        for t in r['offer_templates']:
            for b in [None]+r['benefits']:
                a=max(1,tier['time_cost']+t['attack_delta']);h=max(1,tier['time_cost']+t['health_delta'])
                if b:
                    if h>1:h-=1
                    else:a-=1
                assert a>=1 and h>=1
                stat_combinations+=1
    for example in examples:
        assert compile_offer(example['profile'],example['selected_benefit_id'],r)==example['definition'],example['id']
    p=dict(examples[0]['profile'])
    bounds=[(149999,2),(150000,3),(249999,3),(250000,4),(399999,4),(400000,5),(599999,5),(600000,6),(899999,6),(900000,7)]
    for salary,cost in bounds:
        p.update(monthly_fixed_cny=salary,guaranteed_months=1,annual_fixed_allowance_cny=0,annual_target_bonus_cny=0,annual_equity_cny=0)
        assert compile_offer(p,None,r)['original_time']==cost
    p['annual_target_bonus_cny']=None
    try:compile_offer(p,None,r)
    except ValueError:pass
    else:raise AssertionError('Unknown numeric input must be rejected')
    aid={x['id'] for x in assets['assets']}
    assert len(aid)==len(assets['assets'])==assets['asset_slots']==190
    assert len({x['preferred_path'] for x in assets['assets']})==190
    graph={x['id']:x['dependencies'] for x in assets['assets']}
    def visit(node: str, chain: tuple[str,...]=()) -> None:
        assert node not in chain,'Resource dependency cycle: '+node
        for child in graph[node]:
            assert child in aid,'Missing resource dependency '+child
            visit(child,chain+(node,))
    for a in aid:visit(a)
    for h in r['heroes']+e['secondary']:
        assert h['asset_id'] in aid
    for c in combos:
        assert c['primary_art_id'] in aid and c['secondary_seal_id'] in aid
        assert 'vfx_'+c['cosmetic_recipe'] in aid
    for c in e['combo_titles']:assert 'vfx_'+c['vfx'] in aid
    for t in tokens:assert t['asset_id'] in aid
    for a in assets['assets']:
        assert a['preferred_path'].startswith('assets/') and '..' not in a['preferred_path']
        if a['dimensions']:assert len(a['dimensions'])==2 and all(type(x) is int and x>0 for x in a['dimensions'])
    dialogue=load('data/dialogue_bank.json')['entries']
    assert len(dialogue)==48 and len({x['id'] for x in dialogue})==48
    assert all(x['text'] and len(x['text'])<=40 for x in dialogue)
    assert len(load('tests/education_cases.json'))==70
    base_cases=len(re.findall(r'^\| [A-G]\d{2} \|',(ROOT/'acceptance_tests.md').read_text(),re.M))
    delivery_cases=len(re.findall(r'^\| P\d{3} \|',(ROOT/'tests/delivery_acceptance.md').read_text(),re.M))
    assert base_cases==88 and delivery_cases==20
    required=['README.md','AGI_START_HERE.md','game_design.md','education_system.md',
              'engineering/build_contract.md','engineering/state_and_network.md',
              'art/art_bible.md','prompts/art_generation.md','LAUNCH_PROMPT.txt']
    for file in required:assert (ROOT/file).is_file(),file
    # Check balanced fenced blocks; markdown-only production specs, no binary art claim.
    for md in ROOT.rglob('*.md'):
        assert len(re.findall(r'^```',md.read_text(),re.M))%2==0,'Unbalanced markdown fence in '+str(md)
    proc=subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-p','test_*.py','-v'],
                        cwd=ROOT,capture_output=True,text=True,timeout=30)
    test_output=proc.stdout+proc.stderr
    (ROOT/'reports/reference_tests.txt').write_text(test_output,encoding='utf-8')
    assert proc.returncode==0,test_output
    match=re.search(r'Ran (\d+) tests',test_output)
    assert match is not None
    report={
      'rules_version':'2.0.0','design_date':'2026-09-26','environment_clock_utc':datetime.now(timezone.utc).isoformat(),
      'design_validation':'passed','gameplay_id_count':len(ids),'primary_skills':10,'secondary_skills':11,
      'ordered_education_combinations':110,'base_cards':24,'flex_cards':6,'offer_templates':11,
      'benefits':7,'stat_benefit_combinations_checked':stat_combinations,'salary_boundaries_checked':len(bounds),
      'compiled_offer_examples':len(examples),'loadout_presets':len(load('data/loadout_presets.json')),
      'asset_specification_slots':190,'asset_ids_paths_dependencies':'passed',
      'produced_binary_assets_in_design_bundle':0,'local_dialogue_lines':len(dialogue),
      'full_game_acceptance_requirements':178,'full_game_execution_status':'specified_for_development_agent',
      'education_reference_tests':int(match.group(1)),'education_reference_status':'passed',
      'reference_scope':'Education activation and immediate effects; full combat and networking are specified separately.'}
    (ROOT/'reports/bundle_validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
