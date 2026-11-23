import {analyse, formatTime, parseTime, SHOOT_TARGET} from './metrics.js';
import {readRoster} from './excel.js';

const KEY = 'biathlon-eps-classes-v1';
const screen = document.querySelector('#screen');
const status = document.querySelector('#status');
const data = load();
let view = 'classes';
let classId = data[0]?.id;
let studentId;
let editingId;
const resultDrafts = new Map();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function update(change, message) {
  const next = structuredClone(data);
  change(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    status.textContent = 'Enregistrement impossible sur cet appareil.';
    return false;
  }
  data.splice(0, data.length, ...next);
  status.textContent = message;
  return true;
}

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));
const currentClass = () => data.find(group => group.id === classId);
const currentStudent = () => currentClass()?.students.find(student => student.id === studentId);
const fullName = student => `${student.first} ${student.last}`;
const decimal = value => value.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const inputTime = value => value == null ? '' : String(value).replace('.', ',');
const signedTime = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatTime(value)}`;
const signedSpeed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${decimal(Math.abs(value))} km/h`;
const labelOption = (id, name, selected) => `<option value="${id}" ${selected ? 'selected' : ''}>${e(name)}</option>`;
const newId = () => crypto.randomUUID();

function classPicker() {
  if (!data.length) return '';
  const group = currentClass();
  const students = group.students;
  const selectStudent = view !== 'classes' && students.length;
  return `<section class="panel"><div class="grid">
    <label>Classe<select id="class-select">${data.map(item => labelOption(item.id, item.name, item.id === classId)).join('')}</select></label>
    ${selectStudent ? `<label>Élève<select id="student-select">${students.map(item => labelOption(item.id, fullName(item), item.id === studentId)).join('')}</select></label>` : ''}
  </div></section>`;
}

function classes() {
  const group = currentClass();
  const edited = group?.students.find(item => item.id === editingId);
  return `<section class="panel"><h2>Créer une classe</h2>
    <form id="new-class"><div class="grid"><label>Nom de la classe<input name="name" required maxlength="70" placeholder="Ex. 3e A"></label></div>
    <button class="primary">Créer la classe</button></form></section>
  ${classPicker()}
  ${group ? `<section class="panel"><h2>${edited ? 'Modifier un élève' : 'Ajouter un élève'}</h2>
    <form id="student-form"><div class="grid3">
    <label>Nom<input name="last" required maxlength="100" value="${e(edited?.last)}"></label>
    <label>Prénom<input name="first" required maxlength="100" value="${e(edited?.first)}"></label>
    <label>Référence sur 200 m<input name="reference" inputmode="decimal" value="${inputTime(edited?.reference)}" placeholder="Ex. 42,5"></label>
    </div><div class="actions"><button class="primary">${edited ? 'Enregistrer la modification' : 'Ajouter l’élève'}</button>
    ${edited ? '<button type="button" data-action="cancel">Annuler</button>' : ''}</div></form></section>
    <section class="panel"><h2>Importer depuis Excel</h2><p class="muted">Première feuille du fichier .xlsx. Colonnes Nom, Prénom et, si disponible, Référence 200 m.</p>
    <form id="import-form"><div class="grid"><label>Classeur Excel<input type="file" name="file" accept=".xlsx" required></label></div><div class="actions"><button class="primary">Importer dans ${e(group.name)}</button><a href="./modele-classe.xlsx" download>Modèle Excel</a></div></form></section>
    <section class="panel"><h2>Élèves · ${group.students.length}</h2>
    ${group.students.length ? '<p class="muted">Référence sur 200 m en secondes (42,5) ou en minutes:secondes (0:42). La saisie s’enregistre quand tu quittes le champ.</p>' : ''}
    ${group.students.length ? group.students.map(item => `<div class="row student-row"><strong>${e(fullName(item))}</strong>
    <label>Référence 200 m<input data-reference="${item.id}" aria-label="Référence 200 m · ${e(fullName(item))}" inputmode="decimal" value="${inputTime(item.reference)}" placeholder="Ex. 42,5"></label>
    <div class="actions"><button data-edit="${item.id}">Modifier</button><button data-open="${item.id}">Épreuve</button><button class="danger" data-delete="${item.id}" aria-label="Supprimer ${e(fullName(item))}">Supprimer</button></div></div>`).join('') : '<p class="muted">Ajoute un élève ou importe une liste.</p>'}</section>` : ''}`;
}

function entry(student) {
  const result = student.result;
  const draft = resultDrafts.get(student.id);
  const fieldTime = (name, value) => e(draft ? draft[name] : inputTime(value));
  const students = currentClass().students;
  const index = students.findIndex(item => item.id === student.id);
  return `<section class="panel"><div class="student-nav" aria-label="Navigation entre les élèves">
  <button data-open="${students[index - 1]?.id ?? ''}" ${index === 0 ? 'disabled' : ''}>Précédent</button>
  <div class="student-position"><strong>${e(fullName(student))}</strong><small>${index + 1} / ${students.length}</small></div>
  <button data-open="${students[index + 1]?.id ?? ''}" ${index === students.length - 1 ? 'disabled' : ''}>Suivant</button></div>
  <h2>Saisir l’épreuve</h2><p class="muted">En secondes (ex. 32,5) ou en minutes:secondes (ex. 4:48).</p>
  <form id="result-form"><div class="grid"><label>Temps total, tir compris<input name="total" required value="${fieldTime('total', result?.total)}" placeholder="Ex. 4:48"></label></div>
  <div class="shots">${Array.from({length:4}, (_, index) => {
    const shot = result?.shots[index];
    return `<section class="card"><h3>Passage ${index + 1}</h3>
      <label>Temps au tir<input name="time${index}" required inputmode="decimal" value="${fieldTime('time' + index, shot?.time)}" placeholder="Ex. 30"></label>
      <label>Cibles touchées<select name="hits${index}" required><option value="">Choisir</option>${Array.from({length:6}, (_, hits) => labelOption(hits, `${hits} / 5`, draft ? String(hits) === draft['hits' + index] : hits === shot?.hits)).join('')}</select></label></section>`;
  }).join('')}</div>
  <button class="primary">Enregistrer et voir le bilan</button></form></section>`;
}

function report(student) {
  const result = student.result;
  if (!result) return '<section class="panel"><h2>Bilan individuel</h2><p class="muted">Saisis les résultats de l’épreuve pour afficher le bilan.</p><button data-go="entry">Saisir l’épreuve</button></section>';
  const m = analyse(student.reference, result);
  const metric = (label, value, detail) => `<div class="card"><small>${label}</small><strong>${value}</strong><small>${detail}</small></div>`;
  const maxShot = Math.max(SHOOT_TARGET, ...result.shots.map(shot => shot.time));
  return `<section class="panel"><h2>${e(fullName(student))}</h2><p class="muted">Bilan de l’épreuve sur 800 m</p>
  <div class="stats">
  ${metric('Vitesse de course', decimal(m.runningSpeed) + ' km/h', formatTime(m.running) + ' de course hors tir')}
  ${metric('Vitesse globale', decimal(m.eventSpeed) + ' km/h', 'Temps total · ' + formatTime(result.total))}
  ${metric('Vitesse cible', m.target ? decimal(m.targetSpeed) + ' km/h' : 'À définir', m.target ? 'Temps cible · ' + formatTime(m.target) : 'Référence 200 m à renseigner')}
  ${metric('Écart à la cible', m.target ? signedTime(m.timeGap) : '—', m.target ? signedSpeed(m.eventSpeed - m.targetSpeed) + ' par rapport à la cible' : 'Calculé avec la référence 200 m')}
  </div><details><summary>Détail des calculs</summary><p>Vitesse de course = 800 m ÷ (temps total − temps passé au tir). Vitesse globale = 800 m ÷ temps total. Temps cible = 4 × référence sur 200 m + 4 × 30 s. Vitesse cible = 800 m ÷ temps cible. Les vitesses sont converties en km/h.</p></details></section>
  <section class="panel"><h2>Passages au tir</h2><p class="muted">Temps total au tir <strong>${formatTime(m.shooting)}</strong> · Cibles touchées <strong>${m.hits} / 20</strong></p>
  <div class="bars">${result.shots.map((shot, index) => `<div class="bar-row"><span>Tir ${index + 1}</span><div class="bar" aria-hidden="true"><i style="width:${100 * shot.time / maxShot}%"></i></div><strong>${formatTime(shot.time)}</strong></div>`).join('')}</div>
  <p>Évolution du premier au dernier passage <strong>${signedTime(m.shotGap)}</strong></p>
  <div class="shots">${result.shots.map((shot, index) => `<div class="card"><small>Tir ${index + 1}</small><strong>${shot.hits} / 5</strong><small>${signedTime(shot.time - SHOOT_TARGET)} par rapport à 30 s</small>
  <div class="hits" aria-hidden="true">${Array.from({length:5}, (_, i) => `<i class="${i < shot.hits ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>
  <button data-go="entry">Modifier la saisie</button></section>`;
}

function render() {
  if (!currentClass()) classId = data[0]?.id;
  if (!currentStudent()) studentId = currentClass()?.students[0]?.id;
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const student = currentStudent();
  if (view === 'classes') screen.innerHTML = classes();
  else if (!student) screen.innerHTML = classPicker() + '<section class="panel"><h2>Aucun élève dans cette classe</h2><button data-go="classes">Gérer les classes</button></section>';
  else screen.innerHTML = classPicker() + (view === 'entry' ? entry(student) : report(student));
}

function go(target) {
  status.textContent = '';
  view = target;
  render();
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const {view: destination, go: jump, edit, open, delete: deleteId, action} = button.dataset;
  if (destination || jump) go(destination || jump);
  if (edit || action === 'cancel') {
    editingId = edit || undefined;
    render();
    if (edit) document.querySelector('#student-form input').focus();
  }
  if (open) {
    studentId = open;
    go('entry');
  }
  if (deleteId) {
    const student = currentClass()?.students.find(item => item.id === deleteId);
    if (!student || !window.confirm(`Supprimer ${fullName(student)} de la classe ? Son résultat sera aussi supprimé.`)) return;
    if (!mutateClass(classId, group => {
      group.students = group.students.filter(item => item.id !== deleteId);
    }, 'Élève supprimé.')) return;
    resultDrafts.delete(deleteId);
    if (editingId === deleteId) editingId = undefined;
    render();
  }
});

screen.addEventListener('input', event => {
  const form = event.target.form;
  if (form?.id === 'result-form') {
    resultDrafts.set(studentId, Object.fromEntries(new FormData(form)));
  }
  if (event.target.dataset.reference) event.target.removeAttribute('aria-invalid');
});

screen.addEventListener('change', event => {
  const input = event.target;
  const referenceId = input.dataset.reference;
  if (referenceId) {
    const raw = input.value.trim();
    const reference = raw ? parseTime(raw) : null;
    if (raw && (!Number.isFinite(reference) || reference <= 0)) {
      input.setAttribute('aria-invalid', 'true');
      status.textContent = 'Référence 200 m invalide. Saisis une durée positive, par exemple 42,5 ou 0:42.';
      return;
    }
    const student = currentClass().students.find(item => item.id === referenceId);
    if (student.reference === reference) return;
    if (mutateClass(classId, group => {
      group.students.find(item => item.id === referenceId).reference = reference;
    }, 'Référence enregistrée.') && editingId === referenceId) {
      document.querySelector('#student-form [name="reference"]').value = inputTime(reference);
    }
    return;
  }
  if (event.target.id === 'class-select') {
    classId = event.target.value;
    editingId = undefined;
  } else if (event.target.id === 'student-select') studentId = event.target.value;
  else return;
  go(view);
});

function getTime(form, field, label, optional = false) {
  const value = String(form.get(field) ?? '').trim();
  if (optional && !value) return null;
  const time = parseTime(value);
  if (!Number.isFinite(time) || time <= 0) throw new Error(`${label} · saisis une durée supérieure à zéro.`);
  return time;
}

function mutateClass(id, change, message) {
  return update(groups => change(groups.find(group => group.id === id)), message);
}

screen.addEventListener('submit', async event => {
  event.preventDefault();
  const target = event.target;
  const form = new FormData(target);
  const groupId = classId;
  try {
    if (target.id === 'new-class') {
      const name = form.get('name').trim();
      if (!name) throw new Error('Saisis un nom de classe.');
      if (data.some(group => group.name.toLowerCase() === name.toLowerCase())) throw new Error('Cette classe existe déjà.');
      const id = newId();
      if (!update(groups => groups.push({id, name, students:[]}), 'Classe créée.')) return;
      classId = id;
      editingId = undefined;
    } else if (target.id === 'student-form') {
      const last = form.get('last').trim();
      const first = form.get('first').trim();
      if (!last || !first) throw new Error('Saisis le nom et le prénom.');
      const reference = getTime(form, 'reference', 'Référence 200 m', true);
      const fields = {last, first, reference};
      if (!mutateClass(groupId, group => {
        if (editingId) Object.assign(group.students.find(item => item.id === editingId), fields);
        else group.students.push({id:newId(), ...fields});
      }, 'Élève enregistré.')) return;
      editingId = undefined;
    } else if (target.id === 'import-form') {
      const button = target.querySelector('button');
      button.disabled = true;
      try {
        const roster = await readRoster(form.get('file'));
        const students = roster.map(item => ({id:newId(), ...item}));
        if (!mutateClass(groupId, group => group.students.push(...students), `${students.length} élève(s) importé(s).`)) return;
        if (!target.isConnected) return;
      } finally {
        button.disabled = false;
      }
    } else if (target.id === 'result-form') {
      const total = getTime(form, 'total', 'Temps total');
      const shots = Array.from({length:4}, (_, i) => ({
        time: getTime(form, 'time' + i, `Temps du passage ${i + 1}`),
        hits: Number(form.get('hits' + i))
      }));
      if (shots.some((shot, index) => form.get('hits' + index) === '' || !Number.isInteger(shot.hits) || shot.hits < 0 || shot.hits > 5)) {
        throw new Error('Choisis le nombre de cibles touchées pour chaque passage.');
      }
      if (total - shots.reduce((sum, shot) => sum + shot.time, 0) < 0.000001) {
        throw new Error('Le temps total doit dépasser la somme des quatre temps de tir.');
      }
      if (!mutateClass(groupId, group => {
        group.students.find(item => item.id === studentId).result = {total, shots};
      }, 'Résultat enregistré.')) return;
      resultDrafts.delete(studentId);
      view = 'report';
    }
    render();
  } catch (error) {
    status.textContent = error.message || 'Impossible de traiter cette saisie.';
    status.scrollIntoView({block:'nearest'});
  }
});

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
