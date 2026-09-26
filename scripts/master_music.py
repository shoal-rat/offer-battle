"""Master the commissioned RunningHub instrumental sources into game music.
Sources and creative briefs are retained in assets/music-production-v2.
Requires Python + NumPy and ffmpeg. No paid service is called by this script.
"""
from pathlib import Path
import subprocess,json,hashlib,re
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
SR=48000
SOURCE=ROOT/'assets/music-production-v2'
OUT=ROOT/'public/assets/audio/music'
WORK=ROOT/'work/music-mastering-v2'
WORK.mkdir(parents=True,exist_ok=True)
LOOPS={'lobby','tutorial','battle','danger'}
TITLES={'lobby':'金秋会客厅','tutorial':'第一张底牌','battle':'底牌后出','danger':'最后一份底气','victory':'好消息，录用了','defeat':'明天再赴约'}
def command(args):
 return subprocess.run(args,check=True,capture_output=True)
def pcm(path):
 return np.frombuffer(command(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ar',str(SR),'-ac','2','pipe:1']).stdout,dtype='<f4').reshape(-1,2).copy()
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def master(id,entry):
 source=SOURCE/f'{id}-source.mp3'
 x=pcm(source)
 source_duration=len(x)/SR
 overlap=1.6 if id in LOOPS else 0
 if overlap:
  n=int(overlap*SR); theta=np.linspace(0,np.pi/2,n,dtype=np.float32)[:,None]
  # Tail becomes the beginning of the next cycle without a silent gap or hard cut.
  join=x[-n:]*np.cos(theta)+x[:n]*np.sin(theta)
  x=np.concatenate([x[n:-n],join])
 else:
  n=min(int(1.4*SR),len(x)//4);x[-n:]*=np.linspace(1,0,n)[:,None]
  n=int(.035*SR);x[:n]*=np.linspace(0,1,n)[:,None]
 path=WORK/f'{id}.f32'
 path.write_bytes(x.astype('<f4').tobytes())
 inp=['ffmpeg','-hide_banner','-y','-f','f32le','-ar',str(SR),'-ac','2','-i',str(path)]
 filt='highpass=f=38,loudnorm=I=-21:TP=-2:LRA=9'
 result=command(inp+['-af',filt+':print_format=json','-f','null','-'])
 measured=json.loads(re.findall(r'\{[^{}]+\}',result.stderr.decode())[-1])
 norm=filt+':measured_I='+measured['input_i']+':measured_TP='+measured['input_tp']+':measured_LRA='+measured['input_lra']+':measured_thresh='+measured['input_thresh']+':offset='+measured['target_offset']+':linear=true:print_format=json'
 target=OUT/f'{id}.mp3'
 final=command(inp+['-af',norm,'-ar',str(SR),'-c:a','libmp3lame','-b:a','192k','-metadata',f'title={TITLES[id]}','-metadata','artist=Offer Battle Original Score / ACE-Step',str(target)])
 actual=pcm(target)
 report=json.loads(re.findall(r'\{[^{}]+\}',final.stderr.decode())[-1])
 return {'id':id,'title':TITLES[id],'file':f'/assets/audio/music/{id}.mp3','duration':round(len(actual)/SR,3),'sourceDuration':round(source_duration,3),'loop':id in LOOPS,'overlapSeconds':overlap,'sampleRate':SR,'sha256':digest(target),'originals':[{'file':str(source.relative_to(ROOT)),'sha256':digest(source)},{'file':'assets/music-production-v2/creative-briefs.json','sha256':digest(SOURCE/'creative-briefs.json')}],'provenance':entry,'mastering':report,'peak':float(abs(actual).max()),'rms':float(np.sqrt(np.mean(actual**2))),'clippedSamples':int((abs(actual)>=1).sum()),'loopSeam':float(abs(actual[0]-actual[-1]).max())}
if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*');args=parser.parse_args()
 briefs=json.loads((SOURCE/'creative-briefs.json').read_text())
 existing=json.loads((OUT/'score-manifest.json').read_text()) if (OUT/'score-manifest.json').exists() else {'tracks':[]}
 tracks={t['id']:t for t in existing['tracks']}
 for id in args.ids or TITLES:
  tracks[id]=master(id,briefs['tracks'][id]);print(id,tracks[id]['duration'],tracks[id]['mastering']['output_i'],flush=True)
 manifest={'version':2,'production':'Original creative direction and AI-assisted instrumental performance; individual sources, prompts, task provenance and mastering retained. Earlier procedural MIDI sketches are prototypes, not transcriptions of this score.','generator':briefs['workflow'],'masteringScript':'scripts/master_music.py','tracks':[tracks[id] for id in TITLES if id in tracks]}
 (OUT/'score-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 (ROOT/'evidence/audio/music-v2-quality.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
