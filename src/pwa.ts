// PWA + Web Push helpers: service-worker registration, "Add to Home Screen" install prompt capture,
// and push subscription management. UI lives in PwaPrompts.tsx.
import { supabase } from './supabaseClient';
import { getTenantId } from './db';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/* ------------------------------ environment ------------------------------ */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC_KEY;

/* ------------------------------ service worker ------------------------------ */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}

/* ------------------------------ install prompt ------------------------------ */
// Chrome/Edge/Android fire `beforeinstallprompt` once, early — capture it at startup and hold it
// until the user has signed in, then show our own banner (Safari/iOS has no such event: PwaPrompts
// shows manual Share -> Add to Home Screen instructions instead).
let deferredInstall: any = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export const onPwaStateChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const canInstallNatively = () => !!deferredInstall;

export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferredInstall = e; notify(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; notify(); });
}
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstall) return 'unavailable';
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null; notify();
  return outcome;
}

/* ------------------------------ push subscription ------------------------------ */
const urlBase64ToUint8Array = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function getRegistration() {
  return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  try { return await (await getRegistration()).pushManager.getSubscription(); } catch { return null; }
}

// Saves (or refreshes) this device's subscription for the signed-in user. Idempotent: keyed on endpoint.
export async function saveSubscription(sub: PushSubscription, email: string) {
  const j: any = sub.toJSON();
  const tenant_id = getTenantId();
  if (!tenant_id || !j.keys) return;
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint, tenant_id, user_email: email.toLowerCase(),
    p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

// Must be called from a user gesture (button tap) — iOS and Chrome both require it for the permission prompt.
export async function enablePush(email: string): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await getRegistration();
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) }));
  await saveSubscription(sub, email);
  notify();
  return 'granted';
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
  notify();
}

// On every sign-in: if this browser already has permission, make sure its subscription is registered
// to the CURRENT user (a shared phone may have been used by someone else) and still valid.
export async function syncSubscriptionOnLogin(email: string) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await getRegistration();
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) }));
    await saveSubscription(sub, email);
  } catch (e) { console.warn('Push sync failed', e); }
}

// Asks the send-push edge function to deliver a just-created notification to its recipients' devices.
// Fire-and-forget: a push failure must never break the in-app notification that already succeeded.
export function triggerPush(notificationId: string) {
  supabase.functions.invoke('send-push', { body: { notificationId } }).catch((e) => console.warn('send-push failed', e));
}
