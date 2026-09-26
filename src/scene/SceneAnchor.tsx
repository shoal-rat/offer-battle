import {PaperProp} from './HomeStage';
/** Shared decorative object; real labels and controls remain on their owning page. */
export default function SceneAnchor({kind}:{kind:'create'|'collection'|'loadout'|'friends'|'battle'}){return <div className="scene-page-prop" data-scene-anchor={kind} aria-hidden="true"><PaperProp kind={kind==='battle'?'play':kind}/></div>}
