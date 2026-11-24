import {SHOOT_TARGET, formatTime, inputTime, parseTime, totalShotAccuracy} from './metrics.js';

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const positive = value => Number.isFinite(value) && value > 0;
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 70;
const sum = values => values.reduce((total, value) => total + value, 0);
const durationKey = seconds => Math.round(seconds * 1000);

export function projectTime(event, members) {
  if (event.loops === 0 || !members.every(member => positive(member.reference))) return null;
  const running = members.length === 1 ? event.loops * members[0].reference
    : Math.ceil(event.loops / 2) * members[0].reference + Math.floor(event.loops / 2) * members[1].reference;
  return running + event.passes * SHOOT_TARGET;
}

export function rankings(event, classSize) {
  const net = event.results.map(result => ({
    ...result,
    hits: sum(result.shots.map(shot => shot.hits)),
    shooting: sum(result.shots.map(shot => shot.time)),
    gap: result.target == null ? null : result.total - result.target
  }));
  function rank(rows, keys) {
    const compare = (a, b) => {
      const first = keys(a);
      const second = keys(b);
      for (let i = 0; i < first.length; i++) {
        if (first[i] !== second[i]) return first[i] - second[i];
      }
      return 0;
    };
    const sorted = rows.slice().sort(compare);
    let place = 0;
    return sorted.map((row, index) => {
      if (!index || compare(row, sorted[index - 1])) place = index + 1;
      return {...row, place, points: Math.max(0, classSize - place + 1)};
    });
  }
  return {
    net: rank(net, row => event.loops ? [durationKey(row.total)] : [-row.hits, durationKey(row.total)]),
    project: event.loops ? rank(net.filter(row => row.gap !== null), row => [durationKey(row.gap)]) : []
  };
}

export function drawTeams(students, teams, random = Math.random) {
  function shuffle(items) {
    const shuffled = items.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  const order = shuffle(teams);
  const categories = {girls: [], boys: [], other: []};
  for (const student of students) {
    const category = student.runningScale === 'girls' || student.runningScale === 'boys' ? student.runningScale : 'other';
    categories[category].push(student);
  }
  // Keep the offset across categories to balance total team sizes as well.
  const roster = Object.values(categories).flatMap(shuffle);
  return new Map(roster.map((student, index) => [student.id, order[index % order.length].id]));
}

export function cycleScores(group) {
  const lessons = [...new Set((group.events ?? []).map(event => event.lesson))];
  const students = group.students.map(student => ({student, scores: lessons.map(() => 0), total: 0}));
  const byId = new Map(students.map(row => [row.student.id, row]));
  for (const event of group.events ?? []) {
    const index = lessons.indexOf(event.lesson);
    for (const row of rankings(event, event.classSize)[event.scoring]) {
      for (const id of row.members) {
        const profile = byId.get(id);
        if (!profile) continue;
        profile.scores[index] += row.points;
        profile.total += row.points;
      }
    }
  }
  const teams = (group.teams ?? []).map(team => {
    const members = students.filter(row => row.student.teamId === team.id);
    const total = sum(members.map(row => row.total));
    return {team, members, total};
  });
  const sizes = teams.map(row => row.members.length).filter(size => size > 0);
  const countedSize = sizes.length ? Math.min(...sizes) : 0;
  for (const row of teams) {
    const best = row.members.map(member => member.total).sort((a, b) => b - a).slice(0, countedSize);
    row.counted = best.length;
    row.teamScore = best.length ? sum(best) : null;
  }
  teams.sort((a, b) => (b.teamScore ?? -1) - (a.teamScore ?? -1));
  return {lessons, students: students.sort((a, b) => b.total - a.total), teams};
}

function validEvent(event) {
  return event && validName(event.lesson) && validName(event.name)
    && integer(event.loops, 0, 100) && integer(event.passes, 0, 30)
    && (event.loops > 0 || event.passes > 0)
    && integer(event.targets, 1, 100) && [1, 2].includes(event.size)
    && (event.scoring === 'net' || (event.scoring === 'project' && event.loops > 0));
}

function validShot(shot, targets) {
  return shot && positive(shot.time) && integer(shot.hits, 0, targets)
    && (shot.attempts == null || (Number.isSafeInteger(shot.attempts) && shot.attempts >= shot.hits));
}

export function restoreTraining(source, group, newId) {
  if (source.events === undefined && source.teams === undefined) return group;
  const invalid = () => { throw new Error('Les séances ou les équipes de cette sauvegarde sont invalides.'); };
  const idMap = new Map(source.students.map((student, index) => [student.id, group.students[index].id]));
  const teams = new Map();
  if (!Array.isArray(source.teams) || !Array.isArray(source.events) || idMap.size !== group.students.length) invalid();
  group.teams = source.teams.map(team => {
    if (!team || typeof team.id !== 'string' || teams.has(team.id) || !validName(team.name)) invalid();
    const id = newId();
    teams.set(team.id, id);
    return {id, name: team.name};
  });
  group.students.forEach((student, index) => {
    const teamId = source.students[index].teamId;
    if (teamId && !teams.has(teamId)) invalid();
    student.teamId = teams.get(teamId) ?? null;
  });
  group.events = source.events.map(event => {
    if (!validEvent(event) || !Number.isSafeInteger(event.classSize) || event.classSize < 0
      || !Array.isArray(event.results)) invalid();
    const used = new Set();
    const results = event.results.map(result => {
      if (!result || !Array.isArray(result.members) || result.members.length !== event.size
        || !Array.isArray(result.shots) || result.shots.length !== event.passes
        || !result.shots.every(shot => validShot(shot, event.targets)) || !positive(result.total)
        || (result.target != null && (!event.loops || !positive(result.target)))) invalid();
      const shooting = sum(result.shots.map(shot => shot.time));
      if (event.loops ? result.total <= shooting : result.total !== shooting) invalid();
      const members = result.members.map(id => {
        if (!idMap.has(id) || used.has(id)) invalid();
        used.add(id);
        return idMap.get(id);
      });
      return {id: newId(), members, total: result.total, target: result.target ?? null,
        shots: result.shots.map(({time, hits, attempts}) => ({time, hits, attempts:attempts ?? null}))};
    });
    const {lesson, name, loops, passes, targets, size, scoring, classSize} = event;
    return {id:newId(), lesson, name, loops, passes, targets, size, scoring, classSize, results};
  });
  return group;
}

export function removeTrainingStudent(group, studentId) {
  for (const event of group.events ?? []) {
    event.results = event.results.filter(result => !result.members.includes(studentId));
  }
}

export function createTraining({currentClass, mutateClass, render, e, fullName, newId, labelOption, targetPicker}) {
  let tab = 'events';
  let selectedEvent;
  let selectedResult;
  let selectedPupil;
  const selectEvent = group => (group.events ?? []).find(event => event.id === selectedEvent) ?? group.events?.[0];
  const table = (label, headers, rows) => `<div class="class-report-scroll" role="region" aria-label="${e(label)}" tabindex="0">
    <table class="class-report-table"><thead><tr>${headers.map(header => `<th scope="col">${e(header)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;
  const signed = value => value == null ? '—' : (value < 0 ? '−' : value > 0 ? '+' : '') + formatTime(value);

  function selectedStudent(group, event) {
    return group.students.find(student => student.id === selectedPupil)
      ?? group.students.find(student => !event.results.some(result => result.members[0] === student.id))
      ?? group.students[0];
  }

  function roster(group, event) {
    const pupils = new Map(group.students.map(student => [student.id, fullName(student)]));
    if (event.size === 1) {
      const active = selectedStudent(group, event);
      const results = new Map(event.results.map(result => [result.members[0], result]));
      return group.students.map(student => {
        const result = results.get(student.id);
        return `<button data-training="select-pupil" data-pupil-id="${e(student.id)}" aria-pressed="${student === active}">
          <strong>${e(fullName(student))}</strong><small>${result ? formatTime(result.total) : 'À saisir'}</small></button>`;
      }).join('');
    }
    const canAdd = group.students.length - event.results.length * 2 >= 2;
    return (canAdd ? `<button data-training="new-pair" aria-pressed="${!selectedResult}">Nouveau binôme</button>` : '')
      + event.results.map(result => `<button data-training="select-pair" data-result-id="${e(result.id)}" aria-pressed="${result.id === selectedResult}">
        <strong>${e(result.members.map(id => pupils.get(id)).join(' + '))}</strong><small>${formatTime(result.total)}</small></button>`).join('');
  }

  function activeResult(group, event) {
    return event.size === 1
      ? event.results.find(result => result.members[0] === selectedStudent(group, event)?.id)
      : event.results.find(result => result.id === selectedResult);
  }

  function fieldValue(form, name) {
    return form.elements.namedItem(name)?.value;
  }

  function preview(form) {
    const group = currentClass();
    const event = selectEvent(group);
    const totalDisplay = form.querySelector('[data-training-total]');
    const gapDisplay = form.querySelector('[data-training-gap]');
    if (totalDisplay) {
      const times = Array.from({length:event.passes}, (_, i) => parseTime(fieldValue(form, 'time' + i)));
      totalDisplay.textContent = times.every(positive) ? formatTime(sum(times)) : '—';
    }
    if (gapDisplay) {
      const saved = activeResult(group, event);
      const ids = Array.from({length:event.size}, (_, i) => fieldValue(form, 'member' + i));
      const pupils = ids.map(id => group.students.find(student => student.id === id));
      const valid = pupils.every(Boolean) && new Set(ids).size === event.size;
      const sameMembers = saved?.members.every((id, i) => id === ids[i]);
      const target = valid ? (sameMembers ? saved.target ?? projectTime(event, pupils) : projectTime(event, pupils)) : null;
      const total = parseTime(fieldValue(form, 'total'));
      gapDisplay.textContent = target != null && positive(total) ? signed(total - target) : '—';
      form.querySelector('[data-training-target]').textContent = target == null ? '—' : formatTime(target);
    }
  }

  function resultForm(group, event) {
    const saved = activeResult(group, event);
    const pupil = event.size === 1 ? selectedStudent(group, event) : null;
    if (event.size === 1 && !pupil) return '<p>Ajoute des élèves dans Classes.</p>';
    const taken = new Set(event.results.filter(result => result !== saved).flatMap(result => result.members));
    const available = group.students.filter(student => !taken.has(student.id));
    if (available.length < event.size) return '<p>Tous les résultats possibles sont saisis. Sélectionne un binôme à gauche pour consulter ou modifier son résultat.</p>';
    const member = index => `<label>${event.size === 1 ? 'Élève' : index === 0 ? 'Élève qui commence' : 'Partenaire'}
      <select name="member${index}" required><option value="">Choisir</option>${available.map(student =>
        labelOption(student.id, fullName(student), saved?.members[index] === student.id)).join('')}</select></label>`;
    return `<form id="training-result"><h3>${pupil ? e(fullName(pupil)) : saved ? 'Modifier le binôme' : 'Nouveau binôme'}</h3>
      <div class="grid3">${pupil ? `<input type="hidden" name="member0" value="${e(pupil.id)}">` : member(0) + member(1)}
      ${event.loops ? `<label>Temps total (course et tir)<input name="total" inputmode="decimal" required placeholder="Ex. 4.48" value="${inputTime(saved?.total)}"></label>` : `<div><small>Temps total au tir</small><strong data-training-total aria-live="polite">${saved ? formatTime(saved.total) : '—'}</strong></div>`}</div>
      ${event.loops ? (() => {
        const target = saved?.target ?? (pupil ? projectTime(event, [pupil]) : null);
        return `<div class="training-project"><span>Temps cible <strong data-training-target>${target == null ? '—' : formatTime(target)}</strong></span>
          <span>Écart au projet <strong data-training-gap aria-live="polite">${signed(saved && target != null ? saved.total - target : null)}</strong></span></div>`;
      })() : ''}
      ${event.passes ? `<div class="shots">${Array.from({length:event.passes}, (_, i) => {
        const shot = saved?.shots[i];
        return `<div class="card"><h3>Passage ${i + 1}</h3>
          <label>Temps au tir<input name="time${i}" inputmode="decimal" required value="${inputTime(shot?.time)}" placeholder="Ex. 30"></label>
          ${targetPicker(i, shot?.hits, event.targets)}
          <label>Tirs réalisés (facultatif)<input type="number" name="attempts${i}" min="0" step="1" value="${e(shot?.attempts)}"></label>
        </div>`;
      }).join('')}</div>` : ''}
      <div class="actions"><button type="submit" class="primary">Enregistrer le résultat</button>
      ${saved ? '<button type="button" data-training="cancel-result">Annuler</button><button type="button" class="danger" data-training="delete-result">Supprimer le résultat</button>' : ''}</div>
    </form>`;
  }

  function standings(group, event) {
    const pupils = new Map(group.students.map(student => [student.id, fullName(student)]));
    const ranked = rankings(event, event.classSize);
    const names = row => e(row.members.map(id => pupils.get(id) ?? 'Élève supprimé').join(' + '));
    const scored = mode => event.scoring === mode ? ' · points du cycle' : '';
    const action = row => `<button data-training="edit-result" data-result-id="${e(row.id)}">Modifier</button>`;
    const netHeaders = ['Rang', 'Élève ou binôme', 'Temps total', ...(event.passes ? ['Touches', 'Temps au tir', 'Réussite au tir'] : []),
      ...(event.scoring === 'net' ? ['Points'] : []), 'Résultat'];
    const net = ranked.net.map(row => `<tr><td>${row.place}</td><th scope="row">${names(row)}</th><td>${formatTime(row.total)}</td>
      ${event.passes ? `<td>${row.hits} / ${event.passes * event.targets}</td><td>${formatTime(row.shooting)}</td>
        <td>${totalShotAccuracy(row.shots)}<details><summary>Passages</summary><ul>${row.shots.map((shot, i) =>
          `<li>${i + 1} · ${formatTime(shot.time)} · ${shot.hits} / ${event.targets}${shot.attempts == null ? '' : ` · ${shot.attempts} tirs`}</li>`).join('')}</ul></details></td>` : ''}
      ${event.scoring === 'net' ? `<td>${row.points}</td>` : ''}<td>${action(row)}</td></tr>`);
    const project = ranked.project.map(row => `<tr><td>${row.place}</td><th scope="row">${names(row)}</th>
      <td>${formatTime(row.target)}</td><td>${formatTime(row.total)}</td><td>${signed(row.gap)}</td>
      ${event.scoring === 'project' ? `<td>${row.points}</td>` : ''}</tr>`);
    return `<section class="panel"><h2>Classement de la classe</h2><h3>Classement net${scored('net')}</h3>
      ${net.length ? table('Classement net', netHeaders, net) : '<p>Aucun résultat enregistré.</p>'}
      ${event.loops ? `<h3>Classement au projet${scored('project')}</h3>${project.length
        ? table('Classement au projet', ['Rang', 'Élève ou binôme', 'Temps cible', 'Temps réalisé', 'Écart', ...(event.scoring === 'project' ? ['Points'] : [])], project)
        : '<p>Le classement apparaît après saisie de résultats avec une référence 200 m pour chaque participant.</p>'}
        ${ranked.net.length > project.length ? `<small>${ranked.net.length - project.length} résultat(s) sans temps cible.</small>` : ''}` : ''}
    </section>`;
  }

  function eventPanel(group) {
    const event = selectEvent(group);
    return `<details class="panel training-create" ${event ? '' : 'open'}><summary>Créer une épreuve de séance</summary>
      <form id="training-event"><div class="grid3">
        <label>Séance<input name="lesson" required maxlength="70" placeholder="Ex. Séance 1"></label>
        <label>Nom de l’épreuve<input name="eventName" required maxlength="70" placeholder="Ex. Relais précision"></label>
        <label>Format<select name="size"><option value="1">Individuel</option><option value="2">Binôme</option></select></label>
        <label>Boucles de 200 m<input type="number" name="loops" min="0" max="100" required value="4"></label>
        <label>Passages au tir<input type="number" name="passes" min="0" max="30" required value="4"></label>
        <label>Cibles par passage<input type="number" name="targets" min="1" max="100" required value="5"></label>
        <label>Classement qui attribue les points<select name="scoring"><option value="net">Net</option><option value="project">Au projet</option></select></label>
      </div><p class="muted">Pour une épreuve de tir seul, saisis 0 boucle. Pour une épreuve de course seule, saisis 0 passage au tir.</p>
      <button class="primary">Créer l’épreuve</button></form></details>
      ${event ? `<section class="panel" id="training-entry"><label>Épreuve de séance<select data-training-select>
        ${group.events.map(item => labelOption(item.id, item.lesson + ' · ' + item.name, item.id === event.id)).join('')}</select></label>
        <p class="training-format">${event.size === 2 ? 'Binôme' : 'Individuel'} · ${event.loops} × 200 m · ${event.passes} passage(s) au tir · ${event.targets} cibles/passage</p>
        <div class="training-workspace"><aside class="training-roster"><h3>${event.size === 1 ? 'Élèves' : 'Binômes'}</h3>${roster(group, event)}</aside>
        <div class="training-editor">${resultForm(group, event)}</div></div></section>${standings(group, event)}` : ''}`;
  }

  function cyclePanel(group) {
    const {lessons, students, teams} = cycleScores(group);
    const headers = ['Rang', 'Élève', ...lessons, 'Total'];
    let place = 0;
    const rows = students.map((row, index) => {
      if (!index || students[index - 1].total !== row.total) place = index + 1;
      return `<tr><td>${place}</td><th scope="row">${e(fullName(row.student))}</th>${row.scores.map(score => `<td>${score}</td>`).join('')}<td><strong>${row.total}</strong></td></tr>`;
    });
    let teamPlace = 0;
    return `<section class="panel"><h2>Points individuels par séance</h2>
      ${table('Points individuels par séance', headers, rows)}
      <p class="muted">Le premier reçoit autant de points que l’effectif inscrit à la création de l’épreuve, puis un point de moins par place. Ex æquo au même rang et aux mêmes points. Chaque partenaire reçoit les points de son binôme. Un résultat absent vaut 0.</p>
      <h2>Classement des équipes</h2>
      ${teams.length ? table('Classement des équipes', ['Rang', 'Équipe', 'Membres', 'Élèves comptés', 'Total brut', 'Points retenus'], teams.map((row, index) => {
        if (!index || teams[index - 1].teamScore !== row.teamScore) teamPlace = index + 1;
        return `<tr><td>${row.teamScore == null ? '—' : teamPlace}</td><th scope="row">${e(row.team.name)}</th><td>${e(row.members.map(item => fullName(item.student)).join(', ')) || '—'}</td><td>${row.counted} / ${row.members.length}</td><td>${row.total}</td><td><strong>${row.teamScore == null ? '—' : row.teamScore}</strong></td></tr>`;
      })) : '<p>Crée des équipes dans l’onglet Équipes.</p>'}
    </section>`;
  }

  function teamsPanel(group) {
    return `<section class="panel"><h2>Équipes</h2><form id="training-team"><div class="grid">
      <label>Nom de l’équipe<input required name="team" maxlength="70"></label></div><button class="primary">Créer l’équipe</button></form>
      ${group.teams?.length ? `<p class="training-format">Choisis une équipe pour chaque élève. Le classement additionne les meilleurs totaux individuels. Chaque équipe compte autant d’élèves que la plus petite équipe non vide.</p>
      ${group.teams.length >= 2 && group.students.length >= group.teams.length
        ? '<button data-training="draw-teams" class="primary">Tirer les équipes au sort</button><small>Les choix Fille/Garçon dans Classes servent à équilibrer le tirage.</small>'
        : '<small>Il faut au moins deux équipes et assez d’élèves pour toutes les remplir.</small>'}
      ${group.students.map(student => `<div class="row"><strong>${e(fullName(student))}</strong><label>Équipe<select data-training-member="${e(student.id)}">
        <option value="">Sans équipe</option>${group.teams.map(team => labelOption(team.id, team.name, student.teamId === team.id)).join('')}</select></label></div>`).join('')}` : ''}
    </section>`;
  }

  function html(group) {
    if (!group) return '<section class="panel"><h2>Séances</h2><p>Crée une classe pour commencer.</p></section>';
    return `<div class="actions training-tabs" aria-label="Vues des séances">${[['events','Épreuves de séance'], ['cycle','Cumul et classement'], ['teams','Équipes']].map(([value,label]) =>
      `<button data-training="${value}" aria-pressed="${tab === value}" class="${tab === value ? 'primary' : ''}">${label}</button>`).join('')}</div>
      ${tab === 'cycle' ? cyclePanel(group) : tab === 'teams' ? teamsPanel(group) : eventPanel(group)}`;
  }

  function click(button) {
    const action = button.dataset.training;
    const group = currentClass();
    const event = selectEvent(group);
    if (action === 'draw-teams') {
      if (group.students.some(student => student.teamId) && !window.confirm('Refaire le tirage et remplacer la répartition actuelle ?')) return;
      const assignments = drawTeams(group.students, group.teams);
      if (!mutateClass(group.id, next => {
        for (const student of next.students) student.teamId = assignments.get(student.id);
      }, 'Équipes tirées au sort.')) return;
    } else if (action === 'select-pupil') {
      selectedPupil = button.dataset.pupilId;
    } else if (action === 'new-pair') {
      selectedResult = undefined;
    } else if (action === 'edit-result' || action === 'select-pair') {
      selectedResult = button.dataset.resultId;
      if (event.size === 1) selectedPupil = event.results.find(result => result.id === selectedResult)?.members[0];
    } else if (action === 'cancel-result') {
      selectedResult = undefined;
    } else if (action === 'delete-result') {
      if (!window.confirm('Supprimer ce résultat de séance ?')) return;
      const resultId = activeResult(group, event)?.id;
      if (!mutateClass(group.id, next => {
        const savedEvent = next.events.find(item => item.id === event.id);
        savedEvent.results = savedEvent.results.filter(result => result.id !== resultId);
      }, 'Résultat supprimé.')) return;
      selectedResult = undefined;
    } else {
      tab = action;
    }
    render();
    if (action === 'edit-result') document.querySelector('#training-entry')?.scrollIntoView({block:'start'});
  }

  function change(input) {
    const group = currentClass();
    if ('trainingSelect' in input.dataset) {
      selectedEvent = input.value;
      selectedResult = undefined;
      selectedPupil = undefined;
      render();
    } else {
      const student = group.students.find(item => item.id === input.dataset.trainingMember);
      const teamId = input.value || null;
      if (!mutateClass(group.id, next => {
        next.students.find(item => item.id === student.id).teamId = teamId;
      }, 'Équipe enregistrée.')) input.value = student.teamId ?? '';
    }
  }

  function submit(id, form) {
    const group = currentClass();
    if (id === 'training-event') {
      const event = {id:newId(), lesson:form.get('lesson').trim(), name:form.get('eventName').trim(),
        loops:Number(form.get('loops')), passes:Number(form.get('passes')), targets:Number(form.get('targets')),
        size:Number(form.get('size')), scoring:form.get('scoring'), classSize:group.students.length, results:[]};
      if (!event.loops && event.scoring === 'project') throw new Error('Le classement au projet nécessite au moins une boucle.');
      if (!validEvent(event)) throw new Error('Renseigne la séance, le nom et au moins une boucle ou un passage au tir.');
      if (event.size === 2 && event.loops === 1) throw new Error('Prévois au moins deux boucles pour un relais en binôme.');
      if (group.students.length < event.size) throw new Error('Ajoute suffisamment d’élèves à la classe pour ce format.');
      if (!mutateClass(group.id, next => {
        next.events ??= [];
        next.teams ??= [];
        next.events.push(event);
      }, 'Épreuve de séance créée.')) return;
      selectedEvent = event.id;
      selectedResult = undefined;
      selectedPupil = undefined;
    } else if (id === 'training-team') {
      const name = form.get('team').trim();
      if (!validName(name) || group.teams?.some(team => team.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Saisis un nom d’équipe différent des équipes existantes.');
      }
      if (!mutateClass(group.id, next => {
        next.events ??= [];
        next.teams ??= [];
        next.teams.push({id:newId(), name});
      }, 'Équipe créée.')) return;
    } else {
      const event = selectEvent(group);
      const previous = activeResult(group, event);
      const members = Array.from({length:event.size}, (_, i) => form.get('member' + i));
      const pupils = members.map(id => group.students.find(student => student.id === id));
      if (pupils.some(student => !student) || new Set(members).size !== event.size) {
        throw new Error('Choisis des élèves différents pour le binôme.');
      }
      if (event.results.some(result => result.id !== previous?.id && result.members.some(id => members.includes(id)))) {
        throw new Error('Un élève a déjà un résultat dans cette épreuve.');
      }
      const shots = Array.from({length:event.passes}, (_, i) => {
        const rawAttempts = form.get('attempts' + i);
        const rawHits = form.get('hits' + i);
        const shot = {time:parseTime(form.get('time' + i)), hits:Number(rawHits), attempts:rawAttempts === '' ? null : Number(rawAttempts)};
        if (rawHits == null || rawHits === '' || !validShot(shot, event.targets)) throw new Error(`Vérifie le temps, les touches et les tirs du passage ${i + 1}.`);
        return shot;
      });
      const shooting = sum(shots.map(shot => shot.time));
      const total = event.loops ? parseTime(form.get('total')) : shooting;
      if (!positive(total) || (event.loops && total <= shooting)) throw new Error('Saisis un temps total supérieur au temps passé au tir.');
      const sameMembers = previous?.members.every((id, i) => id === members[i]);
      const target = sameMembers && previous.target !== null ? previous.target : projectTime(event, pupils);
      const result = {id:previous?.id ?? newId(), members, total, target, shots};
      if (!mutateClass(group.id, next => {
        const saved = next.events.find(item => item.id === event.id);
        const index = saved.results.findIndex(item => item.id === result.id);
        if (index < 0) saved.results.push(result);
        else saved.results[index] = result;
      }, 'Résultat de séance enregistré.')) return;
      if (event.size === 2) selectedResult = result.id;
      else selectedPupil = members[0];
    }
    render();
  }

  return {html, click, change, preview, submit, reset() { selectedEvent = undefined; selectedResult = undefined; selectedPupil = undefined; }};
}
