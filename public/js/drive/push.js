// Notifications côté navigateur : abonnement Web Push via le service worker.
// Sur iPhone, elles ne marchent que si le jeu a été ajouté à l'écran d'accueil (iOS 16.4 ou plus).
import { api } from './api.js';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// iPhone ouvert dans Safari : il faut d'abord installer le jeu sur l'écran d'accueil
export const needsInstall = () => isIOS() && !standalone();

function keyBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js');
}

// État sur cet appareil : 'on' | 'off' | 'denied' | 'install' | 'unsupported'
export async function pushState() {
  if (needsInstall()) return 'install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

// À appeler depuis un geste du joueur (toucher un bouton) : iOS l'exige
export async function enablePush() {
  if (needsInstall()) throw new Error('Sur iPhone : Partager → « Sur l\'écran d\'accueil », puis ouvre Ukipu depuis son icône.');
  if (!pushSupported()) throw new Error('Ce navigateur ne gère pas les notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Tu peux les autoriser dans les réglages du navigateur.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { key } = await api.pushKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api.pushSubscribe(sub.toJSON());
  return sub;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  try { await api.pushUnsubscribe(sub.endpoint); } catch { /* le serveur nettoiera tout seul */ }
  await sub.unsubscribe();
}

// Garde l'abonnement à jour (le navigateur peut le renouveler) une fois connecté
export async function refreshPush() {
  if (!api.loggedIn || !pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await api.pushSubscribe(sub.toJSON());
  } catch { /* sans gravité */ }
}
