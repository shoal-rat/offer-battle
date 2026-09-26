import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const publicRoot = path.join(root, "public");
const errors: string[] = [];
function readManifest(relative: string): any {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  } catch {
    errors.push(`${relative}: missing or malformed manifest`);
    return {};
  }
}
function checkFile(
  id: string,
  relative: unknown,
  base: string,
  hash?: unknown,
): boolean {
  const before = errors.length;
  if (typeof relative !== "string" || !relative) {
    errors.push(`${id}: file path missing`);
    return false;
  }
  const file = path.resolve(
    base,
    "." + path.sep + relative.replace(/^\/+/, ""),
  );
  if (!file.startsWith(base + path.sep)) {
    errors.push(`${id}: path outside asset root`);
    return false;
  }
  let bytes: Buffer;
  try {
    // Resolve symlinks before reading so malformed manifests cannot inspect another directory.
    if (!fs.realpathSync(file).startsWith(base + path.sep)) {
      errors.push(`${id}: resolved path outside asset root`);
      return false;
    }
    if (!fs.statSync(file).isFile()) throw Error("not file");
    bytes = fs.readFileSync(file);
  } catch {
    errors.push(`${id}: file missing`);
    return false;
  }
  if (!bytes.length) errors.push(`${id}: empty`);
  if (
    hash !== undefined &&
    (!/^[a-f0-9]{64}$/.test(String(hash)) ||
      crypto.createHash("sha256").update(bytes).digest("hex") !== hash)
  )
    errors.push(`${id}: checksum mismatch`);
  const extension = path.extname(file).toLowerCase();
  if (
    extension === ".webp" &&
    (bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP")
  )
    errors.push(`${id}: invalid WebP signature`);
  if (
    extension === ".wav" &&
    (bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WAVE")
  )
    errors.push(`${id}: invalid WAV signature`);
  if (extension === ".mid" && bytes.toString("ascii", 0, 4) !== "MThd")
    errors.push(`${id}: invalid MIDI signature`);
  if (extension === ".mp4" && bytes.toString("ascii", 4, 8) !== "ftyp")
    errors.push(`${id}: invalid MP4 signature`);
  if (
    extension === ".mp3" &&
    bytes.toString("ascii", 0, 3) !== "ID3" &&
    !(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
    errors.push(`${id}: invalid MP3 signature`);
  if (extension === ".svg" && !bytes.toString("utf8").startsWith("<svg"))
    errors.push(`${id}: invalid SVG source`);
  if (extension === ".json") {
    try {
      JSON.parse(bytes.toString("utf8"));
    } catch {
      errors.push(`${id}: malformed JSON`);
    }
  }
  return errors.length === before;
}
function requireHash(id: string, hash: unknown) {
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
    errors.push(`${id}: SHA-256 missing or invalid`);
}

const spec = readManifest("spec/art/asset_manifest.json");
const manifest = readManifest("public/assets/manifest.json");
if (!Array.isArray(spec.assets) || !spec.assets.length)
  errors.push("art specification: asset list missing or empty");
if (
  !manifest.assets ||
  typeof manifest.assets !== "object" ||
  Array.isArray(manifest.assets)
)
  errors.push("art manifest: asset registry missing or invalid");
const seen = new Set<string>();
let verified = 0;
for (const slot of spec.assets || []) {
  const a = manifest.assets?.[slot.id];
  if (!a) {
    errors.push(`${slot.id}: absent in produced manifest`);
    continue;
  }
  const before = errors.length;
  if (a.id !== slot.id) errors.push(`${slot.id}: registered id mismatch`);
  if (seen.has(a.id)) errors.push(`${a.id}: duplicate`);
  seen.add(a.id);
  requireHash(a.id, a.sha256);
  checkFile(a.id, a.url, publicRoot, a.sha256);
  if (a.parent && !manifest.assets[a.parent])
    errors.push(`${a.id}: parent not registered`);
  if (errors.length === before) verified++;
}

const score = readManifest("public/assets/audio/music/score-manifest.json");
const musicIds = ["lobby", "tutorial", "battle", "danger", "victory", "defeat"];
const tracks: any[] = Array.isArray(score.tracks) ? score.tracks : [];
const music = {
  required: musicIds.length,
  registered: tracks.length,
  verified: 0,
  originalsVerified: 0,
};
let usesLegacyMusicSources = false;
for (const id of musicIds) {
  const matches = tracks.filter((t) => t.id === id);
  if (matches.length !== 1) {
    errors.push(`music:${id}: expected exactly one manifest entry`);
    continue;
  }
  const track = matches[0],
    before = errors.length;
  requireHash(`music:${id}`, track.sha256);
  checkFile(`music:${id}`, track.file, publicRoot, track.sha256);
  if (track.originals !== undefined) {
    if (!Array.isArray(track.originals) || !track.originals.length)
      errors.push(`music:${id}: original sources must be a nonempty list`);
    else
      for (const [index, original] of track.originals.entries()) {
        const originalId = `music-original:${id}:${index + 1}`;
        const sourceErrors = errors.length;
        requireHash(originalId, original?.sha256);
        checkFile(originalId, original?.file, root, original?.sha256);
        if (errors.length === sourceErrors) music.originalsVerified++;
      }
  } else {
    // Earlier procedural prototypes retain WAV/MIDI/score sources. Generated
    // recordings declare their own originals and must not imply a MIDI score.
    usesLegacyMusicSources = true;
    for (const extension of ["wav", "mid", "score.json"]) {
      if (
        checkFile(
          `music-original:${id}.${extension}`,
          `assets/music-masters/${id}.${extension}`,
          root,
        )
      )
        music.originalsVerified++;
    }
  }
  if (errors.length === before) music.verified++;
}
if (tracks.length !== musicIds.length)
  errors.push("music: expected six score tracks");
if (usesLegacyMusicSources)
  checkFile("music:composition-source", "scripts/compose_music.py", root);

const animation = readManifest("public/assets/animations/manifest.json");
const animations = {
  required: 1,
  registered: animation.id ? 1 : 0,
  verified: 0,
  originalsVerified: 0,
};
{
  const before = errors.length;
  if (!animation.id) errors.push("animation: missing id");
  requireHash(`animation:${animation.id || "unknown"}`, animation.sha256);
  checkFile(
    `animation:${animation.id || "unknown"}`,
    animation.runtime,
    publicRoot,
    animation.sha256,
  );
  if (
    checkFile(
      `animation-original:${animation.id || "unknown"}`,
      animation.original,
      root,
    )
  )
    animations.originalsVerified++;
  if (errors.length === before) animations.verified++;
}

console.log(
  JSON.stringify(
    {
      required: spec.assets?.length || 0,
      registered: Object.keys(manifest.assets || {}).length,
      verified,
      music,
      animations,
      totalRuntimeVerified: verified + music.verified + animations.verified,
      originalsVerified: music.originalsVerified + animations.originalsVerified,
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) process.exitCode = 1;
