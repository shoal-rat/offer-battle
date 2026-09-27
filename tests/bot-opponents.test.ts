import {test} from 'node:test';
import assert from 'node:assert/strict';
import {botOpponent,BOT_BASE_TEMPLATES,type BotStrategy} from '../src/game/botOpponents';
import {validateLoadout} from '../src/game/offers';
import {createMatch,defaultLoadout} from '../src/game/index';

const strategies:BotStrategy[]=['aggressive','control','growth'];

test('every generated practice opponent is a legal loadout that can start a match',()=>{
 for(const strategy of strategies)for(let seed=1;seed<=120;seed++){
  const {loadout,name}=botOpponent(strategy,seed);
  assert.doesNotThrow(()=>validateLoadout(loadout),`${strategy} seed ${seed}`);
  assert.equal(loadout.playerId,'p2');assert.ok(name.includes('·'));
  if(seed%40===0)assert.doesNotThrow(()=>createMatch([defaultLoadout('p1','你',0),loadout],seed,{skipSetup:true}));
 }
});

test('opponents vary from match to match but a room seed always reproduces its opponent',()=>{
 for(const strategy of strategies){
  const seen=new Set<string>(),names=new Set<string>(),bases=new Set<string>();
  for(let seed=1;seed<=60;seed++){const opponent=botOpponent(strategy,seed*7919);seen.add(opponent.templateId);names.add(opponent.name);bases.add(opponent.templateId.split('/')[0])}
  assert.ok(seen.size>=50,`${strategy}: ${seen.size} distinct opponents in 60 matches`);
  assert.ok(names.size>=4);assert.ok(bases.size>=4);
  assert.deepEqual(botOpponent(strategy,42),botOpponent(strategy,42));
 }
});

test('personality leans the deck without locking it: most aggressive opponents bring a fitting base',()=>{
 const style=new Map(BOT_BASE_TEMPLATES.map(base=>[base.id,base.style]));
 for(const strategy of strategies){
  let fitting=0;for(let seed=1;seed<=300;seed++)if(style.get(botOpponent(strategy,seed).templateId.split('/')[0])===strategy)fitting++;
  assert.ok(fitting>150&&fitting<270,`${strategy}: ${fitting}/300 fitting`);
 }
});
