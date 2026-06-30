import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  Briefcase, User, Shield, FileText, BarChart2, Award, 
  ArrowRight, Upload, CheckCircle, AlertTriangle, Eye, EyeOff, 
  Download, Filter, RefreshCw, Send, Plus, Check, X, LogOut, 
  Sun, Moon, MessageSquare, BookOpen, ChevronRight, TrendingUp,
  UserCheck, Users, HelpCircle
} from 'lucide-react';

// ==========================================
// TYPES & INTERFACES
// ==========================================

interface User {
  id: number;
  name: string;
  email: string;
  role: 'Admin' | 'Recruiter' | 'Candidate';
  candidateId?: number | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
}

interface Job {
  job_id: number;
  recruiter_id: number;
  job_title: string;
  required_skills: string[];
  preferred_skills: string[];
  experience_required: number;
  min_cgpa: number;
  salary_range: string;
  location: string;
  created_at?: string;
}

interface Candidate {
  candidate_id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  education: string;
  college: string;
  degree: string;
  cgpa: number;
  experience_years: number;
  skills: string[];
  certifications: string[];
  projects: { name: string; desc: string }[];
  github: string;
  linkedin: string;
  gender: string;
  age: number;
  religion: string;
  caste: string;
  marital_status: string;
  address: string;
  application_status: 'Applied' | 'Under Review' | 'Shortlisted' | 'Rejected' | 'Selected';
  // Scoring parameters if loaded via rankings
  match_score?: number;
  skill_score?: number;
  experience_score?: number;
  education_score?: number;
  project_score?: number;
  certification_score?: number;
  final_weighted_score?: number;
  rank?: number;
}

// Course Mapping for Skill Gaps
const COURSE_RECOMMENDATIONS: Record<string, { title: string; provider: string; url: string }> = {
  'aws': { title: 'AWS Cloud Practitioner Essentials', provider: 'Coursera / AWS', url: '#' },
  'docker': { title: 'Docker Technologies for DevOps', provider: 'Udemy', url: '#' },
  'kubernetes': { title: 'Kubernetes Certified Administrator Boot Camp', provider: 'Linux Foundation', url: '#' },
  'spring boot': { title: 'Java Spring Framework & Spring Boot Masterclass', provider: 'Udemy', url: '#' },
  'python': { title: 'Python for Data Science and Machine Learning', provider: 'edX / Harvard', url: '#' },
  'machine learning': { title: 'Machine Learning Specialization by Andrew Ng', provider: 'Coursera / Stanford', url: '#' },
  'deep learning': { title: 'Deep Learning Specialization', provider: 'DeepLearning.AI', url: '#' },
  'nlp': { title: 'Natural Language Processing Nanodegree', provider: 'Udacity', url: '#' },
  'react': { title: 'React - The Complete Guide (incl. Hooks, React Router, Redux)', provider: 'Udemy', url: '#' },
  'sql': { title: 'Complete SQL Bootcamp: Go from Zero to Hero', provider: 'Udemy', url: '#' },
  'mongodb': { title: 'MongoDB Developer Associate Course', provider: 'MongoDB University', url: '#' },
  'typescript': { title: 'Understanding TypeScript - 2026 Edition', provider: 'Udemy', url: '#' }
};

// Default Backend URL fallback
const API_BASE = 'http://localhost:5000/api';

// ==========================================
// CONTEXTS
// ==========================================

const AuthContext = createContext<{
  auth: AuthState;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (name: string, email: string) => void;
} | null>(null);

const ThemeContext = createContext<{
  darkMode: boolean;
  toggleDarkMode: () => void;
} | null>(null);

// ==========================================
// FALLBACK SEED DATA (For fully standalone client operation)
// ==========================================
const MOCK_JOBS: Job[] = [
  {
    job_id: 1,
    recruiter_id: 2,
    job_title: 'Full Stack Java & Cloud Engineer',
    required_skills: ['Java', 'SQL', 'Spring Boot', 'AWS', 'Docker'],
    preferred_skills: ['React', 'Git', 'REST API'],
    experience_required: 3.0,
    min_cgpa: 8.0,
    salary_range: '$90,000 - $120,000',
    location: 'Seattle, WA (Hybrid)'
  },
  {
    job_id: 2,
    recruiter_id: 2,
    job_title: 'AI / Machine Learning Engineer',
    required_skills: ['Python', 'SQL', 'Machine Learning', 'Deep Learning', 'NLP'],
    preferred_skills: ['Docker', 'Kubernetes', 'Git'],
    experience_required: 2.0,
    min_cgpa: 8.5,
    salary_range: '$110,000 - $140,000',
    location: 'Remote, US'
  },
  {
    job_id: 3,
    recruiter_id: 2,
    job_title: 'DevOps & Platform Specialist',
    required_skills: ['Docker', 'Kubernetes', 'AWS', 'Git', 'Python'],
    preferred_skills: ['MySQL', 'REST API'],
    experience_required: 4.0,
    min_cgpa: 7.0,
    salary_range: '$100,000 - $130,000',
    location: 'Austin, TX (On-site)'
  },
  {
    job_id: 4,
    recruiter_id: 2,
    job_title: 'Frontend React Developer',
    required_skills: ['React', 'HTML', 'CSS', 'JavaScript', 'Git'],
    preferred_skills: ['MongoDB', 'Tailwind'],
    experience_required: 1.0,
    min_cgpa: 7.5,
    salary_range: '$75,000 - $95,000',
    location: 'Noida, UP (Hybrid)'
  }
];

const MOCK_CANDIDATES: Candidate[] = [
  {
    candidate_id: 1001,
    user_id: 3,
    full_name: 'John Doe',
    email: 'candidate1@example.com',
    phone: '+1 (555) 019-2834',
    education: 'B.Tech in Computer Science',
    college: 'National Institute of Technology',
    degree: 'Bachelor of Technology',
    cgpa: 8.5,
    experience_years: 3.5,
    skills: ['Java', 'SQL', 'React', 'Git', 'REST API', 'JavaScript', 'HTML', 'CSS'],
    certifications: ['AWS Certified Cloud Practitioner', 'Oracle Java SE 11 Programmer'],
    projects: [
      { name: 'E-commerce API', desc: 'Java Spring Boot project for shopping cart backend' },
      { name: 'Portfolio Website', desc: 'React static website with dark mode' }
    ],
    github: 'https://github.com/johndoe',
    linkedin: 'https://linkedin.com/in/johndoe',
    gender: 'Male',
    age: 25,
    religion: 'Christianity',
    caste: 'General',
    marital_status: 'Single',
    address: '123 Main St, Seattle, WA',
    application_status: 'Applied'
  },
  {
    candidate_id: 1002,
    user_id: 4,
    full_name: 'Jane Smith',
    email: 'candidate2@example.com',
    phone: '+1 (555) 014-9821',
    education: 'M.Tech in Artificial Intelligence',
    college: 'Indian Institute of Technology',
    degree: 'Master of Technology',
    cgpa: 9.2,
    experience_years: 2.0,
    skills: ['Python', 'SQL', 'Machine Learning', 'Deep Learning', 'NLP', 'Git', 'REST API'],
    certifications: ['Google Professional Data Engineer', 'DeepLearning.AI TensorFlow Developer'],
    projects: [
      { name: 'Resume Parser NLP', desc: 'Named Entity Recognition model for resume text extraction' },
      { name: 'Sentiment Classifier', desc: 'LSTM network to classify feedback' }
    ],
    github: 'https://github.com/janesmith',
    linkedin: 'https://linkedin.com/in/janesmith',
    gender: 'Female',
    age: 26,
    religion: 'Hinduism',
    caste: 'OBC',
    marital_status: 'Single',
    address: '456 Tech Park, Bangalore, KA',
    application_status: 'Under Review'
  },
  {
    candidate_id: 1003,
    user_id: 5,
    full_name: 'Bob Johnson',
    email: 'candidate3@example.com',
    phone: '+1 (555) 018-3729',
    education: 'B.Sc in Computer Science',
    college: 'State University',
    degree: 'Bachelor of Science',
    cgpa: 7.8,
    experience_years: 5.0,
    skills: ['Docker', 'Kubernetes', 'AWS', 'Python', 'Git', 'MySQL', 'REST API'],
    certifications: ['AWS Certified Solutions Architect', 'Certified Kubernetes Administrator (CKA)'],
    projects: [
      { name: 'DevOps Pipeline Automator', desc: 'CI/CD pipeline with GitHub Actions, Docker, and K8s' }
    ],
    github: 'https://github.com/bobjohnson',
    linkedin: 'https://linkedin.com/in/bobjohnson',
    gender: 'Male',
    age: 28,
    religion: 'None',
    caste: 'General',
    marital_status: 'Married',
    address: '789 Cloud Ave, Austin, TX',
    application_status: 'Shortlisted'
  },
  {
    candidate_id: 1004,
    user_id: 6,
    full_name: 'Alice Williams',
    email: 'candidate4@example.com',
    phone: '+1 (555) 012-7491',
    education: 'B.E. in Information Technology',
    college: 'Delhi Technological University',
    degree: 'Bachelor of Engineering',
    cgpa: 8.9,
    experience_years: 1.2,
    skills: ['React', 'HTML', 'CSS', 'JavaScript', 'Tailwind', 'Git', 'MongoDB'],
    certifications: ['Meta Front-End Developer Professional Certificate'],
    projects: [
      { name: 'Admin Dashboard', desc: 'Vite React dashboard with interactive graphs' },
      { name: 'Chat Web App', desc: 'Real-time chat client using Socket.io and React' }
    ],
    github: 'https://github.com/alicewilliams',
    linkedin: 'https://linkedin.com/in/alicewilliams',
    gender: 'Female',
    age: 23,
    religion: 'Hinduism',
    caste: 'General',
    marital_status: 'Single',
    address: '101 Sector 4, Noida, UP',
    application_status: 'Selected'
  }
];

// ==========================================
// MASTER PROVIDER & ENTRY
// ==========================================

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem('authToken');
    const userJson = localStorage.getItem('authUser');
    return {
      token: token,
      user: userJson ? JSON.parse(userJson) : null,
      loading: false
    };
  });

  const [page, setPage] = useState<string>('landing');
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  // Sync dark mode class
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  const login = (token: string, user: User) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    setAuth({ token, user, loading: false });
    
    // Auto route on login
    if (user.role === 'Admin') setPage('admin-dashboard');
    else if (user.role === 'Recruiter') setPage('recruiter-dashboard');
    else setPage('candidate-dashboard');
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setAuth({ token: null, user: null, loading: false });
    setSelectedJobId(null);
    setSelectedCandidateId(null);
    setPage('landing');
  };

  const updateUser = (name: string, email: string) => {
    if (auth.user) {
      const updated = { ...auth.user, name, email };
      localStorage.setItem('authUser', JSON.stringify(updated));
      setAuth(prev => ({ ...prev, user: updated }));
    }
  };

  const toggleDarkMode = () => setDarkMode(!darkMode);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      <AuthContext.Provider value={{ auth, login, logout, updateUser }}>
        <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
          <Header currentPage={page} setPage={setPage} />
          
          <main className="flex-1 flex flex-col">
            {page === 'landing' && <LandingPage setPage={setPage} />}
            {page === 'login' && <LoginPage setPage={setPage} />}
            {page === 'signup' && <SignupPage setPage={setPage} />}
            {page === 'candidate-dashboard' && <CandidateDashboard setPage={setPage} />}
            {page === 'recruiter-dashboard' && (
              <RecruiterDashboard 
                setPage={setPage} 
                selectedJobId={selectedJobId}
                setSelectedJobId={setSelectedJobId} 
                setSelectedCandidateId={setSelectedCandidateId} 
              />
            )}
            {page === 'admin-dashboard' && <AdminDashboard />}
            {page === 'resume-parser' && <ResumeParserPage />}
            {page === 'leaderboard' && <LeaderboardPage jobId={selectedJobId} setPage={setPage} setSelectedCandidateId={setSelectedCandidateId} />}
            {page === 'analytics' && <AnalyticsPage />}
            {page === 'reports' && <ReportsPage candidateId={selectedCandidateId} jobId={selectedJobId} setPage={setPage} />}
          </main>

          <Footer />
          <ChatbotWidget />
        </div>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
}

// ==========================================
// COMPONENT: HEADER
// ==========================================

function Header({ currentPage, setPage }: { currentPage: string; setPage: (p: string) => void }) {
  const authContext = useContext(AuthContext);
  const themeContext = useContext(ThemeContext);
  if (!authContext || !themeContext) return null;

  const { auth, logout } = authContext;
  const { darkMode, toggleDarkMode } = themeContext;

  const navigateToAnchor = (anchor: string) => {
    setPage('landing');
    setTimeout(() => {
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.hash = `#${anchor}`;
      }
    }, 100);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPage('landing')}>
          <div className="bg-gradient-to-tr from-blue-600 to-sky-400 p-2 rounded-lg text-white shadow-md shadow-blue-500/25">
            <Shield className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-sky-300">
            EquiScreen AI
          </span>
        </div>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {auth.user ? (
            <>
              {auth.user.role === 'Candidate' && (
                <button 
                  onClick={() => setPage('candidate-dashboard')}
                  className={`hover:text-blue-500 transition-colors ${currentPage === 'candidate-dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  My Dashboard
                </button>
              )}
              {auth.user.role === 'Recruiter' && (
                <>
                  <button 
                    onClick={() => setPage('recruiter-dashboard')}
                    className={`hover:text-blue-500 transition-colors ${currentPage === 'recruiter-dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    Recruiter Console
                  </button>
                  <button 
                    onClick={() => setPage('analytics')}
                    className={`hover:text-blue-500 transition-colors ${currentPage === 'analytics' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    Analytics
                  </button>
                </>
              )}
              {auth.user.role === 'Admin' && (
                <button 
                  onClick={() => setPage('admin-dashboard')}
                  className={`hover:text-blue-500 transition-colors ${currentPage === 'admin-dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  Admin Terminal
                </button>
              )}
              <button 
                onClick={() => setPage('resume-parser')}
                className={`hover:text-blue-500 transition-colors ${currentPage === 'resume-parser' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
              >
                Parser Sandbox
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigateToAnchor('features')} className="text-slate-600 hover:text-blue-500 dark:text-slate-300 transition-colors">Features</button>
              <button onClick={() => navigateToAnchor('science')} className="text-slate-600 hover:text-blue-500 dark:text-slate-300 transition-colors">Bias Protocol</button>
              <button onClick={() => setPage('resume-parser')} className="text-slate-600 hover:text-blue-500 dark:text-slate-300 transition-colors">Try Parser</button>
            </>
          )}
        </nav>

        {/* Action controls */}
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleDarkMode}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            title="Toggle theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {auth.user ? (
            <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="hidden lg:block text-right">
                <p className="text-xs font-semibold">{auth.user.name}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono capitalize">{auth.user.role}</p>
              </div>
              <button 
                onClick={logout}
                className="flex items-center gap-1.5 px-3 h-9 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-lg dark:text-rose-400 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 dark:border-rose-900/30 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPage('login')} 
                className="px-4 h-9 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Sign In
              </button>
              <button 
                onClick={() => setPage('signup')} 
                className="flex items-center gap-1 px-4 h-9 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 transition-all"
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ==========================================
// COMPONENT: FOOTER
// ==========================================

function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 bg-white py-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          &copy; 2026 EquiScreen AI Platform. Final-Year Engineering Major Project. Built with modern NLP algorithms and bias masking.
        </p>
        <div className="flex items-center gap-6 text-[11px] text-slate-400">
          <span>NLP Parsing</span>
          <span>Bias Protocol v1.4</span>
          <span>SQLite Storage</span>
        </div>
      </div>
    </footer>
  );
}

// ==========================================
// PAGE: LANDING PAGE
// ==========================================

function LandingPage({ setPage }: { setPage: (p: string) => void }) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-28 bg-gradient-to-b from-blue-50/50 via-transparent to-transparent dark:from-blue-950/10">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#0f172a10_1px,transparent_1px),linear-gradient(to_bottom,#0f172a10_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] dark:bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)]" />
        
        <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-100 dark:border-blue-900/30 mb-6">
            <Shield className="w-3.5 h-3.5" /> Major Engineering Project — Bias-Mitigating Recruitment
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Automated AI Resume Parsing & <br />
            <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-sky-300">
              Bias-Mitigated Candidate Screening
            </span>
          </h1>
          
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Eliminate hiring biases while accelerating evaluations. Upload resumes, extract skills using structured NLP algorithms, rank matches, and screen candidates anonymously.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => setPage('signup')}
              className="w-full sm:w-auto px-8 h-12 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setPage('resume-parser')}
              className="w-full sm:w-auto px-8 h-12 text-base font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Try NLP Parser
            </button>
          </div>

          {/* Interactive Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 text-left">
            {[
              { label: 'Total Candidates', value: '4 Seeded', desc: 'Prepopulated records' },
              { label: 'Jobs Seeded', value: '4 Active', desc: 'Various tech specs' },
              { label: 'Weights System', value: 'Fully Custom', desc: 'Adjust parameters' },
              { label: 'Masking Protocol', value: '8 Fields', desc: 'Names, gender, age...' }
            ].map((m, i) => (
              <div key={i} className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/80 p-5 rounded-xl shadow-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{m.label}</p>
                <p className="text-xl font-bold mb-1">{m.value}</p>
                <p className="text-[10px] text-slate-400">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" className="py-20 border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-900/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Engineered Core Modules</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-sm">
              Our system utilizes multiple interconnected engines to safely ingest, validate, and prioritize candidates based on technical merit.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
                title: 'AI Resume NLP Parser',
                desc: 'Extracts full candidate details, education details, and technical/soft skills automatically from PDF/DOCX resumes.'
              },
              {
                icon: <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
                title: 'Bias Mitigation Protocol',
                desc: 'Hides names, age, gender, address, and demographic details. Recruiters only see Candidate IDs during evaluations.'
              },
              {
                icon: <BarChart2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
                title: 'Dynamic Ranking Engine',
                desc: 'Computes matching scores using a customizable weighted sum of Skills, Experience, Education, Projects, and Certificates.'
              }
            ].map((f, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 rounded-xl hover:shadow-md transition-all">
                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg w-fit shadow-sm border border-slate-200/20 mb-4">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bias Science Protocol Section */}
      <section id="science" className="py-20 border-t border-slate-200 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-950/20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/30 mb-4">
                Anti-Bias Architecture
              </div>
              <h2 className="text-3xl font-bold mb-6">Anonymous Candidate Evaluation</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                Biased selections usually occur within the first 10 seconds of scanning a candidate profile. Our platform neutralizes unconscious recruiters' bias by automatically redacting identity details.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                Recruiters see objective qualification data, skills distributions, and weighted matching statistics. The actual identity of the candidate can only be requested and revealed by the system Administrator once shortlisting is finalized.
              </p>
              <div className="space-y-3">
                {[
                  'Automatic identity masking (Name, Age, Gender, Marital Status)',
                  'Address, religion, caste, and profile photos redacted',
                  'Candidate score evaluations calculated programmatically',
                  'Full audit trace logs for identity reveal events'
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <span className="text-xs font-mono font-bold text-slate-400">ANONYMIZED VIEW</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30">Anonymous Screening Active</span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg">
                  <div>
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Candidate ID: CAN-1002</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Experience: 2.0 Years | CGPA: 9.20</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black">92% Match</p>
                    <p className="text-[10px] text-slate-400">Final Score</p>
                  </div>
                </div>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <span className="text-slate-400">Full Name</span>
                    <span className="font-mono font-bold text-slate-500">★★★★★★★★★★</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <span className="text-slate-400">Gender / Age</span>
                    <span className="font-mono font-bold text-slate-500">███████ / ██</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <span className="text-slate-400">Religion / Caste</span>
                    <span className="font-mono font-bold text-slate-500">███████ / ████</span>
                  </div>
                  <div className="flex justify-between pb-1.5">
                    <span className="text-slate-400">Extractable Skills</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Python, Machine Learning, SQL, NLP</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ==========================================
// PAGE: LOGIN PAGE
// ==========================================

function LoginPage({ setPage }: { setPage: (p: string) => void }) {
  const { login } = useContext(AuthContext)!;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed.');
      }

      login(data.token, data.user);
    } catch (err: any) {
      console.warn('Backend login unavailable. Using mock authentication fallback.');
      
      // Standalone Login Fallback
      if (email === 'admin@example.com' && password === 'admin123') {
        login('mock-admin-token', { id: 1, name: 'System Admin', email: 'admin@example.com', role: 'Admin' });
      } else if (email === 'recruiter@example.com' && password === 'recruiter123') {
        login('mock-recruiter-token', { id: 2, name: 'Sarah Recruiter', email: 'recruiter@example.com', role: 'Recruiter' });
      } else if (email.startsWith('candidate') && password === 'candidate123') {
        const num = email.replace('candidate', '').replace('@example.com', '');
        const id = num ? parseInt(num) : 1;
        const mappedNames = ['John Doe', 'Jane Smith', 'Bob Johnson', 'Alice Williams'];
        login('mock-candidate-token', {
          id: id + 2,
          name: mappedNames[id - 1] || 'Sample Candidate',
          email,
          role: 'Candidate',
          candidateId: 1000 + id
        });
      } else {
        setError(err.message || 'Invalid credentials. Hint: use recruiter@example.com / recruiter123');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Password reset instructions have been dispatched to your email (Mocked).');
    setShowForgot(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 py-16 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black mb-2">
            {showForgot ? 'Forgot Password' : 'Welcome Back'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {showForgot ? 'Reset your credential instructions' : 'Sign in to access resume evaluation portals'}
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400 p-3 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!showForgot ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="recruiter@example.com"
                className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-500">Password</label>
                <button 
                  type="button" 
                  onClick={() => setShowForgot(true)}
                  className="text-[10px] text-blue-500 hover:underline font-semibold"
                >
                  Forgot Password?
                </button>
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Sign In'}
            </button>

            <div className="text-center pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Don't have an account?{' '}
                <button type="button" onClick={() => setPage('signup')} className="text-blue-500 font-semibold hover:underline">
                  Sign Up
                </button>
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Enter Registered Email</label>
              <input 
                type="email" 
                required
                placeholder="recruiter@example.com"
                className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => setShowForgot(false)}
                className="w-1/2 h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Back to Login
              </button>
              <button 
                type="submit"
                className="w-1/2 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Send Reset Link
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800">
          <p className="text-[11px] font-bold text-slate-400 mb-1.5 font-mono uppercase">Developer Quick Logins:</p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <button onClick={() => { setEmail('recruiter@example.com'); setPassword('recruiter123'); }} className="p-1 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded">
              Recruiter Demo
            </button>
            <button onClick={() => { setEmail('candidate1@example.com'); setPassword('candidate123'); }} className="p-1 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded">
              Candidate #1001 (John)
            </button>
            <button onClick={() => { setEmail('candidate2@example.com'); setPassword('candidate123'); }} className="p-1 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded">
              Candidate #1002 (Jane)
            </button>
            <button onClick={() => { setEmail('admin@example.com'); setPassword('admin123'); }} className="p-1 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded">
              Admin Console
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGE: SIGNUP PAGE
// ==========================================

function SignupPage({ setPage }: { setPage: (p: string) => void }) {
  const { login } = useContext(AuthContext)!;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Candidate' | 'Recruiter'>('Candidate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed.');

      setSuccess(true);
      setTimeout(() => {
        setPage('login');
      }, 1500);
    } catch (err: any) {
      console.warn('Backend unavailable during signup. Registering locally inside temporary mock memory.');
      setSuccess(true);
      setTimeout(() => {
        login('mock-new-user-token', {
          id: Math.round(Math.random() * 100) + 10,
          name,
          email,
          role,
          candidateId: role === 'Candidate' ? 1005 : null
        });
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 py-16 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black mb-2">Create Account</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Join the AI Resume Screen & Validation System</p>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400 p-3 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400 p-3 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>Account created successfully! Redirecting...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Select Your Portal Role</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                type="button"
                onClick={() => setRole('Candidate')}
                className={`h-10 text-xs font-bold rounded-lg border transition-all ${role === 'Candidate' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-850 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                Candidate Portal
              </button>
              <button 
                type="button"
                onClick={() => setRole('Recruiter')}
                className={`h-10 text-xs font-bold rounded-lg border transition-all ${role === 'Recruiter' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-850 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                Recruiter Portal
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Full Name</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Emma Watson"
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="emma@example.com"
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <button 
            type="submit"
            disabled={loading || success}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Register'}
          </button>

          <div className="text-center pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Already have an account?{' '}
              <button type="button" onClick={() => setPage('login')} className="text-blue-500 font-semibold hover:underline">
                Sign In
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// PAGE: CANDIDATE PORTAL / DASHBOARD
// ==========================================

function CandidateDashboard({ setPage }: { setPage: (p: string) => void }) {
  const { auth } = useContext(AuthContext)!;
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  
  // Profile Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [education, setEducation] = useState('');
  const [college, setCollege] = useState('');
  const [degree, setDegree] = useState('');
  const [cgpa, setCgpa] = useState(0.0);
  const [experience, setExperience] = useState(0.0);
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);
  const [newCert, setNewCert] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');

  // Loaded jobs to show match score and recommendations
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetchProfile();
    fetchJobs();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/candidate/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setProfile(data);
      setFullName(data.full_name || '');
      setPhone(data.phone || '');
      setEducation(data.education || '');
      setCollege(data.college || '');
      setDegree(data.degree || '');
      setCgpa(data.cgpa || 0.0);
      setExperience(data.experience_years || 0.0);
      setSkills(data.skills || []);
      setCertifications(data.certifications || []);
      setGithub(data.github || '');
      setLinkedin(data.linkedin || '');
    } catch (e) {
      console.warn('Backend unavailable. Seeding Candidate dashboard with mock John Doe.');
      const localCand = MOCK_CANDIDATES[0];
      setProfile(localCand);
      setFullName(localCand.full_name);
      setPhone(localCand.phone);
      setEducation(localCand.education);
      setCollege(localCand.college);
      setDegree(localCand.degree);
      setCgpa(localCand.cgpa);
      setExperience(localCand.experience_years);
      setSkills(localCand.skills);
      setCertifications(localCand.certifications);
      setGithub(localCand.github);
      setLinkedin(localCand.linkedin);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setJobs(data);
    } catch (e) {
      setJobs(MOCK_JOBS);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const body = {
        full_name: fullName,
        phone,
        education,
        college,
        degree,
        cgpa: parseFloat(cgpa.toString()),
        experience_years: parseFloat(experience.toString()),
        skills,
        certifications,
        projects: profile?.projects || [],
        github,
        linkedin
      };
      
      const response = await fetch(`${API_BASE}/candidate/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      alert('Profile updated and scores recalculated successfully!');
      fetchProfile();
    } catch (err: any) {
      alert('Updated profile saved to mock state memory.');
      setProfile((prev: any) => ({
        ...prev,
        full_name: fullName,
        phone,
        education,
        college,
        degree,
        cgpa,
        experience_years: experience,
        skills,
        certifications,
        github,
        linkedin
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadSuccess(false);
    
    const formData = new FormData();
    formData.append('resume', file);
    formData.append('candidate_id', profile?.candidate_id?.toString() || '');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/candidate/upload-resume`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setUploadSuccess(true);
      setParsedData(data.parsedData);
      fetchProfile();
    } catch (err: any) {
      console.warn('Backend upload failure. Simulating parsing extraction.');
      
      // Simulate rich parser extraction
      setTimeout(() => {
        const mockExtract = {
          fullName: fullName || 'Extracted Name',
          email: profile?.email || 'extracted@gmail.com',
          phone: phone || '+1 (555) 304-9841',
          skills: {
            technical: Array.from(new Set([...skills, 'Java', 'SQL', 'REST API', 'React', 'TypeScript'])),
            soft: ['Problem Solving', 'Communication', 'Teamwork']
          },
          education: [
            { degree: 'B.Tech CS', college: college || 'State Technical Institute', cgpa: cgpa || 8.4 }
          ],
          experienceYears: experience || 2.0,
          projects: profile?.projects || [{ name: 'Extracted ECommerce Backend', desc: 'Node.js Express project' }],
          certifications: Array.from(new Set([...certifications, 'AWS Certified Practitioner']))
        };

        setParsedData(mockExtract);
        setUploadSuccess(true);
        setSkills(mockExtract.skills.technical);
        setCertifications(mockExtract.certifications);
        setFullName(mockExtract.fullName);
        setPhone(mockExtract.phone);
        
        setProfile((prev: any) => ({
          ...prev,
          full_name: mockExtract.fullName,
          phone: mockExtract.phone,
          skills: mockExtract.skills.technical,
          certifications: mockExtract.certifications,
          experience_years: mockExtract.experienceYears,
          college: mockExtract.education[0].college,
          degree: mockExtract.education[0].degree,
          cgpa: mockExtract.education[0].cgpa
        }));
        setUploading(false);
      }, 1500);
    } finally {
      if (!parsedData) setLoading(false);
    }
  };

  const addSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  };

  const removeSkill = (sk: string) => {
    setSkills(skills.filter(s => s !== sk));
  };

  const addCert = () => {
    if (newCert.trim() && !certifications.includes(newCert.trim())) {
      setCertifications([...certifications, newCert.trim()]);
      setNewCert('');
    }
  };

  const removeCert = (cr: string) => {
    setCertifications(certifications.filter(c => c !== cr));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Calculate missing skills & course recommendations based on first job
  const activeJob = jobs[0];
  const requiredSkills = activeJob ? activeJob.required_skills : [];
  const missingSkills = requiredSkills.filter(s => !skills.map(sk => sk.toLowerCase()).includes(s.toLowerCase()));

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold mb-1">Candidate Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Candidate ID: <span className="font-mono font-bold">CAN-{profile?.candidate_id}</span> | Status:{' '}
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {profile?.application_status}
            </span>
          </p>
        </div>
      </div>

      {/* Grid Modules */}
      <div className="grid lg:grid-cols-3 gap-8">
        
        {/* Left Column: Uploader and Parsed Output */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Resume Upload Module */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-500" /> Upload Professional Resume
            </h3>
            
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-6 text-center hover:border-blue-500 dark:hover:border-blue-500 transition-colors relative">
              <input 
                type="file" 
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploading}
              />
              <div className="space-y-2">
                <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-full w-fit mx-auto text-slate-400">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold">Drag resume here or click to browse</p>
                <p className="text-[10px] text-slate-400">Supports PDF, DOC, DOCX</p>
              </div>
            </div>

            {uploading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-blue-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running NLP Parser Engine...</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400 p-3 rounded-lg text-[11px] flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Resume parsed successfully! Form prepopulated.</span>
              </div>
            )}
          </div>

          {/* Visual Parsed Results Card */}
          {parsedData && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm space-y-4">
              <h3 className="text-sm font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
                Last Extracted Resume Artifact
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <p className="text-slate-400 font-medium">Extracted Name</p>
                  <p className="font-semibold">{parsedData.fullName}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">Technical Skills</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {parsedData.skills.technical.map((s: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">Education Degree</p>
                  <p className="font-semibold">{parsedData.education[0]?.degree} at {parsedData.education[0]?.college}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">CGPA</p>
                  <p className="font-semibold">{parsedData.education[0]?.cgpa}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">Experience</p>
                  <p className="font-semibold">{parsedData.experienceYears} Years</p>
                </div>
              </div>
            </div>
          )}

          {/* Course Skill Gaps Recommender */}
          {missingSkills.length > 0 && (
            <div className="bg-gradient-to-tr from-blue-50 to-sky-50 dark:from-slate-900 dark:to-slate-950 border border-blue-100 dark:border-slate-800 p-6 rounded-xl shadow-sm">
              <h3 className="text-sm font-extrabold text-blue-800 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" /> Recommended Skill Bridge Courses
              </h3>
              <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                The platform identified gaps based on required skills for active jobs. Consider taking these courses:
              </p>
              <div className="space-y-3">
                {missingSkills.map((skill, idx) => {
                  const rec = COURSE_RECOMMENDATIONS[skill.toLowerCase()] || {
                    title: `Comprehensive ${skill} Development Training`,
                    provider: 'Udemy / Coursera',
                    url: '#'
                  };
                  return (
                    <div key={idx} className="bg-white/80 dark:bg-slate-900 p-3 rounded-lg border border-slate-200/50 dark:border-slate-800 flex justify-between items-start gap-2">
                      <div>
                        <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 mb-1">
                          Missing: {skill}
                        </span>
                        <p className="text-xs font-bold leading-tight">{rec.title}</p>
                        <p className="text-[10px] text-slate-400">{rec.provider}</p>
                      </div>
                      <a 
                        href={rec.url}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-600 self-center whitespace-nowrap"
                        onClick={(e) => e.preventDefault()}
                      >
                        Enroll Now
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Editable Profile Data Form */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Application Status Tracker */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-wider">Application Tracking System (ATS)</h3>
            <div className="relative flex justify-between items-center max-w-lg mx-auto">
              
              {/* Tracker lines */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 dark:bg-slate-800 -translate-y-1/2 z-0" />
              
              {['Applied', 'Under Review', 'Shortlisted', 'Selected'].map((status, index) => {
                const statusOrder = ['Applied', 'Under Review', 'Shortlisted', 'Selected', 'Rejected'];
                const currentIdx = statusOrder.indexOf(profile?.application_status);
                const stepIdx = statusOrder.indexOf(status);
                
                const isCompleted = stepIdx <= currentIdx && profile?.application_status !== 'Rejected';
                const isRejected = profile?.application_status === 'Rejected' && status === 'Shortlisted';
                
                return (
                  <div key={index} className="flex flex-col items-center z-10">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border transition-all ${
                      isCompleted 
                        ? 'bg-blue-600 border-blue-600 text-white' 
                        : isRejected 
                          ? 'bg-rose-500 border-rose-500 text-white' 
                          : 'bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-700'
                    }`}>
                      {isCompleted ? <Check className="w-4 h-4" /> : isRejected ? <X className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className="text-[10px] font-bold mt-2 text-slate-500 dark:text-slate-400">{status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-xl shadow-sm">
            <h2 className="text-lg font-extrabold mb-6">Candidate Information Form</h2>
            
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              
              {/* Personal Fields */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Full Name</label>
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone Number</label>
                  <input 
                    type="text" 
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Education Fields */}
              <div className="grid md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">College / Institution</label>
                  <input 
                    type="text" 
                    value={college}
                    onChange={e => setCollege(e.target.value)}
                    placeholder="IIT Bombay"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Degree</label>
                  <input 
                    type="text" 
                    value={degree}
                    onChange={e => setDegree(e.target.value)}
                    placeholder="B.Tech CS"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">CGPA</label>
                  <input 
                    type="number" 
                    step="0.01"
                    max="10"
                    value={cgpa}
                    onChange={e => setCgpa(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Experience Fields */}
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Experience (Years)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={experience}
                    onChange={e => setExperience(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">GitHub</label>
                  <input 
                    type="text" 
                    value={github}
                    onChange={e => setGithub(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">LinkedIn</label>
                  <input 
                    type="text" 
                    value={linkedin}
                    onChange={e => setLinkedin(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Dynamic Skill tags */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Extracted Technical Skills</label>
                <div className="flex flex-wrap gap-1.5 mb-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg min-h-[50px]">
                  {skills.length === 0 ? (
                    <span className="text-xs text-slate-400 self-center">No skills listed yet. Add some below.</span>
                  ) : (
                    skills.map((s, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded font-semibold text-xs">
                        {s}
                        <button type="button" onClick={() => removeSkill(s)} className="text-blue-500 hover:text-rose-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newSkill}
                    onChange={e => setNewSkill(e.target.value)}
                    placeholder="Python, Spring Boot..."
                    className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm flex-1"
                  />
                  <button 
                    type="button" 
                    onClick={addSkill}
                    className="px-4 h-10 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    Add Skill
                  </button>
                </div>
              </div>

              {/* Dynamic Certifications */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Certifications</label>
                <div className="flex flex-wrap gap-1.5 mb-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg min-h-[50px]">
                  {certifications.length === 0 ? (
                    <span className="text-xs text-slate-400 self-center">No certifications listed yet.</span>
                  ) : (
                    certifications.map((c, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-350 rounded font-semibold text-xs">
                        {c}
                        <button type="button" onClick={() => removeCert(c)} className="text-slate-400 hover:text-rose-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newCert}
                    onChange={e => setNewCert(e.target.value)}
                    placeholder="AWS Solutions Architect..."
                    className="h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm flex-1"
                  />
                  <button 
                    type="button" 
                    onClick={addCert}
                    className="px-4 h-10 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    Add Certification
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="submit"
                  disabled={saving}
                  className="px-6 h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGE: RECRUITER PORTAL / DASHBOARD
// ==========================================

function RecruiterDashboard({ 
  setPage, 
  selectedJobId,
  setSelectedJobId, 
  setSelectedCandidateId 
}: { 
  setPage: (p: string) => void; 
  selectedJobId: number | null;
  setSelectedJobId: (id: number) => void;
  setSelectedCandidateId: (id: number) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddJob, setShowAddJob] = useState(false);
  const [anonymousMode, setAnonymousMode] = useState(true);

  // Job creation Form states
  const [jobTitle, setJobTitle] = useState('');
  const [reqSkillsInput, setReqSkillsInput] = useState('');
  const [prefSkillsInput, setPrefSkillsInput] = useState('');
  const [expRequired, setExpRequired] = useState(2.0);
  const [minCgpa, setMinCgpa] = useState(8.0);
  const [salary, setSalary] = useState('$90,000 - $110,000');
  const [location, setLocation] = useState('Remote, US');
  const [submittingJob, setSubmittingJob] = useState(false);

  // Filter conditions
  const [selectedSkillFilter, setSelectedSkillFilter] = useState('');
  const [minExpFilter, setMinExpFilter] = useState(0);
  const [minCgpaFilter, setMinCgpaFilter] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchJobsAndCandidates();
    fetchConfig();
  }, []);

  const fetchJobsAndCandidates = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const jobsRes = await fetch(`${API_BASE}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const candsRes = await fetch(`${API_BASE}/recruiter/candidates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!jobsRes.ok || !candsRes.ok) throw new Error();

      const jobsData = await jobsRes.json();
      const candsData = await candsRes.json();
      setJobs(jobsData);
      setCandidates(candsData);
    } catch (e) {
      console.warn('Backend unavailable. Seeding Recruiter dashboard with mock seed data.');
      setJobs(MOCK_JOBS);
      setCandidates(MOCK_CANDIDATES);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/recruiter/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setAnonymousMode(data.anonymousScreeningMode);
    } catch (e) {}
  };

  const toggleAnonymousMode = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/recruiter/toggle-anonymous`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAnonymousMode(data.anonymousScreeningMode);
        // Refresh candidates with new mask state
        fetchJobsAndCandidates();
      }
    } catch (e) {
      const updated = !anonymousMode;
      setAnonymousMode(updated);
      // Simulate client side mask toggling
      setCandidates(prev => {
        return prev.map(c => {
          const original = MOCK_CANDIDATES.find(o => o.candidate_id === c.candidate_id);
          if (!original) return c;
          if (updated) {
            return {
              ...c,
              full_name: `Candidate #${c.candidate_id}`,
              email: 'masked@screening.platform',
              phone: '***-***-****',
              address: 'Masked Location',
              gender: 'Masked',
              age: 24,
              religion: 'Masked',
              caste: 'Masked',
              marital_status: 'Masked',
              github: 'https://github.com/masked',
              linkedin: 'https://linkedin.com/masked'
            };
          } else {
            return original;
          }
        });
      });
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingJob(true);
    
    const required_skills = reqSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const preferred_skills = prefSkillsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

    const body = {
      job_title: jobTitle,
      required_skills,
      preferred_skills,
      experience_required: parseFloat(expRequired.toString()),
      min_cgpa: parseFloat(minCgpa.toString()),
      salary_range: salary,
      location
    };

    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error();
      
      setShowAddJob(false);
      fetchJobsAndCandidates();
      alert('Job created and candidate matching scores evaluated!');
    } catch (err) {
      // Offline fallback
      const mockNewJob: Job = {
        job_id: jobs.length + 1,
        recruiter_id: 2,
        job_title: jobTitle,
        required_skills,
        preferred_skills,
        experience_required: expRequired,
        min_cgpa: minCgpa,
        salary_range: salary,
        location
      };
      setJobs([mockNewJob, ...jobs]);
      setShowAddJob(false);
      alert('Seeded job simulated in memory dashboard.');
    } finally {
      setSubmittingJob(false);
    }
  };

  const handleUpdateStatus = async (candidateId: number, status: Candidate['application_status']) => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/candidate/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ candidate_id: candidateId, status })
      });
      if (res.ok) {
        fetchJobsAndCandidates();
      }
    } catch (e) {
      setCandidates(prev => prev.map(c => c.candidate_id === candidateId ? { ...c, application_status: status } : c));
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Apply filters
  const filteredCandidates = candidates.filter(c => {
    if (selectedSkillFilter && !c.skills.map(s => s.toLowerCase()).includes(selectedSkillFilter.toLowerCase())) return false;
    if (minExpFilter > 0 && c.experience_years < minExpFilter) return false;
    if (minCgpaFilter > 0 && c.cgpa < minCgpaFilter) return false;
    if (statusFilter && c.application_status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold mb-1">Recruiter Console</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Deploy job descriptions, filter candidates, and rank applicants objectively</p>
        </div>
        
        {/* Toggle Protocol and Create Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleAnonymousMode}
            className={`flex items-center gap-2 px-4 h-10 text-xs font-black rounded-lg border shadow-sm transition-all ${
              anonymousMode 
                ? 'bg-amber-600 border-amber-600 text-white shadow-amber-500/10' 
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
            }`}
          >
            {anonymousMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            Anonymous Screening: {anonymousMode ? 'ON (Masked)' : 'OFF (Identities Exposed)'}
          </button>
          
          <button 
            onClick={() => setShowAddJob(true)}
            className="flex items-center gap-1.5 px-4 h-10 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md shadow-blue-500/15"
          >
            <Plus className="w-4 h-4" /> Create Job Opening
          </button>
        </div>
      </div>

      {/* Grid: Job Listings (Left) vs Candidate List (Right) */}
      <div className="grid lg:grid-cols-3 gap-8">
        
        {/* Left Column: Job Openings Cards */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-400 mb-4 uppercase tracking-wider">Active Openings ({jobs.length})</h3>
            
            <div className="space-y-3">
              {jobs.map((job) => (
                <div 
                  key={job.job_id}
                  className="bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-600 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <h4 className="font-extrabold text-sm">{job.job_title}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{job.location} | Exp Required: {job.experience_required} yrs</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.required_skills.slice(0, 3).map((s, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded font-mono text-[9px] font-semibold border border-slate-200/40">
                          {s}
                        </span>
                      ))}
                      {job.required_skills.length > 3 && (
                        <span className="text-[9px] text-slate-400 self-center">+{job.required_skills.length - 3} more</span>
                      )}
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setSelectedJobId(job.job_id);
                      setPage('leaderboard');
                    }}
                    className="w-full mt-4 h-8 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 dark:text-blue-400 font-extrabold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5" /> View Match Leaderboard
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Candidates Table & Filters */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm font-extrabold border-b border-slate-100 dark:border-slate-800 pb-3 mb-6">
              Recruitment Candidate Database ({filteredCandidates.length})
            </h3>
            
            {/* Filter Drawer */}
            <div className="grid sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-850 p-4 rounded-xl mb-6 border border-slate-200/50 dark:border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Filter by Skill</label>
                <input 
                  type="text" 
                  value={selectedSkillFilter}
                  onChange={e => setSelectedSkillFilter(e.target.value)}
                  placeholder="Java, Python..."
                  className="w-full h-8 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded text-xs"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Min Experience</label>
                <select 
                  value={minExpFilter} 
                  onChange={e => setMinExpFilter(parseInt(e.target.value))}
                  className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded text-xs"
                >
                  <option value={0}>Any Experience</option>
                  <option value={1}>1+ Years</option>
                  <option value={3}>3+ Years</option>
                  <option value={5}>5+ Years</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Min CGPA</label>
                <select 
                  value={minCgpaFilter} 
                  onChange={e => setMinCgpaFilter(parseFloat(e.target.value))}
                  className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded text-xs"
                >
                  <option value={0}>Any Grade</option>
                  <option value={7.5}>7.5+ CGPA</option>
                  <option value={8.5}>8.5+ CGPA</option>
                  <option value={9.0}>9.0+ CGPA</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hiring Status</label>
                <select 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded text-xs"
                >
                  <option value="">All Statuses</option>
                  <option value="Applied">Applied</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Shortlisted">Shortlisted</option>
                  <option value="Selected">Selected</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>

            {/* Candidates Table List */}
            {filteredCandidates.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2" />
                <p className="text-xs">No candidates match your current filter selection.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                      <th className="py-3 px-2">ID</th>
                      <th className="py-3 px-2">Candidate Display Name</th>
                      <th className="py-3 px-2">Experience</th>
                      <th className="py-3 px-2">Education / CGPA</th>
                      <th className="py-3 px-2">Pipeline Stage</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCandidates.map(c => (
                      <tr key={c.candidate_id} className="border-b border-slate-100 dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                        <td className="py-3.5 px-2 font-mono font-bold text-slate-400">#{c.candidate_id}</td>
                        <td className="py-3.5 px-2">
                          <p className="font-extrabold">{c.full_name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{c.email}</p>
                        </td>
                        <td className="py-3.5 px-2 font-semibold">{c.experience_years} Years</td>
                        <td className="py-3.5 px-2">
                          <p className="font-medium">{c.degree}</p>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">CGPA: {c.cgpa}</p>
                        </td>
                        <td className="py-3.5 px-2">
                          <select
                            value={c.application_status}
                            onChange={(e) => handleUpdateStatus(c.candidate_id, e.target.value as any)}
                            className="bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200/50 dark:border-slate-750 font-semibold"
                          >
                            <option value="Applied">Applied</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Shortlisted">Shortlisted</option>
                            <option value="Selected">Selected</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <button
                            onClick={() => {
                              setSelectedCandidateId(c.candidate_id);
                              // Auto link to the first job if none selected
                              if (!selectedJobId && jobs.length > 0) setSelectedJobId(jobs[0].job_id);
                              setPage('reports');
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 rounded font-bold transition-colors"
                          >
                            Inspect & Export
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Job Description Modal */}
      {showAddJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl w-full max-w-xl shadow-2xl relative">
            <button 
              onClick={() => setShowAddJob(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-black mb-6">Create Job Opening Profile</h2>
            
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Job Title</label>
                <input 
                  type="text" 
                  required
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="Full Stack Java Developer"
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-lg text-sm"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Required Skills (Comma separated)</label>
                  <input 
                    type="text" 
                    required
                    value={reqSkillsInput}
                    onChange={e => setReqSkillsInput(e.target.value)}
                    placeholder="Java, Spring Boot, SQL"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Preferred Skills (Comma separated)</label>
                  <input 
                    type="text" 
                    value={prefSkillsInput}
                    onChange={e => setPrefSkillsInput(e.target.value)}
                    placeholder="React, Docker, AWS"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Exp Req (Yrs)</label>
                  <input 
                    type="number" 
                    step="0.5"
                    value={expRequired}
                    onChange={e => setExpRequired(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Min CGPA</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={minCgpa}
                    onChange={e => setMinCgpa(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-lg text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Salary Range</label>
                  <input 
                    type="text" 
                    value={salary}
                    onChange={e => setSalary(e.target.value)}
                    placeholder="$80k - $110k"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Location</label>
                <input 
                  type="text" 
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="Remote, US / Bangalore (Hybrid)"
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowAddJob(false)}
                  className="px-4 h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submittingJob}
                  className="px-6 h-10 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {submittingJob ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Evaluate & Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// PAGE: ADMIN PORTAL / DASHBOARD
// ==========================================

function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditTrail, setAuditTrail] = useState<string[]>([
    '2026-06-30 11:15 - Admin initialized database configuration',
    '2026-06-30 12:05 - Recruiter Sarah toggled Anonymous Screening Mode: ON',
    '2026-06-30 12:30 - Candidate John Doe uploaded resume PDF for parsing'
  ]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // Admin fetches all registered accounts
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/recruiter/candidates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      // Seed audit override
      const mockUsers = [
        { id: 1, name: 'System Admin', email: 'admin@example.com', role: 'Admin' },
        { id: 2, name: 'Sarah Recruiter', email: 'recruiter@example.com', role: 'Recruiter' },
        { id: 3, name: 'John Doe', email: 'candidate1@example.com', role: 'Candidate' },
        { id: 4, name: 'Jane Smith', email: 'candidate2@example.com', role: 'Candidate' }
      ];
      setUsers(mockUsers);
    } catch (e) {
      setUsers([
        { id: 1, name: 'System Admin', email: 'admin@example.com', role: 'Admin' },
        { id: 2, name: 'Sarah Recruiter', email: 'recruiter@example.com', role: 'Recruiter' },
        { id: 3, name: 'John Doe', email: 'candidate1@example.com', role: 'Candidate' },
        { id: 4, name: 'Jane Smith', email: 'candidate2@example.com', role: 'Candidate' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRevealIdentity = (candidateName: string) => {
    const time = new Date().toLocaleTimeString();
    setAuditTrail([
      `2026-06-30 ${time} - Admin authorized identity reveal for ${candidateName}`,
      ...auditTrail
    ]);
    alert(`Identity Revealed: "${candidateName}" is unmasked for verification audits.`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold mb-1">Admin Dashboard</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Oversee system configurations, manage users, and inspect reveal audit logs</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        
        {/* User Account Registry */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
          <h3 className="text-sm font-bold border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            System User Registry ({users.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                  <th className="py-2.5">User ID</th>
                  <th className="py-2.5">Name</th>
                  <th className="py-2.5">Email</th>
                  <th className="py-2.5">System Role</th>
                  <th className="py-2.5 text-right">Override View</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-slate-50 dark:border-slate-850">
                    <td className="py-3 font-mono text-slate-400">#{100 + u.id}</td>
                    <td className="py-3 font-bold">{u.name}</td>
                    <td className="py-3 text-slate-500">{u.email}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.role === 'Admin' 
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400' 
                          : u.role === 'Recruiter' 
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-400' 
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {u.role === 'Candidate' && (
                        <button
                          onClick={() => handleRevealIdentity(u.name)}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400 rounded text-[10px] font-bold transition-colors"
                        >
                          Reveal Identity
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Security Audit Trails */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-1.5 text-rose-600">
            <Shield className="w-4 h-4" /> Security Audit Log
          </h3>
          
          <div className="space-y-3 font-mono text-[10px] text-slate-500 leading-relaxed overflow-y-auto max-h-[300px]">
            {auditTrail.map((log, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded border border-slate-200/50 dark:border-slate-800">
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGE: RESUME PARSER PLAYGROUND
// ==========================================

function ResumeParserPage() {
  const [inputText, setInputText] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [parsedSandbox, setParsedSandbox] = useState<any>(null);

  const handleParseText = async () => {
    if (!inputText.trim()) return;
    setLoadingText(true);
    setParsedSandbox(null);

    try {
      const response = await fetch(`${API_BASE}/parser/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText })
      });
      const data = await response.json();
      setParsedSandbox(data);
    } catch (e) {
      console.warn('Backend unavailable. Simulating client-side NLP token extraction.');
      
      // Simulate client side regex extraction
      setTimeout(() => {
        const text = inputText;
        const textL = text.toLowerCase();
        
        const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
        const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
        
        // Find technical skills
        const foundTech: string[] = [];
        const possibleTech = ['Java', 'Python', 'SQL', 'React', 'Docker', 'AWS', 'Spring Boot', 'HTML', 'CSS', 'JavaScript'];
        possibleTech.forEach(t => {
          if (new RegExp(`\\b${t}\\b`, 'i').test(text)) foundTech.push(t);
        });

        // Find CGPA
        let cgpa = 7.5;
        const cgpaMatch = text.match(/(?:cgpa|gpa|pointer)[:\s]+(\d+(?:\.\d+)?)/i);
        if (cgpaMatch) cgpa = parseFloat(cgpaMatch[1]);

        setParsedSandbox({
          fullName: 'Analyzed Candidate Profile',
          email: emailMatch ? emailMatch[0] : 'not-found@email.com',
          phone: phoneMatch ? phoneMatch[0] : 'no-phone',
          skills: {
            technical: foundTech,
            soft: ['Critical Thinking', 'Collaboration']
          },
          education: [{ degree: 'Extracted Degree Spec', college: 'Extracted College Entity', cgpa }],
          experienceYears: textL.includes('years') ? 3.0 : 1.0,
          certifications: ['Mock Course Certification']
        });
        setLoadingText(false);
      }, 1000);
    } finally {
      if (parsedSandbox) setLoadingText(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold mb-2">Resume NLP Parser Sandbox</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Input plain text resume snippets to inspect parsed object outputs</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        
        {/* Editor input */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm flex flex-col">
          <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">Paste Resume Text</label>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="John Doe&#10;Email: john@gmail.com&#10;Skills: Java, SQL, Spring Boot, Docker&#10;College: NIT Calicut. CGPA: 8.4"
            className="w-full flex-1 min-h-[300px] p-3 text-xs bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleParseText}
            disabled={loadingText}
            className="w-full mt-4 h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {loadingText ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Run Token Extraction'}
          </button>
        </div>

        {/* Structured output display */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm flex flex-col justify-between">
          <label className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-wide">Extracted Structured JSON Artifact</label>
          
          {loadingText ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
              <span className="text-[10px] text-slate-400 font-mono">Running RegEx Section Matchers...</span>
            </div>
          ) : parsedSandbox ? (
            <div className="flex-1 space-y-4 text-xs overflow-y-auto max-h-[350px]">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Basic Details</p>
                <p className="font-extrabold text-sm text-blue-600 dark:text-blue-400">{parsedSandbox.fullName}</p>
                <p className="font-semibold">{parsedSandbox.email} | {parsedSandbox.phone}</p>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Extracted Tech Stack</p>
                <div className="flex flex-wrap gap-1">
                  {parsedSandbox.skills.technical.map((s: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-850 rounded font-mono text-[9px] font-semibold border border-slate-200/50">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Education Credentials</p>
                {parsedSandbox.education.map((e: any, idx: number) => (
                  <div key={idx} className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded border border-slate-200/50">
                    <p className="font-bold">{e.degree}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{e.college} | CGPA: {e.cgpa}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Estimated Experience</p>
                <p className="font-semibold">{parsedSandbox.experienceYears} Years</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
              <FileText className="w-8 h-8 mb-2" />
              <p>Paste text on the left to see parsed cards.</p>
            </div>
          )}

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 text-center text-[10px] font-mono text-slate-400">
            NLP Engine Module v1.2
          </div>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// PAGE: CANDIDATE RANKING LEADERBOARD
// ==========================================

function LeaderboardPage({ 
  jobId, 
  setPage, 
  setSelectedCandidateId 
}: { 
  jobId: number | null; 
  setPage: (p: string) => void;
  setSelectedCandidateId: (id: number) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [rankings, setRankings] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Slider weights (Default total = 100%)
  const [wSkill, setWSkill] = useState(50);
  const [wExp, setWExp] = useState(20);
  const [wEdu, setWEdu] = useState(15);
  const [wProj, setWProj] = useState(10);
  const [wCert, setWCert] = useState(5);

  useEffect(() => {
    if (jobId) {
      fetchRankings(jobId);
    }
  }, [jobId]);

  const fetchRankings = async (id: number) => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/jobs/${id}/rankings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setJob(data.job);
      setRankings(data.rankings);
    } catch (e) {
      console.warn('Backend unavailable. Simulating Leaderboard with mock evaluations.');
      // Find job and run static evaluation score math on candidates
      const currentJob = MOCK_JOBS.find(j => j.job_id === id) || MOCK_JOBS[0];
      setJob(currentJob);
      
      const simulatedRankings = MOCK_CANDIDATES.map((c, index) => {
        // Run simple manual scoring logic matching the formula
        const matched = currentJob.required_skills.filter(s => c.skills.map(sk => sk.toLowerCase()).includes(s.toLowerCase()));
        
        const skillScore = Math.round((matched.length / currentJob.required_skills.length) * 100);
        const expScore = currentJob.experience_required <= 0 ? 100 : Math.round(Math.min(100, (c.experience_years / currentJob.experience_required) * 100));
        const eduScore = Math.round(Math.min(100, (c.cgpa / 10.0) * 100));
        const projScore = Math.min(100, c.projects.length * 33);
        const certScore = Math.min(100, c.certifications.length * 50);

        const finalWeighted = Math.round(
          0.50 * skillScore +
          0.20 * expScore +
          0.15 * eduScore +
          0.10 * projScore +
          0.05 * certScore
        );

        return {
          ...c,
          full_name: `Candidate #${c.candidate_id}`, // Anonymous mask default for recruiters
          skill_score: skillScore,
          experience_score: expScore,
          education_score: eduScore,
          project_score: projScore,
          certification_score: certScore,
          final_weighted_score: finalWeighted
        };
      });

      simulatedRankings.sort((a, b) => b.final_weighted_score - a.final_weighted_score);
      setRankings(simulatedRankings.map((c, idx) => ({ ...c, rank: idx + 1 })));
    } finally {
      setLoading(false);
    }
  };

  // Re-run rankings simulation locally using slider weights
  const handleRecalculate = async () => {
    // Client-side simulation to ensure instant slider updates
    const wSkillFraction = wSkill / 100;
    const wExpFraction = wExp / 100;
    const wEduFraction = wEdu / 100;
    const wProjFraction = wProj / 100;
    const wCertFraction = wCert / 100;

    const recalculated = rankings.map(c => {
      const final_weighted_score = Math.round(
        wSkillFraction * (c.skill_score || 0) +
        wExpFraction * (c.experience_score || 0) +
        wEduFraction * (c.education_score || 0) +
        wProjFraction * (c.project_score || 0) +
        wCertFraction * (c.certification_score || 0)
      );
      return { ...c, final_weighted_score };
    });

    recalculated.sort((a, b) => b.final_weighted_score - a.final_weighted_score);
    setRankings(recalculated.map((c, idx) => ({ ...c, rank: idx + 1 })));
  };

  // Keep total weights equal to 100
  const adjustWeight = (type: string, value: number) => {
    if (type === 'skill') setWSkill(value);
    else if (type === 'exp') setWExp(value);
    else if (type === 'edu') setWEdu(value);
    else if (type === 'proj') setWProj(value);
    else if (type === 'cert') setWCert(value);
  };

  useEffect(() => {
    if (!loading && rankings.length > 0) {
      handleRecalculate();
    }
  }, [wSkill, wExp, wEdu, wProj, wCert]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const weightTotal = wSkill + wExp + wEdu + wProj + wCert;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <button onClick={() => setPage('recruiter-dashboard')} className="text-xs text-blue-500 hover:underline mb-2 flex items-center gap-1 font-bold">
          &larr; Back to Recruiter Dashboard
        </button>
        <h1 className="text-3xl font-extrabold mb-1">Rankings Leaderboard</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Evaluated against required match: <span className="font-bold text-slate-700 dark:text-slate-350">{job?.job_title}</span>
        </p>
      </div>

      {/* Grid: Weights Adjuster Dashboard vs Leaderboard Table */}
      <div className="grid lg:grid-cols-4 gap-8">
        
        {/* Weights Sliders (Left) */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm h-fit">
          <h3 className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-wider">Scoring Weights</h3>
          
          <div className="space-y-5">
            {[
              { key: 'skill', label: 'Skills Match', val: wSkill, min: 20 },
              { key: 'exp', label: 'Experience Years', val: wExp, min: 0 },
              { key: 'edu', label: 'Education / CGPA', val: wEdu, min: 0 },
              { key: 'proj', label: 'Projects Counter', val: wProj, min: 0 },
              { key: 'cert', label: 'Certifications', val: wCert, min: 0 }
            ].map(slider => (
              <div key={slider.key}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>{slider.label}</span>
                  <span className="text-blue-500">{slider.val}%</span>
                </div>
                <input 
                  type="range" 
                  min={slider.min}
                  max="80"
                  value={slider.val}
                  onChange={e => adjustWeight(slider.key, parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            ))}
          </div>

          <div className={`mt-6 p-3 rounded-lg text-center text-[10px] font-bold ${
            weightTotal === 100 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            Weights Total: {weightTotal}% {weightTotal === 100 ? '✔' : '⚠️ Adjust to sum to 100%'}
          </div>
        </div>

        {/* Leaderboard Table (Right) */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
          <h3 className="text-sm font-bold border-b border-slate-100 dark:border-slate-800 pb-3 mb-6">
            Ranked Candidate Pipeline
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                  <th className="py-2.5 px-2">Rank</th>
                  <th className="py-2.5 px-2">Anonymized Candidate ID</th>
                  <th className="py-2.5 px-2">Skills Match</th>
                  <th className="py-2.5 px-2">Exp Score</th>
                  <th className="py-2.5 px-2">Edu Score</th>
                  <th className="py-2.5 px-2">Projects</th>
                  <th className="py-2.5 px-2 text-right">Weighted Final Score</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map(c => (
                  <tr key={c.candidate_id} className="border-b border-slate-100 dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                    <td className="py-4 px-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-[10px] ${
                        c.rank === 1 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' 
                          : c.rank === 2 
                            ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-slate-50 text-slate-600 dark:bg-slate-850 dark:text-slate-400'
                      }`}>
                        {c.rank}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      <button 
                        onClick={() => {
                          setSelectedCandidateId(c.candidate_id);
                          setPage('reports');
                        }}
                        className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        CAN-{c.candidate_id}
                      </button>
                      <p className="text-[10px] text-slate-400 mt-0.5">Stage: {c.application_status}</p>
                    </td>
                    <td className="py-4 px-2 font-semibold">{c.skill_score}%</td>
                    <td className="py-4 px-2 font-semibold">{c.experience_score}%</td>
                    <td className="py-4 px-2 font-semibold">{c.education_score}%</td>
                    <td className="py-4 px-2 font-semibold">{c.project_score}%</td>
                    <td className="py-4 px-2 text-right font-black text-sm text-blue-600 dark:text-blue-400">
                      {c.final_weighted_score}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// PAGE: ANALYTICS DASHBOARD
// ==========================================

function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error();
      setStats(data);
    } catch (e) {
      console.warn('Backend unavailable. Simulating visual chart metrics.');
      setStats({
        cards: { totalCandidates: 4, totalJobs: 4, shortlisted: 1, selected: 1 },
        charts: {
          skillDistribution: [
            { name: 'SQL', count: 3 },
            { name: 'Git', count: 3 },
            { name: 'REST API', count: 3 },
            { name: 'React', count: 2 },
            { name: 'Python', count: 2 },
            { name: 'Docker', count: 2 },
            { name: 'AWS', count: 1 },
            { name: 'Java', count: 1 }
          ],
          scoreHistogram: [
            { range: '0-20', count: 0 },
            { range: '21-40', count: 1 },
            { range: '41-60', count: 1 },
            { range: '61-80', count: 1 },
            { range: '81-100', count: 1 }
          ],
          topSkillsDemand: [
            { name: 'SQL', count: 2 },
            { name: 'Docker', count: 2 },
            { name: 'AWS', count: 2 },
            { name: 'Python', count: 2 },
            { name: 'Java', count: 1 }
          ],
          hiringFunnel: [
            { stage: 'Applied', count: 4 },
            { stage: 'Under Review', count: 3 },
            { stage: 'Shortlisted', count: 1 },
            { stage: 'Selected', count: 1 },
            { stage: 'Rejected', count: 0 }
          ]
        }
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold mb-1">Visual Analytics</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Real-time charts of talent distributions, skill demands, and funnel logs</p>
      </div>

      {/* Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Applicants Ingested', value: stats.cards.totalCandidates, color: 'border-blue-500' },
          { label: 'Active Job Descriptions', value: stats.cards.totalJobs, color: 'border-sky-500' },
          { label: 'Candidates Shortlisted', value: stats.cards.shortlisted, color: 'border-amber-500' },
          { label: 'Hiring Selections', value: stats.cards.selected, color: 'border-emerald-500' }
        ].map((c, i) => (
          <div key={i} className={`bg-white dark:bg-slate-900 border-l-4 ${c.color} border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm`}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{c.label}</p>
            <p className="text-2xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid md:grid-cols-2 gap-8">
        
        {/* 1. Skill Distribution (SVG Bar Chart) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Candidate Skill Distribution</h3>
          
          <div className="space-y-4">
            {stats.charts.skillDistribution.map((item: any, idx: number) => {
              const maxVal = Math.max(...stats.charts.skillDistribution.map((s: any) => s.count)) || 1;
              const widthPct = (item.count / maxVal) * 100;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-20 text-[11px] font-mono text-slate-400 truncate">{item.name}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-4 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold w-6 text-right">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Top Skills Demand (SVG Bar Chart) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Active Job Skill Demand</h3>
          
          <div className="space-y-4">
            {stats.charts.topSkillsDemand.map((item: any, idx: number) => {
              const maxVal = Math.max(...stats.charts.topSkillsDemand.map((s: any) => s.count)) || 1;
              const widthPct = (item.count / maxVal) * 100;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-20 text-[11px] font-mono text-slate-400 truncate">{item.name}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-4 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold w-6 text-right">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Candidate Score Histogram */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Match Score Histogram</h3>
          
          <div className="flex items-end justify-between h-48 pt-4 gap-4 px-2">
            {stats.charts.scoreHistogram.map((item: any, idx: number) => {
              const maxVal = Math.max(...stats.charts.scoreHistogram.map((h: any) => h.count)) || 1;
              const heightPct = (item.count / maxVal) * 100;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[10px] font-bold">{item.count}</span>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t-lg h-full flex items-end">
                    <div 
                      className="bg-sky-500 w-full rounded-t-lg transition-all duration-700" 
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 rotate-12 mt-1">{item.range}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Hiring Funnel Stage */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Talent Pipeline Funnel</h3>
          
          <div className="space-y-4">
            {stats.charts.hiringFunnel.map((item: any, idx: number) => {
              const maxVal = Math.max(...stats.charts.hiringFunnel.map((f: any) => f.count)) || 1;
              const widthPct = (item.count / maxVal) * 80 + 20; // Ensure some visibility
              return (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] font-bold px-1 text-slate-400">
                    <span>{item.stage}</span>
                    <span>{item.count} Candidates</span>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 h-5 rounded-lg overflow-hidden flex justify-center">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-500 opacity-80" 
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// PAGE: DETAILED REPORT & PDF EXPORTS
// ==========================================

function ReportsPage({ 
  candidateId, 
  jobId, 
  setPage 
}: { 
  candidateId: number | null; 
  jobId: number | null;
  setPage: (p: string) => void;
}) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [score, setScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState('');
  const [savingComments, setSavingComments] = useState(false);

  useEffect(() => {
    if (candidateId && jobId) {
      fetchReportData(candidateId, jobId);
    }
  }, [candidateId, jobId]);

  const fetchReportData = async (candId: number, jId: number) => {
    try {
      const token = localStorage.getItem('authToken');
      const candRes = await fetch(`${API_BASE}/candidate/profile?id=${candId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const jobRes = await fetch(`${API_BASE}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!candRes.ok || !jobRes.ok) throw new Error();

      const candData = await candRes.json();
      const jobsList = await jobRes.json();
      const currentJob = jobsList.find((jb: Job) => jb.job_id === jId) || jobsList[0];

      setCandidate(candData);
      setJob(currentJob);

      // Perform local fallback calculations for scores
      const matched = currentJob.required_skills.filter((s: string) => candData.skills.includes(s));
      const missing = currentJob.required_skills.filter((s: string) => !candData.skills.includes(s));
      const skillScore = Math.round((matched.length / currentJob.required_skills.length) * 100);
      const expScore = currentJob.experience_required <= 0 ? 100 : Math.round(Math.min(100, (candData.experience_years / currentJob.experience_required) * 100));
      const eduScore = Math.round(Math.min(100, (candData.cgpa / 10.0) * 100));
      const projScore = Math.min(100, candData.projects.length * 33);
      const certScore = Math.min(100, candData.certifications.length * 50);

      const finalWeighted = Math.round(
        0.50 * skillScore +
        0.20 * expScore +
        0.15 * eduScore +
        0.10 * projScore +
        0.05 * certScore
      );

      setScore({
        skill_score: skillScore,
        experience_score: expScore,
        education_score: eduScore,
        project_score: projScore,
        certification_score: certScore,
        final_weighted_score: finalWeighted,
        matched_skills: matched,
        missing_skills: missing,
        comments: score?.comments || ''
      });
      setComments(score?.comments || '');
    } catch (e) {
      console.warn('Backend unavailable. Seeding Report evaluation with mock data.');
      const localCand = MOCK_CANDIDATES.find(c => c.candidate_id === candId) || MOCK_CANDIDATES[0];
      const localJob = MOCK_JOBS.find(j => j.job_id === jId) || MOCK_JOBS[0];
      setCandidate(localCand);
      setJob(localJob);

      const matched = localJob.required_skills.filter((s: string) => localCand.skills.includes(s));
      const missing = localJob.required_skills.filter((s: string) => !localCand.skills.includes(s));
      
      const skillScore = Math.round((matched.length / localJob.required_skills.length) * 100);
      const expScore = localJob.experience_required <= 0 ? 100 : Math.round(Math.min(100, (localCand.experience_years / localJob.experience_required) * 100));
      const eduScore = Math.round(Math.min(100, (localCand.cgpa / 10.0) * 100));
      const projScore = Math.min(100, localCand.projects.length * 33);
      const certScore = Math.min(100, localCand.certifications.length * 50);

      const finalWeighted = Math.round(
        0.50 * skillScore +
        0.20 * expScore +
        0.15 * eduScore +
        0.10 * projScore +
        0.05 * certScore
      );

      setScore({
        skill_score: skillScore,
        experience_score: expScore,
        education_score: eduScore,
        project_score: projScore,
        certification_score: certScore,
        final_weighted_score: finalWeighted,
        matched_skills: matched,
        missing_skills: missing,
        comments: ''
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveComments = async () => {
    setSavingComments(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/scores/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ candidate_id: candidateId, job_id: jobId, comments })
      });
      if (res.ok) {
        alert('Recruiter comments saved successfully!');
      }
    } catch (e) {
      alert('Comments recorded in local candidate memory.');
      setScore((prev: any) => ({ ...prev, comments }));
    } finally {
      setSavingComments(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!candidate || !job || !score) return;
    
    let csv = `AI RESUME EVALUATION EVALUATION REPORT\n`;
    csv += `Job Title,${job.job_title}\n`;
    csv += `Candidate ID,CAN-${candidate.candidate_id}\n`;
    csv += `Candidate Name,${candidate.full_name}\n`;
    csv += `Email,${candidate.email}\n`;
    csv += `Weighted Match Score,${score.final_weighted_score}%\n`;
    csv += `Skill Match Score,${score.skill_score}%\n`;
    csv += `Experience Score,${score.experience_score}%\n`;
    csv += `Education Score,${score.education_score}%\n`;
    csv += `Matched Skills,"${score.matched_skills.join(', ')}"\n`;
    csv += `Missing Skills,"${score.missing_skills.join(', ')}"\n`;
    csv += `Recruiter Comments,"${comments}"\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Candidate_${candidate.candidate_id}_Report.csv`;
    a.click();
  };

  const handlePrintPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!candidate || !job || !score) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl print:p-0">
      
      {/* Hide on print */}
      <div className="mb-6 flex justify-between items-center print:hidden">
        <button onClick={() => setPage('recruiter-dashboard')} className="text-xs text-blue-500 hover:underline flex items-center gap-1 font-bold">
          &larr; Return to Candidate Pool
        </button>
        
        <div className="flex gap-2">
          <button 
            onClick={handleDownloadCSV}
            className="flex items-center gap-1 px-3.5 h-9 text-xs font-bold border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button 
            onClick={handlePrintPDF}
            className="flex items-center gap-1 px-4 h-9 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md"
          >
            <FileText className="w-3.5 h-3.5" /> Print / Export PDF
          </button>
        </div>
      </div>

      {/* Main Report Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-xl space-y-8 print:border-none print:shadow-none">
        
        {/* Header summary info */}
        <div className="border-b border-slate-100 dark:border-slate-850 pb-6 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">{job.job_title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Candidate Evaluated: <span className="font-bold text-slate-700 dark:text-slate-350">{candidate.full_name}</span> | ID: <span className="font-mono">CAN-{candidate.candidate_id}</span>
            </p>
          </div>
          
          <div className="text-left md:text-right">
            <p className="text-3xl font-black text-blue-600 dark:text-blue-400">{score.final_weighted_score}%</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Weighted Alignment Score</p>
          </div>
        </div>

        {/* Detailed scoring categories grid */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Objective Score Matrix</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Skills Match', val: score.skill_score, weight: '50%' },
              { label: 'Experience Years', val: score.experience_score, weight: '20%' },
              { label: 'Education CGPA', val: score.education_score, weight: '15%' },
              { label: 'Projects Counter', val: score.project_score, weight: '10%' },
              { label: 'Certifications', val: score.certification_score, weight: '5%' }
            ].map((mat, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-1">{mat.label}</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-100">{mat.val}%</p>
                <p className="text-[8px] text-slate-400 mt-0.5">Weight: {mat.weight}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Skill matching stats */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-5 bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-900/20 rounded-xl">
            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase mb-3">Matched Required Skills ({score.matched_skills.length})</h4>
            <div className="flex flex-wrap gap-1.5">
              {score.matched_skills.length === 0 ? (
                <span className="text-xs text-slate-400">No matching skills found.</span>
              ) : (
                score.matched_skills.map((s: string, i: number) => (
                  <span key={i} className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded font-semibold text-xs border border-emerald-200/35">
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="p-5 bg-rose-50/40 dark:bg-rose-950/10 border border-rose-100/50 dark:border-rose-900/20 rounded-xl">
            <h4 className="text-xs font-bold text-rose-800 dark:text-rose-400 uppercase mb-3">Missing Required Skills ({score.missing_skills.length})</h4>
            <div className="flex flex-wrap gap-1.5">
              {score.missing_skills.length === 0 ? (
                <span className="text-xs text-slate-400">All required skills met.</span>
              ) : (
                score.missing_skills.map((s: string, i: number) => (
                  <span key={i} className="px-2.5 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-350 rounded font-semibold text-xs border border-rose-200/35">
                    {s}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Candidate Profile Details summary */}
        <div className="border-t border-slate-100 dark:border-slate-850 pt-6">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Qualification Summaries</h3>
          
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="flex border-b border-slate-50 dark:border-slate-850 pb-2">
              <span className="w-32 text-slate-500 font-medium">Education</span>
              <span className="font-semibold">{candidate.education} — {candidate.college}</span>
            </div>
            <div className="flex border-b border-slate-50 dark:border-slate-850 pb-2">
              <span className="w-32 text-slate-500 font-medium">CGPA Grade</span>
              <span className="font-bold">{candidate.cgpa} / 10.0</span>
            </div>
            <div className="flex border-b border-slate-50 dark:border-slate-850 pb-2">
              <span className="w-32 text-slate-500 font-medium">Experience</span>
              <span className="font-semibold">{candidate.experience_years} Years</span>
            </div>
            <div className="flex pb-2">
              <span className="w-32 text-slate-500 font-medium">Contact Links</span>
              <span className="font-mono text-blue-500">{candidate.github} | {candidate.linkedin}</span>
            </div>
          </div>
        </div>

        {/* Recruiter Evaluation Comments Editor (Hidden on print unless text present) */}
        <div className="border-t border-slate-100 dark:border-slate-850 pt-6 print:border-none">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recruiter Evaluation Comments</label>
          <textarea
            value={comments}
            onChange={e => setComments(e.target.value)}
            placeholder="Type your screening remarks or interview notes for the panel here..."
            className="w-full min-h-[100px] p-3 text-xs bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 print:bg-transparent print:border-none print:p-0"
          />
          <button
            onClick={handleSaveComments}
            disabled={savingComments}
            className="mt-3 px-4 h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors print:hidden"
          >
            {savingComments ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Evaluation Remarks'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// COMPONENT: AI CHATBOT ASSISTANT
// ==========================================

function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([
    { sender: 'bot', text: 'Hi! I am EquiScreen AI Assistant. How can I help you screen candidates or analyze talent distributions today?' }
  ]);
  const [inputVal, setInputVal] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = () => {
    if (!inputVal.trim()) return;

    const userMsg = { sender: 'user', text: inputVal };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');

    setTimeout(() => {
      let reply = "I'm analyzing the candidate database and active job openings. Can you please specify which job role or skill match you'd like to check?";
      const lower = inputVal.toLowerCase();

      if (lower.includes('top candidate') || lower.includes('rank') || lower.includes('best')) {
        reply = "Jane Smith (Candidate #1002) currently ranks #1 on our Full Stack Leaderboard with a 92% match score, followed by Alice Williams at 89% and John Doe at 85%.";
      } else if (lower.includes('course') || lower.includes('learn') || lower.includes('gap')) {
        reply = "We suggest training courses for key skill gaps, e.g. 'AWS Cloud Practitioner Essentials' for AWS, or 'Docker Technologies for DevOps' for Docker container management.";
      } else if (lower.includes('bias') || lower.includes('anonym') || lower.includes('mask')) {
        reply = "Anonymous Screening Mode redacts sensitive identifiers (Name, gender, age, religion, caste, address, photos) during candidate lists. Only the Admin can unmask candidate rows.";
      } else if (lower.includes('hello') || lower.includes('hi')) {
        reply = "Hello! I can help you query matching scores, view top candidates, and navigate anonymous evaluations. What are you looking for?";
      }

      setMessages(prev => [...prev, { sender: 'bot', text: reply }]);
    }, 800);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end print:hidden">
      {isOpen && (
        <div className="w-80 h-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3 animate-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <span className="font-bold text-xs tracking-wide">EquiScreen AI Chatbot</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs bg-slate-50 dark:bg-slate-950">
            {messages.map((m, idx) => (
              <div 
                key={idx} 
                className={`max-w-[80%] p-2.5 rounded-xl border leading-relaxed ${
                  m.sender === 'bot' 
                    ? 'bg-white border-slate-200 text-slate-800 rounded-tl-none dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100' 
                    : 'bg-blue-600 border-blue-600 text-white rounded-tr-none ml-auto'
                }`}
              >
                {m.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 flex gap-2">
            <input 
              type="text" 
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask about top candidates..."
              className="flex-1 h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none"
            />
            <button 
              onClick={handleSend}
              className="w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Circle Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all shadow-blue-500/25"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    </div>
  );
}
