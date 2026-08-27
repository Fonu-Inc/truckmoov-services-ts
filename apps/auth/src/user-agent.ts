/**
 * A best-effort read of "browser and platform" from a raw user-agent string —
 * enough to show "Chrome 120" or "Safari iOS" on the login history table.
 *
 * This is not device fingerprinting and does not try to be exhaustive; a
 * string it cannot place returns "Unknown", which is the honest answer for a
 * header any client can send as anything.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent?.trim()) return 'Unknown';

  const platform = detectPlatform(userAgent);
  const browser = detectBrowser(userAgent);

  if (browser && platform) return `${browser} ${platform}`;
  if (browser) return browser;
  if (platform) return platform;
  return 'Unknown';
}

function detectBrowser(userAgent: string): string | null {
  const edge = userAgent.match(/Edg\/(\d+)/);
  if (edge) return `Edge ${edge[1]}`;

  const chrome = userAgent.match(/Chrome\/(\d+)/);
  // Chrome's UA token also appears in Edge and most Chromium-based browsers,
  // so it is checked after the more specific ones above.
  if (chrome && !userAgent.includes('OPR/')) return `Chrome ${chrome[1]}`;

  const firefox = userAgent.match(/Firefox\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;

  const opera = userAgent.match(/OPR\/(\d+)/);
  if (opera) return `Opera ${opera[1]}`;

  // Safari's own UA also contains "Version/" ahead of "Safari/", and its
  // token appears in many other UAs too, so it is checked last.
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    const version = userAgent.match(/Version\/(\d+)/);
    return version ? `Safari ${version[1]}` : 'Safari';
  }

  return null;
}

function detectPlatform(userAgent: string): string | null {
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Mac OS X')) return 'macOS';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Linux')) return 'Linux';
  return null;
}
