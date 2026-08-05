import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import * as S from './shared';

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
    <div className="h-screen relative overflow-hidden bg-slate-950 flex items-center justify-center p-6">
      {/* Abstract project-management-style backdrop: gantt bars, a kanban skyline and connector
          nodes rendered as soft, low-contrast SVG shapes over a deep gradient — evokes the app's
          domain without literally depicting a screenshot, and stays completely self-contained
          (no external image asset to fetch/host). */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#0d1330] to-brand-950"></div>
      <svg className="absolute inset-0 w-full h-full opacity-[0.35]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800" fill="none">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5b7cfa" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#5b7cfa" stopOpacity="0.15"/>
          </linearGradient>
        </defs>
        {/* Gantt-style bars, staggered */}
        {[ [60,120,260,14],[60,160,420,14],[60,200,180,14],[60,240,340,14],[60,280,520,14],[60,320,240,14] ].map((b,i)=>(
          <rect key={'g'+i} x={b[0]} y={b[1]} width={b[2]} height={b[3]} rx={7} fill="url(#barGrad)" />
        ))}
        {/* Kanban columns skyline, bottom-right */}
        {[ [780,520,60,280],[860,460,60,340],[940,560,60,240],[1020,420,60,380],[1100,500,60,300] ].map((c,i)=>(
          <rect key={'k'+i} x={c[0]} y={c[1]} width={c[2]} height={c[3]} rx={10} fill="#3b5bdb" fillOpacity={0.12 + (i%2)*0.06} stroke="#5b7cfa" strokeOpacity="0.25"/>
        ))}
        {/* Connector nodes + lines, top-right — a loose network/roadmap motif */}
        <g stroke="#7c9bff" strokeOpacity="0.35" strokeWidth="1.5">
          <path d="M760 90 L860 60 L960 110 L1080 70 L1150 130"/>
          <path d="M860 60 L880 160"/>
          <path d="M960 110 L1000 200"/>
        </g>
        {[[760,90],[860,60],[960,110],[1080,70],[1150,130],[880,160],[1000,200]].map((p,i)=>(
          <circle key={'n'+i} cx={p[0]} cy={p[1]} r={5} fill="#a5b8ff"/>
        ))}
        {/* Checklist ticks, lower-left */}
        <g stroke="#7c9bff" strokeOpacity="0.3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M70 640 l14 14 26-26"/>
          <path d="M70 690 l14 14 26-26"/>
          <path d="M70 740 l14 14 26-26"/>
        </g>
        <g stroke="#7c9bff" strokeOpacity="0.18" strokeWidth="10">
          <line x1="120" y1="646" x2="300" y2="646"/>
          <line x1="120" y1="696" x2="260" y2="696"/>
          <line x1="120" y1="746" x2="320" y2="746"/>
        </g>
      </svg>
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-500/10 blur-3xl"></div>
      <div className="absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full bg-brand-400/10 blur-3xl"></div>

      <div className="relative w-full max-w-sm" style={{ perspective: '1200px' }}>
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-lg shadow-brand-500/40">
            <S.Icon name="logo" className="w-6 h-6"/>
          </div>
          <div>
            <div className="font-semibold text-white text-base leading-tight">Trace PMT</div>
            <div className="text-[11px] text-slate-400 leading-tight">Project Management Tool</div>
          </div>
        </div>

        {/* The "3D box" — a layered, slightly tilted card: a soft blurred shadow card sits behind
            the real one, and the real one is rotated a couple degrees on X/Y so it reads as a
            floating panel rather than a flat form, without needing a hover interaction to notice. */}
        <div className="relative">
          <div className="absolute inset-0 translate-y-4 rounded-2xl bg-black/40 blur-2xl"></div>
          <div
            className="relative bg-white rounded-2xl shadow-[0_35px_80px_-15px_rgba(0,0,0,0.55)] border border-white/60 p-5 sm:p-6"
            style={{ transform: 'rotateX(2deg) rotateY(-1.5deg)', transformStyle: 'preserve-3d' }}
          >
            <div className="h-1 -mx-5 sm:-mx-6 -mt-5 sm:-mt-6 mb-5 rounded-t-2xl bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400"></div>

            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 mb-4 text-xs">
              <button type="button" onClick={()=>{setMode('signin');setErr('');setNotice('');}} className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-colors ${mode==='signin'?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>Sign In</button>
              <button type="button" onClick={()=>{setMode('signup');setErr('');setNotice('');}} className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-colors ${mode==='signup'?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>Create Account</button>
            </div>

            {notice && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">{notice}</div>}
            {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}

            <form onSubmit={submit} className="space-y-3">
              {mode==='signup' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-400">Full Name</label>
                    <input required value={name} onChange={e=>setName(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400">Phone</label>
                      <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Optional" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400">Designation</label>
                      <select value={designation} onChange={e=>setDesignation(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                        {S.DESIGNATIONS.map(d=><option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-400">Company Code</label>
                    <input required value={companyCode} onChange={e=>setCompanyCode(e.target.value)} placeholder="Given to you by your organization admin" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Email</label>
                <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Password</label>
                <input required type="password" value={password} onChange={e=>setPassword(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 text-white rounded-lg px-3 py-2.5 text-sm font-medium shadow-md shadow-brand-500/30 transition-colors">
                {busy ? (mode==='signin'?'Signing in…':'Creating account…') : (mode==='signin'?'Sign In':'Create Account')}
              </button>
            </form>

            {mode==='signup' && <div className="text-[11px] text-slate-400 mt-3 leading-relaxed">Joining an existing organization needs its company code, plus approval from an Admin/Super Admin/owner there once you sign up. Setting up a brand-new organization? Contact <span className="text-slate-500">hello@rosbinlabs.com</span>.</div>}
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-400 mt-6">Powered by Rosbin Labs</div>
      </div>
    </div>
  );
}
