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

export function grade(student, metrics) {
  const {result, runningScale, investment} = student;
  const offset = runningScale === 'girls' ? 1 : 0;
  const speed = ['girls', 'boys'].includes(runningScale)
    ? [9, 10.5, 12, 13.5, 15].filter(threshold => metrics.runningSpeed >= threshold - offset).length * 0.6
    : null;
  const delay = metrics.target ? metrics.timeGap / metrics.target : null;
  const objective = delay === null ? null
    : [0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.48].filter(threshold => delay <= threshold + 1e-10).length;
  const countsKnown = result.shots.every(shot => Number.isSafeInteger(shot.attempts) && shot.attempts >= shot.hits);
  const attempts = result.shots.reduce((sum, shot) => sum + (shot.attempts ?? 0), 0);
  const accuracy = countsKnown ? (attempts ? 4 * metrics.hits / attempts : 0) : null;
  const shootingTime = metrics.hits >= 12
    ? [120, 135, 150, 165].filter(limit => metrics.shooting <= limit + 1e-8).length * 0.5
    : 0;
  const parts = [speed, objective, accuracy, shootingTime];
  const subtotal = parts.includes(null) ? null : parts.reduce((sum, points) => sum + points, 0);
  const total = subtotal !== null && investment != null ? subtotal + investment : null;
  return {speed, objective, delay, accuracy, shootingTime, subtotal, total};
}
