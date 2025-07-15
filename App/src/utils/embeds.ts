// Central utility for building all Discord embed payloads for Socket notifications

export function buildEmbed({
  title,
  description,
  color = 0x8e7cf0,
  fields = [],
  footer = 'Socket',
  timestamp = new Date().toISOString(),
  url,
  thumbnail,
  image,
} : {
  title: string,
  description?: string,
  color?: number,
  fields?: { name: string, value: string, inline?: boolean }[],
  footer?: string,
  timestamp?: string,
  url?: string,
  thumbnail?: string,
  image?: string,
}) {
  const embed: any = {
    title,
    color,
    fields,
    footer: { text: footer },
    timestamp,
  };
  if (description) embed.description = description;
  if (url) embed.url = url;
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  if (image) embed.image = { url: image };
  return embed;
}

// Helper for a simple field
export function field(name: string, value: string, inline = false) {
  return { name, value, inline };
}

// PIN notification embeds
export function pinEmbed({ roomId, success, time }: { roomId: string, success: boolean, time: Date }) {
  return buildEmbed({
    title: success ? '🔓 Socket: PIN Entered' : '🔒 Socket: Incorrect PIN',
    color: success ? 0x6fe07b : 0xff4f4f,
    description: success
      ? `A user entered the correct PIN for room **${roomId}**.`
      : `A user attempted to enter an incorrect PIN for room **${roomId}**.`,
    fields: [
      field('Room', roomId, true),
      field('Result', success ? 'Correct' : 'Incorrect', true),
      field('Timestamp', time.toLocaleString(), false),
    ],
  });
}

// Presence notification embeds
export function presenceEmbed({ roomId, event, time, joinTime, duration }: {
  roomId: string,
  event: 'join' | 'leave',
  time: Date,
  joinTime?: Date,
  duration?: string,
}) {
  const isJoin = event === 'join';
  const fields = [
    field('Room', roomId, true),
    field('Event', isJoin ? 'User Joined' : 'User Left', true),
    field('Timestamp', time.toLocaleString(), false),
  ];
  if (!isJoin && joinTime && duration) {
    fields.push(field('Joined at', joinTime.toLocaleString(), true));
    fields.push(field('Session Duration', duration, true));
  }
  return buildEmbed({
    title: isJoin ? '👤 Socket: User Joined Room' : '🚪 Socket: User Left Room',
    color: isJoin ? 0x6fe07b : 0xff4f4f,
    fields,
  });
}

// App leave embed
export function appLeaveEmbed({ url, leftTime, joinTime, duration }: {
  url: string,
  leftTime: Date,
  joinTime?: Date,
  duration?: string,
}) {
  const fields = [
    field('URL', url, false),
    field('Left at', leftTime.toLocaleString(), true),
  ];
  if (joinTime && duration) {
    fields.push(field('Joined at', joinTime.toLocaleString(), true));
    fields.push(field('Session Duration', duration, true));
  }
  return buildEmbed({
    title: '🚪 Socket: User Left App',
    color: 0xffb347,
    fields,
  });
}
