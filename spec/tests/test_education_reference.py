from __future__ import annotations
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from reference.education_reference import (new_state,apply_skill,next_own_turn,rank_band,
    deployment_cost,public_view,RuleError,unit,card,PRIMARY,SECONDARY)

class EducationTests(unittest.TestCase):
    def reject_unchanged(self,s,**kwargs):
        frozen=copy.deepcopy(s)
        with self.assertRaises(RuleError):apply_skill(s,**kwargs)
        self.assertEqual(s,frozen)
    def test_rank_boundaries(self):
        for n,band in [(1,'H07'),(50,'H07'),(51,'H08'),(100,'H08'),(101,'H09'),(9999,'H09')]:
            self.assertEqual(rank_band(n),band)
    def test_rank_rejects_unknown_and_boolean(self):
        for bad in [None,True,0,-1,'50',50.0]:
            with self.assertRaises(RuleError):rank_band(bad)
    def test_all_110_ordered_loadouts(self):
        seen=set()
        for p in PRIMARY:
            for q in SECONDARY:
                s=new_state(p,q);seen.add((s['players'][0]['primary'],s['players'][0]['secondary']))
        self.assertEqual(len(seen),110)
    def test_secondary_locked_round_three(self):
        self.reject_unchanged(new_state(round_no=3),slot='secondary',target='p-offer')
    def test_secondary_unlocked_round_four(self):
        s=apply_skill(new_state(),slot='secondary',target='p-offer')
        self.assertTrue(s['players'][0]['secondary_used'])
    def test_shared_primary_then_secondary(self):
        s=apply_skill(new_state(),slot='primary')
        self.reject_unchanged(s,slot='secondary',target='p-offer')
    def test_shared_secondary_then_primary(self):
        s=apply_skill(new_state(),slot='secondary',target='p-offer')
        self.reject_unchanged(s,slot='primary')
    def test_secondary_never_refreshes(self):
        s=next_own_turn(apply_skill(new_state(),slot='secondary',target='p-offer'))
        self.reject_unchanged(s,slot='secondary',target='p-offer')
    def test_insufficient_time_is_atomic(self):
        s=new_state();s['players'][0]['time']=1
        self.reject_unchanged(s,slot='primary')
    def test_same_school_uses_distinct_skills(self):
        s=new_state('H04','S04');s=apply_skill(s,slot='primary')
        self.assertEqual(len(s['players'][0]['hand']),2)
        s=next_own_turn(s);s=apply_skill(s,slot='secondary')
        self.assertEqual(len(s['players'][0]['hand']),4)
    def test_jlu_two_preparations(self):
        s=apply_skill(new_state(),slot='primary');p=s['players'][0]
        self.assertEqual((p['jlu_signins'],p['mind'],p['time']),(1,21,6))
        s=apply_skill(next_own_turn(s),slot='primary');p=s['players'][0]
        self.assertEqual((p['jlu_signins'],p['mind']),(2,22))
    def test_jlu_preparation_at_full_mind(self):
        s=new_state();s['players'][0]['mind']=30
        s=apply_skill(s,slot='primary')
        self.assertEqual(s['players'][0]['mind'],30)
        self.assertEqual(s['players'][0]['jlu_signins'],1)
    def test_jlu_ready_requires_offer(self):
        s=new_state();s['players'][0]['jlu_signins']=2
        self.reject_unchanged(s,slot='primary',target='p-support')
        self.reject_unchanged(s,slot='primary')
    def test_jlu_ultimate_exact_stats_damage_age_attack(self):
        s=new_state();p=s['players'][0];p['jlu_signins']=2
        p['board'][0].update(age=35,damage=2,attacked=True,optimization={'due':5})
        s=apply_skill(s,slot='primary',target='p-offer');p=s['players'][0];u=p['board'][0]
        self.assertEqual((u['attack'],u['max_health'],u['damage']),(7,8,2))
        self.assertEqual(u['age'],35);self.assertTrue(u['attacked']);self.assertIn('optimization',u)
        self.assertTrue(p['jlu_ultimate_used']);self.assertEqual(p['jlu_signins'],0)
        self.assertEqual(len(p['board']),2)
    def test_jlu_post_ultimate_meal_only(self):
        s=new_state();p=s['players'][0];p['jlu_ultimate_used']=True
        s=apply_skill(s,slot='primary');p=s['players'][0]
        self.assertEqual(p['mind'],22);self.assertEqual(p['jlu_signins'],0)
        self.assertEqual(p['board'][0]['attack'],3)
    def test_double_jlu_total_buff(self):
        s=new_state();s['players'][0]['jlu_signins']=2
        s=apply_skill(s,slot='primary',target='p-offer')
        s=apply_skill(next_own_turn(s),slot='secondary',target='p-offer')
        u=s['players'][0]['board'][0]
        self.assertEqual((u['attack'],u['max_health']),(9,10))
    def test_secondary_jlu_does_not_create_primary(self):
        s=apply_skill(new_state('H04','S10'),slot='secondary',target='p-offer')
        p=s['players'][0];self.assertEqual(p['jlu_signins'],0)
        self.assertFalse(p['jlu_ultimate_used']);self.assertEqual(p['primary'],'H04')
    def test_jlu_buff_bounce_clears_keeps_spent_and_age(self):
        s=new_state('H10','S07');p=s['players'][0];p['jlu_signins']=2;p['board'][0]['age']=35
        s=apply_skill(s,slot='primary',target='p-offer')
        s=apply_skill(next_own_turn(s),slot='secondary',target='p-offer')
        p=s['players'][0];u=next(x for x in p['hand'] if x['id']=='p-offer')
        self.assertEqual((u['attack'],u['max_health'],u['age']),(3,4,35))
        self.assertEqual(u['modifiers'],[]);self.assertTrue(p['jlu_ultimate_used'])
    def test_overseas_return_ticket(self):
        s=apply_skill(new_state('H07','S00'),slot='primary',target='p-offer')
        p=s['players'][0];self.assertEqual(p['return_ticket']['offer_id'],'p-offer')
        self.assertEqual(p['return_ticket']['discount'],1)
        self.assertEqual(len(p['board']),1)
    def test_overseas_return_rejects_full_hand(self):
        s=new_state('H07','S00');s['players'][0]['hand']=[card(f'c{i}') for i in range(8)]
        self.reject_unchanged(s,slot='primary',target='p-offer')
    def test_overseas_ticket_expires_next_owner_end(self):
        s=apply_skill(new_state('H07','S00'),slot='primary',target='p-offer')
        s=next_own_turn(s);self.assertIsNotNone(s['players'][0]['return_ticket'])
        s=next_own_turn(s);self.assertIsNone(s['players'][0]['return_ticket'])
    def test_support_upgrade_rejects_offer(self):
        self.reject_unchanged(new_state('H08','S00'),slot='primary',target='p-offer')
    def test_support_upgrade(self):
        s=apply_skill(new_state('H08','S00'),slot='primary',target='p-support')
        self.assertEqual((s['players'][0]['board'][1]['attack'],s['players'][0]['board'][1]['max_health']),(4,5))
    def test_hand_rotation_order_and_no_card_advantage(self):
        s=apply_skill(new_state('H09','S00'),slot='primary',choice='p-hand');p=s['players'][0]
        self.assertEqual([x['id'] for x in p['hand']],['p-deck-a'])
        self.assertEqual(p['deck'][-1]['id'],'p-hand')
    def test_rotation_rejects_empty_deck_and_offer(self):
        s=new_state('H09','S00');s['players'][0]['deck']=[]
        self.reject_unchanged(s,slot='primary',choice='p-hand')
        s=new_state('H09','S00');s['players'][0]['hand'].append(unit('hand-offer'))
        self.reject_unchanged(s,slot='primary',choice='hand-offer')
    def test_tax_uses_largest_increase(self):
        s=new_state('H01','S01');s=apply_skill(s,slot='primary',choice='q-hand-a')
        s=apply_skill(next_own_turn(s),slot='secondary',choice='q-hand-a')
        self.assertEqual(s['players'][1]['hand'][0]['school_tax'],2)
    def test_referral_upgrade_not_sum(self):
        s=new_state('H02','S02');s['players'][0]['referral_discount']=1
        s=apply_skill(s,slot='secondary');self.assertEqual(s['players'][0]['referral_discount'],2)
    def test_primary_c9_rejects_existing_coupon(self):
        s=new_state('H02','S00');s['players'][0]['referral_discount']=2
        self.reject_unchanged(s,slot='primary')
    def test_c9_selection_order(self):
        s=new_state('H02','S00');s['players'][0]['deck'].append(card('p-deck-d'))
        s=apply_skill(s,slot='primary',choice='p-deck-b')
        self.assertEqual([x['id'] for x in s['players'][0]['deck']],['p-deck-b','p-deck-d','p-deck-a','p-deck-c'])
    def test_secondary_two_targets_distinct(self):
        s=new_state('H04','S08');self.reject_unchanged(s,slot='secondary',targets=['p-offer','p-offer'])
        s=apply_skill(s,slot='secondary',targets=['p-offer','p-support'])
        self.assertEqual([x['attack'] for x in s['players'][0]['board']],[4,4])
    def test_secondary_summon_board_full(self):
        s=new_state('H04','S06');s['players'][0]['board']=[unit(str(i),False) for i in range(4)]
        self.reject_unchanged(s,slot='secondary')
    def test_project_token_rush(self):
        s=apply_skill(new_state('H04','S06'),slot='secondary');u=s['players'][0]['board'][-1]
        self.assertEqual((u['attack'],u['max_health'],u['original_time']),(2,3,2))
        self.assertTrue(u['rush_units']);self.assertTrue(u['temporary'])
    def test_secondary_damage_retires_offer(self):
        s=new_state('H04','S09');s['players'][1]['board'][0]['damage']=2
        s=apply_skill(s,slot='secondary',target='q-offer')
        self.assertEqual(len(s['players'][1]['board']),0);self.assertEqual(s['players'][1]['mind'],18)
    def test_secondary_draw_fatigue_and_stop_on_lethal(self):
        s=new_state('H04','S04');p=s['players'][0];p['deck']=[];p['mind']=1
        s=apply_skill(s,slot='secondary');p=s['players'][0]
        self.assertEqual(p['fatigue'],1);self.assertEqual(s['result'],1)
    def test_s00_heals_before_fatigue(self):
        s=new_state('H04','S00');p=s['players'][0];p['deck']=[];p['mind']=1
        s=apply_skill(s,slot='secondary');self.assertEqual(s['players'][0]['mind'],2)
    def test_secondary_draw_overflow(self):
        s=new_state('H04','S04');s['players'][0]['hand']=[card(f'h{i}') for i in range(8)]
        s=apply_skill(s,slot='secondary');p=s['players'][0]
        self.assertEqual(len(p['hand']),8);self.assertEqual(len(p['discard']),2)
    def test_cost_floor_and_legal_stacks(self):
        self.assertEqual(deployment_cost(7,negotiation=3,referral=2),2)
        self.assertEqual(deployment_cost(5,referral=2,returned=1),2)
        self.assertEqual(deployment_cost(5,negotiation=3,referral=2),1)
        with self.assertRaises(RuleError):deployment_cost(5,negotiation=1,returned=1)
    def test_public_view_omits_opponent_hand_and_decks(self):
        v=public_view(new_state(),0)
        self.assertIsNone(v['players'][1]['hand']);self.assertNotIn('deck',v['players'][1])
        self.assertEqual(len(v['players'][0]['hand']),1)
    def test_deterministic_same_input(self):
        s=new_state();a=apply_skill(s,slot='primary');b=apply_skill(s,slot='primary')
        self.assertEqual(a,b)
    def test_every_primary_handler(self):
        for hid in PRIMARY:
            with self.subTest(hid=hid):
                kw=dict(slot='primary')
                if hid in ['H03','H05','H07']:kw['target']='p-offer'
                if hid=='H08':kw['target']='p-support'
                if hid=='H09':kw['choice']='p-hand'
                s=apply_skill(new_state(hid,'S00'),**kw)
                self.assertTrue(s['players'][0]['used_this_turn'])
    def test_every_secondary_handler(self):
        for sid in SECONDARY:
            with self.subTest(sid=sid):
                kw=dict(slot='secondary')
                if sid in ['S03','S05','S07','S10']:kw['target']='p-offer'
                if sid=='S08':kw['targets']=['p-offer','p-support']
                if sid=='S09':kw['target']='q-offer'
                s=apply_skill(new_state('H04',sid),**kw)
                self.assertTrue(s['players'][0]['secondary_used'])

if __name__=='__main__':unittest.main(verbosity=2)
