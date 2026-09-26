import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

test("generated soundtrack sources validate without MIDI claims and reject altered or missing originals", () => {
  const project = process.cwd(),
    root = fs.mkdtempSync(path.join(os.tmpdir(), "offer-manifest-test-"));
  const sha = (bytes: string | Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const write = (file: string, data: unknown) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      typeof data === "string" ? data : JSON.stringify(data),
    );
  };
  try {
    write("spec/art/asset_manifest.json", { assets: [{ id: "one" }] });
    write("public/assets/one.png", "fixture");
    write("public/assets/manifest.json", {
      assets: {
        one: { id: "one", url: "/assets/one.png", sha256: sha("fixture") },
      },
    });
    const tracks = [
      "lobby",
      "tutorial",
      "battle",
      "danger",
      "victory",
      "defeat",
    ].map((id) => {
      write(`public/assets/audio/music/${id}.mp3`, "ID3runtime");
      write(`assets/music-originals/${id}.mp3`, "ID3original");
      return {
        id,
        file: `/assets/audio/music/${id}.mp3`,
        sha256: sha("ID3runtime"),
        originals: [
          {
            file: `assets/music-originals/${id}.mp3`,
            sha256: sha("ID3original"),
          },
        ],
      };
    });
    const save = () =>
      write("public/assets/audio/music/score-manifest.json", { tracks });
    save();
    write("public/assets/animations/clip.mp4", "0000ftypvideo");
    write("assets/animation-originals/clip.mp4", "0000ftyporiginal");
    write("public/assets/animations/manifest.json", {
      id: "clip",
      runtime: "/assets/animations/clip.mp4",
      sha256: sha("0000ftypvideo"),
      original: "assets/animation-originals/clip.mp4",
    });
    const run = () => {
      const r = spawnSync(
        path.join(project, "node_modules/.bin/tsx"),
        [path.join(project, "scripts/check-assets.ts")],
        { cwd: root, encoding: "utf8" },
      );
      return { status: r.status, data: JSON.parse(r.stdout) };
    };
    const valid = run();
    assert.equal(valid.status, 0);
    assert.equal(valid.data.music.verified, 6);
    assert.equal(valid.data.music.originalsVerified, 6);
    assert.equal(fs.existsSync(path.join(root, "assets/music-masters")), false);
    tracks[0].originals[0].sha256 = "0".repeat(64);
    save();
    let result = run();
    assert.equal(result.status, 1);
    assert.ok(
      result.data.errors.includes("music-original:lobby:1: checksum mismatch"),
    );
    tracks[0].originals[0].sha256 = sha("ID3original");
    save();
    fs.unlinkSync(path.join(root, tracks[0].originals[0].file));
    result = run();
    assert.equal(result.status, 1);
    assert.ok(
      result.data.errors.includes("music-original:lobby:1: file missing"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
