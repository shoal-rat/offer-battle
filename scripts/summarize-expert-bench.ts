/** Merge benchmark-expert shards: score rate, paired-cluster bootstrap 95% interval, per style. */
import {readdirSync,readFileSync} from 'node:fs';
import {botRandom} from '../src/game/ai/belief';
const dir=process.argv[2]??'work/bench';
const shards=readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(`${dir}/${f}`,'utf8')));
const records=shards.flatMap(s=>s.records as {pair:number;swap:number;style:string;score:number;round:number}[]);
const byPair=new Map<number,number[]>();for(const r of records){const xs=byPair.get(r.pair)??[];xs.push(r.score);byPair.set(r.pair,xs)}
const pairs=[...byPair.values()].filter(xs=>xs.length===2).map(xs=>(xs[0]+xs[1])/2);
const random=botRandom(200201),boot=Array.from({length:4000},()=>pairs.reduce(sum=>sum+pairs[Math.floor(random()*pairs.length)],0)/pairs.length).sort((a,b)=>a-b);
const rate=records.reduce((v,r)=>v+r.score,0)/records.length;
console.log(JSON.stringify({games:records.length,pairs:pairs.length,wins:records.filter(r=>r.score===1).length,losses:records.filter(r=>r.score===0).length,draws:records.filter(r=>r.score===.5).length,scoreRate:+rate.toFixed(3),ci95:[+boot[Math.floor(boot.length*.025)].toFixed(3),+boot[Math.floor(boot.length*.975)].toFixed(3)],
 byStyle:Object.fromEntries(['aggressive','control','growth'].map(style=>{const rs=records.filter(r=>r.style===style);return [style,+(rs.reduce((v,r)=>v+r.score,0)/rs.length).toFixed(3)]})),
 thinkMs:shards.map(s=>s.thinkMs.challenger.p95).sort((a:number,b:number)=>a-b).at(-1),referenceThinkMs:shards.map(s=>s.thinkMs.reference.p95).sort((a:number,b:number)=>a-b).at(-1)},null,1));
