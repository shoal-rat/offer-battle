import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_EXPERIMENT_FLAGS,experimentFlags,challengeCatalog,createChallenge,validateChallengeSolution,createBoss,createSeries,recordSeriesResult,setSeriesFlex,seriesNextLoadouts,seriesReady,seriesSummary,deriveAchievements,mergeAchievements,createTempoTrial,replayTempo} from '../src/game/experiments';
import {defaultLoadout,stableHash} from '../src/game/offers';
import {createMatch,applyCommand} from '../src/game/engine';
const flags=experimentFlags({tempo:true,challenges:true,series:true,boss:true,achievements:true});
const loadouts=()=>[defaultLoadout('p1','甲',5),defaultLoadout('p2','乙',6)] as [ReturnType<typeof defaultLoadout>,ReturnType<typeof defaultLoadout>];
test('P2 defaults: every feature is false, explicit opt-in only; ordinary match initialization is untouched',()=>{
 assert.ok(Object.values(DEFAULT_EXPERIMENT_FLAGS).every(value=>value===false));assert.deepEqual(experimentFlags({boss:'true',tempo:1}),DEFAULT_EXPERIMENT_FLAGS);assert.throws(()=>createChallenge('CH01'));assert.throws(()=>createBoss('BOSS01'));assert.throws(()=>createSeries(loadouts()));const old=createMatch(loadouts(),123,{skipSetup:true});createBoss('BOSS01',flags);assert.deepEqual(createMatch(loadouts(),123,{skipSetup:true}),old);
});
for(const entry of challengeCatalog)test(`EXP02 ${entry.id}: fixed seed solution is legal, goal requires actual effects and replay repeats`,()=>{
 const fixture=createChallenge(entry.id,flags),initial=structuredClone(fixture.state),first=validateChallengeSolution(fixture),second=validateChallengeSolution(createChallenge(entry.id,flags));assert.equal(first.solved,true);assert.equal(stableHash(first.state),stableHash(second.state));assert.deepEqual(fixture.state,initial);assert.equal(validateChallengeSolution(fixture,[]).solved,false);assert.equal(fixture.descriptor.standard,false);
});
test('EXP03: scores are idempotent, loadouts lock, flex changes only between games, final result blocks another match',()=>{
 let series=createSeries(loadouts(),flags);const frozen=structuredClone(series.lockedLoadouts);series=recordSeriesResult(series,'game-1',{winnerId:'p1',reason:'engine'});assert.equal(series.wins.p1,1);assert.deepEqual(recordSeriesResult(series,'game-1',{winnerId:'p1',reason:'engine'}),series);
 assert.throws(()=>seriesReady(series,'p1',{loadout:{primaryId:'H09'}}),/锁定/);series=setSeriesFlex(series,'p1',['F02','F03','F06']);const next=seriesNextLoadouts(series);assert.deepEqual(next.loadouts[0].flexDeck,['F02','F03','F06']);assert.deepEqual(next.series.lockedLoadouts,frozen);assert.throws(()=>setSeriesFlex(next.series,'p1',['F01','F02','F03']));
 const final=recordSeriesResult(next.series,'game-2',{winnerId:'p1',reason:'engine'});assert.equal(final.status,'finished');assert.equal(final.winnerId,'p1');assert.throws(()=>seriesNextLoadouts(final));assert.doesNotMatch(JSON.stringify(seriesSummary(final)),/profile|baseDeck|annualPackage|lockedLoadout/);
});
test('EXP03: draws are explicit and nine drawn games stop the experiment without fabricating a winner',()=>{
 let series=createSeries(loadouts(),flags);for(let i=1;i<=9;i++){series=recordSeriesResult(series,'draw-'+i,{winnerId:null,reason:'draw'});if(i<9)series=seriesNextLoadouts(series).series;}assert.equal(series.status,'finished');assert.equal(series.winnerId,null);assert.equal(series.draws,9);
});
test('EXP04: boss public conditions match the actual initial snapshot, future commands remain ordinary',()=>{
 const fixture=createBoss('BOSS01',flags);assert.equal(fixture.state.players[1].mind,30);assert.equal(fixture.state.players[0].mind,24);assert.equal(fixture.state.round,4);assert.equal(fixture.state.players[1].board.length,1);assert.equal(fixture.descriptor.standard,false);assert.equal(applyCommand(fixture.state,'p1',{type:'CONCEDE'}).state.result?.winnerId,'p2');assert.deepEqual(createBoss('BOSS01',flags).state,fixture.state);
});
test('EXP05: achievements verify engine transitions; forged text and cosmetic fields cannot add rewards',()=>{
 const fixture=createChallenge('CH02',flags),entry=fixture.solution[0],after=applyCommand(fixture.state,entry.actorId,entry.command).state;const earned=deriveAchievements(fixture.state,after,entry.actorId,entry.command,flags);assert.equal(earned[0].id,'small-big');assert.equal(earned[0].cosmeticId,'sticker-small-big');const fake=structuredClone(after);fake.players[0].mind=999;assert.deepEqual(deriveAchievements(fixture.state,fake,entry.actorId,entry.command,flags),[]);assert.equal(mergeAchievements(earned,earned).length,1);assert.equal(Object.keys(earned[0]).length,4);
 const notice=createChallenge('CH04',flags);let state=notice.state;let results:any[]=[];for(const e of notice.solution){const next=applyCommand(state,e.actorId,e.command).state;results.push(...deriveAchievements(state,next,e.actorId,e.command,flags));state=next}assert.equal(results[0].id,'notice-cleared');
});
test('EXP01: one variable, baseline evidence gate, frozen experiment metadata and deterministic replay',()=>{
 assert.throws(()=>createTempoTrial(loadouts(),1,{firstPlayerStartingMindPenalty:1},{baselinePairs:0,replaysVerified:false},flags),/基线/);assert.throws(()=>createTempoTrial(loadouts(),1,{firstPlayerStartingMindPenalty:1,another:1} as any,{baselinePairs:1,replaysVerified:true},flags),/一项/);
 const record=createTempoTrial(loadouts(),19,{firstPlayerStartingMindPenalty:1},{baselinePairs:1,replaysVerified:true},flags),normal=createMatch(loadouts(),19,{skipSetup:true,matchId:record.initialState.matchId});const second=record.initialState.players.find(p=>p.id===normal.firstPlayerId)!;assert.equal(second.mind,normal.players.find(p=>p.id===second.id)!.mind-1);record.journal.push({actorId:'p1',command:{type:'CONCEDE'}});assert.equal(replayTempo(record).result?.winnerId,'p2');const forged=structuredClone(record);forged.initialState.players[0].timeRemaining=999;assert.throws(()=>replayTempo(forged),/初始状态/);
});
