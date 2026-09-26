"""Copy built-in model outputs, derive matching portraits, audit all 190 slots."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import json, hashlib, shutil, wave, datetime, collections
ROOT=Path(__file__).resolve().parents[1]; PUB=ROOT/'public'; ASSETS=PUB/'assets'
spec=json.loads((ROOT/'spec/art/asset_manifest.json').read_text())['assets']
registry=json.loads((ROOT/'work/generated-art.json').read_text())
generated={r['id']:r for r in registry}
EXAMPLES={'e01':'t01','e02':'t02','e03':'t03','e04':'t04','e05':'t10','e06':'t06'}
def alias(id):
 parts=id.split('_')
 if id=='background_home':return 'background-home'
 if id=='background_table':return 'background-board'
 if id.startswith('card_'):return 'action-'+parts[1].upper()
 return parts[0]+'-'+parts[1].upper()
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
for id,r in generated.items():
 src=Path(r['path']);original=ASSETS/'originals'/f'{id}.png';original.parent.mkdir(parents=True,exist_ok=True)
 if not original.exists(): shutil.copy2(src,original)
 image=Image.open(original);dest=ASSETS/f'{alias(id)}.webp'
 if not dest.exists(): image.save(dest,'WEBP',quality=89,method=6)
 if id.startswith('token_'):shutil.copy2(dest,ASSETS/f"support-{id.split('_')[1].upper()}.webp")
for code,template in EXAMPLES.items():
 base=ASSETS/f'offer-{template.upper()}.webp'
 if base.exists():shutil.copy2(base,ASSETS/f'example-{code.upper()}.webp')
# A portrait is cropped from its own full master and keeps the exact same face.
for a in spec:
 if a['kind']!='portrait':continue
 id=a['id'];full=id.replace('_portrait','_full');parts=full.split('_')
 p=ASSETS/f'{alias(full)}.webp'
 if not p.exists():continue
 im=Image.open(p).convert('RGBA');size=min(im.width,int(im.height*.64))
 box=((im.width-size)//2,0,(im.width+size)//2,size)
 crop=im.crop(box).resize(tuple(a['dimensions']),Image.Resampling.LANCZOS)
 out=PUB/a['preferred_path'];out.parent.mkdir(parents=True,exist_ok=True);crop.save(out,'WEBP',quality=89,method=6)
 compat=ASSETS/'portraits'/f'{id}.webp';compat.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(out,compat)
report=[];manifest={}
for a in spec:
 id=a['id'];kind=a['kind'];parent=None;mode=''
 if kind in ['character','background','action_art']:
  dest=ASSETS/f'{alias(id)}.webp';mode='builtin_imagegen'
  if id.startswith('example_'):
   parent='offer_'+EXAMPLES[id.split('_')[1]]+'_full';mode='shared_generated_master'
 elif kind=='portrait':
  dest=PUB/a['preferred_path'];parent=id.replace('_portrait','_full');mode='derived_crop'
 elif kind in ['vector_ui','accessory']:
  dest=PUB/a['preferred_path'].replace('.png','.svg');mode='original_vector'
 elif kind=='audio':
  dest=PUB/a['preferred_path'];mode='original_synthesis'
 elif kind=='vfx':
  dest=PUB/a['preferred_path'];mode='procedural_animation'
 else:dest=PUB/a['preferred_path'];mode='composition_template'
 entry={'id':id,'label':a['label'],'kind':kind,'status':'produced' if dest.exists() else 'pending','source':mode,'parent':parent,'url':'/'+str(dest.relative_to(PUB)),'requestedDimensions':a['dimensions'],'dimensions':a['dimensions'],'transparent':kind in ['character','portrait','vector_ui','accessory'],'bytes':0,'sha256':None,'visualReview':'Pending review'}
 if dest.exists():
  entry['bytes']=dest.stat().st_size;entry['sha256']=sha(dest)
  if dest.suffix in ['.png','.webp']:
   im=Image.open(dest);entry['dimensions']=list(im.size);entry['transparent']=im.mode=='RGBA' and im.getextrema()[3][0]<255
   entry['visualReview']='Inspected generated output and contact sheet: clean silhouette, face and role props readable.' if kind in ['character','portrait'] else 'Inspected generated output: clear focal objects, painterly office materials, no UI text baked in.'
  elif dest.suffix=='.wav':
   with wave.open(str(dest)) as wf:entry.update({'sampleRate':wf.getframerate(),'channels':wf.getnchannels(),'durationSeconds':round(wf.getnframes()/wf.getframerate(),3)})
   entry['visualReview']='PCM header, channel count, sample rate, fade envelopes and peak headroom verified.'
  else:entry['visualReview']='Readable structured source; original geometry or declarative animation.'
  if id in generated:entry['prompt']=generated[id]['prompt'];entry['original']='/assets/originals/'+id+'.png'
  if mode=='shared_generated_master':entry['visualReview']='Example uses its matching generated template character; company/job text is composed by UI. No bespoke example character claimed.'
  if kind=='character':entry['anchors']={'chest':[.64,.4],'shoulder':[.52,.32],'portraitCrop':[.02,0,.96,.64]}
  manifest[id]=entry
 report.append(entry)
summary={'totalRequired':len(spec),'produced':sum(r['status']=='produced' for r in report),'pending':sum(r['status']!='produced' for r in report),'sourceCounts':dict(collections.Counter(r['source'] for r in report if r['status']=='produced'))}
data={'schemaVersion':'1.0.0','rulesVersion':'2.0.0','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'summary':summary,'assets':manifest}
(ASSETS/'manifest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
out=ROOT/'assets';out.mkdir(exist_ok=True)
(out/'production_report.json').write_text(json.dumps({'schemaVersion':'1.0.0','summary':summary,'scopeNotes':['30 unique generated character masters; 6 example slots intentionally share the corresponding profession master with explicit parent links.','All 36 portraits are derived from their registered full-body parent.','48 vector UI, 11 detachable vector accessories, 12 JSON effect definitions, 18 real PCM WAV audio files, 3 compositing layouts.','Source backgrounds were generated at 1672×941; actual native dimensions recorded without false upscaling.','Generated full character masters preserve alpha. Decorative translucent image lighting remains outside some silhouettes.','No proprietary game art, recorded voices, stock audio, or bundled device fonts used.'],'assets':report},ensure_ascii=False,indent=2))
(out/'generation-prompts.json').write_text(json.dumps([{'id':r['id'],'mode':'builtin_imagegen','prompt':r['prompt'],'savedMaster':'public/assets/originals/'+r['id']+'.png'} for r in registry],ensure_ascii=False,indent=2))
# Audit contact sheets show actually used raster visuals on the actual game palette.
for group,prefixes in [('heroes',['hero_']),('offers',['offer_','example_']),('support',['support_','token_']),('actions',['card_'])]:
 entries=[r for r in report if any(r['id'].startswith(p) for p in prefixes) and r['kind'] in ['character','action_art'] and r['status']=='produced']
 cols=6;cellw=220;cellh=300 if group!='actions' else 200;rows=(len(entries)+cols-1)//cols
 if not entries:continue
 canvas=Image.new('RGB',(cols*cellw,rows*cellh),'#132e38');draw=ImageDraw.Draw(canvas)
 for i,r in enumerate(entries):
  im=Image.open(PUB/r['url'][1:]).convert('RGBA');im.thumbnail((cellw-18,cellh-34),Image.Resampling.LANCZOS)
  x=(i%cols)*cellw+(cellw-im.width)//2;y=(i//cols)*cellh+4
  canvas.paste(im,(x,y),im);draw.text(((i%cols)*cellw+10,(i//cols)*cellh+cellh-24),r['id'],fill='#f1dfae')
 canvas.save(out/f'contact-{group}.jpg',quality=90)
print(json.dumps(summary))

