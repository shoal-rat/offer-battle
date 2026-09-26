import {publicUrl} from './deployment';
import type { BattleCue } from "./game/types";
import { ATTACK_TIMING, cueOffset, groupBattleCues } from "./components/battle-motion";
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
}
/** Delays align with the card lunge, impact, and retirement beats of BattleEffects. */
export function soundsForCue(cue: BattleCue, selfId?: string): CueSound[] {
  switch (cue.kind) {
    case "attack":
      return [
        { file: "attack", delay: 40, duck: 0.55, protectMs: 380 },
        { file: "damage", delay: ATTACK_TIMING.contact, duck: 0.4 },
      ];
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
      return [{ file: "deploy", delay: 255, duck: 0.65 }];
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

export interface SoundGroup {
  id: string;
  sounds: CueSound[];
  duration: number;
}
/** Use the same resolver groups as the visual queue, with one sound per layer.
 * Eight damage/death events describe eight targets, not eight simultaneous clips.
 */
export function soundsForBatch(
  cues: BattleCue[],
  selfId?: string,
  reduced = false,
): SoundGroup[] {
  const groups = groupBattleCues(cues, reduced).map((group) => {
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
              : ["primary_skill", "secondary_skill", "card"].includes(lead.kind)
                ? 160
                : lead.kind === "retort"
                  ? 120
                  : delay;
        if (
          index > 0 &&
          sound.file === "heal" &&
          ["primary_skill", "secondary_skill", "card"].includes(lead.kind)
        )
          delay = 160;
        if (index > 0 && sound.file === "optimization") delay = cueOffset(group,index);
        layers.set(sound.file, { ...sound, delay: reduced ? 0 : delay });
      }
    return {
      id: group.id,
      sounds: [...layers.values()],
      duration: group.duration,
    };
  });
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

export class SoundEffects {
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
    else for (const audio of this.playing) audio.volume = this.volume;
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
