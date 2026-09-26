import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SoundEffects,
  soundsForCue,
  soundsForBatch,
} from "../src/sound-effects";
import type { BattleCue, Command, MatchState } from "../src/game/types";
import {
  createMatch,
  applyCommand,
  defaultLoadout,
  exampleOffers,
  getView,
} from "../src/game/index";
import { fakeAudioEnvironment } from "./helpers/fake-audio";
const cue = (
  sequence: number,
  kind: BattleCue["kind"],
  extra: Partial<BattleCue> = {},
): BattleCue => ({ id: `m:${sequence}`, sequence, kind, ...extra });

test("semantic cues schedule attack, impact, retirement and education audio at the animation beats", () => {
  assert.deepEqual(
    soundsForCue(cue(1, "attack")).map((s) => [s.file, s.delay]),
    [
      ["attack", 40],
      ["damage", 220],
    ],
  );
  assert.equal(soundsForCue(cue(2, "retire"))[0].delay, 0);
  assert.equal(
    soundsForCue(cue(3, "primary_skill", { effectId: "jlu_signin" }))[0].file,
    "jlu_collect",
  );
  assert.equal(
    soundsForCue(cue(4, "primary_skill", { effectId: "jlu_ultimate" }))[0].file,
    "jlu_ultimate",
  );
  assert.equal(soundsForCue(cue(5, "secondary_skill"))[0].file, "graduation");
  assert.equal(
    soundsForCue(cue(6, "status", { effectId: "jlu_signin" })).length,
    0,
  );
  assert.equal(
    soundsForCue(cue(7, "result", { targetId: "p1" }), "p1")[0].file,
    "win",
  );
});

test("each event is heard once across snapshots, duplicates, stale updates and mute changes", async () => {
  const env = fakeAudioEnvironment(),
    ducks: number[] = [];
  try {
    const sounds = new SoundEffects((level) => ducks.push(level));
    sounds.set(true, 0.5);
    sounds.consume("m", [cue(1, "draw")]);
    env.tick(1000);
    assert.equal(env.instances.length, 0);
    const attack = cue(2, "attack");
    sounds.consume("m", [cue(1, "draw"), attack, attack]);
    sounds.consume("m", [attack]);
    sounds.consume("m", [cue(1, "draw")]);
    env.tick(39);
    assert.equal(env.instances.length, 0);
    env.tick(1);
    assert.equal(env.instances.length, 1);
    env.tick(310);
    assert.equal(env.instances.length, 2);
    assert.deepEqual(ducks, [0.55, 0.4]);
    sounds.set(false, 0.5);
    assert.ok(env.instances.every((a) => a.paused));
    sounds.consume("m", [cue(3, "heal")]);
    sounds.set(true, 0.5);
    sounds.consume("m", [cue(3, "heal")]);
    env.tick(1000);
    assert.equal(env.instances.length, 2);
    sounds.consume("new-match", [cue(1, "attack")]);
    env.tick(1000);
    assert.equal(env.instances.length, 2);
    sounds.dispose();
    await env.flush();
  } finally {
    env.restore();
  }
});

test("SFX concurrency is capped, hidden tabs stop tails and timers, and playback failures stay quiet", async () => {
  const env = fakeAudioEnvironment();
  try {
    const sounds = new SoundEffects();
    sounds.set(true, 0.8);
    sounds.consume("m", []);
    sounds.consume(
      "m",
      Array.from({ length: 9 }, (_, i) => cue(i + 1, "draw")),
    );
    env.tick(0);
    assert.equal(env.instances.filter((a) => !a.paused).length, 1);
    sounds.set(true, 0.25);
    assert.ok(
      env.instances.filter((a) => !a.paused).every((a) => a.volume === 0.25),
    );
    sounds.consume("m", [cue(10, "attack")]);
    env.visibility(true);
    env.tick(1000);
    assert.ok(env.instances.every((a) => a.paused));
    assert.equal(env.timers.size, 0);
    sounds.consume("m", [cue(11, "heal")]);
    env.visibility(false);
    sounds.consume("m", [cue(11, "heal")]);
    env.tick(1000);
    assert.equal(env.instances.length, 1);
    env.rejectNext();
    sounds.consume("m", [cue(12, "draw")]);
    env.tick(0);
    await env.flush();
    assert.ok(env.instances.every((a) => a.paused));
    sounds.consume("m", [cue(13, "attack")]);
    sounds.dispose();
    env.tick(1000);
    assert.equal(env.instances.length, 2);
    assert.equal(env.timers.size, 0);
  } finally {
    env.restore();
  }
});

function engineGame() {
  const a = defaultLoadout("a", "甲"),
    b = defaultLoadout("b", "乙");
  a.primaryId = "H10";
  a.offers = structuredClone(exampleOffers.slice(0, 3));
  const state = createMatch([a, b], 41, { skipSetup: true });
  state.round = 6;
  state.activePlayerId = "a";
  state.topic = "life";
  for (const p of state.players) {
    p.hand = [];
    p.ownTurn = 1;
    p.timeRemaining = 8;
  }
  return state;
}
function execute(state: MatchState, command: Command, actor = "a") {
  const result = applyCommand(state, actor, command);
  assert.equal(result.error, undefined);
  return result.state;
}
function play(state: MatchState, id: string, actor = "a") {
  state.activePlayerId = actor;
  const player = state.players.find((p) => p.id === actor)!;
  player.timeRemaining = 8;
  const cardId = `sound-${state.nextId++}`;
  player.hand.push({
    id: cardId,
    definitionId: id,
    kind: "card",
    taxes: [],
    knownTo: [],
  });
  return execute(state, { type: "PLAY_CARD", cardId }, actor);
}
const filenames = (instances: { src: string }[]) =>
  instances.map((a) => a.src.split("?")[0].split("/").at(-1));

test("ending sound plays once at the fracture beat after the final attack, with both perspectives and a quiet draw", () => {
 const cues=[cue(1,"attack"),cue(2,"result",{effectId:"winner",targetId:"a"})];
 for(const [selfId,file] of [["a","win"],["b","lose"]]){
  const groups=soundsForBatch(cues,selfId);
  assert.equal(groups.length,1);assert.equal(groups[0].duration,850);
  assert.deepEqual(groups[0].sounds.map(s=>[s.file,s.delay]),[["attack",0],["damage",95],[file,350]]);
 }
 assert.deepEqual(soundsForBatch([cue(3,"result",{effectId:"draw"})],"a")[0].sounds,[]);
 assert.equal(soundsForBatch(cues,"a",true)[0].duration,100);
 const env=fakeAudioEnvironment();
 try{
  const sounds=new SoundEffects();sounds.set(true,.5);sounds.consume("m",[]);sounds.consume("m",cues,"a");
  env.tick(349);assert.deepEqual(filenames(env.instances),["attack.wav","damage.wav"]);
  env.tick(1);assert.deepEqual(filenames(env.instances),["attack.wav","damage.wav","win.wav"]);
  sounds.consume("m",cues,"a");env.tick(3000);assert.equal(env.instances.length,3);sounds.dispose();
 }finally{env.restore()}
});

test("real simultaneous combat death produces one impact and shared retirement at the 220 ms contact", () => {
  let state = engineGame();
  state = play(state, "N01");
  state = play(state, "N01", "b");
  state.activePlayerId = "a";
  for (const p of state.players) {
    p.board[0].deployedTurn = 0;
    p.board[0].damage = 1;
  }
  const before = state.eventSequence;
  state = execute(state, {
    type: "ATTACK",
    cardId: state.players[0].board[0].id,
    targetId: state.players[1].board[0].id,
  });
  const cues = getView(state, "a").visualCues.filter(
    (c) => c.sequence > before,
  );
  assert.equal(cues.filter((c) => c.kind === "attack").length, 1);
  assert.equal(cues.filter((c) => c.kind === "retire").length, 2);
  const groups = soundsForBatch(cues, "a");
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].sounds.map((s) => [s.file, s.delay]),
    [
      ["attack", 40],
      ["damage", 220],
      ["optimization", 220],
    ],
  );
  const env = fakeAudioEnvironment();
  try {
    const sounds = new SoundEffects();
    sounds.set(true, 0.5);
    sounds.consume(state.matchId, []);
    sounds.consume(state.matchId, cues, "a");
    env.tick(150);
    assert.deepEqual(filenames(env.instances), ["attack.wav"]);
    env.tick(69);assert.deepEqual(filenames(env.instances), ["attack.wav"]);
    env.tick(1);
    assert.deepEqual(filenames(env.instances), [
      "attack.wav",
      "damage.wav",
      "optimization.wav",
    ]);
    sounds.consume(state.matchId, cues, "a");
    env.tick(1000);
    assert.equal(env.instances.length, 3);
    sounds.dispose();
  } finally {
    env.restore();
  }
});

test("real eight-target action coalesces eight damage and retirement cues into one impact and one exit layer", () => {
  let state = engineGame();
  for (const actor of ["a", "b"])
    for (let i = 0; i < 4; i++) state = play(state, "N01", actor);
  const before = state.eventSequence;
  state = play(state, "N19");
  const cues = getView(state, "a").visualCues.filter(
    (c) => c.sequence > before,
  );
  assert.equal(cues.filter((c) => c.kind === "damage").length, 8);
  assert.equal(cues.filter((c) => c.kind === "retire").length, 8);
  const groups = soundsForBatch(cues, "a");
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].sounds.map((s) => [s.file, s.delay]),
    [
      ["card_pick", 0],
      ["damage", 160],
      ["optimization", 160],
    ],
  );
});

test("real JLU ultimate followed by an eight-target action keeps its charge and follows the visual group boundary", () => {
  let state = engineGame();
  state = execute(state, { type: "DEPLOY_OFFER", offerId: "E01" });
  for (let i = 0; i < 3; i++) state = play(state, "N01");
  for (let i = 0; i < 4; i++) state = play(state, "N01", "b");
  state.activePlayerId = "a";
  state.players[0].timeRemaining = 8;
  state.players[0].education.jluSignins = 2;
  const before = state.eventSequence;
  state = execute(state, {
    type: "USE_PRIMARY",
    targetId: state.players[0].board[0].id,
  });
  state = play(state, "N19");
  const cues = getView(state, "a").visualCues.filter(
      (c) => c.sequence > before,
    ),
    groups = soundsForBatch(cues, "a");
  assert.equal(groups.length, 2);
  assert.equal(cues.filter((c) => c.kind === "damage").length, 8);
  assert.deepEqual(
    groups[0].sounds.map((s) => s.file),
    ["jlu_ultimate"],
  );
  assert.equal(groups[1].sounds.filter((s) => s.file === "damage").length, 1);
  const env = fakeAudioEnvironment();
  try {
    const sounds = new SoundEffects();
    sounds.set(true, 0.5);
    sounds.consume(state.matchId, []);
    sounds.consume(state.matchId, cues, "a");
    env.tick(0);
    assert.deepEqual(filenames(env.instances), ["jlu_ultimate.wav"]);
    env.tick(groups[0].duration-1);
    assert.equal(env.instances[0].paused, false);
    assert.equal(env.instances.length, 1);
    env.tick(1);
    assert.deepEqual(filenames(env.instances), [
      "jlu_ultimate.wav",
      "card_pick.wav",
    ]);
    env.tick(groups[1].duration);
    assert.equal(
      filenames(env.instances).filter((file) => file === "damage.wav").length,
      1,
    );
    assert.equal(env.instances.filter((a) => !a.paused).length, 4);
    sounds.dispose();
  } finally {
    env.restore();
  }
});

test("crowded aftermath preserves the skill charge and pending audio keeps only the newest three motion groups", () => {
  const env = fakeAudioEnvironment();
  try {
    const sounds = new SoundEffects();
    sounds.set(true, 0.5);
    sounds.consume("m", []);
    sounds.consume("m", [
      cue(1, "primary_skill", { effectId: "jlu_ultimate" }),
      cue(2, "draw"),
      cue(3, "status", { effectId: "age" }),
      cue(4, "damage"),
      cue(5, "retire"),
      cue(6, "heal"),
    ]);
    env.tick(510);
    assert.equal(env.instances.filter((a) => !a.paused).length, 4);
    assert.equal(filenames(env.instances)[0], "jlu_ultimate.wav");
    assert.equal(env.instances[0].paused, false);
    sounds.consume(
      "m",
      Array.from({ length: 8 }, (_, i) => cue(i + 7, "attack")),
    );
    env.tick(5000);
    assert.equal(
      filenames(env.instances).filter((file) => file === "attack.wav").length <=
        3,
      true,
    );
    // Released audio clears its src, so count all created clips after the six-layer first group.
    assert.equal(env.instances.length, 12);
    assert.equal(env.timers.size, 0);
    sounds.dispose();
  } finally {
    env.restore();
  }
});
