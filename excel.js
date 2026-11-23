import "./vendor/pako_inflate.min.js";
import {parseTime} from './metrics.js';

const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const decode = bytes => new TextDecoder().decode(bytes);

function openZip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < Math.max(0, bytes.length - 65557)) throw new Error('Ce fichier ne semble pas être un classeur .xlsx.');
  const entries = new Map();
  let offset = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);
  for (let index = 0; index < count; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Classeur illisible.');
    const length = view.getUint16(offset + 28, true);
    const name = decode(bytes.subarray(offset + 46, offset + 46 + length));
    entries.set(name, {method: view.getUint16(offset + 10, true), size: view.getUint32(offset + 20, true),
      expanded: view.getUint32(offset + 24, true), local: view.getUint32(offset + 42, true)});
    offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return async name => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.expanded > 12_000_000) throw new Error('Cette feuille Excel est trop volumineuse.');
    const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
    const compressed = bytes.subarray(start, start + entry.size);
    if (entry.method === 0) return decode(compressed);
    if (entry.method !== 8) throw new Error('Compression Excel non compatible.');
    const inflater = new globalThis.pako.Inflate({raw: true, chunkSize: 65536});
    const chunks = [];
    let length = 0;
    inflater.onData = chunk => {
      length += chunk.length;
      if (length > entry.expanded) throw new Error('Taille de feuille Excel incohérente.');
      chunks.push(chunk);
    };
    inflater.push(compressed, true);
    if (inflater.err || length !== entry.expanded) throw new Error('Feuille Excel illisible.');
    return new Blob(chunks).text();
  };
}

function xml(source) {
  const doc = new DOMParser().parseFromString(source ?? '', 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Le contenu Excel est illisible.');
  return doc;
}

const cellText = node => [...node.querySelectorAll('t')].map(part => part.textContent).join('');

export async function readRoster(file) {
  if (file.size > 10_000_000) throw new Error('Choisis un fichier Excel de moins de 10 Mo.');
  const read = openZip(await file.arrayBuffer());
  const [book, relationships, strings, styles] = await Promise.all([
    read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels'), read('xl/sharedStrings.xml'), read('xl/styles.xml')
  ]);
  const sheet = xml(book).querySelector('sheet');
  const sheetId = sheet?.getAttribute('r:id') ?? sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const target = [...xml(relationships).querySelectorAll('Relationship')].find(item => item.getAttribute('Id') === sheetId)?.getAttribute('Target');
  if (!target) throw new Error('Aucune feuille trouvée dans le classeur.');
  const path = new URL(target, 'https://xlsx.invalid/xl/workbook.xml').pathname.slice(1);
  const shared = strings ? [...xml(strings).querySelectorAll('si')].map(cellText) : [];
  const stylesDoc = styles ? xml(styles) : null;
  const formats = new Map([...stylesDoc?.querySelectorAll('numFmt') ?? []].map(node => [
    Number(node.getAttribute('numFmtId')), node.getAttribute('formatCode')
  ]));
  const styleIds = [...stylesDoc?.querySelectorAll('cellXfs > xf') ?? []].map(node => Number(node.getAttribute('numFmtId')));
  const rows = [...xml(await read(path)).querySelectorAll('sheetData > row')].map(row => {
    const columns = {};
    for (const cell of row.querySelectorAll('c')) {
      const col = cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
      if (!col) continue;
      const type = cell.getAttribute('t');
      const raw = cell.querySelector('v')?.textContent ?? '';
      const formatId = styleIds[Number(cell.getAttribute('s') ?? 0)];
      const timeFormat = [18,19,20,21,22,45,46,47].includes(formatId) || /h+\s*:|m+\s*:s+|\[s+\]/i.test(formats.get(formatId) ?? '');
      if (type === 's') columns[col] = shared[Number(raw)];
      else if (type === 'inlineStr') columns[col] = cellText(cell);
      else if ((!type || type === 'n') && raw !== '' && timeFormat) columns[col] = Math.round(Number(raw) * 8640000) / 100;
      else columns[col] = raw;
    }
    return {columns, number: row.getAttribute('r')};
  });
  const headerIndex = rows.findIndex(({columns}) => {
    const labels = Object.values(columns).map(normalize);
    return labels.includes('nom') && labels.includes('prenom');
  });
  if (headerIndex < 0) throw new Error('Ajoute les colonnes Nom et Prénom dans la première feuille.');
  const headers = Object.entries(rows[headerIndex].columns);
  const last = headers.find(([,value]) => normalize(value) === 'nom')[0];
  const first = headers.find(([,value]) => normalize(value) === 'prenom')[0];
  const reference = headers.find(([,value]) => /^(reference|temps|chrono)(\b|_)/.test(normalize(value)))?.[0];
  const students = [];
  for (const {columns, number} of rows.slice(headerIndex + 1)) {
    const surname = String(columns[last] ?? '').trim();
    const given = String(columns[first] ?? '').trim();
    const raw = String(columns[reference] ?? '').trim();
    if (!surname && !given && !raw) continue;
    if (!surname || !given) throw new Error(`Ligne ${number} · nom et prénom requis.`);
    const seconds = raw ? parseTime(raw) : null;
    if (raw && (!Number.isFinite(seconds) || seconds <= 0)) throw new Error(`Ligne ${number} · référence 200 m invalide.`);
    students.push({last: surname, first: given, reference: seconds});
  }
  if (!students.length) throw new Error('La feuille ne contient aucun élève.');
  return students;
}
