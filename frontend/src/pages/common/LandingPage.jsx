import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './landing.css';

/* ── Data ───────────────────────────────────────────── */
const BLOOD_TYPES = [
  { type: 'A+', donateTo: ['A+', 'AB+'], receiveFrom: ['A+', 'A-', 'O+', 'O-'], universal: false },
  { type: 'A-', donateTo: ['A+', 'A-', 'AB+', 'AB-'], receiveFrom: ['A-', 'O-'], universal: false },
  { type: 'B+', donateTo: ['B+', 'AB+'], receiveFrom: ['B+', 'B-', 'O+', 'O-'], universal: false },
  { type: 'B-', donateTo: ['B+', 'B-', 'AB+', 'AB-'], receiveFrom: ['B-', 'O-'], universal: false },
  { type: 'AB+', donateTo: ['AB+'], receiveFrom: ['All'], universal: true },
  { type: 'AB-', donateTo: ['AB+', 'AB-'], receiveFrom: ['A-', 'B-', 'O-', 'AB-'], universal: false },
  { type: 'O+', donateTo: ['A+', 'B+', 'O+', 'AB+'], receiveFrom: ['O+', 'O-'], universal: false },
  { type: 'O-', donateTo: ['All'], receiveFrom: ['O-'], universal: true },
];

const STEPS = [
  { icon: '📝', title: 'Register', desc: 'Create your account as a Donor or Hospital in minutes. Verify your identity securely.' },
  { icon: '🔔', title: 'Get Notified', desc: 'Receive real-time emergency blood request alerts matching your blood type and location.' },
  { icon: '🚗', title: 'Respond', desc: 'Accept the request and navigate to the hospital using live tracking and ETA guidance.' },
  { icon: '❤️', title: 'Save a Life', desc: 'Donate blood at the hospital and earn recognition badges for your heroic contribution.' },
];

const ELIGIBILITY = [
  {
    icon: '✅', title: 'Basic Requirements', cls: '',
    items: ['Age: 18 – 60 years', 'Weight: at least 45 kg (100 lbs)', 'Haemoglobin ≥ 12.5 g/dL (women), 13 g/dL (men)', 'Normal blood pressure (80–120 / 60–100 mmHg)', 'Good health on day of donation'],
  },
  {
    icon: '⏳', title: 'Donation Intervals', cls: '',
    items: ['Whole blood: every 90 days (3 months)', 'Platelets (apheresis): every 2 weeks', 'Plasma: every 28 days', 'Double red cells: every 112 days (16 weeks)', 'Inform staff of recent donations'],
  },
  {
    icon: '🚫', title: 'Temporary Disqualifications', cls: 'disqualify',
    items: ['Recent cold / fever (wait 2 weeks)', 'Tattoo or piercing (wait 12 months)', 'Pregnancy or recent childbirth', 'Recent surgery or dental work', 'Alcohol within 24 hours'],
  },
  {
    icon: '💊', title: 'Medications to Check', cls: 'note',
    items: ['Antibiotics — consult your doctor', 'Aspirin: wait 48 hrs for platelets', 'Blood thinners: may require deferral', 'Accutane / Propecia: specific wait periods', 'Always disclose all medications'],
  },
  {
    icon: '🏥', title: 'Medical History', cls: 'disqualify',
    items: ['HIV / Hepatitis B or C — permanent deferral', 'Cancer (some types) — case-by-case', 'Sickle cell disease', 'Chronic lung or heart conditions', 'Recent organ or bone marrow transplant'],
  },
  {
    icon: '🌍', title: 'Travel Restrictions', cls: 'note',
    items: ['Malaria-risk areas: 3–12 month wait', 'Chagas disease (S. America): screening required', 'Recent international travel — disclose destination', 'Consult the donation center when in doubt'],
  },
];

const FAQS = [
  { q: 'Is blood donation painful?', a: 'Most donors feel only a brief pinch when the needle is inserted. The donation process itself is painless and typically takes 8–10 minutes.' },
  { q: 'How long does the whole process take?', a: 'The entire visit — registration, health screening, donation, and refreshments — typically takes 45–60 minutes.' },
  { q: 'Can I donate if I have diabetes?', a: 'Donors with well-controlled diabetes who are not insulin-dependent may be eligible. Please consult the donation center for individual assessment.' },
  { q: 'What should I do before donating?', a: 'Stay well-hydrated, eat a healthy meal, avoid fatty foods, get a good night\'s sleep, and wear a comfortable short-sleeved shirt.' },
  { q: 'How does the emergency request work for hospitals?', a: 'Hospitals post an emergency blood request with the required blood type and quantity. Our system automatically identifies and notifies the nearest eligible donors in real time.' },
  { q: 'What are "Achievements" for donors?', a: 'Every donation earns you recognition badges — Bronze, Silver, Gold, and Platinum — based on your total number of donations and lives impacted.' },
];

const DONOR_GUIDE = [
  { title: 'Create Your Account', desc: 'Click "Register" → choose "Donor" → fill in your personal details, blood type, and location.' },
  { title: 'Complete Your Profile', desc: 'Add your availability schedule, last donation date, and any relevant health notes in the Profile section.' },
  { title: 'Receive Emergency Alerts', desc: 'When a nearby hospital needs your blood type, you\'ll get an instant in-app notification with full request details.' },
  { title: 'Accept & Navigate', desc: 'Click "Accept" on the alert. Use the live tracking map to navigate to the hospital and share your ETA.' },
  { title: 'Donate & Earn Badges', desc: 'After donating, your history updates automatically. Earn recognition badges and track your life-saving impact.' },
];

const HOSPITAL_GUIDE = [
  { title: 'Register Your Hospital', desc: 'Click "Register" → choose "Hospital" → submit your details. Admin review typically completes within 24 hours.' },
  { title: 'Log In After Approval', desc: 'Once approved, log in to your hospital dashboard to manage all blood requests and donor activity.' },
  { title: 'Post an Emergency Request', desc: 'Go to "New Request" → select blood type, urgency level, and units required. The system notifies matching donors instantly.' },
  { title: 'Track Donors Live', desc: 'Watch real-time donor movement on the tracking map, see ETAs, and communicate with incoming donors.' },
  { title: 'Manage Request History', desc: 'View past requests, fulfilled units, donor details, and download reports from the History section.' },
];

/* ── Counter hook ─────────────── */
function useCounter(target, duration = 2000, active = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration]);
  return count;
}

/* ── IntersectionObserver hook ── */
function useFade(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ── Stats Section ──────────────────────────────────── */
function StatsSection() {
  const [ref, visible] = useFade(0.2);
  const donors = useCounter(12450, 2000, visible);
  const units = useCounter(38200, 2200, visible);
  const hospitals = useCounter(340, 1800, visible);
  const lives = useCounter(9800, 2400, visible);
  return (
    <section className="lp-stats" ref={ref}>
      <div className="lp-container">
        <div className="lp-stats-grid">
          {[
            { icon: '🩸', num: donors.toLocaleString() + '+', label: 'Registered Donors' },
            { icon: '💉', num: units.toLocaleString() + '+', label: 'Blood Units Facilitated' },
            { icon: '🏥', num: hospitals.toLocaleString() + '+', label: 'Partner Hospitals' },
            { icon: '❤️', num: lives.toLocaleString() + '+', label: 'Lives Saved' },
          ].map((s, i) => (
            <div key={i}>
              <div className="lp-stats-icon">{s.icon}</div>
              <div className="lp-stats-num">{s.num}</div>
              <div className="lp-stats-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────── */
function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <div className="lp-faq">
      {FAQS.map((f, i) => (
        <div key={i} className={`lp-faq-item${open === i ? ' open' : ''}`}>
          <button className="lp-faq-q" onClick={() => setOpen(open === i ? null : i)}>
            <span>{f.q}</span>
            <span className="lp-faq-arrow">▼</span>
          </button>
          <div className="lp-faq-a">{f.a}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────── */
export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [guideTab, setGuideTab] = useState('donor');
  const [heroRef, heroVisible] = useFade(0.1);
  const [aboutRef, aboutVisible] = useFade(0.15);
  const [btRef, btVisible] = useFade(0.15);
  const [stepsRef, stepsVisible] = useFade(0.15);
  const [eligRef, eligVisible] = useFade(0.1);
  const [guideRef, guideVisible] = useFade(0.15);
  const [ctaRef, ctaVisible] = useFade(0.2);

  const activeGuide = guideTab === 'donor' ? DONOR_GUIDE : HOSPITAL_GUIDE;

  /* Redirect logged-in users to their dashboard */
  useEffect(() => {
    if (user) {
      if (user.role === 'admin') navigate('/admin', { replace: true });
      if (user.role === 'hospital') navigate('/hospital', { replace: true });
      if (user.role === 'donor') navigate('/donor', { replace: true });
    }
  }, [user, navigate]);

  /* Navbar scroll shadow */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ overflowX: 'hidden' }}>

      {/* ── NAVBAR ─────────────────────────────── */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <a href="#hero" className="lp-nav-logo">
            <div className="lp-nav-logo-icon"><img src="/logo.png" alt="" /></div>
            <span className="lp-nav-brand">Blood<span>On</span></span>
          </a>
          <div className="lp-nav-links">
            <a href="#about" className="lp-nav-link">About</a>
            <a href="#how" className="lp-nav-link">How It Works</a>
            <a href="#eligibility" className="lp-nav-link">Eligibility</a>
            <a href="#guide" className="lp-nav-link">Guide</a>
            <Link to="/login" className="lp-btn lp-btn-ghost" id="nav-login-btn">Login</Link>
            <Link to="/register" className="lp-btn lp-btn-primary" id="nav-register-btn">Register</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────── */}
      <section id="hero" className="lp-hero" ref={heroRef}>
        <div className="lp-hero-inner">
          {/* LEFT */}
          <div className={`lp-fade${heroVisible ? ' visible' : ''}`}>
            <div className="lp-hero-eyebrow">🔴 India's Intelligent Blood Donation Network</div>
            <h1 className="lp-hero-title">
              Donate Blood.
              <span>Save Lives Today.</span>
            </h1>
            <p className="lp-hero-desc">
              BloodOn connects verified donors with hospitals in real time — ensuring the right blood
              type reaches the right patient within the critical window. Every second counts. Be the reason
              someone survives.
            </p>
            <div className="lp-hero-cta">
              <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg" id="hero-register-btn">
                🩸 Become a Donor
              </Link>
              <Link to="/register" className="lp-btn lp-btn-outline lp-btn-lg" id="hero-hospital-btn">
                🏥 Register Hospital
              </Link>
            </div>
            <div className="lp-hero-trust">
              <div className="lp-hero-trust-item">✅ 12K+ Active Donors</div>
              <div className="lp-hero-trust-sep" />
              <div className="lp-hero-trust-item">🏥 340+ Hospitals</div>
              <div className="lp-hero-trust-sep" />
              <div className="lp-hero-trust-item">❤️ 9,800+ Lives Saved</div>
            </div>
          </div>

          {/* RIGHT – Blood Ecosystem Visual */}
          <div className={`lp-hero-visual lp-fade lp-fade-delay-2${heroVisible ? ' visible' : ''}`}>
            <div className="lp-ecosystem">

              {/* ── Sonar / Radar rings ── */}
              <div className="lp-radar">
                <div className="lp-radar-ring lp-radar-r1" />
                <div className="lp-radar-ring lp-radar-r2" />
                <div className="lp-radar-ring lp-radar-r3" />
              </div>

              {/* ── Central animated blood drop ── */}
              <div className="lp-eco-drop">
                <svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" className="lp-drop-main-svg">
                  <defs>
                    <linearGradient id="dg1" x1="0%" y1="0%" x2="55%" y2="100%">
                      <stop offset="0%" stopColor="#ef5350" />
                      <stop offset="100%" stopColor="#b71c1c" />
                    </linearGradient>
                    <radialGradient id="dg2" cx="35%" cy="25%" r="50%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.38)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </radialGradient>
                  </defs>
                  <path d="M50 4 C50 4 7 62 7 90 C7 115 27 128 50 128 C73 128 93 115 93 90 C93 62 50 4 50 4Z"
                    fill="url(#dg1)" />
                  <path d="M50 4 C50 4 7 62 7 90 C7 115 27 128 50 128 C73 128 93 115 93 90 C93 62 50 4 50 4Z"
                    fill="url(#dg2)" />
                  {/* Highlight streak */}
                  <ellipse cx="35" cy="54" rx="6" ry="17" fill="rgba(255,255,255,0.20)" transform="rotate(-22 35 54)" />
                  {/* Inner cross symbol */}
                  <rect x="44" y="78" width="12" height="3.5" rx="1.5" fill="rgba(255,255,255,0.75)" />
                  <rect x="48.25" y="74" width="3.5" height="12" rx="1.5" fill="rgba(255,255,255,0.75)" />
                </svg>

                {/* Live pulse ring directly around drop */}
                <div className="lp-drop-live-ring" />
              </div>

              {/* ── ECG Heartbeat line ── */}
              <div className="lp-ecg-strip">
                <svg viewBox="0 0 340 48" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="lp-ecg-svg">
                  <path className="lp-ecg-path"
                    d="M0 24 L50 24 L62 24 L72 6 L82 44 L92 4 L102 24 L118 24
                       M118 24 L170 24 L182 24 L192 6 L202 44 L212 4 L222 24 L240 24
                       M240 24 L340 24"
                    fill="none" stroke="var(--red-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="lp-ecg-label">❤ Live · Monitoring Active Donations</div>
              </div>

              {/* ── Floating stat badges ── */}
              <div className="lp-eco-badge lp-eco-badge-tl">
                <div className="lp-eco-badge-dot eco-green" />
                <div>
                  <div className="lp-eco-badge-num">12</div>
                  <div className="lp-eco-badge-lbl">Donors Nearby</div>
                </div>
              </div>

              <div className="lp-eco-badge lp-eco-badge-tr">
                <div className="lp-eco-badge-dot eco-red" />
                <div>
                  <div className="lp-eco-badge-num">O+</div>
                  <div className="lp-eco-badge-lbl">Active Emergency</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BANNER ─────────────────────── */}
      <StatsSection />

      {/* ── ABOUT ────────────────────────────── */}
      <section id="about" className="lp-section" ref={aboutRef}>
        <div className="lp-container">
          <div className="lp-about-grid">
            {/* About card */}
            <div className={`lp-about-card lp-fade${aboutVisible ? ' visible' : ''}`}>
              <div className="lp-about-card-hero">
                <div
                  style={{
                    height: "260px",
                    width: "100%",
                    overflow: "hidden",
                    borderRadius: "16px 16px 0 0",
                  }}
                >
                  <img
                    src="/bloodon1.jpg"
                    alt="Blood Donation"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover", // fills the container
                      display: "block",
                    }}
                  />
                </div>
              </div>
              <div className="lp-about-facts">
                <div className="lp-about-fact"><span className="lp-about-fact-icon">🌍</span><span>The WHO recommends a minimum blood donation rate of <strong>1% of the population</strong> to meet a nation's basic blood supply needs.</span></div>
                <div className="lp-about-fact"><span className="lp-about-fact-icon">⏱️</span><span>Every <strong>2 seconds</strong> someone in India needs blood — over 14,000 pints are needed every day.</span></div>
                <div className="lp-about-fact"><span className="lp-about-fact-icon">💪</span><span>One donation can save up to <strong>3 lives</strong> as blood is separated into red cells, plasma, and platelets.</span></div>
              </div>
            </div>

            {/* Text */}
            <div className={`lp-fade lp-fade-delay-2${aboutVisible ? ' visible' : ''}`}>
              <div className="lp-badge">💉 Why It Matters</div>
              <h2 className="lp-section-title">Blood Donation —<br />A Gift of Life</h2>
              <p className="lp-section-sub">
                Blood cannot be manufactured — it can only come from human donors. Patients undergoing surgery,
                cancer treatment, trauma care, or childbirth depend entirely on voluntary donation.
              </p>
              <ul className="lp-about-list">
                {[
                  'Blood has a limited shelf life (red cells: 42 days; platelets: only 5 days) — making continuous donation critical.',
                  'A healthy adult can safely donate every 3 months with zero long-term health impact.',
                  'BloodOn uses AI-driven donor ranking to match the most eligible, closest donor to each emergency in seconds.',
                  'Real-time GPS tracking and automated notifications eliminate the traditional manual search process entirely.',
                  'Hospitals can post emergency requests at any hour and receive confirmed donor ETAs within minutes.',
                ].map((item, i) => (
                  <li key={i}>
                    <div className="lp-about-check">✓</div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLOOD TYPE GRID ─────────────────── */}
      <section id="bloodtypes" className="lp-section lp-section-alt" ref={btRef}>
        <div className="lp-container">
          <div className={`lp-fade${btVisible ? ' visible' : ''}`} style={{ textAlign: 'center' }}>
            <div className="lp-badge">🩸 Compatibility Reference</div>
            <h2 className="lp-section-title">Blood Type Compatibility Guide</h2>
            <p className="lp-section-sub" style={{ margin: '12px auto 0' }}>
              Understanding your blood type lets you know who you can help — and who can help you in an emergency.
            </p>
          </div>
          <div className="lp-bt-grid">
            {BLOOD_TYPES.map((bt, i) => (
              <div key={bt.type} className={`lp-bt-card lp-fade lp-fade-delay-${(i % 4) + 1}${btVisible ? ' visible' : ''}${bt.universal ? ' lp-bt-universal' : ''}`}>
                <span className="lp-bt-symbol">{bt.type}</span>
                {bt.universal && (
                  <div className="lp-bt-universal-badge">
                    {bt.type === 'O-' ? '★ UNIVERSAL DONOR' : '★ UNIVERSAL RECEIVER'}
                  </div>
                )}
                <div className="lp-bt-row">
                  <strong>Donates to:</strong><br />
                  {(bt.donateTo[0] === 'All' ? ['All types'] : bt.donateTo).map(t => (
                    <span key={t} className="lp-bt-tag">{t}</span>
                  ))}
                </div>
                <div className="lp-bt-row" style={{ marginTop: 8 }}>
                  <strong>Receives from:</strong><br />
                  {(bt.receiveFrom[0] === 'All' ? ['All types'] : bt.receiveFrom).map(t => (
                    <span key={t} className="lp-bt-tag green">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────── */}
      <section id="how" className="lp-section" ref={stepsRef}>
        <div className="lp-container">
          <div className={`lp-fade${stepsVisible ? ' visible' : ''}`} style={{ textAlign: 'center' }}>
            <div className="lp-badge">🚀 Process Overview</div>
            <h2 className="lp-section-title">How BloodOn Works</h2>
            <p className="lp-section-sub" style={{ margin: '12px auto 0' }}>
              From registration to life-saving donation — a simple, transparent 4-step process.
            </p>
          </div>
          <div className="lp-steps" ref={stepsRef}>
            {STEPS.map((s, i) => (
              <div key={i} className={`lp-step lp-fade lp-fade-delay-${i + 1}${stepsVisible ? ' visible' : ''}`}>
                <div className="lp-step-num">{s.icon}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ELIGIBILITY ─────────────────────── */}
      <section id="eligibility" className="lp-section lp-section-alt" ref={eligRef}>
        <div className="lp-container">
          <div className={`lp-fade${eligVisible ? ' visible' : ''}`} style={{ textAlign: 'center' }}>
            <div className="lp-badge">📋 Who Can Donate</div>
            <h2 className="lp-section-title">Donor Eligibility Criteria</h2>
            <p className="lp-section-sub" style={{ margin: '12px auto 0' }}>
              Review the guidelines below. When in doubt, always consult the donation center staff — they are there to help.
            </p>
          </div>
          <div className="lp-elig-grid">
            {ELIGIBILITY.map((e, i) => (
              <div key={i} className={`lp-elig-card ${e.cls} lp-fade lp-fade-delay-${(i % 3) + 1}${eligVisible ? ' visible' : ''}`}>
                <span className="lp-elig-icon">{e.icon}</span>
                <div className="lp-elig-title">{e.title}</div>
                <ul className="lp-elig-list">
                  {e.items.map((item, j) => <li key={j}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── USER GUIDE ──────────────────────── */}
      <section id="guide" className="lp-guide" ref={guideRef}>
        <div className="lp-container">
          <div className={`lp-fade${guideVisible ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 56 }}>
            <div className="lp-badge">📖 User Guide</div>
            <h2 className="lp-section-title">How to Use BloodOn</h2>
            <p className="lp-section-sub" style={{ margin: '12px auto 0' }}>
              Step-by-step guide for donors and hospitals to get started quickly and effectively.
            </p>
          </div>
          <div className="lp-guide-inner">
            {/* Steps */}
            <div className={`lp-fade${guideVisible ? ' visible' : ''}`}>
              <div className="lp-guide-tabs">
                <button id="guide-donor-tab" className={`lp-guide-tab${guideTab === 'donor' ? ' active' : ''}`} onClick={() => setGuideTab('donor')}>🩸 For Donors</button>
                <button id="guide-hospital-tab" className={`lp-guide-tab${guideTab === 'hospital' ? ' active' : ''}`} onClick={() => setGuideTab('hospital')}>🏥 For Hospitals</button>
              </div>
              <div className="lp-guide-steps">
                {activeGuide.map((step, i) => (
                  <div key={i} className="lp-guide-step">
                    <div className="lp-guide-step-num">{i + 1}</div>
                    <div className="lp-guide-step-body">
                      <div className="lp-guide-step-title">{step.title}</div>
                      <div className="lp-guide-step-desc">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* FAQ */}
            <div className={`lp-fade lp-fade-delay-2${guideVisible ? ' visible' : ''}`}>
              <div style={{ marginBottom: 20 }}>
                <div className="lp-badge" style={{ marginBottom: 12 }}>❓ FAQ</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.2, color: 'var(--text-900)' }}>Frequently Asked<br />Questions</h3>
              </div>
              <FAQ />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────── */}
      <section className="lp-cta" ref={ctaRef}>
        <div className="lp-container">
          <div className={`lp-fade${ctaVisible ? ' visible' : ''}`}>
            <div className="lp-emergency-strip">
              <span className="lp-emergency-strip-icon">🚨</span>
              <div>
                <div className="lp-emergency-strip-label">Blood Emergency Helpline (24×7)</div>
                <div className="lp-emergency-strip-num">1800-180-BLOOD</div>
              </div>
              <div className="lp-emergency-sep" />
              <span className="lp-emergency-strip-icon">🏥</span>
              <div>
                <div className="lp-emergency-strip-label">National Blood Transfusion Council</div>
                <div className="lp-emergency-strip-num">011-23061804</div>
              </div>
            </div>
            <h2 className="lp-cta-title">Ready to Make a <span>Difference?</span></h2>
            <p className="lp-cta-sub">Join thousands of donors and hospitals on BloodOn — together we can eliminate blood shortages across India.</p>
            <div className="lp-cta-buttons">
              <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg" id="cta-register-btn">🩸 Register as Donor</Link>
              <Link to="/register" className="lp-btn lp-btn-outline lp-btn-lg" id="cta-hospital-btn">🏥 Register Hospital</Link>
              <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-lg" id="cta-login-btn">Sign In →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            {/* Brand */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div className="lp-nav-logo-icon"><img src="/logo.png" alt="" /></div>
                <span className="lp-nav-brand">Blood<span>On</span></span>
              </div>
              <p className="lp-footer-brand-desc">
                An intelligent emergency blood request management system connecting registered donors with hospitals
                in real time — powered by AI-driven ranking, geo-fencing, and live tracking.
              </p>
              <div className="lp-footer-tags">
                {['🌐 Web Portal', '🔒 HIPAA-Aware'].map(t => (
                  <span key={t} className="lp-footer-tag">{t}</span>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <div className="lp-footer-col-title">Quick Links</div>
              {[['#about', 'About Blood Donation'], ['#bloodtypes', 'Blood Type Guide'], ['#how', 'How It Works'], ['#eligibility', 'Eligibility']].map(([href, label]) => (
                <a key={href} href={href} className="lp-footer-link">{label}</a>
              ))}
            </div>

            {/* Platform */}
            <div>
              <div className="lp-footer-col-title">Platform</div>
              {[
                ['/login', 'Donor Login'],
                ['/login', 'Hospital Login'],
                ['/register', 'Register']
              ].map(([href, label]) => (
                <Link key={label} to={href} className="lp-footer-link" style={{ display: 'block' }}>{label}</Link>
              ))}
            </div>

            {/* Contact */}
            <div>
              <div className="lp-footer-col-title">Emergency</div>
              <a className="lp-footer-link" href="tel:18001800000">☎ 1800-180-BLOOD</a>
              <a className="lp-footer-link" href="tel:01123061804">☎ 011-2306-1804 (NBTC)</a>
              <a className="lp-footer-link" href="mailto:support@bloodOn.in">✉ support@bloodOn.in</a>
              <div style={{ marginTop: 16 }}>
                <div className="lp-footer-col-title">Blood Banks</div>
                <a className="lp-footer-link" href="http://tnblood.org" target="_blank" rel="noreferrer">TN Blood Bank ↗</a>
                <a className="lp-footer-link" href="http://blooddonor.in" target="_blank" rel="noreferrer">Blood Donor India ↗</a>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>© 2026 BloodOn. All rights reserved.</span>
            <span>Built with ❤️ to save lives · <a href="/login">Privacy Policy</a> · <a href="/login">Terms of Use</a></span>
          </div>
        </div>
      </footer>

    </div>
  );
}
