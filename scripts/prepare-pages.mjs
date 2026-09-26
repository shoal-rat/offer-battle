import {cpSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';

const site=process.argv[2];
if(!site)throw new Error('Usage: npm run prepare:pages -- /path/to/shoal-rat.github.io');
const root=resolve(site),destination=join(root,'offer-battle'),source=resolve('dist-pages');
const remote=execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8'}).trim();
if(!/^(?:https:\/\/github\.com\/|git@github\.com:)shoal-rat\/shoal-rat\.github\.io(?:\.git)?$/.test(remote))throw new Error('Destination must be the personal website checkout.');
const release=JSON.parse(readFileSync(join(source,'release.json'),'utf8'));
if(release.base!=='/offer-battle/'||release.guestMode!=='local-bot')throw new Error('Use npm run build:pages first.');
if(existsSync(destination)){
 if(lstatSync(destination).isSymbolicLink())throw new Error('Refusing a symlink destination.');
 if(readdirSync(destination).length&&!existsSync(join(destination,'release.json')))throw new Error('Existing subfolder has no Offer Battle release manifest; inspect it before replacing.');
 rmSync(destination,{recursive:true});
}
mkdirSync(destination,{recursive:true});cpSync(source,destination,{recursive:true});
console.log('Updated only offer-battle/. Review, commit and push this directory in the website repository.');
