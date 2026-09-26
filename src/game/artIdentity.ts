/** Public illustration family only. Never contains a source file, private URL or original upload. */
export type PublicArtKey='algorithm'|'research'|'finance'|'public'|'sales'|'product'|'support';
const templateArt:Record<string,PublicArtKey>={T00:'support',T01:'algorithm',T02:'public',T03:'public',T04:'research',T05:'product',T06:'sales',T07:'research',T08:'public',T09:'finance',T10:'algorithm'};
export function publicArtKey(templateId:string,appearance?:string):PublicArtKey{return appearance==='formal'?'public':appearance==='casual'?'algorithm':templateArt[templateId.toUpperCase()]??'support'}
