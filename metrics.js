export const DISTANCE = 800;
export const SHOOT_TARGET = 30;

export function parseTime(value) {
  const raw = String(value ?? '').trim();
  if (/^\d+(?:,\d+)?$/.test(raw)) return Number(raw.replace(',', '.'));
  if (!/^\d+\.[0-5]?\d(?:,\d+)?$/.test(raw)) return null;
  const [minutes, seconds] = raw.split('.');
  return Number(minutes) * 60 + Number(seconds.replace(',', '.'));
}

export function inputTime(value) {
  if (value == null) return '';
  const [whole, fraction] = String(value).split('.');
  const seconds = Number(whole);
  const duration = seconds >= 60
    ? `${Math.floor(seconds / 60)}.${String(seconds % 60).padStart(2, '0')}`
    : whole;
  return fraction ? `${duration},${fraction}` : duration;
}

export function formatTime(seconds) {
  const rounded = Math.round(Math.abs(seconds) * 10) / 10;
  return inputTime(rounded) + (rounded < 60 ? ' s' : '');
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

const percent = new Intl.NumberFormat('fr-FR', {style: 'percent', maximumFractionDigits: 1});

export function shotAccuracy({hits, attempts}) {
  return attempts > 0 ? percent.format(hits / attempts) : '—';
}

export function totalShotAccuracy(shots) {
  if (shots.some(shot => !Number.isSafeInteger(shot.attempts) || shot.attempts < shot.hits)) return '—';
  return shotAccuracy({
    hits: shots.reduce((sum, shot) => sum + shot.hits, 0),
    attempts: shots.reduce((sum, shot) => sum + shot.attempts, 0)
  });
}
