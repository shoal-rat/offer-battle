import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {exampleOffers} from '../src/game/offers';
import {rules,education,presets} from '../src/game/catalog';
const path=resolve(process.env.DATA_DIR||'data','content.snapshot.json');
await mkdir(resolve(process.env.DATA_DIR||'data'),{recursive:true});
const data=JSON.stringify({rulesVersion:rules.rules_version,exampleOffers,heroes:rules.heroes,secondary:education.secondary,presets},null,2);
let old='';try{old=await readFile(path,'utf8')}catch{}
if(old!==data){await writeFile(path+'.tmp',data);await rename(path+'.tmp',path)}
console.log(`内容种子已就绪：${exampleOffers.length} 张公共 Offer、${rules.heroes.length} 个主角、${education.secondary.length} 种进修；已有收藏与牌局保持原样。`);
