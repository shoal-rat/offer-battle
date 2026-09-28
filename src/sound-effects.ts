import {publicUrl} from './deployment';
import type { BattleCue } from "./game/types";
import { ATTACK_TIMING, DEPLOY_TIMING, RETIRE_SHIVER, cueOffset, groupBattleCues, type MotionGroup } from "./components/battle-motion";
import { resultMotionDuration } from "./components/result-motion";

export type SoundFile =
  | "attack"
  | "damage"
  | "heal"
  | "deploy"
  | "retort"
  | "draw"
  | "card_pick"
  | "negotiate"
  | "age_up"
  | "optimization"
  | "graduation"
  | "jlu_collect"
  | "jlu_ultimate"
  | "win"
  | "lose";
export interface CueSound {
  file: SoundFile;
  delay: number;
  duck?: number;
  protectMs?: number;
  /** Playback rate; heavier blows play the same clip lower and slower. */
  rate?: number;
}
/** Delays align with the card lunge, impact, and retirement beats of BattleEffects. */
export function soundsForCue(cue: BattleCue, selfId?: string): CueSound[] {
  switch (cue.kind) {
    case "attack": {
      const heavy = (cue.amount ?? 0) >= 5;
      return [
        { file: "attack", delay: ATTACK_TIMING.lift, duck: 0.55, protectMs: 380 },
        { file: "damage", delay: ATTACK_TIMING.contact, duck: 0.4, ...(heavy ? { rate: 0.82 } : {}) },
      ];
    }
    case "retire":
      return [{ file: "optimization", delay: 0, duck: 0.6 }];
    case "primary_skill":
      return [
        {
          file:
            cue.effectId === "jlu_ultimate"
              ? "jlu_ultimate"
              : cue.effectId === "jlu_signin"
                ? "jlu_collect"
                : "card_pick",
          delay: 0,
          duck: cue.effectId === "jlu_ultimate" ? 0.25 : 0.55,
          protectMs: 950,
        },
      ];
    case "secondary_skill":
      return [{ file: "graduation", delay: 0, duck: 0.3, protectMs: 950 }];
    case "retort":
      return [{ file: "retort", delay: 0, duck: 0.45 }];
    case "deploy":
      return [{ file: "deploy", delay: DEPLOY_TIMING.land - 40, duck: 0.65 }];
    case "damage":
      return [{ file: "damage", delay: 0, duck: 0.5 }];
    case "heal":
      return [{ file: "heal", delay: 80, duck: 0.7 }];
    case "draw":
      return [{ file: "draw", delay: 0 }];
    case "card":
    case "covered":
    case "bounce":
      return [{ file: "card_pick", delay: 0 }];
    case "status":
      return cue.effectId === "negotiate"
        ? [{ file: "negotiate", delay: 0, duck: 0.55 }]
        : cue.effectId === "age"
          ? [{ file: "age_up", delay: 120 }]
          : cue.effectId === "notice"
            ? [{ file: "optimization", delay: 0, duck: 0.55 }]
            : [];
    case "result":
      return cue.effectId === "draw"
        ? []
        : [
            {
              file: cue.targetId === selfId ? "win" : "lose",
              delay: 160,
              duck: 0.4,
            },
          ];
    default:
      return [];
  }
}

/** Window event the battle table dispatches when a group's animation begins. */
export const BATTLE_SOUND_EVENT = "offer-battle-sounds";
/** Fired on window each time a Web Audio clip starts. */
export const SFX_PLAYED_EVENT = "offer-sfx-played";
export interface SoundGroup {
  id: string;
  sounds: CueSound[];
  duration: number;
}
/** One sound per layer for a resolver group, timed to the same beats as its animation. */
export function soundsForGroup(
  group: MotionGroup,
  selfId?: string,
  reduced = false,
): SoundGroup {
  const lead = group.cues[0],
    layers = new Map<SoundFile, CueSound>();
  for (const [index, cue] of group.cues.entries())
    for (const sound of soundsForCue(cue, selfId)) {
      if (layers.has(sound.file)) continue;
      let delay = sound.delay;
      if (index > 0 && sound.file === "damage")
        delay =
          lead.kind === "attack"
            ? ATTACK_TIMING.contact
            : ["primary_skill", "secondary_skill", "card", "retort"].includes(lead.kind)
              ? cueOffset(group, index)
              : delay;
      if (
        index > 0 &&
        sound.file === "heal" &&
        ["primary_skill", "secondary_skill", "card"].includes(lead.kind)
      )
        delay = cueOffset(group, index);
      // The tear sound lands when the paper actually rips, after the stand-up's shiver.
      if (index > 0 && sound.file === "optimization") delay = cueOffset(group,index) + (cue.kind === "retire" ? RETIRE_SHIVER : 0);
      layers.set(sound.file, { ...sound, delay: reduced ? 0 : delay });
    }
  return {
    id: group.id,
    sounds: [...layers.values()],
    duration: group.duration,
  };
}

/** Use the same resolver groups as the visual queue, with one sound per layer.
 * Eight damage/death events describe eight targets, not eight simultaneous clips.
 */
export function soundsForBatch(
  cues: BattleCue[],
  selfId?: string,
  reduced = false,
): SoundGroup[] {
  const groups = groupBattleCues(cues, reduced, selfId).map((group) => soundsForGroup(group, selfId, reduced));
  // These cues have no visual motion group, but still get one quiet feedback cue.
  const extras = cues.filter(
    (c) => c.kind === "covered",
  );
  if (extras.length) {
    const extraSounds = new Map<SoundFile, CueSound>();
    for (const cue of extras)
      for (const sound of soundsForCue(cue, selfId))
        extraSounds.set(sound.file, {
          ...sound,
          delay: reduced ? 0 : sound.delay,
        });
    if (groups.length)
      groups[groups.length - 1].sounds.push(...extraSounds.values());
    else
      groups.push({
        id: extras[0].id,
        sounds: [...extraSounds.values()],
        duration: reduced ? 280 : 700,
      });
  }
  const result=cues.find(c=>c.kind==='result');
  if(result){
    const attack=[...cues].reverse().find(c=>c.kind==='attack');
    // Preserve the final resolver's impact and shared exit layer before the ending.
    const finalAttack=attack?groups.find(group=>group.id===attack.id):undefined;
    const attackDuration=attack&&!reduced?(finalAttack?.duration??ATTACK_TIMING.duration):0;
    const sounds:CueSound[]=reduced?[]:[...(finalAttack?.sounds??[])];
    sounds.push(...soundsForCue(result,selfId).map(sound=>({...sound,delay:reduced?0:attackDuration+sound.delay})));
    return [{id:result.id,sounds,duration:attackDuration+resultMotionDuration(result,reduced)}];
  }
  return groups;
}

const SOUND_FILES: SoundFile[] = ["attack","damage","heal","deploy","retort","draw","card_pick","negotiate","age_up","optimization","graduation","jlu_collect","jlu_ultimate","win","lose"];
const clipUrl = (file: SoundFile) => publicUrl(`/assets/audio/sfx/${file}.wav?rev=2`);
/** Decoded clips on one AudioContext. A clip starts on the exact audio clock tick it was scheduled for,
 * with no fetch or decode in between — the delay that made hits sound late on a fresh HTMLAudio element. */
class ClipBank {
  private context?: AudioContext;
  private buffers = new Map<SoundFile, AudioBuffer>();
  private loading?: Promise<void>;
  readonly voices = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();
  /** Needs a user gesture: browsers keep audio suspended until then. */
  unlock() {
    const Context = typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    this.context ??= new Context({ latencyHint: "interactive" });
    if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    this.loading ??= Promise.all(SOUND_FILES.map(async (file) => {
      const response = await fetch(clipUrl(file));
      if (!response.ok) return;
      this.buffers.set(file, await this.context!.decodeAudioData(await response.arrayBuffer()));
    })).then(() => {}, () => {});
  }
  ready(file: SoundFile) {
    return this.context?.state === "running" && this.buffers.has(file);
  }
  /** Schedules on the audio clock; returns false when the caller should fall back to HTMLAudio. */
  schedule(sound: CueSound, delayMs: number, volume: number): boolean {
    if (!this.ready(sound.file)) return false;
    const context = this.context!, source = context.createBufferSource(), gain = context.createGain();
    source.buffer = this.buffers.get(sound.file)!;
    source.playbackRate.value = sound.rate ?? 1;
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    const voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect(); };
    source.start(context.currentTime + Math.max(0, delayMs) / 1000);
    // Announce the clip when it actually sounds (diagnostics and browser tests listen for this).
    setTimeout(() => window.dispatchEvent(new CustomEvent(SFX_PLAYED_EVENT, { detail: { file: sound.file } })), Math.max(0, delayMs));
    return true;
  }
  setVolume(volume: number) { for (const voice of this.voices) voice.gain.gain.value = volume; }
  stop() { for (const voice of [...this.voices]) try { voice.source.stop(); } catch {} this.voices.clear(); }
}

export class SoundEffects {
  private bank = new ClipBank();
  private enabled = false;
  private volume = 0.35;
  private matchId = "";
  private sequence = -1;
  private pending = new Set<ReturnType<typeof setTimeout>>();
  private playing = new Set<HTMLAudioElement>();
  private protectedUntil = new Map<HTMLAudioElement, number>();
  private queue: SoundGroup[] = [];
  private running = false;
  private listening = false;
  /** When the battle table drives sound, snapshots only advance the watermark. */
  private driven = false;
  private readonly visibility = () => {
    if (document.hidden) this.stop();
  };
  constructor(
    private readonly duck?: (level: number, durationMs: number) => void,
  ) {}
  set(enabled: boolean, volume: number) {
    if (!this.listening && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.visibility);
      this.listening = true;
    }
    this.enabled = enabled;
    this.volume = Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : 0.35;
    if (!enabled) this.stop();
    else {
      for (const audio of this.playing) audio.volume = this.volume;
      this.bank.setVolume(this.volume);
    }
  }
  /** Call from a user gesture: resumes the audio clock and decodes every clip once. */
  unlock() {
    this.bank.unlock();
  }
  /** Hand timing to the visual director: each group's sounds start when its animation starts. */
  setPresentationDriven(value: boolean) {
    this.driven = value;
    if (value) {
      this.queue = [];
    }
  }
  /** Play one presented group now; `scale` follows a sped-up backlog. */
  playGroup(sounds: CueSound[], scale = 1) {
    if (!this.enabled || (typeof document !== "undefined" && document.hidden))
      return;
    for (const sound of sounds) {
      const delay = Math.max(0, sound.delay * scale);
      // Sample-accurate when the clips are decoded; otherwise the old timer path.
      if (this.bank.schedule(sound, delay, this.volume)) {
        if (sound.duck !== undefined) this.later(() => this.duck?.(sound.duck!, sound.file === "graduation" || sound.file === "jlu_ultimate" ? 950 : 450), delay);
      } else this.later(() => this.play(sound), delay);
    }
  }
  /** Call for every snapshot, including while muted, so old sounds never replay. */
  consume(matchId: string, cues: BattleCue[], selfId?: string) {
    const latest = Math.max(-1, ...cues.map((c) => c.sequence));
    if (this.matchId !== matchId) {
      this.stop();
      this.matchId = matchId;
      this.sequence = latest;
      return;
    }
    const fresh = cues
      .filter((c) => c.sequence > this.sequence)
      .sort((a, b) => a.sequence - b.sequence);
    this.sequence = Math.max(this.sequence, latest);
    if (!this.enabled || (typeof document !== "undefined" && document.hidden))
      return;
    const accepted = new Set<string>();
    const unique = fresh.filter((cue) => {
      if (accepted.has(cue.id)) return false;
      accepted.add(cue.id);
      return true;
    });
    const explicit = typeof document !== 'undefined' ? document.documentElement?.dataset.reduced : undefined;
    const reduced = explicit !== undefined ? explicit === 'true' : typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(unique.some(c=>c.kind==='result'))this.stop();
    if (this.driven) {
      // Hidden-card cues have no animation group; give them their quiet feedback directly.
      for (const cue of unique.filter((c) => c.kind === "covered"))
        for (const sound of soundsForCue(cue, selfId)) this.play(sound);
      return;
    }
    this.queue = [
      ...this.queue,
      ...soundsForBatch(unique, selfId, reduced),
    ].slice(-3);
    if (!this.running) this.pump();
  }
  private later(run: () => void, delay: number) {
    const timer = setTimeout(() => {
      this.pending.delete(timer);
      run();
    }, delay);
    this.pending.add(timer);
  }
  private pump() {
    const group = this.queue.shift();
    if (!group) {
      this.running = false;
      return;
    }
    this.running = true;
    for (const sound of group.sounds)
      this.later(() => this.play(sound), sound.delay);
    this.later(() => this.pump(), group.duration);
  }
  private release(audio: HTMLAudioElement) {
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();
    this.playing.delete(audio);
    this.protectedUntil.delete(audio);
  }
  private play(sound: CueSound) {
    if (!this.enabled || (typeof document !== "undefined" && document.hidden))
      return;
    if (this.bank.schedule(sound, 0, this.volume)) {
      if (sound.duck !== undefined) this.duck?.(sound.duck, sound.file === "graduation" || sound.file === "jlu_ultimate" ? 950 : 450);
      return;
    }
    // Short tails can overlap, but a new impact should never create an unbounded chorus.
    while (this.playing.size >= 4) {
      const tail = [...this.playing].find(
        (audio) => (this.protectedUntil.get(audio) || 0) <= performance.now(),
      );
      if (!tail) return;
      this.release(tail);
    }
    try {
      const audio = new Audio(publicUrl(`/assets/audio/sfx/${sound.file}.wav?rev=2`));
      audio.volume = this.volume;
      if (sound.rate) {
        audio.preservesPitch = false;
        audio.playbackRate = sound.rate;
      }
      this.playing.add(audio);
      if (sound.protectMs)
        this.protectedUntil.set(audio, performance.now() + sound.protectMs);
      const done = () => this.release(audio);
      audio.onended = done;
      audio.onerror = done;
      if (sound.duck !== undefined)
        this.duck?.(
          sound.duck,
          sound.file === "graduation" || sound.file === "jlu_ultimate"
            ? 950
            : 450,
        );
      void audio.play().catch(done);
    } catch {}
  }
  private stop() {
    this.bank.stop();
    for (const timer of this.pending) clearTimeout(timer);
    this.pending.clear();
    this.queue = [];
    this.running = false;
    for (const audio of [...this.playing]) this.release(audio);
  }
  reset() {
    this.stop();
    this.matchId = "";
    this.sequence = -1;
  }
  dispose() {
    this.reset();
    if (this.listening) {
      document.removeEventListener("visibilitychange", this.visibility);
      this.listening = false;
    }
  }
}
