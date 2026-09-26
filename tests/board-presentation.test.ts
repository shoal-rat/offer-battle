import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,getTutorialView} from '../src/game/tutorial';
import {applyCommand,getView} from '../src/game';
import {initialBoardPresentation,presentBoard,finishBoardDepartures} from '../src/components/board-presentation';
import type {BattleCue} from '../src/game/types';
function position(){const lesson=createTutorial('L02');let s=lesson.state;const weaken=getTutorialView(s,lesson.progress).allowedCommands[0];s=applyCommand(s,'p1',weaken).state;const before=getView(s,'p1'),attack=getTutorialView(s,{lessonId:'L02',stepIndex:1}).allowedCommands[0];s=applyCommand(s,'p1',attack).state;return {before,after:getView(s,'p1'),dead:attack.targetId!};}
test('lethal combat retains the dying front slot until its exit is complete',()=>{
 const {before,after,dead}=position(),survivor=before.players[1].board[1].id;
 const held=presentBoard(initialBoardPresentation(before),after);
 assert.equal(after.players[1].board[0].id,survivor);
 assert.equal(held.rows.p2[0]?.unit.id,dead);assert.equal(held.rows.p2[0]?.departing,true);
 assert.equal(held.rows.p2[1]?.unit.id,survivor);
 const done=finishBoardDepartures(held,[dead]);assert.equal(done.rows.p2[0]?.unit.id,survivor);assert.ok(!done.rows.p2.some(s=>s?.unit.id===dead));
});
test('connection snapshots do not release an unfinished exit or replay removed cards',()=>{
 const {before,after,dead}=position();let held=presentBoard(initialBoardPresentation(before),after);
 held=presentBoard(held,structuredClone(after));assert.equal(held.rows.p2[0]?.unit.id,dead);
 const restored=initialBoardPresentation(after);assert.ok(!restored.rows.p2.some(s=>s?.unit.id===dead));
});
test('simultaneous exits keep survivors in place until all reserved slots are released',()=>{
 const {before}=position();const a=before.players[0].board[0],b=before.players[0].board[1];
 const after=structuredClone(before);after.version++;after.players[0].board=[];
 const seq=Math.max(0,...before.visualCues.map(c=>c.sequence));
 after.visualCues.push(...[a,b].map((u,i)=>({id:`death-${i}`,sequence:seq+i+1,kind:'retire',targetId:u.id} as BattleCue)));
 let held=presentBoard(initialBoardPresentation(before),after);
 held=finishBoardDepartures(held,[a.id]);assert.equal(held.rows.p1[0],null);assert.equal(held.rows.p1[1]?.unit.id,b.id);
 held=finishBoardDepartures(held,[b.id]);assert.deepEqual(held.rows.p1,[]);
});
test('a new arrival cannot replace a dying card while its old slot is still reserved',()=>{
 const {before,after,dead}=position();const arrival={...before.players[1].board[0],id:'new-arrival'};
 const extra=[1,2].map(i=>({...before.players[1].board[1],id:`survivor-${i}`}));
 before.players[1].board.push(...extra);after.players[1].board.push(...extra,arrival);
 const held=presentBoard(initialBoardPresentation(before),after);
 assert.equal(held.rows.p2[0]?.unit.id,dead);assert.ok(!held.rows.p2.some(slot=>slot?.unit.id===arrival.id));
 const done=finishBoardDepartures(held);assert.deepEqual(done.rows.p2.map(s=>s?.unit.id),after.players[1].board.map(u=>u.id));
});
test('return-to-hand exits reserve the source card rather than the hand destination',()=>{
 const {before,after,dead}=position();const seq=Math.max(0,...before.visualCues.map(c=>c.sequence));
 after.visualCues=[...before.visualCues,{id:'bounce',sequence:seq+1,kind:'bounce',sourceId:dead,targetId:'p2'} as BattleCue];
 const held=presentBoard(initialBoardPresentation(before),after);assert.equal(held.rows.p2[0]?.unit.id,dead);assert.equal(held.rows.p2[0]?.departing,true);
});
test('changing matches discards all previous animation reservations',()=>{
 const {before,after}=position();const held=presentBoard(initialBoardPresentation(before),after);
 const next=structuredClone(after);next.matchId='new-match';assert.deepEqual(presentBoard(held,next),initialBoardPresentation(next));
});
