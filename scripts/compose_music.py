"""Original Offer Battle score: deterministic notes, synthesis, MIDI and game masters.

Requires NumPy and ffmpeg. No samples, pre-existing tunes, or network services.
Run: python3 scripts/compose_music.py
"""
from pathlib import Path
import json, math, wave, subprocess, struct, hashlib
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'assets/music-masters'
OUT = ROOT / 'public/assets/audio/music'
MASTER.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
SR = 32000
rng = np.random.default_rng(20260926)

def voice(note, duration, instrument):
    n = int((duration + (1.5 if instrument in ('piano', 'bell', 'pluck') else .24)) * SR)
    t = np.arange(n) / SR
    f = 440 * 2 ** ((note - 69) / 12)
    if instrument == 'piano':
        y = sum(a * np.sin(2*np.pi*f*k*t + .12*k) * np.exp(-t*(1.7 + .8*k))
                for k,a in [(1,1),(2,.48),(3,.22),(4,.08),(5,.035)])
        env = (1-np.exp(-t*180)) * np.minimum(1, np.exp(-np.maximum(0,t-duration)*5))
    elif instrument == 'bell':
        y = (np.sin(2*np.pi*f*t)*np.exp(-t*2.2) + .3*np.sin(2*np.pi*f*2.004*t)*np.exp(-t*4)
             + .08*np.sin(2*np.pi*f*3*t)*np.exp(-t*7))
        env = (1-np.exp(-t*150)) * np.exp(-np.maximum(0,t-duration)*2)
    elif instrument == 'pluck':
        y = sum(np.sin(2*np.pi*f*k*t)*np.exp(-t*(3+2*k)) / k**1.4 for k in range(1,7))
        env = 1-np.exp(-t*220)
    elif instrument == 'bass':
        y = np.sin(2*np.pi*f*t)+.25*np.sin(2*np.pi*f*2*t)+.07*np.sin(2*np.pi*f*3*t)
        env = (1-np.exp(-t*45))*np.exp(-t*.75)*np.clip((duration+.18-t)/.18,0,1)
    elif instrument == 'brass':
        y = sum(np.sin(2*np.pi*f*k*t + .005*np.sin(t*30))/k**1.7 for k in range(1,7))
        env = np.minimum(1,t/.055) * np.clip((duration+.2-t)/.2,0,1) * (.8+.2*np.exp(-t*4))
    else:
        y = sum((np.sin(2*np.pi*f*k*.998*t)+np.sin(2*np.pi*f*k*1.002*t))/(2*k**2.1) for k in range(1,5))
        env = np.minimum(1,t/.34) * np.clip((duration+.24-t)/.4,0,1)
        y *= .88+.12*np.sin(2*np.pi*.7*t)
    return (y*env*.43).astype(np.float32)

def drum(kind):
    t=np.arange(int(SR*.36))/SR
    noise=rng.normal(0,1,len(t))
    if kind=='kick': return (np.sin(2*np.pi*(48*t+3.1*(1-np.exp(-t*22))))*np.exp(-t*16)*.55).astype(np.float32)
    if kind=='rim': return ((noise-np.roll(noise,1))*.09*np.exp(-t*110)+np.sin(t*2*np.pi*880)*.14*np.exp(-t*85)).astype(np.float32)
    if kind=='brush': return ((noise-np.roll(noise,1))*.045*np.exp(-t*32)).astype(np.float32)
    return (np.sin(2*np.pi*(110*t+1.6*(1-np.exp(-t*30))))*np.exp(-t*16)*.3).astype(np.float32)

SCORES = [
 dict(id='lobby',title='秋日会客厅',bpm=84,bars=16,key='C major / A minor',loop=True,
      chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,57]],melody=[72,76,79,81,79,76,74,72],mood='warm piano, music box, brushed wood, soft strings'),
 dict(id='tutorial',title='前辈递来的第一张牌',bpm=80,bars=8,key='F major',loop=True,
      chords=[[41,48,52,57],[38,45,48,53],[46,53,57,60],[48,55,57,64]],melody=[69,72,76,77,76,72,70,69],mood='sparse piano, celesta, gentle pizzicato'),
 dict(id='battle',title='工资先亮，底牌后出',bpm=100,bars=16,key='D minor',loop=True,
      chords=[[38,45,48,52],[46,53,57,60],[41,48,53,57],[48,55,60,62]],melody=[74,77,81,84,81,77,76,74],mood='pizzicato ostinato, low strings, clockwork percussion'),
 dict(id='danger',title='最后一份底气',bpm=100,bars=16,key='D minor / A dominant',loop=True,
      chords=[[38,45,48,53],[46,53,57,60],[43,50,53,58],[45,52,55,61]],melody=[74,77,81,82,81,77,76,73],mood='urgent string pulses, toms, chromatic turnaround'),
 dict(id='victory',title='Offer Accepted',bpm=108,bars=4,key='D major',loop=False,
      chords=[[38,45,50,54],[43,50,54,59],[45,52,57,61],[38,45,50,54]],melody=[74,78,81,86,85,81,78,86],mood='warm brass, celesta, rising fanfare'),
 dict(id='defeat',title='明天还有一桌',bpm=72,bars=4,key='D minor',loop=False,
      chords=[[46,53,57,62],[43,50,53,58],[45,52,55,61],[38,45,50,53]],melody=[77,76,74,69,72,73,74,74],mood='gentle piano cadence, warm sustaining strings'),
]

def midi_var(n):
    a=[n&127]; n>>=7
    while n: a.insert(0,(n&127)|128); n>>=7
    return bytes(a)

def write_midi(path, score, events):
    channels={'piano':0,'bell':1,'pluck':2,'bass':3,'pad':4,'brass':5}
    midi=[(0,b'\xff\x51\x03'+int(60e6/score['bpm']).to_bytes(3,'big')),(0,b'\xff\x58\x04\x04\x02\x18\x08')]
    for ins,prog in [('piano',0),('bell',8),('pluck',45),('bass',32),('pad',48),('brass',60)]:
        midi.append((0,bytes([0xc0+channels[ins],prog])))
    for e in events:
        ch=channels[e['instrument']]; start=round(e['beat']*480);end=round((e['beat']+e['duration'])*480)
        midi += [(start,bytes([0x90+ch,e['note'],max(20,min(110,int(e['velocity']*120)))])),(end,bytes([0x80+ch,e['note'],0]))]
    data=b'';prev=0
    for tick,msg in sorted(midi,key=lambda x:x[0]):data+=midi_var(tick-prev)+msg;prev=tick
    data+=b'\x00\xff\x2f\x00'
    path.write_bytes(b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(data))+data)

manifest=[]
for s in SCORES:
    beat=60/s['bpm']; length=s['bars']*4*beat+(0 if s['loop'] else 2.5)
    mix=np.zeros((round(length*SR),2),np.float32); events=[]
    def add(y, at, vol=1, pan=0):
        start=round(at*beat*SR); stereo=y[:,None]*np.array([math.sqrt((1-pan)/2),math.sqrt((1+pan)/2)])[None,:]*vol
        if s['loop']:
            indices=(np.arange(len(y))+start)%len(mix)
            np.add.at(mix,indices,stereo)
        else:
            size=min(len(y),len(mix)-start)
            if size>0: mix[start:start+size]+=stereo[:size]
    def note(n, at, dur, ins='piano', vol=.4, pan=0):
        events.append(dict(note=n,beat=at,duration=dur,instrument=ins,velocity=vol,pan=pan))
        add(voice(n,dur*beat,ins),at,vol,pan)
    for bar in range(s['bars']):
        chord=s['chords'][bar%4]; at=bar*4;kind=s['id']
        for j,n in enumerate(chord[1:]): note(n,at,3.6,'pad',.115 if kind!='danger' else .17,(j-1)*.45)
        note(chord[0],at,1.6,'bass',.42 if kind in ('battle','danger') else .29,-.06)
        if kind!='defeat':note(chord[0]+12,at+2,1.4,'bass',.23,.06)
        steps=8 if kind in ('battle','danger','lobby') else 4
        pattern=[0,2,1,3,2,1,3,2]
        for i in range(steps):
            n=chord[pattern[i]]+12
            note(n,at+i*4/steps,.33 if steps==8 else .65,'pluck' if kind in ('battle','danger') else 'piano',.27 if i%2==0 else .2,(-.35 if i%2 else .35))
        # A recurring four-note rising phrase is answered by a softer falling phrase.
        for i in range(2):
            idx=(bar%4)*2+i; n=s['melody'][idx]
            if kind=='tutorial' and bar%2==1 and i==1:continue
            onset=at+(0 if i==0 else 2.5)
            note(n,onset,1.3 if i==0 else 1.1,'brass' if kind=='victory' else 'piano',.49 if kind=='victory' else .37,.13)
            if (bar%4 in (0,3) and i==0) or kind=='victory':note(n+12,onset,.6,'bell',.13,-.26)
        if kind not in ('tutorial','defeat'):
            for b in (0,2):add(drum('kick'),at+b,.45 if kind=='lobby' else .7)
            for b in (1,3):add(drum('rim'),at+b,.34 if kind=='lobby' else .65,.15)
            for b in np.arange(.5,4,.5):add(drum('brush'),at+float(b),.34,-.35)
        if kind=='danger':
            for b in (1.5,3.25,3.5):add(drum('tom'),at+b,.38,-.17)
            for b in np.arange(.25,4,.5): note(chord[2]+12,at+float(b),.16,'pluck',.1,.4)
        if kind=='victory' and bar==3:
            for n in chord[1:]:note(n+12,at,3.7,'brass',.28)
    # Three reflections plus an opposite-channel return. Circular delay preserves loop seams.
    dry=mix.copy()
    for delay,gain in ((.113,.15),(.227,.105),(.389,.075),(.571,.045)):
        frames=int(delay*SR)
        if s['loop']:mix+=np.roll(dry[:,::-1],frames,axis=0)*gain
        else:mix[frames:]+=dry[:-frames,::-1]*gain
    mix-=mix.mean(axis=0)
    mix=np.tanh(mix*1.12)
    peak=float(np.max(np.abs(mix))); mix*=min(.82/max(peak,.001),1.6)
    if not s['loop']:mix[-SR*2:]*=np.linspace(1,0,SR*2)[:,None]**1.8
    path=MASTER/f"{s['id']}.wav"
    with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((mix*32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),'-c:a','libmp3lame','-q:a','3',str(OUT/f"{s['id']}.mp3")],check=True)
    write_midi(MASTER/f"{s['id']}.mid",s,events)
    (MASTER/f"{s['id']}.score.json").write_text(json.dumps({**s,'events':events},ensure_ascii=False,indent=2))
    result={**s,'file':f"/assets/audio/music/{s['id']}.mp3",'duration':round(length,3),'sampleRate':SR,'notes':len(events),'peak':round(float(np.abs(mix).max()),4),'rms':round(float(np.sqrt(np.mean(mix**2))),4),'sha256':hashlib.sha256((OUT/f"{s['id']}.mp3").read_bytes()).hexdigest()}
    manifest.append(result); print(s['id'],result['duration'],result['notes'],result['rms'])
(OUT/'score-manifest.json').write_text(json.dumps({'title':'Offer Battle — Original Score','created':'2026-09-26','composition':'Original algorithmic composition and synthesis for this game; no external recordings or melody sources.','license':'Included for use and modification with this project. No third-party samples.','tracks':manifest},ensure_ascii=False,indent=2))
