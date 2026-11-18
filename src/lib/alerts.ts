// Sound, vibration and browser notifications for incoming files.
const KEY = 'maketransfer_alert_prefs_v1';

export interface AlertPrefs {
  sound: boolean;
  vibrate: boolean;
  notify: boolean;
}

const DEFAULTS: AlertPrefs = { sound: true, vibrate: true, notify: true };

export function getAlertPrefs(): AlertPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setAlertPrefs(patch: Partial<AlertPrefs>): AlertPrefs {
  const next = { ...getAlertPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationState(): NotificationState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotificationState;
}

export async function enableNotifications(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return (await Notification.requestPermission()) as NotificationState;
  } catch {
    return notificationState();
  }
}

let audio: AudioContext | null = null;
function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audio = audio || new Ctx();
    if (audio.state === 'suspended') void audio.resume();
    const now = audio.currentTime;
    [880, 1318].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.22);
      osc.connect(gain).connect(audio!.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.25);
    });
  } catch { /* autoplay blocked or unsupported */ }
}

async function showNotification(title: string, body: string, tag: string) {
  const options: NotificationOptions = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, options); return; } // required on Android Chrome
  } catch { /* fall through */ }
  try { new Notification(title, options); } catch { /* not allowed here */ }
}

export function alertIncoming(title: string, body: string, tag: string) {
  const prefs = getAlertPrefs();
  if (prefs.sound) chime();
  if (prefs.vibrate && typeof navigator.vibrate === 'function') navigator.vibrate([120, 60, 120]);
  if (prefs.notify && notificationState() === 'granted' && document.visibilityState === 'hidden') void showNotification(title, body, tag);
}
