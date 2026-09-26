"""Deterministic executable reference for education activation only.

This module models the education subsystem and its immediate effects. Full card
combat, template age bonuses, networking and retort handlers belong to the game
implementation. Inputs are dictionaries so fixtures can be ported to TypeScript.
All rejected commands preserve their original input state.
"""
from __future__ import annotations
import copy
from pathlib import Path
import json
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EDU = json.loads((ROOT / 'education_catalog.json').read_text(encoding='utf-8'))
PRIMARY = {v['id']: v for v in EDU['primary']}
SECONDARY = {v['id']: v for v in EDU['secondary']}

class RuleError(ValueError):
    pass

def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuleError(message)

def rank_band(rank: int) -> str:
    require(type(rank) is int and rank >= 1, 'Rank must be a positive integer')
    return 'H07' if rank <= 50 else 'H08' if rank <= 100 else 'H09'

def hero(primary: str = 'H10', secondary: str = 'S10') -> dict[str, Any]:
    require(primary in PRIMARY and secondary in SECONDARY, 'Unknown education ID')
    return dict(primary=primary, secondary=secondary, mind=20, time=8,
                used_this_turn=False, secondary_used=False, jlu_signins=0,
                jlu_ultimate_used=False, referral_discount=0, return_ticket=None,
                own_turn=1, fatigue=0, hand=[], deck=[], board=[], discard=[], known_hand=[])

def unit(uid: str, offer: bool = True, attack: int = 3,
         health: int = 4, age: int = 22, original_time: int = 3) -> dict[str, Any]:
    return dict(id=uid, deployment_id=uid+'-d1', type='offer' if offer else 'support',
                base_attack=attack, base_health=health, attack=attack, max_health=health,
                damage=0, age=age if offer else None, original_time=original_time,
                temporary=False, attacked=False, modifiers=[], ever_deployed=True)

def card(cid: str, cost: int = 2) -> dict[str, Any]:
    return dict(id=cid, type='action', original_time=cost, school_tax=0)

def new_state(primary: str = 'H10', secondary: str = 'S10', round_no: int = 4) -> dict[str, Any]:
    p, q = hero(primary,secondary),hero('H04','S00')
    p['board']=[unit('p-offer'),unit('p-support',False)]
    q['board']=[unit('q-offer',True,5,6,35,5)]
    p['hand']=[card('p-hand')];p['deck']=[card('p-deck-a'),card('p-deck-b'),card('p-deck-c')]
    q['hand']=[card('q-hand-a'),card('q-hand-b')]
    return dict(round=round_no,active=0,players=[p,q],result=None,events=[])

def find_target(board: list[dict], uid: str | None, kind: str | None = None) -> dict:
    target=next((x for x in board if x['id']==uid),None)
    require(target is not None,'Target is not on the required board')
    require(kind is None or target['type']==kind,'Invalid target type')
    return target

def heal_mind(p: dict, n: int) -> None:
    p['mind']=min(30,p['mind']+n)

def buff(u: dict, attack: int, health: int, source: str, temporary: bool=False) -> None:
    u['attack']+=attack;u['max_health']+=health
    u['modifiers'].append(dict(source=source,attack=attack,health=health,
                               expires='own_turn_end' if temporary else 'deployment_end'))

def check_result(s: dict) -> None:
    dead=[i for i,p in enumerate(s['players']) if p['mind']<=0]
    if dead:s['result']='draw' if len(dead)==2 else 1-dead[0]

def draw(s: dict, idx: int, count: int=1) -> None:
    p=s['players'][idx]
    for _ in range(count):
        if s['result'] is not None:return
        if p['deck']:
            c=p['deck'].pop(0)
            (p['hand'] if len(p['hand'])<8 else p['discard']).append(c)
        else:
            p['fatigue']+=1;p['mind']-=p['fatigue'];check_result(s)

def bounce(p: dict, u: dict) -> dict:
    require(len(p['hand'])<8,'Education return requires hand space')
    p['board'].remove(u)
    u['damage']=0;u['attack']=u['base_attack'];u['max_health']=u['base_health']
    u['modifiers']=[];u['deployment_id']=None;u['attacked']=False
    for key in ['optimization','managed','option_disabled']:
        u.pop(key,None)
    p['hand'].append(u)
    return u

def retire_dead(s: dict) -> None:
    for p in s['players']:
        dead=[u for u in p['board'] if u['damage']>=u['max_health']]
        for u in dead:
            p['board'].remove(u);p['discard'].append(u)
            if u['type']=='offer':p['mind']-=2
    check_result(s)

def apply_skill(state: dict, slot: str, target: str | None = None,
                targets: list[str] | None = None, choice: str | None = None) -> dict:
    """Apply a preselected legal skill. Network reveal transactions are specified separately."""
    s=copy.deepcopy(state)
    require(s['result'] is None,'Match is over')
    idx=s['active'];p=s['players'][idx];q=s['players'][1-idx]
    require(slot in ('primary','secondary'),'Unknown slot')
    require(not p['used_this_turn'],'Shared education action already used')
    sid=p[slot];definition=(PRIMARY if slot=='primary' else SECONDARY)[sid]
    cost=definition['time_cost']
    if slot=='secondary':
        require(s['round']>=4,'Secondary unlocks at round 4')
        require(not p['secondary_used'],'Secondary already spent')
    require(p['time']>=cost,'Insufficient time')
    # Changes below only touch the copied state; errors are transactionally rejected.
    p['time']-=cost;p['used_this_turn']=True
    if slot=='secondary':p['secondary_used']=True
    if sid in ('H01','S01'):
        require(bool(q['hand']),'Opponent has no hand')
        chosen=choice or q['hand'][0]['id']
        c=next((x for x in q['hand'] if x['id']==chosen),None)
        require(c is not None,'Invalid hand choice')
        p['known_hand']=[x['id'] for x in q['hand']]
        c['school_tax']=max(c.get('school_tax',0),1 if sid=='H01' else 2)
        c['tax_expires_owner_turn']=q['own_turn']+1
    elif sid=='H02':
        require(p['referral_discount']==0,'Referral already held')
        top=p['deck'][:3]
        if top:
            chosen=choice or top[0]['id']
            require(any(x['id']==chosen for x in top),'Invalid top-deck choice')
            keep=next(x for x in top if x['id']==chosen)
            p['deck']=[keep]+p['deck'][len(top):]+[x for x in top if x['id']!=chosen]
        p['referral_discount']=1
    elif sid=='H03':
        u=find_target(p['board'],target);buff(u,2,0,sid,True);p['mind']-=1
    elif sid=='H04':draw(s,idx)
    elif sid in ('H05','S05'):
        if p['board']:
            u=find_target(p['board'],target)
            u['damage']=max(0,u['damage']-(2 if sid=='H05' else 3))
        heal_mind(p,1 if sid=='H05' else 3)
    elif sid in ('H06','S06'):
        require(len(p['board'])<4,'Board is full')
        a=(2 if len(p['board'])<len(q['board']) else 1) if sid=='H06' else 2
        h=2 if sid=='H06' else 3
        uid=f'token-{len(s["events"])}-{sid}-{p["own_turn"]}'
        u=unit(uid,False,a,h,original_time=1 if sid=='H06' else 2)
        u['temporary']=True;u['rush_units']=sid=='S06';p['board'].append(u)
    elif sid in ('H07','S07'):
        u=find_target(p['board'],target,'offer')
        if sid=='H07':require(p['return_ticket'] is None,'Return ticket already held')
        bounce(p,u)
        if sid=='H07':p['return_ticket']=dict(offer_id=u['id'],discount=1,expires=p['own_turn']+1)
        else:draw(s,idx)
    elif sid=='H08':
        u=find_target(p['board'],target,'support');buff(u,1,1,sid)
    elif sid=='H09':
        require(bool(p['deck']),'Deck must be nonempty before exchange')
        c=next((x for x in p['hand'] if x['id']==choice),None)
        require(c is not None and c['type']!='offer','Choose a shared hand card')
        p['hand'].remove(c);p['deck'].append(c);draw(s,idx)
    elif sid=='H10':
        if p['jlu_ultimate_used']:heal_mind(p,2)
        elif p['jlu_signins']<2:
            heal_mind(p,1);p['jlu_signins']+=1
        else:
            u=find_target(p['board'],target,'offer');buff(u,4,4,sid)
            p['jlu_signins']=0;p['jlu_ultimate_used']=True
    elif sid=='S00':heal_mind(p,2);draw(s,idx)
    elif sid=='S02':p['referral_discount']=max(p['referral_discount'],2);heal_mind(p,2)
    elif sid=='S03':
        u=find_target(p['board'],target);buff(u,2,2,sid);p['mind']-=1
    elif sid=='S04':draw(s,idx,2)
    elif sid=='S08':
        ts=targets if targets is not None else ([target] if target else [])
        require(1<=len(ts)<=2 and len(ts)==len(set(ts)),'Choose one or two distinct targets')
        for uid in ts:buff(find_target(p['board'],uid),1,1,sid)
    elif sid=='S09':
        u=find_target(q['board'],target)
        u['damage']+=4 if u['original_time']>=5 else 3
        retire_dead(s)
    elif sid=='S10':
        u=find_target(p['board'],target,'offer');buff(u,2,2,sid)
    else:raise RuleError('Unimplemented education ID')
    check_result(s)
    s['events'].append(dict(type='education_resolved',id=sid,slot=slot,cost=cost))
    return s

def next_own_turn(state: dict, round_no: int | None=None) -> dict:
    """Reference helper: end and start the same player's next own turn; skips combat."""
    s=copy.deepcopy(state);p=s['players'][s['active']]
    for u in p['board']:
        remove=[m for m in u['modifiers'] if m['expires']=='own_turn_end']
        for m in remove:u['attack']-=m['attack'];u['max_health']-=m['health']
        u['modifiers']=[m for m in u['modifiers'] if m not in remove]
    if p['return_ticket'] and p['return_ticket']['expires']<=p['own_turn']:
        p['return_ticket']=None
    for c in p['hand']:
        if c.get('tax_expires_owner_turn',10**9)<=p['own_turn']:
            c['school_tax']=0;c.pop('tax_expires_owner_turn',None)
    p['own_turn']+=1;p['used_this_turn']=False
    s['round']=round_no if round_no is not None else s['round']+1
    p['time']=min(8,s['round'])
    return s

def deployment_cost(original: int, tax: int=0, negotiation: int=0,
                    referral: int=0, returned: int=0) -> int:
    require(all(type(x) is int and x>=0 for x in (original,tax,negotiation,referral,returned)),
            'Cost components must be nonnegative integers')
    require(original>=1,'Original cost must be positive')
    require(not(negotiation and returned),'Negotiation and returned card cannot share a target')
    return max(1,original+tax-negotiation-referral-returned)

def public_view(state: dict, viewer: int) -> dict:
    require(viewer in (0,1),'Invalid viewer')
    rows=[]
    for i,p in enumerate(state['players']):
        v={k:copy.deepcopy(p[k]) for k in ['primary','secondary','mind','time','secondary_used',
                                           'jlu_signins','jlu_ultimate_used','referral_discount',
                                           'return_ticket','used_this_turn','board']}
        v['deck_count']=len(p['deck']);v['hand_count']=len(p['hand'])
        v['hand']=copy.deepcopy(p['hand']) if i==viewer else None
        if i==viewer:v['known_hand_snapshot']=copy.deepcopy(p['known_hand'])
        rows.append(v)
    return dict(round=state['round'],active=state['active'],players=rows)
