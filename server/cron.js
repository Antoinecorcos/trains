// Tâche horaire : rappels envoyés aux joueurs qui ont activé les notifications.
// Chaque rappel n'est envoyé qu'une fois (table push_log) et jamais la nuit (voir push.js).

import { network } from './network.js';
import { notify } from './push.js';
import { dailyKey } from '../public/js/drive/route.js';

const fr = new Intl.NumberFormat('fr-FR');

export async function cron(env, now = Date.now(), opts = {}) {
  const force = !!opts.force;
  const out = { users: 0, sent: 0 };
  const users = (await env.DB.prepare('SELECT DISTINCT p.user_id AS id, u.pseudo FROM push_subs p JOIN users u ON u.id = p.user_id').all()).results;
  out.users = users.length;
  if (!users.length) return out;

  // Chantiers terminés (lus avant que le calcul du réseau ne les solde)
  const works = await env.DB.prepare('SELECT user_id, station, until FROM stations WHERE until > 0 AND until <= ? AND user_id IN (SELECT user_id FROM push_subs)').bind(now).all();
  for (const w of works.results) {
    const r = await notify(env, w.user_id, { title: '🏗️ Chantier terminé', body: `La rénovation de ${w.station} est finie : la gare rapporte plus. Lance le chantier suivant !`, url: '/?tab=reseau', tag: 'chantier' }, { once: { kind: 'chantier', ref: `${w.station}:${w.until}` }, force });
    out.sent += r.sent;
  }

  // Caisses pleines : elles ne se remplissent plus, autant le dire
  for (const u of users) {
    const net = await network(env, u, now);
    const full = Object.entries(net.caisses).filter(([, c]) => c.cap > 0 && c.amount >= c.cap);
    if (!full.length) continue;
    const total = Object.values(net.caisses).reduce((s, c) => s + c.amount, 0);
    const r = await notify(env, u.id, { title: '💰 Caisses pleines', body: `${fr.format(total)} 🎟 t'attendent et elles ne se remplissent plus. Passe récolter !`, url: '/?tab=reseau', tag: 'caisse' }, { once: { kind: 'caisse', ref: full.map(([id, c]) => `${id}${c.since}`).join(',') }, force });
    out.sent += r.sent;
  }

  // Cadeau du jour : à 18 h (Paris), pour ceux dont la série risque de casser
  const parisHour = new Date(now + 3600000).getUTCHours();
  if (parisHour === 18 || force) {
    const today = dailyKey(new Date(now));
    const yesterday = dailyKey(new Date(now - 86400000));
    const rows = (await env.DB.prepare('SELECT user_id, streak FROM wallet WHERE last_daily = ? AND streak >= 2 AND user_id IN (SELECT user_id FROM push_subs)').bind(yesterday).all()).results;
    for (const w of rows) {
      const r = await notify(env, w.user_id, { title: '🎁 Ton cadeau du jour', body: `Série de ${w.streak} jours : ne la casse pas, ton cadeau t'attend.`, url: '/', tag: 'daily' }, { once: { kind: 'daily', ref: today }, force });
      out.sent += r.sent;
    }
  }
  return out;
}
