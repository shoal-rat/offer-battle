import {publicUrl} from './deployment';
/** Production manifest keeps asset IDs independent of file format and location. */
export interface ProducedAsset {id:string;kind:string;source:string;parent:string|null;url:string;dimensions:number[]|null;bytes:number;sha256:string;transparent:boolean}
export interface ArtManifest {schemaVersion:string;assets:Record<string,ProducedAsset>}
let registry:ArtManifest|undefined;
let loaded:Promise<ArtManifest>|undefined;
export const resolveAsset=(id:string,fallback:string)=>publicUrl(registry?.assets[id]?.url||fallback);
export const loadArtManifest=()=>loaded??=fetch(publicUrl('/assets/manifest.json'),{signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error('Art manifest unavailable');registry=await r.json() as ArtManifest;return registry});
export const assetUrl=async(id:string)=>{const url=(await loadArtManifest()).assets[id]?.url;return url?publicUrl(url):undefined};
export const heroArt=(id:string)=>resolveAsset(`hero_${id.toLowerCase()}_full`,`/assets/hero-${id.toUpperCase()}.webp`);
export const offerArt=(id:string)=>resolveAsset(`offer_${id.toLowerCase()}_full`,`/assets/offer-${id.toUpperCase()}.webp`);
export const supportArt=(id:string)=>resolveAsset(`${id.toUpperCase().startsWith('K')?'token':'support'}_${id.toLowerCase()}_full`,`/assets/support-${id.toUpperCase()}.webp`);
export const actionArt=(id:string)=>resolveAsset(`card_${id.toLowerCase()}_illustration`,`/assets/action-${id.toUpperCase()}.webp`);
export const schoolBadge=(id:string)=>resolveAsset(`school_${id.toLowerCase()}_badge`,`/assets/education/${id.toLowerCase()}/badge.svg`);
export const educationSeal=(id:string)=>resolveAsset(`education_${id.toLowerCase()}_seal`,`/assets/education/${id.toLowerCase()}/seal.svg`);
export const educationAccessory=(id:string)=>resolveAsset(`education_${id.toLowerCase()}_accessory`,`/assets/education/${id.toLowerCase()}/accessory.svg`);
export const iconArt=(name:string)=>resolveAsset(`icon_${name}`,`/assets/ui/icons/${name}.svg`);
export const frameArt=(name:string)=>resolveAsset(`frame_${name}`,`/assets/ui/frames/${name}.svg`);
export const soundUrl=(name:string)=>resolveAsset(`sfx_${name}`,`/assets/audio/sfx/${name}.wav`);
export const musicUrl=(name:'lobby'|'battle')=>resolveAsset(`music_${name}`,`/assets/audio/music/${name}.wav`);
export const effectUrl=(name:string)=>resolveAsset(`vfx_${name}`,`/assets/vfx/${name}.json`);
