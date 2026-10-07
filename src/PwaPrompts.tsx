import React, { useEffect, useState } from 'react';
import * as P from './pwa';

// Two small, dismissible banners shown only AFTER sign-in (Shell mounts this), on phones/tablets:
//  1. "Install Trace PMT" — native install sheet on Android/Chrome/Edge; Share -> Add to Home Screen
//     steps on iPhone/iPad Safari. Not shown once installed (standalone). Dismiss = ask again in 7 days.
//  2. "Turn on notifications" — shown once the app is installed (required on iOS) or, on Android/desktop,
//     right away. Dismiss = ask again in 7 days; if the browser has blocked notifications, a hint instead.
const SNOOZE_MS = 7 * 24 * 3600 * 1000;
const snoozed = (k: string) => { try { return Date.now() - Number(localStorage.getItem(k) || 0) < SNOOZE_MS; } catch { return false; } };
const snooze = (k: string) => { try { localStorage.setItem(k, String(Date.now())); } catch {} };

export default function PwaPrompts({ email }: { email: string }) {
  const [, force] = useState(0);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [iosHelp, setIosHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => P.onPwaStateChange(() => force((n) => n + 1)), []);
  useEffect(() => { P.syncSubscriptionOnLogin(email); }, [email]);
  useEffect(() => { P.currentPushSubscription().then((s) => setSubscribed(!!s)); }, [email, msg]);
  // Browser rotated the subscription -> re-register it.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const h = (e: MessageEvent) => { if (e.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') P.syncSubscriptionOnLogin(email); };
    navigator.serviceWorker.addEventListener('message', h);
    return () => navigator.serviceWorker.removeEventListener('message', h);
  }, [email]);

  const standalone = P.isStandalone();
  const mobile = P.isMobile();
  const showInstall = mobile && !standalone && !snoozed('pwa-install-snooze') && (P.canInstallNatively() || P.isIos());
  // iOS only allows web push for an installed home-screen app, so don't offer it there until installed.
  const pushReady = P.pushSupported() && (!P.isIos() || standalone);
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  const showPush = !showInstall && pushReady && subscribed === false && !denied && !snoozed('pwa-push-snooze') && (mobile || standalone);

  if (!showInstall && !showPush && !msg) return null;

  const install = async () => {
    if (P.canInstallNatively()) { await P.promptInstall(); force((n) => n + 1); }
    else setIosHelp(true);
  };
  const enable = async () => {
    setBusy(true);
    try {
      const r = await P.enablePush(email);
      setMsg(r === 'granted' ? 'Notifications are on for this device.' : r === 'denied' ? 'Notifications are blocked — allow them in your browser/phone settings for this site.' : '');
      setSubscribed(r === 'granted');
      if (r === 'granted') setTimeout(() => setMsg(''), 4000);
    } catch (e: any) { setMsg('Could not turn on notifications: ' + (e.message || 'unknown error')); }
    setBusy(false);
  };

  return (
    <div className="fixed left-3 right-3 bottom-[4.75rem] lg:bottom-4 lg:left-auto lg:right-4 lg:w-96 z-[60]" role="dialog" aria-live="polite">
      <div className="rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700 p-4">
        {showInstall && !iosHelp && (<>
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-lg shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-sm">Install Trace PMT</div>
              <div className="text-xs text-slate-300 mt-0.5">Add it to your home screen for one-tap access, a full-screen app experience and instant notifications.</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={install} className="flex-1 bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium rounded-lg py-2">Install app</button>
            <button onClick={() => { snooze('pwa-install-snooze'); force((n) => n + 1); }} className="px-3 text-sm text-slate-300 hover:text-white">Not now</button>
          </div>
        </>)}
        {showInstall && iosHelp && (<>
          <div className="font-semibold text-sm mb-2">Add Trace PMT to your Home Screen</div>
          <ol className="text-xs text-slate-300 space-y-1.5 list-decimal pl-4">
            <li>Tap the <b className="text-white">Share</b> button (square with an arrow) in Safari's toolbar.</li>
            <li>Scroll and tap <b className="text-white">Add to Home Screen</b>.</li>
            <li>Tap <b className="text-white">Add</b>, then open Trace PMT from your home screen.</li>
          </ol>
          <button onClick={() => { snooze('pwa-install-snooze'); setIosHelp(false); }} className="mt-3 w-full bg-slate-700 hover:bg-slate-600 text-sm rounded-lg py-2">Got it</button>
        </>)}
        {!showInstall && showPush && (<>
          <div className="font-semibold text-sm">Turn on notifications</div>
          <div className="text-xs text-slate-300 mt-0.5">Get alerted the moment an approval, remark, mention or deadline needs you — even when the app is closed.</div>
          <div className="flex gap-2 mt-3">
            <button onClick={enable} disabled={busy} className="flex-1 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2">{busy ? 'Enabling…' : 'Enable notifications'}</button>
            <button onClick={() => { snooze('pwa-push-snooze'); force((n) => n + 1); }} className="px-3 text-sm text-slate-300 hover:text-white">Not now</button>
          </div>
        </>)}
        {!showInstall && !showPush && msg && <div className="text-sm">{msg}</div>}
      </div>
    </div>
  );
}

// Permanent on/off switch for push notifications on THIS device, shown in the profile menu (the
// banner above only appears occasionally). Also covers desktop browsers.
export function PushToggle({ email }: { email: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { P.currentPushSubscription().then((s) => setOn(!!s)); }, []);
  if (!P.pushSupported()) return null;
  if (P.isIos() && !P.isStandalone()) {
    return <div className="px-2 py-1.5 text-xs text-slate-400">Install the app to your Home Screen to enable notifications.</div>;
  }
  const toggle = async () => {
    setBusy(true); setNote('');
    try {
      if (on) { await P.disablePush(); setOn(false); }
      else {
        const r = await P.enablePush(email);
        setOn(r === 'granted');
        if (r === 'denied') setNote('Blocked — allow notifications for this site in your browser settings.');
      }
    } catch (e: any) { setNote(e.message || 'Something went wrong.'); }
    setBusy(false);
  };
  return (
    <div className="mb-1">
      <button onClick={toggle} disabled={busy || on === null} className="w-full text-left text-sm text-slate-700 hover:bg-slate-50 rounded-lg px-2 py-1.5 flex items-center justify-between disabled:opacity-60">
        <span>Push notifications</span>
        <span className={'text-[11px] font-medium rounded-full px-2 py-0.5 ' + (on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{busy ? '…' : on ? 'On' : 'Off'}</span>
      </button>
      {note && <div className="px-2 text-[11px] text-red-500">{note}</div>}
    </div>
  );
}
