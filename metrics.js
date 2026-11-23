export const DISTANCE = 800;
export const SHOOT_TARGET = 30;

export function parseTime(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (!/^\d+:[0-5]?\d(?:\.\d+)?$/.test(raw)) return null;
  const [minutes, seconds] = raw.split(':').map(Number);
  return minutes * 60 + seconds;
}

export function formatTime(seconds) {
  const tenths = Math.round(Math.abs(seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600 / 10).toLocaleString('fr-FR', {maximumFractionDigits: 1});
  return minutes ? `${minutes}:${tenths % 600 < 100 ? '0' : ''}${rest}` : `${rest} s`;
}

export function analyse(reference, result) {
  const shooting = result.shots.reduce((sum, shot) => sum + shot.time, 0);
  const hits = result.shots.reduce((sum, shot) => sum + shot.hits, 0);
  const running = result.total - shooting;
  const target = reference > 0 ? 4 * (reference + SHOOT_TARGET) : null;
  const speed = seconds => DISTANCE * 3.6 / seconds;
  return { shooting, hits, running, target, runningSpeed: speed(running),
    eventSpeed: speed(result.total), targetSpeed: target ? speed(target) : null,
    timeGap: target ? result.total - target : null,
    shotGap: result.shots[3].time - result.shots[0].time };
}
