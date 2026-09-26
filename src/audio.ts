import {publicUrl} from './deployment';
import type { MatchView } from "./game/types";

export type MusicScene =
  | "lobby"
  | "tutorial"
  | "battle"
  | "danger"
  | "victory"
  | "defeat";
export const musicTitles: Record<MusicScene, string> = {
  lobby: "金秋会客厅",
  tutorial: "第一张底牌",
  battle: "底牌后出",
  danger: "最后一份底气",
  victory: "好消息，录用了",
  defeat: "明天再赴约",
};
export function chooseMusic(
  page: string,
  view: MatchView | null,
  isTutorial = false,
): MusicScene {
  if (page === "tutorial" || (page === "battle" && isTutorial))
    return "tutorial";
  if (page !== "battle" || !view) return "lobby";
  if (view.phase === "finished")
    return view.result?.winnerId === view.selfId ? "victory" : "defeat";
  return view.players.some((p) => p.mind <= 12) || view.round >= 8
    ? "danger"
    : "battle";
}

/** Two decks let music change scene without chopping off the preceding phrase. */
export class MusicDirector {
  private current: {
    scene: MusicScene;
    audio: HTMLAudioElement;
    gain: number;
  } | null = null;
  private retiring: { audio: HTMLAudioElement; gain: number }[] = [];
  private volume = 0.16;
  private enabled = false;
  private unlocked = false;
  private frame = 0;
  private scene: MusicScene = "lobby";
  private transition: {
    audio: HTMLAudioElement;
    oldGain: number;
    started: boolean;
  } | null = null;
  private listening = false;
  private hidden = false;
  private duckGain = 1;
  private duckFrame = 0;
  private duckUntil = 0;
  private duckTarget = 1;
  private readonly visibility = () => {
    this.hidden = document.hidden;
    if (this.hidden) this.pause();
    else this.playCurrent();
  };
  private listen() {
    if (!this.listening && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.visibility);
      this.listening = true;
      this.hidden = document.hidden;
    }
  }
  private release(audio: HTMLAudioElement) {
    audio.pause();
    audio.onloadedmetadata = null;
    audio.removeAttribute("src");
    audio.load();
  }
  private playCurrent() {
    if (
      !this.enabled ||
      !this.unlocked ||
      this.hidden ||
      !this.current ||
      this.current.audio.ended
    )
      return;
    const audio = this.current.audio;
    try {
      void audio
        .play()
        .then(() => {
          if (this.current?.audio !== audio || !this.enabled || this.hidden) {
            audio.pause();
            return;
          }
          const transition = this.transition;
          if (!transition || transition.audio !== audio || transition.started)
            return;
          transition.started = true;
          const started = performance.now();
          const fade = (now: number) => {
            if (this.current?.audio !== audio || !this.enabled || this.hidden)
              return;
            const progress = Math.max(0, Math.min(1, (now - started) / 1500));
            this.current.gain = Math.sin((progress * Math.PI) / 2);
            if (this.retiring[0])
              this.retiring[0].gain =
                transition.oldGain * Math.cos((progress * Math.PI) / 2);
            this.applyVolumes();
            if (progress < 1) this.frame = requestAnimationFrame(fade);
            else {
              for (const item of this.retiring) this.release(item.audio);
              this.retiring = [];
              this.transition = null;
            }
          };
          this.frame = requestAnimationFrame(fade);
        })
        .catch(() => {});
    } catch {}
  }
  set(scene: MusicScene, enabled: boolean, volume: number) {
    this.listen();
    this.scene = scene;
    this.enabled = enabled;
    this.volume = Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : 0.16;
    if (!enabled) {
      this.pause();
      return;
    }
    if (this.current?.scene === scene) {
      this.applyVolumes();
      this.playCurrent();
      return;
    }
    cancelAnimationFrame(this.frame);
    // Rapid navigation must not leave a third music stream playing.
    for (const old of this.retiring) this.release(old.audio);
    this.retiring = [];
    const old = this.current;
    if (old) this.retiring = [{ audio: old.audio, gain: old.gain }];
    const audio = new Audio(publicUrl(`/assets/audio/music/${scene}.mp3?rev=2`));
    audio.loop = !["victory", "defeat"].includes(scene);
    audio.preload = "auto";
    audio.volume = 0;
    if (
      old &&
      ["battle", "danger"].includes(old.scene) &&
      ["battle", "danger"].includes(scene)
    ) {
      const sync = () => {
        if (
          this.current?.audio !== audio ||
          !Number.isFinite(audio.duration) ||
          audio.duration <= 0 ||
          !Number.isFinite(old.audio.duration) ||
          old.audio.duration <= 0
        )
          return;
        const phase =
          (old.audio.currentTime % old.audio.duration) / old.audio.duration;
        try {
          audio.currentTime = Math.max(0, phase * audio.duration);
        } catch {}
        audio.onloadedmetadata = null;
      };
      audio.onloadedmetadata = sync;
    }
    this.current = { scene, audio, gain: old ? 0 : 1 };
    this.transition = old ? { audio, oldGain: old.gain, started: false } : null;
    this.applyVolumes();
    this.playCurrent();
  }
  unlock() {
    this.listen();
    this.unlocked = true;
    if (!this.enabled) return;
    if (!this.current) this.set(this.scene, true, this.volume);
    else this.playCurrent();
  }
  /** Temporarily leave room for an impact or skill without changing the saved volume. */
  duck(level: number, durationMs: number) {
    if (!this.enabled || this.hidden) return;
    const target = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1;
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const started = performance.now(),
      from = this.duckGain;
    this.duckTarget =
      started < this.duckUntil ? Math.min(this.duckTarget, target) : target;
    this.duckUntil = Math.max(this.duckUntil, started + duration);
    cancelAnimationFrame(this.duckFrame);
    const fade = (now: number) => {
      if (!this.enabled || this.hidden) return;
      if (now <= this.duckUntil) {
        const t = Math.max(0, Math.min(1, (now - started) / 45));
        this.duckGain = from + (this.duckTarget - from) * t;
      } else {
        const t = Math.max(0, Math.min(1, (now - this.duckUntil) / 300));
        this.duckGain =
          this.duckTarget + (1 - this.duckTarget) * Math.sin((t * Math.PI) / 2);
      }
      this.applyVolumes();
      if (now < this.duckUntil + 300)
        this.duckFrame = requestAnimationFrame(fade);
      else {
        this.duckGain = 1;
        this.duckTarget = 1;
        this.duckUntil = 0;
        this.applyVolumes();
      }
    };
    this.duckFrame = requestAnimationFrame(fade);
  }
  private applyVolumes() {
    if (this.current)
      this.current.audio.volume =
        this.current.gain * this.volume * this.duckGain;
    for (const old of this.retiring)
      old.audio.volume = old.gain * this.volume * this.duckGain;
  }
  pause() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.duckFrame);
    this.current?.audio.pause();
    if (this.current) this.current.gain = 1;
    for (const item of this.retiring) this.release(item.audio);
    this.retiring = [];
    this.transition = null;
    this.duckGain = 1;
    this.duckTarget = 1;
    this.duckUntil = 0;
    this.applyVolumes();
  }
  dispose() {
    this.pause();
    if (this.current) this.release(this.current.audio);
    this.current = null;
    if (this.listening) {
      document.removeEventListener("visibilitychange", this.visibility);
      this.listening = false;
    }
  }
}
