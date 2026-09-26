/** Keep static Pages files and the authoritative game service on their own hosts. */
export interface DeploymentConfig { basePath?: string; apiBaseUrl?: string }

export function createDeploymentUrls({basePath = '/', apiBaseUrl = ''}: DeploymentConfig = {}) {
  const base = `/${basePath.trim().replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  if (/[?#\\]/.test(base) || base.includes('://') || base.split('/').some(part => part === '..' || part === '.')) {
    throw new Error('VITE_BASE_PATH must be an absolute site path, for example /offer-battle/');
  }
  let service = apiBaseUrl.trim().replace(/\/+$/, '');
  if (service) {
    const parsed = new URL(service);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('VITE_API_BASE_URL must be an HTTP(S) service URL without credentials, query or fragment');
    }
    service = parsed.href.replace(/\/+$/, '');
  }
  const external = (path: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path);
  function publicUrl(path: string) {
    if (!path || external(path) || path.startsWith('#')) return path;
    if (base !== '/' && path.startsWith(base)) return path;
    return base + path.replace(/^\/+/, '');
  }
  function apiUrl(path: string) {
    if (!path.startsWith('/api/')) throw new Error('Game API requests must use a /api/ path');
    return service + path;
  }
  function artUrl(path: string) {
    return path.startsWith('/api/art/') ? apiUrl(path) : publicUrl(path);
  }
  function webSocketUrl(roomId: string, token: string, origin: string) {
    const url = new URL(`${service || origin}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token);
    url.searchParams.set('roomId', roomId);
    return url.href;
  }
  function invitationUrl(roomCode: string, origin: string) {
    const url = new URL(base, origin);
    url.searchParams.set('room', roomCode);
    return url.href;
  }
  return {base, publicUrl, apiUrl, artUrl, webSocketUrl, invitationUrl};
}

// Node unit tests have no Vite environment; the same-origin local defaults remain usable.
export const {publicUrl, apiUrl, artUrl, webSocketUrl, invitationUrl} = createDeploymentUrls({
  basePath: import.meta.env?.BASE_URL,
  apiBaseUrl: import.meta.env?.VITE_API_BASE_URL,
});
