import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

/* ============================ REPORTS: charts ============================
   Reports used to be tables and thin progress bars only. These are small, reusable Recharts
   wrappers -- one per chart shape (vertical bars, horizontal ranked bars, trend lines, donuts) --
   so every report gets the same look (brand palette, light gridlines, consistent tooltip/legend
   styling) without each report re-deriving its own chart config. Colors are hardcoded rather than
   pulled from Tailwind classes because Recharts renders plain SVG with inline styles -- the app's
   `.dark` class remap (see index.css) only rewrites Tailwind utility classes, so these charts stay
   light-styled even in dark mode. That's a known, accepted gap for this pass, not a bug.

   Pulled out of shared.tsx (2026-08-24, perf pass) so the ~recharts library isn't part of the
   eager/blocking bundle that loads on every page via App.tsx -> shared.tsx. shared.tsx is imported
   eagerly by App.tsx (not lazily), but this module is only ever imported by the Reports screen,
   which is already route-lazy-loaded -- so recharts now only downloads/parses when a user actually
   opens Reports, not on every page load. */
export const CHART_COLORS = ['#3b5bdb','#10b981','#f59e0b','#ef4444','#8b5cf6','#38bdf8','#f43f5e','#84cc16','#f97316','#6366f1'];
const chartAxisTick = { fontSize: 11, fill: '#94a3b8' };
const chartTooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' };

// Vertical bar chart, one or more series over a categorical x-axis -- monthly trend buckets, status
// mixes, per-department comparisons. `bars` = [{key, color, name?}].
export const BarChartMini = ({data, xKey, bars, height=220}: any) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{top:6, right:10, left:-16, bottom:0}}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
      <XAxis dataKey={xKey} tick={chartAxisTick} tickLine={false} axisLine={{stroke:'#e2e8f0'}}/>
      <YAxis tick={chartAxisTick} tickLine={false} axisLine={false} allowDecimals={false}/>
      <Tooltip contentStyle={chartTooltipStyle}/>
      {bars.length>1 && <Legend wrapperStyle={{fontSize:11}}/>}
      {bars.map((b:any)=><Bar key={b.key} dataKey={b.key} name={b.name||b.key} fill={b.color} radius={[4,4,0,0]} maxBarSize={38}/>)}
    </BarChart>
  </ResponsiveContainer>
);

// Horizontal bar chart -- ranked lists (top clients by revenue, overdue count by project, headroom
// by person) where the category label is too long to sit under a vertical bar.
export const HBarChartMini = ({data, xKey, barKey, color='#3b5bdb', height, name}: any) => (
  <ResponsiveContainer width="100%" height={height || Math.max(140, data.length*36)}>
    <BarChart data={data} layout="vertical" margin={{top:4, right:28, left:8, bottom:0}}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
      <XAxis type="number" tick={chartAxisTick} tickLine={false} axisLine={{stroke:'#e2e8f0'}} allowDecimals={false}/>
      <YAxis type="category" dataKey={xKey} tick={chartAxisTick} tickLine={false} axisLine={false} width={130}/>
      <Tooltip contentStyle={chartTooltipStyle}/>
      <Bar dataKey={barKey} name={name||barKey} fill={color} radius={[0,4,4,0]} maxBarSize={22}/>
    </BarChart>
  </ResponsiveContainer>
);

// Line chart -- trends over time (monthly buckets). `lines` = [{key, color, name?}].
export const LineChartMini = ({data, xKey, lines, height=220}: any) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart data={data} margin={{top:6, right:10, left:-16, bottom:0}}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
      <XAxis dataKey={xKey} tick={chartAxisTick} tickLine={false} axisLine={{stroke:'#e2e8f0'}}/>
      <YAxis tick={chartAxisTick} tickLine={false} axisLine={false} allowDecimals={false}/>
      <Tooltip contentStyle={chartTooltipStyle}/>
      {lines.length>1 && <Legend wrapperStyle={{fontSize:11}}/>}
      {lines.map((l:any)=><Line key={l.key} type="monotone" dataKey={l.key} name={l.name||l.key} stroke={l.color} strokeWidth={2.5} dot={{r:3}} activeDot={{r:5}}/>)}
    </LineChart>
  </ResponsiveContainer>
);

// Donut chart -- share/mix breakdowns. `data` = [{name, value, color?}]; falls back to CHART_COLORS
// cycled by index when a row has no explicit color.
export const DonutChartMini = ({data, height=220, showLegend=true}: any) => {
  const total = (data||[]).reduce((s:number,d:any)=>s+(Number(d.value)||0), 0);
  if (!total) return <div className="text-sm text-slate-400 text-center py-8">No data yet.</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((d:any,i:number)=><Cell key={i} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]}/>)}
        </Pie>
        <Tooltip contentStyle={chartTooltipStyle}/>
        {showLegend && <Legend wrapperStyle={{fontSize:11}} layout="vertical" verticalAlign="middle" align="right"/>}
      </PieChart>
    </ResponsiveContainer>
  );
};

// Consistent title/subtitle treatment above any chart -- every chart in Reports gets wrapped in one
// of these so the report body reads the same whether it's one chart or a chart plus a table below it.
export const ChartBlock = ({title, sub, children}: any) => (
  <div className="mb-5">
    {title && <div className="text-sm font-semibold text-slate-700 mb-0.5">{title}</div>}
    {sub && <div className="text-xs text-slate-400 mb-2">{sub}</div>}
    {children}
  </div>
);
