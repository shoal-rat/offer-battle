"""Original vector artwork, audio synthesis, animation and layout source assets.
No placeholder raster or external samples are used.
"""
from pathlib import Path
import json, math, wave, random, hashlib, struct
ROOT=Path(__file__).resolve().parents[1]
PUB=ROOT/'public'
SPEC=json.loads((ROOT/'spec/art/asset_manifest.json').read_text())['assets']
rng=random.Random(91026)
def write(path,text):
 p=PUB/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
def svg(w,h,body,accent='#d9b76e'):
 return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><linearGradient id="gold" x2=".7" y2="1"><stop stop-color="#fff0bc"/><stop offset=".38" stop-color="{accent}"/><stop offset=".7" stop-color="#98713c"/><stop offset="1" stop-color="#edcb88"/></linearGradient><linearGradient id="enamel" x2="1" y2="1"><stop stop-color="#2f5b62"/><stop offset="1" stop-color="#0b202b"/></linearGradient></defs>{body}</svg>'''
# All glyphs share a 96 unit grid but carry distinct office metaphors.
glyphs={
'mind':'<path d="M48 70C7 44 22 17 41 30l7 8 7-8c19-13 34 14-7 40Z"/><path d="m33 48 8 7m14 0 8-7"/>',
'time':'<circle cx="48" cy="48" r="29"/><path d="M48 27v23l16 9M24 22l-7 8m55-8 7 8"/>',
'attack':'<path d="m24 40 44-18v52L24 57Zm0 0H15v17h9m11 4 6 18h11l-6-15M77 32l10-7m-10 23h13m-13 15 10 7"/>',
'health':'<rect x="23" y="25" width="50" height="55" rx="6"/><path d="M36 25V16h24v9M48 37v28m-14-14h28"/>',
'age':'<rect x="19" y="26" width="58" height="53" rx="5"/><path d="M19 41h58M33 18v17m30-17v17M30 53h10m16 0h10M30 65h10m16 0h10"/>',
'guard':'<path d="m48 16 29 11v22c0 19-19 28-29 32-10-4-29-13-29-32V27Z"/><path d="m33 49 10 11 21-25"/>',
'frontline':'<rect x="18" y="24" width="60" height="42" rx="4"/><path d="m36 37-8 8 8 8m24-16 8 8-8 8M42 55l11-21M14 75h68"/>',
'life':'<path d="M29 42c-16-17 7-39 19-15 12-24 35-2 19 15L48 61Z"/><path d="M21 75c18-12 36-12 54 0M48 61v13"/>',
'salary':'<rect x="14" y="30" width="68" height="43" rx="6"/><path d="m15 37 33 22 33-22M33 20h30M39 13h18"/>',
'future':'<path d="M17 75h64M28 75V56h12v19m7 0V40h12v35m7 0V23h12v52M21 44l22-19 13 6 20-19"/>',
'referral':'<circle cx="34" cy="32" r="11"/><circle cx="67" cy="37" r="9"/><path d="M14 71c0-29 39-29 39 0M57 54c15-6 27 4 27 20M57 20h25m-9-9 9 9-9 9"/>',
'return_ticket':'<path d="M20 25h57v18c-15 0-15 17 0 17v16H20V60c15 0 15-17 0-17Z"/><path d="M49 33v32M38 43l-8 8 8 8m-8-8h32"/>',
'optimization':'<path d="M17 42h62v36H17Zm0 0 12-19h38l12 19M48 42v36M34 59h28"/><path d="m33 15 9-7m21 7-9-7"/>',
'retort':'<path d="M17 23h62v40H43L27 77V63H17Z"/><path d="m36 34-8 9 8 9m24-18 8 9-8 9M42 55l10-23"/>',
'primary_skill':'<path d="m48 14 29 17v34L48 82 19 65V31Z"/><path d="M35 63V34h17c16 0 16 19 0 19H35"/>',
'secondary_skill':'<path d="m48 14 29 17v34L48 82 19 65V31Z"/><path d="M62 35H43c-17 0-17 16 0 16h10c17 0 17 16 0 16H34"/>',
'jlu_stamp':'<path d="M22 59h52v16H22ZM34 59l4-23c-15-22 35-22 20 0l4 23"/><path d="M15 81h66M27 67h42"/>',
'jlu_ready':'<path d="m48 12 11 7 13-1 4 13 10 9-7 12 1 13-13 4-9 10-12-7-13 1-4-13-10-9 7-12-1-13 13-4Z"/><path d="m32 45 12 13 24-26"/>'
}
colors=['#ab4e50','#7285c8','#c88946','#55a998','#a8a077','#5c8ead','#7b98c0','#55b2c3','#c16b53','#d9bd77','#89a374']
cap='<path d="m38 45 58-28 58 28-58 27Zm22 14v35c24 19 49 19 72 0V59M154 45v57" fill="url(#gold)" stroke="#382c22" stroke-width="4"/><circle cx="154" cy="107" r="6" fill="#edcb88"/>'
for a in SPEC:
 id=a['id'];kind=a['kind'];w,h=a['dimensions'] or (0,0)
 if kind=='vector_ui':
  if id.startswith('icon_'):
   key=id[5:];body=f'<circle cx="48" cy="48" r="43" fill="url(#enamel)" stroke="url(#gold)" stroke-width="3"/><g fill="none" stroke="#f4dc9b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">{glyphs[key]}</g>'
  elif id.startswith(('school_','education_')):
   ix=int(id.split('_')[1][1:]);accent=colors[ix%len(colors)]
   teeth=' '.join(f'{128+(114 if i%2==0 else 105)*math.cos(i*math.pi/24)},{128+(114 if i%2==0 else 105)*math.sin(i*math.pi/24)}' for i in range(48))
   body=f'<polygon points="{teeth}" fill="url(#gold)"/><circle cx="128" cy="128" r="97" fill="#182d37" stroke="#eacf91" stroke-width="3"/><circle cx="128" cy="128" r="85" fill="{accent}" opacity=".55"/><g transform="translate(32 40)">{cap}</g><path d="M68 167q60 33 120 0M78 185q50 26 100 0" fill="none" stroke="#efd496" stroke-width="3"/><circle cx="128" cy="196" r="5" fill="#f5db9f"/>'
  elif id.startswith('frame_'):
   accent={'frame_offer':'#d9b76e','frame_support':'#71ad9c','frame_action':'#c5816e','frame_retort':'#aaa0d0','frame_back_jlu':'#d9b76e','frame_back_default':'#689aad'}[id]
   body=f'<rect x="18" y="18" width="732" height="988" rx="53" fill="url(#enamel)" stroke="#201911" stroke-width="20"/><rect x="24" y="24" width="720" height="976" rx="49" fill="none" stroke="url(#gold)" stroke-width="15"/><rect x="45" y="45" width="678" height="934" rx="33" fill="none" stroke="{accent}" stroke-width="3"/><path d="M66 638h636v278H66Z" fill="#e8dbc0" stroke="url(#gold)" stroke-width="9"/><rect x="104" y="69" width="560" height="501" rx="164" fill="none" stroke="url(#gold)" stroke-width="16"/><path d="m78 596 29-21h554l29 21-29 23H107Z" fill="url(#gold)"/><path d="M302 22v42h164V22" fill="#38332b" stroke="url(#gold)" stroke-width="5"/><rect x="325" y="35" width="118" height="15" rx="7" fill="#08191f"/>'
   if 'back' in id: body=f'<rect x="20" y="20" width="728" height="984" rx="52" fill="url(#enamel)" stroke="url(#gold)" stroke-width="16"/><rect x="45" y="45" width="678" height="934" rx="32" fill="none" stroke="#d2b574" stroke-width="3"/><path d="m384 160 235 352-235 352-235-352Z" fill="none" stroke="#c6a368" stroke-width="10"/><g transform="translate(96 242) scale(3)">{cap}</g><path d="M148 782h472M148 246h472" stroke="#c6a368" stroke-width="4"/>'
   write('assets/frame-'+id[6:]+'.svg',svg(w,h,body,accent))
  else:
   key=id[6:];label={'salary':'年包','life':'生活','future':'以后'}[key]
   body=f'<path d="m0 60 40-50h880l40 50-40 50H40Z" fill="url(#enamel)" stroke="url(#gold)" stroke-width="3"/><path d="M100 35h760M100 85h760" stroke="#b3945f" opacity=".5"/><g transform="translate(40 12)" fill="none" stroke="#e6c47a" stroke-width="4" stroke-linecap="round">{glyphs[key]}</g><text x="480" y="77" text-anchor="middle" fill="#f0dab0" font-family="system-ui,sans-serif" font-size="42" letter-spacing="12">聊{label}</text>'
  write(a['preferred_path'],svg(w,h,body,colors[int(id.split('_')[1][1:])%len(colors)] if id.startswith(('school_','education_')) else '#d9b76e'))
 elif kind=='accessory':
  ix=int(id.split('_')[1][1:]);accent=colors[ix%len(colors)]
  body=f'<path d="m128 190 74 40-36 161-57-49-68 13ZM384 190l-74 40 36 161 57-49 68 13Z" fill="{accent}" stroke="#ead39e" stroke-width="7"/><circle cx="256" cy="208" r="115" fill="url(#gold)"/><circle cx="256" cy="208" r="99" fill="url(#enamel)" stroke="#f3d48f" stroke-width="5"/><g transform="translate(160 132)">{cap}</g>'
  write(a['preferred_path'].replace('.png','.svg'),svg(w,h,body,accent))
 elif kind=='vfx':
  key=id[4:];duration=a['duration_ms']
  frames={
  'damage':[{'transform':'translateX(0)','filter':'brightness(1)'},{'transform':'translateX(-8px)','filter':'brightness(1.8)'},{'transform':'translateX(6px)'},{'transform':'translateX(0)','filter':'brightness(1)'}],
  'deploy':[{'transform':'translateY(-35px) scale(1.16)','opacity':0},{'transform':'translateY(3px) scale(.97)','opacity':1},{'transform':'translateY(0) scale(1)','opacity':1}],
  'heal':[{'filter':'brightness(1)','transform':'scale(1)'},{'filter':'brightness(1.5)','transform':'scale(1.06)'},{'filter':'brightness(1)','transform':'scale(1)'}],
  'draw':[{'transform':'translateY(90px) rotate(10deg)','opacity':0},{'transform':'translateY(0) rotate(0)','opacity':1}],
  'retort_flip':[{'transform':'rotateY(0deg)'},{'transform':'rotateY(90deg)'},{'transform':'rotateY(0deg)'}],
  'optimization':[{'opacity':1,'transform':'scale(1)'},{'opacity':0,'transform':'translateY(45px) scale(.8)'}],
  }
  data={'id':id,'decorative_only':True,'duration_ms':duration,'easing':'cubic-bezier(.2,.8,.2,1)','reduced_motion_ms':a['reduced_motion_ms'],'keyframes':frames.get(key,[{'opacity':0,'transform':'scale(1.5)'},{'opacity':1,'transform':'scale(.92)'},{'opacity':1,'transform':'scale(1)'},{'opacity':0}]),'layers':a['layers'],'cssClass':'fx-'+key,'pointerEvents':'none','cancellable':True}
  if 'jlu' in key: data['timeline']=[{'at':0,'event':'camera_nudge'},{'at':150,'event':'six_decorative_alumni'},{'at':450,'event':'large_sign','text':'本硕连读·宇宙吉大' if key=='jlu_double' else '全校撑腰'},{'at':750,'event':'target_stat_pop','source':'resolved_game_event'},{'at':1000,'event':'dismiss_decoration'}]
  write(a['preferred_path'],json.dumps(data,ensure_ascii=False,indent=2))
 elif kind=='layout':
  data={'id':id,'width':1080,'height':1440,'background':'#102b35','foreground':'#f5e5bd','accent':'#c6a468','font':'system-ui, sans-serif','layers':[{'type':'image','source':'/assets/background-home.webp','rect':[0,0,1080,1440],'opacity':.4},{'type':'text','text':'秋招斗兽棋','position':[540,140],'fontSize':74,'align':'center'},{'type':'hero','source':'player.primary','rect':[210,250,660,720]},{'type':'badge','source':'player.secondary','rect':[810,230,140,140]},{'type':'text','source':'headline','position':[540,1080],'fontSize':52,'align':'center'},{'type':'text','source':'description','position':[540,1190],'fontSize':30,'maxWidth':880,'align':'center'},{'type':'text','text':'OFFER BATTLE · 好友桌','position':[540,1350],'fontSize':26,'align':'center'}]}
  write(a['preferred_path'],json.dumps(data,ensure_ascii=False,indent=2))
# Musical source is generated from synthesis, no samples / no voice cloning.
import numpy as np
SR=44100
def tone(freq,dur,kind='bell',amp=1):
 t=np.arange(int(dur*SR))/SR
 if kind=='bell': s=np.sin(2*np.pi*freq*t)*np.exp(-6*t)+.24*np.sin(2*np.pi*freq*2.76*t)*np.exp(-14*t)
 elif kind=='pluck':s=(np.sin(2*np.pi*freq*t)+.3*np.sin(2*np.pi*freq*2*t)+.15*np.sin(2*np.pi*freq*3*t))*np.exp(-8*t)
 elif kind=='bass':s=np.sin(2*np.pi*freq*t)*np.exp(-4*t)
 else:s=np.sin(2*np.pi*freq*t)*np.exp(-9*t)
 s*=np.minimum(t/.006,1)*np.minimum((dur-t)/.025,1)
 return s*amp
def noise(dur,amp=.08,decay=22):
 t=np.arange(int(dur*SR))/SR
 s=np.random.default_rng(2409).normal(0,1,len(t));s=np.convolve(s,np.ones(5)/5,'same')
 return s*np.exp(-decay*t)*np.minimum(t/.003,1)*np.minimum((dur-t)/.02,1)*amp
def mixat(dest,s,time,channel=None):
 start=int(time*SR);end=min(start+len(s),len(dest));n=end-start
 if n>0: dest[start:end]+=s[:n]
def savewave(path,data,ch):
 p=PUB/path;p.parent.mkdir(parents=True,exist_ok=True)
 peak=np.max(abs(data));data=data/max(1,peak/.76)
 # Global fades prevent clicks without changing note sequence.
 fade=min(int(.012*SR),len(data)//4); data[:fade]*=np.linspace(0,1,fade).reshape((-1,1)) if ch==2 else np.linspace(0,1,fade);data[-fade:]*=np.linspace(1,0,fade).reshape((-1,1)) if ch==2 else np.linspace(1,0,fade)
 pcm=np.asarray(data*32767,dtype='<i2')
 with wave.open(str(p),'wb') as f:f.setnchannels(ch);f.setsampwidth(2);f.setframerate(SR);f.writeframes(pcm.tobytes())
for a in SPEC:
 if a['kind']!='audio':continue
 key=a['id']
 if key.startswith('sfx_'):
  k=key[4:]; seq={'click':[880],'card_pick':[660,990],'deploy':[196,392,784],'attack':[230,160],'damage':[145,110],'heal':[523,659,784],'draw':[587,880],'negotiate':[392,494,587],'retort':[784,622,988],'age_up':[330,440],'optimization':[294,220,147],'graduation':[523,659,784,1047],'jlu_collect':[659,880],'jlu_ultimate':[392,523,659,784,1047],'win':[523,659,784,1047],'lose':[392,349,294]}[k]
  dur=.15 if k=='click' else min(1.48,.21+len(seq)*.19)
  s=np.zeros(int(dur*SR))
  for i,f in enumerate(seq):mixat(s,tone(f,.45,'pluck' if k in ['deploy','attack','damage','optimization'] else 'bell',.26),i*.12)
  if k in ['click','card_pick','deploy','attack','damage','negotiate','retort','age_up','optimization']:mixat(s,noise(.2,.18,30),0)
  savewave(a['preferred_path'],s,1)
 else:
  battle=key=='music_battle';bpm=112 if battle else 88;beat=60/bpm;dur=beat*48
  s=np.zeros((int(dur*SR),2));notes=[60,64,67,71,62,65,69,72,59,62,67,69,57,60,64,67]
  for step in range(96):
   bt=step*.5;t=bt*beat;chord=(step//8)%4
   midi=notes[chord*4+(step%4)]+(12 if step%6==0 else 0)
   freq=440*2**((midi-69)/12)
   note=tone(freq,min(.9,dur-t),'bell' if step%2 else 'pluck',.095 if battle else .07)
   pan=.32 if step%2 else .68
   mixat(s[:,0],note*(1-pan),t);mixat(s[:,1],note*pan,t)
   if step%4==0:
    bass=tone(440*2**((notes[chord*4]-24-69)/12),1,'bass',.13)
    for c in range(2):mixat(s[:,c],bass,t)
   if battle or step%2==0:
    hit=noise(.08,.025 if battle else .016,45)
    for c in range(2):mixat(s[:,c],hit,t)
  savewave(a['preferred_path'],s,2)
print('Procedural outputs created: UI 48, accessories 11, VFX 12, audio 18, share layouts 3.')

