import type {Loadout} from './types';
export type InvitationStatus='waiting'|'full'|'ended'|'expired'|'not-found';
export interface InvitationPreview {status:InvitationStatus;hostNickname?:string;offers?:{templateId:string;cost:number;attack:number;health:number}[]}
export function invitationPreview(room:{status:string;expires?:number;createdAt:number;publishLineup?:boolean;seats:{name:string;loadout:Loadout}[]}|null,now=Date.now()):InvitationPreview{
 if(!room)return {status:'not-found'};
 if((room.expires??room.createdAt+86400000)<=now&&room.status!=='playing')return {status:'expired'};
 const status=room.status==='finished'?'ended':room.status!=='waiting'||room.seats.length>=2?'full':'waiting';
 return {status,hostNickname:room.seats[0]?.name.slice(0,24)??'秋招挑战者',...(room.publishLineup?{offers:room.seats[0]?.loadout.offers.map(o=>({templateId:o.templateId,cost:o.originalTime,attack:o.baseAttack,health:o.baseHealth}))??[]}:{})};
}
export function invitationCode(value:unknown){if(typeof value!=='string')return null;let raw=value.trim();try{const url=new URL(raw);raw=url.searchParams.get('room')??url.searchParams.get('invite')??raw}catch{}raw=raw.toUpperCase();return /^[A-F0-9]{6}$/.test(raw)?raw:null;}
