import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeploymentUrls} from '../src/deployment';
import {heroArt,resolveAsset} from '../src/assets';

test('local defaults keep existing API, media and manifest fallback paths', () => {
  const urls=createDeploymentUrls();
  assert.equal(urls.base,'/');
  assert.equal(urls.apiUrl('/api/rooms/room-1'),'/api/rooms/room-1');
  assert.equal(urls.publicUrl('/assets/manifest.json'),'/assets/manifest.json');
  assert.equal(urls.artUrl('/api/art/portrait.webp'),'/api/art/portrait.webp');
  assert.equal(heroArt('H01'),'/assets/hero-H01.webp');
  assert.equal(resolveAsset('missing','/assets/fallback.svg'),'/assets/fallback.svg');
  const socket=new URL(urls.webSocketUrl('r 1','a+b &c','http://127.0.0.1:5174'));
  assert.equal(socket.origin,'ws://127.0.0.1:5174');
  assert.equal(socket.pathname,'/ws');
  assert.equal(socket.searchParams.get('token'),'a+b &c');
  assert.equal(socket.searchParams.get('roomId'),'r 1');
});

test('Pages assets stay in their subfolder while API and uploads use the remote service', () => {
  const urls=createDeploymentUrls({basePath:'/offer-battle/',apiBaseUrl:'https://api.example.test/'});
  assert.equal(urls.apiUrl('/api/rooms/a/replay?matchId=b'),'https://api.example.test/api/rooms/a/replay?matchId=b');
  for (const file of ['manifest.json','hero-H01.webp','education/h01/badge.svg','audio/music/battle.mp3?rev=2','audio/sfx/attack.wav?rev=2','animations/alumni-burst.mp4']) {
    assert.equal(urls.publicUrl(`/assets/${file}`),`/offer-battle/assets/${file}`);
  }
  assert.equal(urls.artUrl('/api/art/custom.webp'),'https://api.example.test/api/art/custom.webp');
  assert.equal(urls.artUrl('/assets/offer-O01.webp'),'/offer-battle/assets/offer-O01.webp');
  assert.equal(urls.artUrl('/offer-battle/assets/offer-O01.webp'),'/offer-battle/assets/offer-O01.webp');
});

test('remote WebSocket uses WSS, preserves service prefix and carries encoded membership', () => {
  const urls=createDeploymentUrls({basePath:'offer-battle',apiBaseUrl:'https://api.example.test/game/'});
  const socket=new URL(urls.webSocketUrl('r/with space','opaque+secret/?','https://shoal-rat.github.io'));
  assert.equal(socket.origin,'wss://api.example.test');
  assert.equal(socket.pathname,'/game/ws');
  assert.equal(socket.searchParams.get('roomId'),'r/with space');
  assert.equal(socket.searchParams.get('token'),'opaque+secret/?');
  assert.equal(urls.apiUrl('/api/session'),'https://api.example.test/game/api/session');
});

test('invitations open the Pages game folder and never expose the backend session', () => {
  const urls=createDeploymentUrls({basePath:'/offer-battle/',apiBaseUrl:'https://api.example.test'});
  const invite=new URL(urls.invitationUrl('AB12CD','https://shoal-rat.github.io'));
  assert.equal(invite.href,'https://shoal-rat.github.io/offer-battle/?room=AB12CD');
  assert.deepEqual([...invite.searchParams.keys()],['room']);
  assert.equal(createDeploymentUrls().invitationUrl('CODE','http://localhost:5173'),'http://localhost:5173/?room=CODE');
});

test('external manifest resources and data or blob images are not prefixed', () => {
  const urls=createDeploymentUrls({basePath:'/offer-battle/'});
  for (const path of ['https://cdn.example.test/hero.webp','//cdn.example.test/frame.svg','data:image/png;base64,aabb','blob:https://example.test/id','#symbol']) {
    assert.equal(urls.publicUrl(path),path);
    assert.equal(urls.artUrl(path),path);
  }
  assert.equal(urls.publicUrl('assets/frame.svg'),'/offer-battle/assets/frame.svg');
});

test('misconfigured deployment URLs fail early rather than leaking API credentials', () => {
  for (const basePath of ['https://example.test/game','/game?token=x','/game#fragment','/game/../escape']) {
    assert.throws(()=>createDeploymentUrls({basePath}));
  }
  for (const apiBaseUrl of ['//example.test','ftp://example.test','https://user:password@example.test','https://example.test?token=x','https://example.test#fragment']) {
    assert.throws(()=>createDeploymentUrls({apiBaseUrl}));
  }
  const urls=createDeploymentUrls({apiBaseUrl:'https://api.example.test'});
  assert.throws(()=>urls.apiUrl('https://unrelated.test/api/session'));
});
