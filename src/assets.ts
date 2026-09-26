import {publicUrl} from './deployment';
/** Production manifest keeps asset IDs independent of file format and location. */
export interface ProducedAsset {id:string;kind:string;source:string;parent:string|null;url:string;dimensions:number[]|null;bytes:number;sha256:string;transparent:boolean}
export interface ArtManifest {schemaVersion:string;assets:Record<string,ProducedAsset>}
let registry:ArtManifest|undefined;
let loaded:Promise<ArtManifest>|undefined;
export const resolveAsset=(id:string,fallback:string)=>publicUrl(registry?.assets[id]?.url||fallback);
export const loadArtManifest=()=>loaded??=fetch(publicUrl('/assets/manifest.json'),{signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error('Art manifest unavailable');registry=await r.json() as ArtManifest;return registry});
export const assetUrl=async(id:string)=>{const url=(await loadArtManifest()).assets[id]?.url;return url?publicUrl(url):undefined};
export type PaperArtSize=128|256|768;
export type PaperArtVariant='full'|'portrait';
export type PaperProfession='algorithm'|'research'|'finance'|'public'|'sales'|'product'|'support';
export const PAPER_CHARACTER_IDS=['algorithm','research','finance','public','sales','product','support','campus-rat','intern-beagle','interview-owl','mentor-capybara','veteran-tortoise','headhunter-fox','H01','H02','H03','H04','H05','H06','H07','H08','H09','H10'] as const;
export type PaperCharacterArtId=typeof PAPER_CHARACTER_IDS[number];
const characterIds=new Set<string>(PAPER_CHARACTER_IDS);
export const PAPER_TEMPLATE_PROFESSION:Record<string,PaperProfession>={T00:'support',T01:'algorithm',T02:'public',T03:'public',T04:'research',T05:'product',T06:'sales',T07:'research',T08:'public',T09:'finance',T10:'algorithm'};
/** N01–N06 each have a distinct animal painting; derived tokens intentionally share those identities. */
export const PAPER_SUPPORT_CHARACTER:Record<string,PaperCharacterArtId>={N01:'intern-beagle',N02:'interview-owl',N03:'campus-rat',N04:'mentor-capybara',N05:'veteran-tortoise',N06:'headhunter-fox',K01:'intern-beagle',K02:'mentor-capybara',K03:'intern-beagle'};
export const normalizePaperCharacterId=(id:string):PaperCharacterArtId=>{const key=/^h\d/i.test(id)?id.toUpperCase():id.toLowerCase();return characterIds.has(key)?key as PaperCharacterArtId:'support'};
export const paperCharacterArt=(id:string,size:PaperArtSize=256,variant:PaperArtVariant='full')=>publicUrl(`/assets/paper/characters/${normalizePaperCharacterId(id)}/${variant==='portrait'?`portrait-${size===128?128:256}`:size}.webp`);
export type PaperExpression='confident'|'calm'|'hit'|'happy'|'thinking'|'blink';
/** Only approved representative identities have generated facial variants. */
export const paperCharacterExpressionArt=(id:string,expression:PaperExpression,size:PaperArtSize=256)=>{const key=normalizePaperCharacterId(id);return (key==='algorithm'||key==='research')&&['hit','happy','thinking','blink'].includes(expression)?publicUrl(`/assets/paper/expressions/${key}/${expression}/${size}.webp`):paperCharacterArt(key,size)};
/** Avatars use a crop of the approved face; full artwork is available for collection and showcase layouts. */
export const heroArt=(id:string,variant:PaperArtVariant='portrait',size:PaperArtSize=variant==='full'?768:256)=>paperCharacterArt(/^H(?:0[1-9]|10)$/.test(id.toUpperCase())?id:'H06',size,variant);
export const offerArt=(id:string,size:PaperArtSize=256)=>paperCharacterArt(PAPER_TEMPLATE_PROFESSION[id.toUpperCase()]||'support',size);
export const supportArt=(id:string,size:PaperArtSize=256,variant:PaperArtVariant='full')=>paperCharacterArt(PAPER_SUPPORT_CHARACTER[id.toUpperCase()]||'intern-beagle',size,variant);
export type PaperActionArtId='N07'|'N08'|'N09'|'F04';
export const PAPER_ACTION_ART:Record<string,PaperActionArtId>={N07:'N07',N08:'N08',N09:'N09',N10:'N07',N11:'N09',N12:'N09',N13:'N09',N14:'N07',N15:'N07',N16:'N09',N17:'N08',N18:'N07',N19:'N07',N20:'N07',N21:'N07',N22:'N07',N23:'F04',N24:'N09',F01:'N07',F02:'N09',F03:'N09',F04:'F04',F05:'N08',F06:'F04'};
/** Four unique illustrations; all other rules select an explicit nearest-theme illustration. */
export const actionArt=(id:string,size:PaperArtSize=256)=>publicUrl(`/assets/paper/actions/${PAPER_ACTION_ART[id.toUpperCase()]||'N07'}/${size}.webp`);
const secondaryPaperId=(id:string)=>/^S(?:0[0-9]|10)$/.test(id.toUpperCase())?id.toUpperCase():'S00';
export const schoolBadge=(id:string)=>publicUrl(`/assets/paper/education/${secondaryPaperId(id.replace(/^H/i,'S'))}/seal.svg`);
export const educationSeal=(id:string)=>publicUrl(`/assets/paper/education/${secondaryPaperId(id)}/seal.svg`);
export const educationAccessory=(id:string)=>publicUrl(`/assets/paper/education/${secondaryPaperId(id)}/accessory.svg`);
export const iconArt=(name:string)=>resolveAsset(`icon_${name}`,`/assets/ui/icons/${name}.svg`);
export const frameArt=(name:string)=>resolveAsset(`frame_${name}`,`/assets/ui/frames/${name}.svg`);
export const soundUrl=(name:string)=>resolveAsset(`sfx_${name}`,`/assets/audio/sfx/${name}.wav`);
export const musicUrl=(name:'lobby'|'battle')=>resolveAsset(`music_${name}`,`/assets/audio/music/${name}.wav`);
export const effectUrl=(name:string)=>resolveAsset(`vfx_${name}`,`/assets/vfx/${name}.json`);
