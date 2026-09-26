export function fakeAudioEnvironment() {
  let now = 1000,
    sequence = 0,
    rejectNext = false;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { at: number; run: () => void }>();
  class FakeAudio {
    volume = 0;
    currentTime = 0;
    duration = NaN;
    paused = true;
    ended = false;
    loop = false;
    preload = "";
    src: string;
    onloadedmetadata: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    fail = false;
    constructor(src: string) {
      this.src = src;
      this.fail = rejectNext;
      rejectNext = false;
      instances.push(this);
    }
    play() {
      if (this.fail) return Promise.reject(new Error("media unavailable"));
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute() {
      this.src = "";
    }
    load() {}
    metadata(duration: number) {
      this.duration = duration;
      this.onloadedmetadata?.();
    }
  }
  const instances: FakeAudio[] = [];
  const doc = new (class extends EventTarget {
    hidden = false;
  })();
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  };
  replace("Audio", FakeAudio);
  replace("document", doc);
  replace("performance", { now: () => now });
  replace("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.set(++sequence, fn);
    return sequence;
  });
  replace("cancelAnimationFrame", (id: number) => frames.delete(id));
  replace("setTimeout", (run: () => void, ms = 0) => {
    timers.set(++sequence, { at: now + ms, run });
    return sequence;
  });
  replace("clearTimeout", (id: number) => timers.delete(id));
  return {
    instances,
    frames,
    timers,
    rejectNext: () => {
      rejectNext = true;
    },
    flush: async () => {
      await Promise.resolve();
      await Promise.resolve();
    },
    tick(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers]
          .filter(([, v]) => v.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].run();
      }
      now = end;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const fn of callbacks) fn(now);
    },
    visibility(hidden: boolean) {
      doc.hidden = hidden;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
