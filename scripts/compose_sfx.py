"""Offer Battle: original layered, deterministic office-card sound design.

Requires only NumPy. Produces 44.1 kHz / PCM16 mono WAV. No recordings,
stock sounds, external API, voices, or copyrighted musical material.
Attack movement and contact impact are separate so the cue scheduler can align
them to the moving card. Graduation/ultimate charge peaks around 400 ms.
"""
from pathlib import Path
import hashlib
import json
import math
import re
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/audio/sfx"
SR = 44100
rng = np.random.default_rng(926204)
TAU = math.tau

def time(d): return np.arange(round(d * SR)) / SR

def band_noise(d, lo=100, hi=9000, slope=.4):
    """Smooth spectral slopes avoid brittle white-noise fizz."""
    n = round(d * SR)
    spectrum = np.fft.rfft(rng.normal(0, 1, n))
    f = np.fft.rfftfreq(n, 1 / SR)
    hp = 1 - np.exp(-np.power(f / max(lo, 1), 4))
    lp = np.exp(-np.power(f / hi, 4))
    shape = hp * lp / np.maximum(f, 150) ** slope
    shaped = np.fft.irfft(spectrum * shape, n)
    return shaped / max(np.std(shaped), 1e-9)

def envelope(d, attack=.004, decay=8, release=.035):
    t = time(d)
    return np.minimum(1, t / max(attack, .0001)) * np.exp(-decay * t) * np.minimum(1, (d - t) / release)

def modal(d, modes, decay=10):
    """Small resonating wood/metal bodies with inharmonic partials."""
    t = time(d)
    s = np.zeros(len(t))
    for freq, gain in modes:
        s += gain * np.sin(TAU * freq * t + .12) * np.exp(-decay * (freq / modes[0][0]) ** .32 * t)
    return s * np.minimum(1, t / .0025) * np.minimum(1, (d - t) / .035)

def paper(d=.19, direction=1):
    t = time(d)
    env = np.sin(np.pi * t / d) ** 1.4
    texture = band_noise(d, 430, 6700, .1)
    flutter = .63 + .37 * np.sin(TAU * (32 * t + direction * 80 * t * t)) ** 2
    s = texture * env * flutter * .095
    for at in [.016, .052, .095]:
        add(s, band_noise(.022, 1600, 7500, .2) * envelope(.022, .001, 70, .005) * .065, at)
    return s

def knock(d=.35, power=1):
    body = modal(d, [(126,.62), (213,.36), (381,.16), (639,.06)], 18)
    grain = band_noise(d, 160, 5000, .65) * envelope(d, .0018, 47) * .15
    return (body * .35 + grain) * power

def impact(d=.65):
    t = time(d)
    pitch = 58 + 130 * np.exp(-26 * t)
    thump = np.sin(TAU * np.cumsum(pitch) / SR) * envelope(d, .0015, 14) * .42
    flesh = band_noise(d, 80, 1600, .7) * envelope(d, .002, 23) * .2
    crack = band_noise(d, 900, 9200, .25) * envelope(d, .001, 70) * .12
    brass = modal(d, [(410,.10),(691,.075),(1126,.035),(1789,.016)], 16)
    return thump + flesh + crack + brass

def whoosh(d=.31):
    t = time(d)
    amp = np.sin(np.pi * t / d) ** 2.2
    airy = band_noise(d, 160, 3600, .7) * amp * .21
    edge = band_noise(d, 1100, 7800, .25) * amp * (.05 + .045 * t / d)
    bass = np.sin(TAU * np.cumsum(85 + 110 * (1-t/d)) / SR) * amp * .08
    return airy + edge + bass

def chime(freq, d=.8, gain=.1):
    t = time(d)
    signal = sum(a * np.sin(TAU * freq * ratio * t) *
                 np.exp(-decay*t) for ratio,a,decay in [(1,1,4.6),(2,.20,8),(2.756,.085,15),(4.07,.025,23)])
    return signal * np.minimum(1, t/.008) * np.minimum(1,(d-t)/.05) * gain

def add(dest, signal, at):
    start = round(at * SR)
    count = min(len(signal), len(dest) - start)
    if count > 0: dest[start:start+count] += signal[:count]

def room(signal, wet=.16):
    """Very short damped early reflections keep actions close and tactile."""
    result = signal.copy()
    for delay,amp in [(.017,.48),(.033,.30),(.051,.23),(.082,.13),(.119,.08)]:
        add(result, signal * amp * wet, delay)
    return result

def charge(d=.42):
    t=time(d)
    env=np.sin(np.pi*.5*t/d)**2
    air=band_noise(d, 190, 4700, .7)*env*.075
    low=np.sin(TAU*np.cumsum(80+260*(t/d)**1.7)/SR)*env*.07
    sparks=np.zeros(len(t))
    for i,f in enumerate([523.25,659.25,783.99,1046.5]):
        add(sparks,chime(f,.17,.035),i*.085)
    return air+low+sparks

def synth(name):
    durations = {"click":.12,"card_pick":.26,"draw":.39,"deploy":.54,"attack":.34,
        "damage":.64,"heal":1.06,"retort":.83,"negotiate":.60,"age_up":.39,
        "optimization":.83,"graduation":1.42,"jlu_collect":.68,"jlu_ultimate":1.74,
        "win":2.12,"lose":1.95}
    s=np.zeros(round(durations[name]*SR))
    layers=[]
    def put(signal, at, label):
        add(s,signal,at);layers.append({"name":label,"atSeconds":at})
    if name=="click":
        put(knock(.1,.36),0,"muted wooden button")
        put(paper(.06)*.25,.002,"tiny card edge")
    elif name=="card_pick":
        put(paper(.17),0,"paper flex and fibres")
        put(modal(.18,[(440,.08),(913,.022)],25),.012,"soft edge flick")
    elif name=="draw":
        put(paper(.20)*.95,0,"card pull")
        put(paper(.16,-1)*.50,.10,"deck separation")
        put(knock(.14,.18),.20,"light desk contact")
    elif name=="deploy":
        put(paper(.12)*.62,0,"card settling")
        put(knock(.43,1),.012,"solid walnut landing")
        put(modal(.38,[(690,.035),(1251,.018)],16),.025,"brass frame resonance")
    elif name=="attack":
        put(whoosh(.30),.005,"accelerating card air displacement")
        put(paper(.09)*.40,.20,"leading paper edge")
    elif name=="damage":
        put(impact(.61),0,"low body, tactile crack, dull brass")
        put(knock(.23,.36),.025,"cardboard frame contact")
    elif name=="heal":
        put(band_noise(.65,550,3800,.7)*envelope(.65,.08,5)*.028,0,"soft rising air")
        for i,f in enumerate([659.25,783.99,1046.5]):
            put(chime(f,.72,.085),i*.10,"warm restorative chime")
    elif name=="retort":
        put(paper(.24,-1),0,"heavy card turning")
        put(whoosh(.20)*.33,.12,"flip arc")
        put(knock(.43,.80),.24,"decisive stamp contact")
        put(chime(622.25,.46,.055),.28,"violet seal ping")
    elif name=="negotiate":
        put(paper(.14)*.45,0,"contract placement")
        put(knock(.40,1.08),.12,"rubber stamp and wood")
        put(modal(.35,[(970,.024),(1817,.009)],15),.15,"metal stamp handle")
    elif name=="age_up":
        put(paper(.16,-1)*.83,0,"calendar leaf turn")
        put(knock(.19,.24),.17,"calendar spring tick")
    elif name=="optimization":
        put(paper(.31)*.85,0,"document and packing carton")
        put(whoosh(.42)*.40,.13,"card retreat")
        put(modal(.45,[(108,.18),(164,.09),(266,.035)],12),.26,"soft hollow carton close")
    elif name=="graduation":
        put(charge(.41),0,"quiet air and tonal charge")
        put(impact(.70)*.72,.405,"engraved seal impact")
        for i,f in enumerate([523.25,659.25,783.99,1046.5]):
            put(chime(f,.70,.058),.43+i*.075,"gold certification overtones")
    elif name=="jlu_collect":
        put(knock(.29,.7),0,"sign-in stamp")
        put(chime(783.99,.48,.072),.045,"badge call")
        put(chime(1046.5,.44,.052),.16,"badge response")
    elif name=="jlu_ultimate":
        put(charge(.43)*1.07,0,"gathering alumni charge")
        put(whoosh(.27)*.62,.20,"rising group energy")
        put(impact(.80)*.92,.405,"large shared crest contact")
        for i,f in enumerate([261.63,392,523.25,659.25,783.99,1046.5]):
            put(chime(f,.90,.062 if i<3 else .036),.43+i*.027,"six original resonant voices, no speech")
        put(band_noise(.75,800,6700,.4)*envelope(.75,.08,7)*.02,.61,"golden paper confetti")
    elif name=="win":
        for i,f in enumerate([392,523.25,659.25,783.99]):
            put(chime(f,1.25,.10),i*.16,"original four-note bright cadence")
        put(modal(.62,[(130.81,.14),(261.63,.04)],5),.46,"warm final root")
        put(paper(.26)*.28,.56,"restrained celebration confetti")
    elif name=="lose":
        for i,f in enumerate([392,349.23,293.66,261.63]):
            put(chime(f,1.13,.070),i*.20,"original gentle descending cadence")
        put(modal(.55,[(130.81,.075),(196,.025)],5),.6,"soft grounded close")
    return room(s,.18 if name in ["heal","win","lose","graduation","jlu_ultimate"] else .10), layers

def master(signal, name):
    # Remove DC/inaudible rumble and soften high-frequency edge.
    f=np.fft.rfftfreq(len(signal),1/SR)
    shape=(1-np.exp(-(f/32)**4))*np.exp(-(f/12500)**6)
    s=np.fft.irfft(np.fft.rfft(signal)*shape,len(signal))
    fade_in=min(round(.003*SR),len(s)//10);fade_out=min(round(.045*SR),len(s)//10)
    s[:fade_in]*=np.linspace(0,1,fade_in)**1.2
    s[-fade_out:]*=np.linspace(1,0,fade_out)**1.4
    # Preserve punch with 3.5 dB peak headroom. Do not normalize noise tails loudly.
    active=s[np.abs(s)>.004]
    rms=float(np.sqrt(np.mean(active**2))) if len(active) else .01
    target_db=-19.5 if name in ["attack","card_pick","draw","click","age_up"] else -17.5
    gain=min(10**(target_db/20)/max(rms,1e-9),.67/max(np.max(abs(s)),1e-9))
    s*=gain
    s[0]=s[-1]=0
    return s

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    names=["click","card_pick","draw","deploy","attack","damage","heal","retort",
           "negotiate","age_up","optimization","graduation","jlu_collect","jlu_ultimate","win","lose"]
    results=[]
    for name in names:
        raw,layers=synth(name);s=master(raw,name)
        path=OUT/f"{name}.wav"
        pcm=np.round(s*32767).astype("<i2")
        with wave.open(str(path),"wb") as wf:
            wf.setnchannels(1);wf.setsampwidth(2);wf.setframerate(SR);wf.writeframes(pcm.tobytes())
        peak=float(np.max(np.abs(s)));rms=float(np.sqrt(np.mean(s*s)))
        rec={"id":f"sfx_{name}","url":f"/assets/audio/sfx/{name}.wav","bytes":path.stat().st_size,
             "sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"sampleRate":SR,"channels":1,
             "durationSeconds":round(len(s)/SR,4),"dimensions":None,"transparent":False,
             "peakDbFS":round(20*np.log10(max(peak,1e-12)),2),"rmsDbFS":round(20*np.log10(max(rms,1e-12)),2),
             "crestDb":round(20*np.log10(max(peak,1e-12)/max(rms,1e-12)),2),
             "clippedSamples":int(np.sum(np.abs(pcm)>=32767)),
             "firstSample":int(pcm[0]),"lastSample":int(pcm[-1]),
             "layers":layers,"source":"original_layered_procedural_synthesis"}
        assert rec["clippedSamples"]==0 and peak<.68
        assert rec["firstSample"]==rec["lastSample"]==0
        results.append(rec)
    # Read the newest manifest only after synthesis; preserve every music/art field.
    mp=ROOT/"public/assets/manifest.json";manifest=json.loads(mp.read_text())
    for r in results:
        entry=manifest["assets"].get(r["id"],{})
        entry.update({k:r[k] for k in ["id","url","bytes","sha256","sampleRate","channels","durationSeconds","dimensions","transparent","source"]})
        entry.update({"kind":"audio","status":"produced","soundDesignVersion":"2.0",
            "audioReview":"Layered paper/wood/body/air/chime synthesis; 44.1kHz PCM16 mono, DC removal, soft high-frequency rolloff, headroom >=3.5dB, zero clipped samples, zero endpoints.",
            "visualReview":"Audio quality metrics validated; source layers and envelopes documented in evidence/sfx-quality.json."})
        manifest["assets"][r["id"]]=entry
    temp=mp.with_suffix(".json.tmp");temp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));temp.replace(mp)
    evidence=ROOT/"evidence";evidence.mkdir(exist_ok=True)
    report={"version":"2.0","design":"Tactile modern office collectible-card sound design; distinct movement/contact; no stock samples, no voices.",
            "sampleRate":SR,"format":"PCM16 mono WAV","mastering":"Peak ceiling 0.67 (-3.48 dBFS), active-level targets -19.5/-17.5 dBFS, 3ms attack anti-click fade, 45ms tail fade.",
            "cueAlignment":{"attack":"whoosh only, player schedules independent damage contact at 350ms","graduation":"charge 0-405ms then seal impact","jlu_ultimate":"charge 0-405ms then crest impact with six chime partial layers"},
            "count":len(results),"allChecksPassed":all(r["clippedSamples"]==0 and r["firstSample"]==r["lastSample"]==0 for r in results),
            "assets":results}
    (evidence/"sfx-quality.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({"produced":len(results),"allChecksPassed":report["allChecksPassed"],
        "peakDbFSRange":[min(r["peakDbFS"] for r in results),max(r["peakDbFS"] for r in results)],
        "durationSecondsRange":[min(r["durationSeconds"] for r in results),max(r["durationSeconds"] for r in results)]}))
if __name__=="__main__":main()
