import { MOCK_ANALYTICS } from '../../data/mockData';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';

const monthly = MOCK_ANALYTICS.monthly;
const monthlyData = monthly.labels.map((l, i) => ({
  month: l,
  Requests: monthly.requests[i],
  Success: monthly.successRate[i],
}));

const BLOOD_COLORS = ['#e63946','#7c3aed','#0284c7','#22c55e','#f59e0b','#06b6d4','#a855f7','#f97316'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem' }}>
      <p style={{ color: 'var(--color-muted)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}{p.name === 'Success' ? '%' : ''}</p>)}
    </div>
  );
  return null;
};

const kpi = MOCK_ANALYTICS.kpis;

export default function Analytics() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Summary KPI row */}
      <div className="grid-4">
        {[
          { label: 'Total Requests', value: kpi.totalRequests.toLocaleString(), color: '#e63946' },
          { label: 'Success Rate',   value: `${kpi.successRate}%`,              color: '#22c55e' },
          { label: 'Avg Response',   value: `${kpi.avgResponseTime} min`,       color: '#7c3aed' },
          { label: 'Active Donors',  value: kpi.activeDonors.toLocaleString(),  color: '#0284c7' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '16px 20px', borderTop: `3px solid ${k.color}` }}>
            <p style={{ fontSize: '1.7rem', fontWeight: 800, color: k.color }}>{k.value}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: 4 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Monthly Requests */}
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Monthly Emergency Requests (2025)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Requests" fill="#e63946" radius={[5,5,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Success Rate Line + Blood Group Pie */}
      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Monthly Success Rate (%)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[82, 100]} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line dataKey="Success" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Requests by Blood Group</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ResponsiveContainer width={160} height={180}>
              <PieChart>
                <Pie data={MOCK_ANALYTICS.bloodGroupDist} dataKey="count" nameKey="group" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                  {MOCK_ANALYTICS.bloodGroupDist.map((_, i) => <Cell key={i} fill={BLOOD_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MOCK_ANALYTICS.bloodGroupDist.map((bg, i) => (
                <div key={bg.group} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: BLOOD_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', flex: 1, color: 'var(--color-text-2)' }}>{bg.group}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{bg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Donors Reliability */}
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Top Donor Reliability Rankings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { name: 'Ravi Kumar',    score: 94, donations: 12, bloodGroup: 'O+',  badge: '🥇' },
            { name: 'Sneha Reddy',   score: 91, donations: 9,  bloodGroup: 'O-',  badge: '🥇' },
            { name: 'Priya Sharma',  score: 88, donations: 7,  bloodGroup: 'A+',  badge: '🥈' },
            { name: 'Divya Nair',    score: 85, donations: 6,  bloodGroup: 'A-',  badge: '🥈' },
            { name: 'Karan Mehta',   score: 79, donations: 5,  bloodGroup: 'B-',  badge: null },
          ].map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: 'var(--color-bg-3)', borderRadius: 10 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-muted)', width: 18, textAlign: 'center' }}>#{i+1}</span>
              <div className="blood-badge">{d.bloodGroup}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>{d.name}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{d.donations} donations</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="progress-bar" style={{ width: 100 }}>
                  <div className="progress-fill" style={{ width: `${d.score}%`, '--from': d.score > 85 ? '#22c55e' : '#f59e0b', '--to': d.score > 85 ? '#22c55e' : '#f59e0b' }} />
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: 30 }}>{d.score}</span>
                {d.badge && <span style={{ fontSize: '1rem' }}>{d.badge}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
