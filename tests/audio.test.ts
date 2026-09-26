import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { chooseMusic, MusicDirector } from "../src/audio";
import type { MatchView } from "../src/game/types";
import { fakeAudioEnvironment } from "./helpers/fake-audio";

test("score selection follows tutorial, pressure and result without overriding menu music", () => {
  const view = {
    phase: "playing",
    selfId: "p1",
    round: 2,
    players: [{ mind: 30 }, { mind: 30 }],
  } as MatchView;
  assert.equal(chooseMusic("home", view), "lobby");
  assert.equal(chooseMusic("battle", view, true), "tutorial");
  assert.equal(chooseMusic("battle", view), "battle");
  assert.equal(chooseMusic("battle", { ...view, round: 8 }), "danger");
  assert.equal(
    chooseMusic("battle", {
      ...view,
      players: [{ mind: 12 }, { mind: 30 }],
    } as MatchView),
    "danger",
  );
  assert.equal(
    chooseMusic("battle", {
      ...view,
      phase: "finished",
      result: { winnerId: "p1", reason: "test" },
    }),
    "victory",
  );
  assert.equal(
    chooseMusic("battle", {
      ...view,
      phase: "finished",
      result: { winnerId: "p2", reason: "test" },
    }),
    "defeat",
  );
});

test("music waits for a gesture, crossfades at equal power and maps the actual decoded durations", async () => {
  const env = fakeAudioEnvironment();
  try {
    const player = new MusicDirector();
    player.set("lobby", true, 0.2);
    assert.equal(env.instances[0].paused, true);
    player.unlock();
    await env.flush();
    assert.equal(env.instances[0].paused, false);
    player.set("battle", true, 0.2);
    await env.flush();
    env.tick(750);
    assert.ok(
      Math.abs(
        env.instances[0].volume ** 2 + env.instances[1].volume ** 2 - 0.04,
      ) < 1e-10,
    );
    env.tick(750);
    assert.equal(env.instances[0].paused, true);
    env.instances[1].metadata(120);
    env.instances[1].currentTime = 90;
    player.set("danger", true, 0.2);
    assert.equal(env.instances[2].currentTime, 0);
    env.instances[2].metadata(80);
    assert.equal(env.instances[2].currentTime, 60);
    await env.flush();
    env.tick(1500);
    assert.equal(env.instances[2].volume, 0.2);
    player.set("danger", false, 0.2);
    assert.ok(env.instances.every((a) => a.paused));
    player.set("danger", true, 0.4);
    await env.flush();
    assert.equal(env.instances[2].volume, 0.4);
    assert.equal(env.instances[2].paused, false);
    player.dispose();
    assert.ok(env.instances.every((a) => a.paused));
    assert.equal(env.frames.size, 0);
  } finally {
    env.restore();
  }
});

test("music ducking recovers saved volume, hidden tabs pause, and disposed directors can remount", async () => {
  const env = fakeAudioEnvironment();
  try {
    const player = new MusicDirector();
    player.set("battle", true, 0.4);
    player.unlock();
    await env.flush();
    player.duck(0.3, 600);
    env.tick(50);
    assert.ok(Math.abs(env.instances[0].volume - 0.12) < 1e-10);
    player.duck(0.6, 650);
    env.tick(50);
    assert.ok(env.instances[0].volume <= 0.12 + 1e-10);
    player.set("battle", true, 0.2);
    assert.ok(env.instances[0].volume <= 0.06 + 1e-10);
    env.tick(1000);
    assert.equal(env.instances[0].volume, 0.2);
    env.visibility(true);
    assert.equal(env.instances[0].paused, true);
    assert.equal(env.frames.size, 0);
    player.set("danger", true, 0.2);
    await env.flush();
    assert.ok(env.instances.every((a) => a.paused));
    env.visibility(false);
    await env.flush();
    env.tick(1500);
    assert.equal(env.instances[1].paused, false);
    player.dispose();
    env.visibility(true);
    player.set("lobby", true, 0.2);
    await env.flush();
    assert.ok(env.instances.every((a) => a.paused));
    env.visibility(false);
    await env.flush();
    assert.equal(env.instances[2].paused, false);
    player.dispose();
  } finally {
    env.restore();
  }
});

test("rapid music changes and unavailable media never leave extra streams or throw", async () => {
  const env = fakeAudioEnvironment();
  try {
    const player = new MusicDirector();
    player.set("lobby", true, 0.2);
    player.unlock();
    await env.flush();
    env.rejectNext();
    player.set("battle", true, 0.2);
    await env.flush();
    env.tick(2000);
    assert.equal(env.instances[0].paused, false);
    assert.equal(env.instances[0].volume, 0.2);
    player.set("victory", true, 0.3);
    player.set("defeat", true, 0.3);
    player.set("tutorial", true, 0.3);
    await env.flush();
    env.tick(1500);
    assert.equal(env.instances.filter((a) => !a.paused).length, 1);
    assert.equal(env.instances[2].loop, false);
    player.set("tutorial", true, NaN);
    assert.equal(env.instances.at(-1)!.volume, 0.16);
    player.dispose();
    assert.equal(env.frames.size, 0);
    assert.ok(env.instances.every((a) => a.paused));
  } finally {
    env.restore();
  }
});

test("six runtime music files match their manifest and declared source originals", () => {
  const manifest = JSON.parse(
    readFileSync("public/assets/audio/music/score-manifest.json", "utf8"),
  );
  assert.equal(manifest.tracks.length, 6);
  for (const t of manifest.tracks) {
    const bytes = readFileSync(`public${t.file}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), t.sha256);
    assert.ok(t.duration > 2);
    assert.ok(bytes.length > 1000);
    if (t.peak !== undefined) assert.ok(t.peak > 0 && t.peak <= 1);
    if (t.rms !== undefined) assert.ok(t.rms > 0 && t.rms < 1);
    if (t.originals !== undefined) {
      assert.ok(Array.isArray(t.originals) && t.originals.length > 0);
      for (const original of t.originals) {
        assert.equal(
          createHash("sha256")
            .update(readFileSync(original.file))
            .digest("hex"),
          original.sha256,
        );
      }
    } else {
      assert.ok(existsSync(`assets/music-masters/${t.id}.mid`));
      assert.ok(existsSync(`assets/music-masters/${t.id}.score.json`));
    }
  }
});
