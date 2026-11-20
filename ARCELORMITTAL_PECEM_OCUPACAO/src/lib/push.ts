// Notificações no Windows: Service Worker + Web Push (lembretes enviados pelo servidor mesmo com o
// app fechado, desde que o navegador esteja em execução) e lembrete local quando o app está aberto.
import { supabase, VAPID_PUBLIC, errMsg } from './supabase';
import { db } from './db';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.register('./sw.js');
  } catch {
    return undefined;
  }
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enablePush(userId: string) {
  if (!pushSupported()) throw new Error('Este navegador não suporta notificações push. Use o Microsoft Edge ou Google Chrome no Windows.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada. Libere em Configurações do site no navegador.');
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW());
  if (!reg) throw new Error('Não foi possível registrar o service worker.');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) });
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, user_id: userId, subscription: sub.toJSON(), user_agent: navigator.userAgent }, { onConflict: 'endpoint' });
  if (error) throw new Error(errMsg(error));
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke('notify', { body: { teste: true } });
  if (error) throw new Error(errMsg(error));
  return data as { enviados: number };
}

/** Lembrete local (app aberto): dispara nos horários configurados, uma vez por dia/horário. */
export function startLocalReminders(getOpenCount: () => number) {
  const tick = () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const dow = now.getDay();
    if (dow === 0 || dow === 6) return;
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const slot of db.settings.lembretes ?? []) {
      if (hm < slot) continue;
      const key = `amp:lembrete:${now.toDateString()}:${slot}`;
      if (localStorage.getItem(key)) continue;
      // Só dispara até 2h após o horário (evita notificação atrasada ao abrir o app à noite).
      const [h, m] = slot.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() - (h * 60 + m) > 120) {
        localStorage.setItem(key, '1');
        continue;
      }
      localStorage.setItem(key, '1');
      const n = getOpenCount();
      if (!n) continue;
      navigator.serviceWorker?.getRegistration().then((reg) => {
        const opts = { body: `Você tem ${n} serviço(s) em aberto. Atualize horas, datas e status no sistema.`, icon: './icon-192.png', tag: 'amp-lembrete', data: { url: './#/atividades' } };
        if (reg) reg.showNotification(`Atualize seus serviços (${slot})`, opts);
        else new Notification(`Atualize seus serviços (${slot})`, opts);
      });
    }
  };
  tick();
  const id = window.setInterval(tick, 60_000);
  return () => window.clearInterval(id);
}
