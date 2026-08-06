import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import * as S from './shared';

// Rosbin Labs' brand mark — a stylised pulse/heartbeat line rendered as connected dots, navy fading
// into brand blue. Mirrors the wordmark logo (navy -> blue zigzag, isolated trailing dot) so the
// sign-in screen reads as part of the same brand instead of a generic app login.
const PulseMark = ({ className }: any) => (
  <svg viewBox="0 0 108 60" className={className} fill="none">
    <defs>
      <linearGradient id="pulseGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="55%" stopColor="#3b5bdb" />
        <stop offset="100%" stopColor="#8fa8ff" />
      </linearGradient>
    </defs>
    <path d="M5 36 L20 47 L32 16 L44 52 L56 10 L68 36 L80 36" stroke="url(#pulseGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="5" cy="36" r="3" fill="#0f172a" />
    <circle cx="20" cy="47" r="3.5" fill="#1e2a5e" />
    <circle cx="32" cy="16" r="4" fill="#2f4bc7" />
    <circle cx="56" cy="10" r="5" fill="#3b5bdb" />
    <circle cx="80" cy="36" r="4" fill="#8fa8ff" />
    <circle cx="92" cy="47" r="2.5" fill="#a9bdff" />
  </svg>
);

// Sign-in / self sign-up screen. Self sign-up is for joining an EXISTING tenant only — new
// organizations are provisioned by the Rosbin Labs platform super admin from the Super Admin Panel
// (see SuperAdminPanel.tsx / App.tsx), which is also where a "Company Code" comes from. Every
// self sign-up lands as status "Pending Approval" inside that tenant — blocked from the app (see
// PendingApprovalScreen in App.tsx) until an Admin/Super Admin/owner approves them from
// Administration -> Users, where a notification also surfaces the request.
export default function Login(){
  const [mode, setMode] = useState<'signin'|'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('Associate');
  const [companyCode, setCompanyCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (e: any) => {
    e.preventDefault();
    setErr(''); setNotice(''); setBusy(true);
    try {
      if (mode==='signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (!companyCode.trim()) throw new Error('Company code is required — ask your organization admin for it.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { name: name.trim(), phone: phone.trim(), requestedDesignation: designation, companyCode: companyCode.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice('Account created — check your email to confirm it, then sign in. An admin will still need to approve you before you can get in.');
          setMode('signin');
        }
      }
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Brand panel — deep navy, the pulse mark, and letter-spaced uppercase copy lifted straight
          from the Rosbin Labs wordmark (navy -> blue gradient, thin rule + dot separators, generous
          tracking) so this reads as the same brand as the logo rather than a generic app login.
          Hidden below lg: the form alone carries the page on small screens. */}
      <div className="hidden lg:flex lg:w-[44%] xl:w-[40%] relative flex-col justify-between bg-slate-950 px-14 py-12 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(circle, #3b5bdb 1px, transparent 1px)', backgroundSize: '26px 26px' }}></div>
        <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-brand-500/20 blur-3xl"></div>
        <div className="absolute -bottom-32 -right-16 w-[26rem] h-[26rem] rounded-full bg-brand-400/10 blur-3xl"></div>

        <div className="relative flex items-center gap-3">
          <PulseMark className="w-9 h-9" />
          <div className="text-white font-medium tracking-[0.25em] text-sm">TRACE <span className="text-slate-400 font-normal">PMT</span></div>
        </div>

        <div className="relative">
          <PulseMark className="w-24 h-14 mb-9 opacity-95" />
          <div className="text-white text-3xl font-semibold leading-tight max-w-xs">Run every engagement with total clarity.</div>
          <div className="h-px w-14 bg-slate-700 my-7"></div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <span className="text-[11px] tracking-[0.3em] uppercase">Plan</span>
            <span className="w-1 h-1 rounded-full bg-brand-400"></span>
            <span className="text-[11px] tracking-[0.3em] uppercase">Track</span>
            <span className="w-1 h-1 rounded-full bg-brand-400"></span>
            <span className="text-[11px] tracking-[0.3em] uppercase">Deliver</span>
          </div>
          <p className="text-slate-500 text-sm leading-relaxed max-w-xs mt-5">Projects, phases, risks and billing for your consulting team — in one place, built for how you actually work.</p>
        </div>

        <div className="relative">
          <div className="h-px w-14 bg-slate-800 mb-4"></div>
          <div className="text-slate-600 text-[10px] tracking-[0.3em] uppercase">Powered by Rosbin Labs</div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10 bg-slate-50 lg:bg-white">
        <div className="lg:hidden flex items-center gap-2.5 mb-9">
          <PulseMark className="w-8 h-8" />
          <div className="text-slate-900 font-medium tracking-[0.2em] text-sm">TRACE <span className="text-slate-400 font-normal">PMT</span></div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7">
            <div className="text-slate-900 text-2xl font-semibold tracking-tight">{mode==='signin' ? 'Welcome back' : 'Create your account'}</div>
            <div className="text-slate-400 text-sm mt-1.5">{mode==='signin' ? 'Sign in to continue to Trace PMT.' : 'Join an existing organization on Trace PMT.'}</div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 mb-6 text-xs">
            <button type="button" onClick={()=>{setMode('signin');setErr('');setNotice('');}} className={`flex-1 px-3 py-2 rounded-md font-medium transition-colors ${mode==='signin'?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>Sign In</button>
            <button type="button" onClick={()=>{setMode('signup');setErr('');setNotice('');}} className={`flex-1 px-3 py-2 rounded-md font-medium transition-colors ${mode==='signup'?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>Create Account</button>
          </div>

          {notice && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">{notice}</div>}
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</div>}

          <form onSubmit={submit} className="space-y-4">
            {mode==='signup' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-slate-500 tracking-wide">Full Name</label>
                  <input required value={name} onChange={e=>setName(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-slate-500 tracking-wide">Phone</label>
                    <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Optional" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"/>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-slate-500 tracking-wide">Designation</label>
                    <select value={designation} onChange={e=>setDesignation(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow">
                      {S.DESIGNATIONS.map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-slate-500 tracking-wide">Company Code</label>
                  <input required value={companyCode} onChange={e=>setCompanyCode(e.target.value)} placeholder="Given to you by your organization admin" className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"/>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-wide">Email</label>
              <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 tracking-wide">Password</label>
              <input required type="password" value={password} onChange={e=>setPassword(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow"/>
            </div>
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 text-white rounded-lg px-3 py-3 text-sm font-medium shadow-md shadow-brand-500/25 transition-colors mt-1">
              {busy ? (mode==='signin'?'Signing in…':'Creating account…') : (mode==='signin'?'Sign In':'Create Account')}
            </button>
          </form>

          {mode==='signup' && <div className="text-[11px] text-slate-400 mt-4 leading-relaxed">Joining an existing organization needs its company code, plus approval from an Admin/Super Admin/owner there once you sign up. Setting up a brand-new organization? Contact <span className="text-slate-500">hello@rosbinlabs.com</span>.</div>}

          <div className="lg:hidden text-center text-[10px] tracking-[0.3em] uppercase text-slate-400 mt-9">Powered by Rosbin Labs</div>
        </div>
      </div>
    </div>
  );
}
