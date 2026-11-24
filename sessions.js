import {SHOOT_TARGET, formatTime, inputTime, parseTime, shotAccuracy, totalShotAccuracy} from './metrics.js';

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const positive = value => Number.isFinite(value) && value > 0;
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 70;
const sum = values => values.reduce((total, value) => total + value, 0);
const durationKey = seconds => seconds == null ? Infinity : Math.round(seconds * 1000);
const showTime = seconds => seconds == null ? '—' : formatTime(seconds);
const shootingTotal = shots => shots.every(shot => shot.time != null) ? sum(shots.map(shot => shot.time)) : null;

export function projectTime(event, members) {
  if (event.loops === 0 || !members.every(member => positive(member.reference))) return null;
  const running = members.length === 1 ? event.loops * members[0].reference
    : Math.ceil(event.loops / 2) * members[0].reference + Math.floor(event.loops / 2) * members[1].reference;
  return running + event.passes * SHOOT_TARGET;
}

const shotMode = event => event.shotMode ?? 'standard';
const adjustsTime = event => ['penalty', 'bonus'].includes(shotMode(event));

export function shootingAdjustment(event, hits, total) {
  const missed = event.passes * event.targets - hits;
  const amount = event.shotAmount ?? 0;
  const mode = shotMode(event);
  const delta = mode === 'penalty' ? missed * amount : mode === 'bonus' ? -hits * amount : 0;
  return {delta, rings:mode === 'rings' ? missed * amount : 0,
    time:total == null ? null : Math.max(0, total + delta)};
}

export function rankings(event, classSize) {
  const net = event.results.map(result => {
    const hits = sum(result.shots.map(shot => shot.hits));
    const adjustment = shootingAdjustment(event, hits, result.total);
    return {...result, hits, shooting:shootingTotal(result.shots), ...adjustment,
      gap: result.target == null || adjustment.time == null ? null : adjustment.time - result.target};
  });
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
    net: rank(net, row => event.loops || adjustsTime(event) ? [durationKey(row.time), ...(event.loops ? [] : [-row.hits])] : [-row.hits, durationKey(row.total)]),
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

function eliminationOrder(event) {
  const order = new Map(event.elimination.active.map((id, index) => [id, index]));
  return rankings(event, event.classSize).net.sort((a, b) =>
    a.place - b.place || order.get(a.members[0]) - order.get(b.members[0]));
}

export function eliminationRanking(event) {
  const {rounds, finished} = event.elimination;
  const final = finished ? eliminationOrder(event).map(row => ({members:row.members, stage:'Finale'})) : [];
  const eliminated = rounds.flatMap((ids, index) => [ids.map(id => ({members:[id], stage:'Tour ' + (index + 1)}))]);
  const ordered = [...final, ...eliminated.reverse().flat()];
  const offset = finished ? 0 : event.elimination.active.length;
  return ordered.map((row, index) => ({...row, place:offset + index + 1, points:Math.max(0, event.classSize - offset - index)}));
}

export function cycleScores(group) {
  const lessons = [...new Set((group.events ?? []).map(event => event.lesson))];
  const students = group.students.map(student => ({student, scores: lessons.map(() => 0), total: 0}));
  const byId = new Map(students.map(row => [row.student.id, row]));
  for (const event of group.events ?? []) {
    const index = lessons.indexOf(event.lesson);
    const rows = event.elimination ? (event.elimination.finished ? eliminationRanking(event) : []) : rankings(event, event.classSize)[event.scoring];
    for (const row of rows) {
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
    && (shotMode(event) === 'standard' || (event.passes > 0 && (
      (shotMode(event) === 'rings' && event.loops > 0 && integer(event.shotAmount, 1, 100))
      || (adjustsTime(event) && positive(event.shotAmount) && event.shotAmount <= 3600))))
    && (event.scoring === 'net' || (event.scoring === 'project' && event.loops > 0));
}

function validShot(shot, targets) {
  return shot && (shot.time == null || positive(shot.time)) && integer(shot.hits, 0, targets)
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
        || !result.shots.every(shot => validShot(shot, event.targets)) || (event.loops ? !positive(result.total) : result.total != null && !positive(result.total))
        || (result.target != null && (!event.loops || !positive(result.target)))) invalid();
      const shooting = sum(result.shots.map(shot => shot.time));
      if (event.loops ? result.total <= shooting : result.total !== shootingTotal(result.shots)) invalid();
      const members = result.members.map(id => {
        if (!idMap.has(id) || used.has(id)) invalid();
        used.add(id);
        return idMap.get(id);
      });
      return {id: newId(), members, total: result.total, target: result.target ?? null,
        shots: result.shots.map(({time, hits, attempts}) => ({time:time ?? null, hits, attempts:attempts ?? null}))};
    });
    let elimination;
    if (event.elimination != null) {
      const {active, rounds, finished} = event.elimination;
      if (event.loops !== 1 || event.passes !== 1 || event.size !== 1 || event.scoring !== 'net'
        || !Array.isArray(active) || !Array.isArray(rounds) || !rounds.every(Array.isArray) || typeof finished !== 'boolean') invalid();
      const ids = [...active, ...rounds.flat()];
      if (new Set(ids).size !== ids.length || ids.some(id => !idMap.has(id))
        || event.results.some(row => !active.includes(row.members[0]))
        || (finished && results.length !== active.length)) invalid();
      elimination = {active:active.map(id => idMap.get(id)),
        rounds:rounds.map(ids => ids.map(id => idMap.get(id))), finished};
    }
    const {lesson, name, loops, passes, targets, size, scoring, classSize} = event;
    return {id:newId(), lesson, name, loops, passes, targets, size, scoring, classSize, shotMode:shotMode(event), shotAmount:event.shotAmount ?? 0, results, ...(elimination ? {elimination} : {})};
  });
  return group;
}

export function removeTrainingStudent(group, studentId) {
  for (const event of group.events ?? []) {
    event.results = event.results.filter(result => !result.members.includes(studentId));
    if (event.elimination) {
      event.elimination.active = event.elimination.active.filter(id => id !== studentId);
      event.elimination.rounds = event.elimination.rounds.map(ids => ids.filter(id => id !== studentId));
    }
  }
}

export function createTraining({currentClass, mutateClass, render, e, fullName, newId, labelOption, targetPicker}) {
  let tab = 'events';
  let selectedEvent;
  const drafts = new Map();
  const pairSlots = new Map();
  const selectEvent = group => (group.events ?? []).find(event => event.id === selectedEvent) ?? group.events?.[0];
  const table = (label, headers, rows) => `<div class="class-report-scroll" role="region" aria-label="${e(label)}" tabindex="0">
    <table class="class-report-table"><thead><tr>${headers.map(header => `<th scope="col">${e(header)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;
  const signed = value => value == null ? '—' : (value < 0 ? '−' : value > 0 ? '+' : '') + formatTime(value);

  function rowProject(event, group, saved, ids) {
    const pupils = ids.map(id => group.students.find(student => student.id === id));
    if (!pupils.every(Boolean) || new Set(ids).size !== event.size) return null;
    return saved?.members.every((id, i) => id === ids[i]) && saved.target != null
      ? saved.target : projectTime(event, pupils);
  }

  function accuracyLabel(hits, attempts) {
    const count = Number(attempts);
    if (hits == null || hits === '' || !Number.isSafeInteger(count) || count <= 0 || count < Number(hits)) return '';
    return 'Réussite · ' + shotAccuracy({hits:Number(hits), attempts:count});
  }

  function readShootingTime(event, read) {
    const times = Array.from({length:event.passes}, (_, i) => parseTime(read(i)));
    return times.every(positive) ? sum(times) : null;
  }

  function rowAdjustment(event, hits, total) {
    if (shotMode(event) !== 'standard' && hits.some(hit => hit == null || hit === '')) return null;
    return shootingAdjustment(event, sum(hits.map(Number)), positive(total) ? total : null);
  }

  function adjustmentLabel(event, adjustment) {
    if (!adjustment) return '—';
    if (shotMode(event) === 'rings') return adjustment.rings + ' anneau(x)';
    return signed(adjustment.delta) + ' · Temps retenu : ' + showTime(adjustment.time);
  }

  function preview(form) {
    const group = currentClass();
    const event = selectEvent(group);
    const values = Object.fromEntries(new FormData(form));
    drafts.set(form.id, values);
    const row = form.closest('tr');
    const totalDisplay = row.querySelector('[data-training-total]');
    const gapDisplay = row.querySelector('[data-training-gap]');
    const adjustmentDisplay = row.querySelector('[data-training-adjustment]');
    const hits = Array.from({length:event.passes}, (_, i) => values['hits' + i]);
    const total = event.loops ? parseTime(values.total) : readShootingTime(event, i => values['time' + i]);
    const adjustment = rowAdjustment(event, hits, total);
    if (adjustmentDisplay) adjustmentDisplay.textContent = adjustmentLabel(event, adjustment);
    row.querySelectorAll('[data-shot-accuracy]').forEach((output, i) => {
      output.textContent = accuracyLabel(values['hits' + i], values['attempts' + i]);
    });
    if (totalDisplay) {
      const times = Array.from({length:event.passes}, (_, i) => parseTime(values['time' + i]));
      totalDisplay.textContent = times.every(positive) ? formatTime(sum(times)) : '—';
    }
    if (gapDisplay) {
      const saved = event.results.find(result => result.id === values.resultId);
      const ids = Array.from({length:event.size}, (_, i) => values['member' + i]);
      const target = rowProject(event, group, saved, ids);
      gapDisplay.textContent = target != null && adjustment?.time != null ? signed(adjustment.time - target) : '—';
    }
  }

  function entryTable(group, event) {
    const resultByPupil = new Map(event.results.map(result => [result.members[0], result]));
    const places = new Map(rankings(event, event.classSize)[event.scoring].map(row => [row.id, row.place]));
    const headers = [event.size === 1 ? 'Nom' : 'Premier élève', ...(event.size === 2 ? ['Partenaire'] : []),
      'Temps total', ...Array.from({length:event.passes}, (_, i) => 'Tir ' + (i + 1)),
      ...(shotMode(event) !== 'standard' ? [shotMode(event) === 'rings' ? 'Anneaux à courir' : 'Correction du temps'] : []),
      ...(event.loops ? ['Écart au projet'] : []), 'Classement'];
    const rowId = key => 'training-row-' + event.id + '-' + key;
    function row(key, saved, pupil) {
      const id = rowId(key);
      const draft = drafts.get(id);
      const owner = `form="${e(id)}"`;
      const value = (name, fallback) => draft?.[name] ?? fallback;
      const taken = new Set(event.results.filter(result => result !== saved).flatMap(result => result.members));
      const ids = pupil ? [pupil.id] : [0, 1].map(i => value('member' + i, saved?.members[i] ?? ''));
      const member = i => `<select ${owner} name="member${i}" required aria-label="${i ? 'Partenaire' : 'Premier élève'}"><option value="">Choisir</option>${group.students
        .filter(student => !taken.has(student.id) || student.id === ids[i])
        .map(student => labelOption(student.id, fullName(student), student.id === ids[i])).join('')}</select>`;
      const total = value('total', inputTime(saved?.total));
      const times = Array.from({length:event.passes}, (_, i) => parseTime(value('time' + i, inputTime(saved?.shots[i]?.time))));
      const target = event.loops ? rowProject(event, group, saved, ids) : null;
      const actual = event.loops ? parseTime(total) : readShootingTime(event, i => value('time' + i, inputTime(saved?.shots[i]?.time)));
      const adjustment = rowAdjustment(event, Array.from({length:event.passes}, (_, i) => value('hits' + i, saved?.shots[i]?.hits)), actual);
      const label = pupil ? fullName(pupil) : 'binôme';
      return `<tr id="line-${e(id)}"><th scope="row"><form id="${e(id)}" data-training-result>
        <input type="hidden" name="resultId" value="${e(saved?.id)}">
        <input type="hidden" name="rowKey" value="${e(key)}">
        ${pupil ? `<input type="hidden" name="member0" value="${e(pupil.id)}">${e(label)}` : member(0)}</form></th>
        ${pupil ? '' : `<td>${member(1)}</td>`}
        <td>${event.loops ? `<input ${owner} name="total" inputmode="decimal" required aria-label="Temps total · ${e(label)}" placeholder="4.48" value="${e(total)}">`
          : `<strong data-training-total>${times.every(positive) ? formatTime(sum(times)) : '—'}</strong>`}</td>
        ${Array.from({length:event.passes}, (_, i) => {
          const shot = saved?.shots[i];
          return `<td class="training-shot-cell"><input ${owner} name="time${i}" inputmode="decimal" aria-label="Temps du tir ${i + 1} (facultatif)" placeholder="Temps (facultatif)" value="${e(value('time' + i, inputTime(shot?.time)))}">
            ${targetPicker(i, value('hits' + i, shot?.hits), event.targets, id)}
            <input ${owner} type="number" name="attempts${i}" min="0" step="1" aria-label="Tirs réalisés au passage ${i + 1} (facultatif)" placeholder="Nombre de tirs" value="${e(value('attempts' + i, shot?.attempts))}">
            <small data-shot-accuracy aria-live="polite">${accuracyLabel(value('hits' + i, shot?.hits), value('attempts' + i, shot?.attempts))}</small></td>`;
        }).join('')}
        ${shotMode(event) !== 'standard' ? `<td data-training-adjustment>${adjustmentLabel(event, adjustment)}</td>` : ''}
        ${event.loops ? `<td data-training-gap>${signed(target != null && adjustment?.time != null ? adjustment.time - target : null)}</td>` : ''}
        <td><strong>${places.has(saved?.id) ? places.get(saved.id) + 'ᵉ' : '—'}</strong>
          <div class="training-row-actions"><button ${owner} type="submit" class="primary">Enregistrer</button>
          ${saved ? `<button type="button" class="danger" data-training="delete-result" data-result-id="${e(saved.id)}">Effacer</button>` : ''}</div></td></tr>`;
    }
    let rows;
    if (event.size === 1) {
      rows = group.students.filter(pupil => !event.elimination || event.elimination.active.includes(pupil.id))
        .map(pupil => row(pupil.id, resultByPupil.get(pupil.id), pupil));
    } else {
      const count = Math.max(0, Math.floor(group.students.length / 2) - event.results.length);
      const results = new Map(event.results.map(result => [result.id, result]));
      const slots = pairSlots.get(event.id) ?? [];
      const pending = slots.filter(key => !results.has(key)).slice(0, count);
      while (pending.length < count) pending.push(newId());
      const keep = new Set([...results.keys(), ...pending]);
      const order = [...new Set([...slots.filter(key => keep.has(key)), ...keep])];
      pairSlots.set(event.id, order);
      rows = order.map(key => row(key, results.get(key)));
    }
    return `<h3>Résultats de l’épreuve</h3><p class="muted">Classement ${event.scoring === 'project' ? 'au projet' : 'net'} · rang actualisé à l’enregistrement de la ligne. Fais défiler le tableau horizontalement pour accéder à toutes les colonnes.</p>
      ${rows.length ? table('Saisie des résultats', headers, rows) : '<p>Ajoute des élèves dans Classes.</p>'}`;
  }

  function standings(group, event) {
    const pupils = new Map(group.students.map(student => [student.id, fullName(student)]));
    const ranked = rankings(event, event.classSize);
    const names = row => e(row.members.map(id => pupils.get(id) ?? 'Élève supprimé').join(' + '));
    const scored = mode => event.scoring === mode ? ' · points du cycle' : '';
    const action = row => `<button data-training="edit-result" data-result-id="${e(row.id)}">Modifier</button>`;
    const netHeaders = ['Rang', 'Élève ou binôme', adjustsTime(event) ? 'Temps retenu' : 'Temps total', ...(event.passes ? ['Touches', 'Temps au tir', 'Réussite au tir'] : []),
      ...(event.scoring === 'net' ? ['Points'] : []), 'Résultat'];
    const net = ranked.net.map(row => `<tr><td>${row.place}</td><th scope="row">${names(row)}</th><td>${showTime(row.time)}</td>
      ${event.passes ? `<td>${row.hits} / ${event.passes * event.targets}</td><td>${showTime(row.shooting)}</td>
        <td>${totalShotAccuracy(row.shots)}<details><summary>Passages</summary><ul>${row.shots.map((shot, i) =>
          `<li>${i + 1} · ${showTime(shot.time)} · ${shot.hits} / ${event.targets}${shot.attempts == null ? '' : ` · ${shot.attempts} tirs`}</li>`).join('')}</ul></details></td>` : ''}
      ${event.scoring === 'net' ? `<td>${row.points}</td>` : ''}<td>${action(row)}</td></tr>`);
    const project = ranked.project.map(row => `<tr><td>${row.place}</td><th scope="row">${names(row)}</th>
      <td>${formatTime(row.target)}</td><td>${showTime(row.time)}</td><td>${signed(row.gap)}</td>
      ${event.scoring === 'project' ? `<td>${row.points}</td>` : ''}</tr>`);
    return `<section class="panel"><h2>Classement de la classe</h2><h3>Classement net${scored('net')}</h3>
      ${net.length ? table('Classement net', netHeaders, net) : '<p>Aucun résultat enregistré.</p>'}
      ${event.loops ? `<h3>Classement au projet${scored('project')}</h3>${project.length
        ? table('Classement au projet', ['Rang', 'Élève ou binôme', 'Temps cible', adjustsTime(event) ? 'Temps retenu' : 'Temps réalisé', 'Écart', ...(event.scoring === 'project' ? ['Points'] : [])], project)
        : '<p>Le classement apparaît après saisie de résultats avec une référence 200 m pour chaque participant.</p>'}
        ${ranked.net.length > project.length ? `<small>${ranked.net.length - project.length} résultat(s) sans temps cible.</small>` : ''}` : ''}
    </section>`;
  }

  function eliminationPanel(group, event) {
    const {active, rounds, finished} = event.elimination;
    const ready = active.length > 0 && active.length === event.results.length;
    const pupils = new Map(group.students.map(student => [student.id, fullName(student)]));
    const rows = eliminationRanking(event).map(row =>
      `<tr><td>${row.place}</td><th scope="row">${e(pupils.get(row.members[0]))}</th><td>${row.stage}</td>
      ${finished ? `<td>${row.points}</td>` : ''}</tr>`);
    return `<h3>${finished ? 'Épreuve terminée' : 'Tour ' + (rounds.length + 1)}</h3>
      ${finished ? '' : `<p>${event.results.length} / ${active.length} résultats enregistrés.</p>
        ${entryTable(group,event)}
        <p class="muted">En cas d’égalité exacte à la coupure, l’ordre de la liste de classe départage les élèves.</p>
        ${active.length > 1 ? `<form id="training-eliminate"><div class="grid"><label>Nombre de derniers à éliminer<input name="count" type="number" min="1" max="${active.length - 1}" value="1" required></label></div>
          <button class="primary" ${ready ? '' : 'disabled'}>Éliminer et passer au tour suivant</button></form>` : ''}
        <form id="training-final"><button ${ready ? '' : 'disabled'}>Valider ce tour comme finale</button></form>`}
      <h3>${finished ? 'Classement final' : 'Élèves éliminés'}</h3>
      ${rows.length ? table('Classement de l’élimination', ['Rang','Élève','Tour atteint', ...(finished ? ['Points'] : [])], rows) : '<p>Aucun élève éliminé.</p>'}`;
  }

  function eventPanel(group) {
    const event = selectEvent(group);
    return `<details class="panel training-create" ${event ? '' : 'open'}><summary>Créer une épreuve de séance</summary>
      <form id="training-event"><div class="grid3">
        <label>Séance<input name="lesson" required maxlength="70" placeholder="Ex. Séance 1"></label>
        <label>Nom de l’épreuve<input name="eventName" required maxlength="70" placeholder="Ex. Relais précision"></label>
        <label>Format<select name="size"><option value="1">Individuel</option><option value="2">Binôme</option><option value="elimination">Élimination</option></select></label>
        <label>Boucles de 200 m<input type="number" name="loops" min="0" max="100" required value="4"></label>
        <label>Passages au tir<input type="number" name="passes" min="0" max="30" required value="4"></label>
        <label>Mode de tir<select name="shotMode"><option value="standard">Standard</option><option value="penalty">Pénalité de temps par cible manquée</option><option value="rings">Anneaux à courir par cible manquée</option><option value="bonus">Bonus de temps par cible touchée</option></select></label>
        <label>Valeur par cible (secondes ou anneaux)<input type="number" name="shotAmount" step="any" min="0" placeholder="Ex. 10 secondes ou 1 anneau"></label>
        <label>Cibles par passage<input type="number" name="targets" min="1" max="100" required value="5"></label>
        <label>Classement qui attribue les points<select name="scoring"><option value="net">Net</option><option value="project">Au projet</option></select></label>
      </div><p class="muted">Le format Élimination utilise automatiquement 1 boucle, 1 passage au tir et le classement net. Pour une épreuve de tir seul, saisis 0 boucle. Pour une épreuve de course seule, saisis 0 passage au tir.</p>
      <button class="primary">Créer l’épreuve</button></form></details>
      ${event ? `<section class="panel" id="training-entry"><label>Épreuve de séance<select data-training-select>
        ${group.events.map(item => labelOption(item.id, item.lesson + ' · ' + item.name, item.id === event.id)).join('')}</select></label>
        <div class="actions training-lesson-actions"><button type="button" class="danger" data-training="delete-lesson">Supprimer la séance</button></div>
        <p class="training-format">${event.elimination ? 'Élimination' : event.size === 2 ? 'Binôme' : 'Individuel'} · ${event.loops} × 200 m · ${event.passes} passage(s) au tir · ${event.targets} cibles/passage</p>
        ${shotMode(event) === 'rings' ? '<p class="muted">Inclus les anneaux courus dans le temps total saisi.</p>' : ''}
        ${event.elimination ? eliminationPanel(group, event) : entryTable(group, event)}</section>
        ${event.elimination?.finished ? '' : `<details class="training-details"><summary>Détail des classements et des tirs</summary>${standings(group, event)}</details>`}` : ''}`;
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
    } else if (action === 'delete-lesson') {
      if (!event) return;
      const ids = group.events.filter(item => item.lesson === event.lesson).map(item => item.id);
      if (!window.confirm(`Supprimer « ${event.lesson} » et ses ${ids.length} épreuve(s), avec tous leurs résultats ?`)) return;
      const removed = new Set(ids);
      if (!mutateClass(group.id, next => {
        next.events = next.events.filter(item => !removed.has(item.id));
      }, 'Séance supprimée. Les classements ont été recalculés.')) return;
      for (const id of ids) pairSlots.delete(id);
      for (const key of drafts.keys()) {
        if (ids.some(id => key.startsWith('training-row-' + id + '-'))) drafts.delete(key);
      }
      selectedEvent = undefined;
    } else if (action === 'edit-result') {
      const result = event.results.find(item => item.id === button.dataset.resultId);
      if (result) {
        const key = event.size === 1 ? result.members[0] : result.id;
        document.getElementById('line-training-row-' + event.id + '-' + key)?.scrollIntoView({block:'center'});
      }
      return;
    } else if (action === 'delete-result') {
      if (!window.confirm('Supprimer ce résultat de séance ?')) return;
      const resultId = button.dataset.resultId;
      const result = event.results.find(item => item.id === resultId);
      if (!result) return;
      if (!mutateClass(group.id, next => {
        const savedEvent = next.events.find(item => item.id === event.id);
        savedEvent.results = savedEvent.results.filter(result => result.id !== resultId);
      }, 'Résultat supprimé.')) return;
      drafts.delete('training-row-' + event.id + '-' + (event.size === 1 ? result.members[0] : result.id));
    } else {
      tab = action;
    }
    render();
  }

  function change(input) {
    const group = currentClass();
    if ('trainingSelect' in input.dataset) {
      selectedEvent = input.value;
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
    if (id === 'training-eliminate' || id === 'training-final') {
      const event = selectEvent(group);
      const state = event?.elimination;
      if (!state || state.finished || !state.active.length || event.results.length !== state.active.length) {
        throw new Error('Enregistre tous les résultats du tour avant de le valider.');
      }
      const final = id === 'training-final';
      const count = Number(form.get('count'));
      if (!final && !integer(count, 1, state.active.length - 1)) {
        throw new Error('Choisis combien de derniers éliminer. Il doit rester au moins un élève.');
      }
      const eliminated = final ? [] : eliminationOrder(event).slice(-count).map(row => row.members[0]);
      const message = final ? 'Finale validée. Les points sont ajoutés au cumul.' : count + ' élève(s) éliminé(s). Tour suivant ouvert.';
      if (!mutateClass(group.id, next => {
        const saved = next.events.find(item => item.id === event.id);
        if (final) {
          saved.elimination.finished = true;
        } else {
          saved.elimination.rounds.push(eliminated);
          saved.elimination.active = saved.elimination.active.filter(id => !eliminated.includes(id));
          saved.results = [];
        }
      }, message)) return;
      for (const key of drafts.keys()) {
        if (key.startsWith('training-row-' + event.id + '-')) drafts.delete(key);
      }
    } else if (id === 'training-event') {
      const event = {id:newId(), lesson:form.get('lesson').trim(), name:form.get('eventName').trim(),
        loops:Number(form.get('loops')), passes:Number(form.get('passes')), targets:Number(form.get('targets')),
        size:Number(form.get('size')), scoring:form.get('scoring'),
        shotMode:form.get('shotMode') || 'standard', shotAmount:Number(form.get('shotAmount')), classSize:group.students.length, results:[]};
      if (form.get('size') === 'elimination') {
        Object.assign(event, {loops:1, passes:1, size:1, scoring:'net',
          elimination:{active:group.students.map(student => student.id), rounds:[], finished:false}});
      }
      if (!event.loops && event.scoring === 'project') throw new Error('Le classement au projet nécessite au moins une boucle.');
      if (shotMode(event) !== 'standard' && !event.passes) throw new Error('Choisis au moins un passage au tir pour ce mode.');
      if (shotMode(event) === 'rings' && (!event.loops || !integer(event.shotAmount, 1, 100))) {
        throw new Error('Les anneaux nécessitent une épreuve avec course et un nombre entier de 1 à 100 anneaux par cible manquée.');
      }
      if (adjustsTime(event) && (!positive(event.shotAmount) || event.shotAmount > 3600)) {
        throw new Error('Indique une valeur en secondes supérieure à zéro et au maximum égale à 3 600.');
      }
      if (!validEvent(event)) throw new Error('Renseigne la séance, le nom et au moins une boucle ou un passage au tir.');
      if (event.size === 2 && event.loops === 1) throw new Error('Prévois au moins deux boucles pour un relais en binôme.');
      if (group.students.length < event.size) throw new Error('Ajoute suffisamment d’élèves à la classe pour ce format.');
      if (!mutateClass(group.id, next => {
        next.events ??= [];
        next.teams ??= [];
        next.events.push(event);
      }, 'Épreuve de séance créée.')) return;
      selectedEvent = event.id;
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
      if (event.elimination && (event.elimination.finished || !event.elimination.active.includes(form.get('member0')))) {
        throw new Error('Cet élève ne participe pas au tour en cours.');
      }
      const previous = event.results.find(result => result.id === form.get('resultId'));
      const key = form.get('rowKey');
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
        const rawTime = String(form.get('time' + i) ?? '').trim();
        const time = rawTime ? parseTime(rawTime) : null;
        if (rawTime && !positive(time)) throw new Error(`Vérifie le temps du passage ${i + 1}.`);
        const shot = {time, hits:Number(rawHits), attempts:rawAttempts === '' || rawAttempts == null ? null : Number(rawAttempts)};
        if (rawHits == null || rawHits === '' || !validShot(shot, event.targets)) throw new Error(`Vérifie le temps, les touches et les tirs du passage ${i + 1}.`);
        return shot;
      });
      const shooting = sum(shots.map(shot => shot.time));
      const total = event.loops ? parseTime(form.get('total')) : shootingTotal(shots);
      if (event.loops && (!positive(total) || total <= shooting)) throw new Error('Saisis un temps total supérieur au temps passé au tir.');
      const sameMembers = previous?.members.every((id, i) => id === members[i]);
      const target = sameMembers && previous.target !== null ? previous.target : projectTime(event, pupils);
      const result = {id:previous?.id ?? (event.size === 2 ? key : newId()), members, total, target, shots};
      if (!mutateClass(group.id, next => {
        const saved = next.events.find(item => item.id === event.id);
        const index = saved.results.findIndex(item => item.id === result.id);
        if (index < 0) saved.results.push(result);
        else saved.results[index] = result;
      }, 'Résultat de séance enregistré.')) return;
      drafts.delete('training-row-' + event.id + '-' + key);
    }
    const scroll = document.querySelector('#training-entry .class-report-scroll')?.scrollLeft;
    render();
    const tableScroll = document.querySelector('#training-entry .class-report-scroll');
    if (tableScroll && scroll != null) tableScroll.scrollLeft = scroll;
  }

  return {html, click, change, preview, submit, reset() { selectedEvent = undefined; }};
}
