import {restoreTraining} from './sessions.js?v=34';

const format = 'biathlon-eps-class';
const version = 1;

export function backupClass(group) {
  return JSON.stringify({format, version, class: group}, null, 2);
}

export function readClassBackup(source, newId) {
  const {format: fileFormat, version: fileVersion, class: group} = JSON.parse(source.replace(/^\uFEFF/, '')) ?? {};
  if (fileFormat !== format || fileVersion !== version || !name(group?.name) || !Array.isArray(group.students)) {
    throw new Error('Choisis un fichier de sauvegarde Biathlon EPS valide.');
  }
  const restoredGroup = {id: newId(), name: group.name, students: group.students.map(student => {
    const {first, last, reference, runningScale, investment, result} = student ?? {};
    if (!name(first) || !name(last) || (reference != null && !positive(reference))
      || (runningScale != null && !['girls', 'boys'].includes(runningScale))
      || (investment != null && (!Number.isFinite(investment) || investment < 0 || investment > 4))
      || (result != null && !validResult(result))) {
      throw new Error('Une fiche élève de la sauvegarde contient des données invalides.');
    }
    const restored = {id: newId(), first, last, reference, runningScale, investment};
    if (result) {
      restored.result = {total: result.total, shots: result.shots.map(({time, hits, attempts}) => ({time, hits, attempts}))};
    }
    return restored;
  })};
  return restoreTraining(group, restoredGroup, newId);
}

const name = value => typeof value === 'string' && value.trim().length > 0;
const positive = value => Number.isFinite(value) && value > 0;
function validResult(result) {
  return positive(result.total) && Array.isArray(result.shots) && result.shots.length === 4
    && result.shots.every(shot => shot && positive(shot.time) && Number.isInteger(shot.hits)
      && shot.hits >= 0 && shot.hits <= 5 && (shot.attempts == null
        || (Number.isSafeInteger(shot.attempts) && shot.attempts >= shot.hits)))
    && result.total > result.shots.reduce((sum, shot) => sum + shot.time, 0);
}

const headers = ['Nom', 'Prénom', 'Vitesse hors tir / 5', 'Objectif individuel / 5',
  'Réussite au tir / 4', 'Temps au tir / 2', 'Investissement / 4', 'Note finale / 20'];
function csvCell(value) {
  if (Number.isFinite(value)) return String(Number(value.toFixed(2)));
  if (value == null) return '';
  const safe = /^\s*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function gradebookCsv(students, grades) {
  const rows = students.map((student, index) => {
    const mark = grades[index];
    return [student.last, student.first, mark?.speed, mark?.objective, mark?.accuracy,
      mark?.shootingTime, student.investment, mark?.total];
  });
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
