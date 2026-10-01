import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  ExternalLink,
  Plus,
  Search,
  CheckCircle2,
  Copy,
  QrCode,
  Edit3,
  Trash2,
  Lock,
  LogOut,
  Database,
  Eye,
  Briefcase,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  CatalogItem,
  Competency,
  Course,
  CourseResult,
  GapThresholdConfig,
  Participant,
  ParticipantAnswer,
  ParticipantSession,
} from './types/lms.ts';
import { ParticipantActivityPlayer } from './components/participant/ParticipantActivityPlayer.tsx';
import { TrainingLibraryView } from './components/participant/TrainingLibraryView.tsx';
import { CourseSessionHubView } from './components/participant/CourseSessionHubView.tsx';
import { CourseBuilderWizard } from './components/admin/CourseBuilderWizard.tsx';
import { AdminCourseSessionsView } from './components/admin/AdminCourseSessionsView.tsx';
import { ParticipantProfileView } from './components/admin/ParticipantProfileView.tsx';
import { GapAnalyticsModule } from './components/admin/GapAnalyticsModule.tsx';
import { OrganizationalRolesManager } from './components/admin/OrganizationalRolesManager.tsx';
import { AdminLoginScreen } from './components/admin/AdminLoginScreen.tsx';
import { CourseQrCodeSvg, ResilientImage } from './components/common/ResilientImage.tsx';
import { UClaroTecnologiaLogo } from './components/common/ClaroBrandAssets.tsx';
import {
  buildDetailExcelRows,
  buildSummaryExcelRows,
  DETAIL_EXCEL_HEADERS,
  exportCompleteWorkbookToExcel,
  exportDetailToExcel,
  exportSummaryToExcel,
  SUMMARY_EXCEL_HEADERS,
} from './utils/excelExport.ts';
import {
  testConnection,
  syncCourseToFirestore,
  deleteCourseFromFirestore,
  signOutAdmin,
} from './firebase.ts';

type ActiveTab =
  | 'public_portal'
  | 'dashboard'
  | 'gap_analytics'
  | 'participants'
  | 'courses_admin'
  | 'catalogs_sql';

type AppZone = 'participant_portal' | 'admin_login' | 'admin_dashboard';

function parsePathSlug(pathname: string): string | null {
  const match = pathname.match(/^\/(?:formacion|actividad)\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseInitialZone(pathname: string, hasAdminToken: boolean): AppZone {
  if (/^\/admin\/login/i.test(pathname)) return 'admin_login';
  if (/^\/capacitaciones/i.test(pathname)) return 'participant_portal';
  if (/^\/admin/i.test(pathname)) {
    return hasAdminToken ? 'admin_dashboard' : 'admin_login';
  }
  return 'admin_dashboard';
}

export default function App() {
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    const saved = sessionStorage.getItem('claro_admin_token');
    if (saved) return saved;
    const defaultToken = 'demo-admin-session-token-2026';
    sessionStorage.setItem('claro_admin_token', defaultToken);
    return defaultToken;
  });
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    return sessionStorage.getItem('claro_admin_email') || 'admin@fabricaformacion.co';
  });

  // Check if URL is /formacion/:slug or /actividad/:slug
  const [activeActivitySlug, setActiveActivitySlug] = useState<string | null>(() =>
    parsePathSlug(window.location.pathname)
  );
  const [isPreviewActivity, setIsPreviewActivity] = useState(false);

  const [appZone, setAppZone] = useState<AppZone>(() =>
    parseInitialZone(window.location.pathname, true)
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>('courses_admin');
  const [participantPortalTab, setParticipantPortalTab] = useState<
    'library' | 'course_session'
  >('library');
  const [selectedPortalCourseSlug, setSelectedPortalCourseSlug] = useState<
    string | null
  >(null);

  // Full Relational Data State
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<ParticipantSession[]>([]);
  const [answers, setAnswers] = useState<ParticipantAnswer[]>([]);
  const [results, setResults] = useState<CourseResult[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [thresholds, setThresholds] = useState<GapThresholdConfig>({
    goodMin: 80,
    warningMin: 65,
  });
  const [supabaseSql, setSupabaseSql] = useState<string>('');

  // Dashboard & Gap Analytics Filters (Curso, Área, Cargo, Estado, Fecha, Búsqueda)
  const [filterCourseId, setFilterCourseId] = useState<string>('ALL');
  const [filterArea, setFilterArea] = useState<string>('ALL');
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sub-views in Admin
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [qrModalSlug, setQrModalSlug] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [showExcelPreview, setShowExcelPreview] = useState<boolean>(false);
  const [excelPreviewTab, setExcelPreviewTab] = useState<'summary' | 'detail'>('summary');
  const [lastExcelExportInfo, setLastExcelExportInfo] = useState<{
    fileName: string;
    byteLength: number;
    validZipSignature: boolean;
    sheetNames: string[];
    rowCountBySheet: Record<string, number>;
  } | null>(null);

  // Competency Creation Form
  const [newCompName, setNewCompName] = useState('');
  const [newCompCode, setNewCompCode] = useState('');
  const [newCompCategory, setNewCompCategory] = useState('Fibra Óptica');
  const [newCompDesc, setNewCompDesc] = useState('');

  const fetchAllState = async (tokenToUse = adminToken) => {
    setLoading(true);
    try {
      if (tokenToUse) {
        const res = await fetch('/api/admin/state', {
          headers: { Authorization: `Bearer ${tokenToUse}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCourses(data.courses || []);
          setParticipants(data.participants || []);
          setSessions(data.sessions || []);
          setAnswers(data.answers || []);
          setResults(data.results || []);
          setCompetencies(data.competencies || []);
          setCatalogs(data.catalogs || []);
          if (data.thresholds) setThresholds(data.thresholds);
          if (data.supabase_sql) setSupabaseSql(data.supabase_sql);
          setLoading(false);
          return;
        }
      }

      // Public bootstrap for Participant Portal (strictly published courses & catalogs only)
      const pubRes = await fetch('/api/public/bootstrap');
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        setCourses(pubData.published_courses || []);
        setCatalogs(pubData.catalogs || []);
        setCompetencies(pubData.competencies || []);
      }
    } catch (err) {
      console.error('Error loading application state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    testConnection();
    fetchAllState();
    const onPopState = () => {
      const slug = parsePathSlug(window.location.pathname);
      setActiveActivitySlug(slug);
      if (!slug) {
        const currentToken = sessionStorage.getItem('claro_admin_token');
        setAppZone(parseInitialZone(window.location.pathname, Boolean(currentToken)));
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openActivityBySlug = (slug: string, preview = false) => {
    setIsPreviewActivity(preview);
    setActiveActivitySlug(slug);
    window.history.pushState({}, '', `/formacion/${slug}`);
  };

  const closeActivityPlayer = () => {
    const wasPreview = isPreviewActivity;
    setActiveActivitySlug(null);
    setIsPreviewActivity(false);
    if (wasPreview && adminToken) {
      setAppZone('admin_dashboard');
      window.history.pushState({}, '', '/admin/dashboard');
    } else {
      setAppZone('participant_portal');
      window.history.pushState({}, '', '/capacitaciones');
    }
    fetchAllState();
  };

  const navigateToAdminLogin = () => {
    if (adminToken) {
      setAppZone('admin_dashboard');
      window.history.pushState({}, '', '/admin/dashboard');
    } else {
      setAppZone('admin_login');
      window.history.pushState({}, '', '/admin/login');
    }
  };

  const navigateToParticipantPortal = () => {
    setSelectedParticipantId(null);
    setWizardOpen(false);
    setAppZone('participant_portal');
    window.history.pushState({}, '', '/capacitaciones');
  };

  const handleAdminAuthSuccess = async (token: string, email: string) => {
    sessionStorage.setItem('claro_admin_token', token);
    sessionStorage.setItem('claro_admin_email', email);
    setAdminToken(token);
    setAdminEmail(email);
    setAppZone('admin_dashboard');
    setActiveTab('dashboard');
    window.history.pushState({}, '', '/admin/dashboard');
    await fetchAllState(token);
  };

  const openMaterialGeneratorDirectly = async (openWizardModal = true) => {
    const token = adminToken || 'demo-admin-session-token-2026';
    const email = adminEmail || 'admin@fabricaformacion.co';
    if (!adminToken) {
      sessionStorage.setItem('claro_admin_token', token);
      sessionStorage.setItem('claro_admin_email', email);
      setAdminToken(token);
      setAdminEmail(email);
    }
    setSelectedParticipantId(null);
    setEditingCourse(null);
    setAppZone('admin_dashboard');
    setActiveTab('courses_admin');
    setWizardOpen(openWizardModal);
    window.history.pushState({}, '', '/admin/dashboard');
    await fetchAllState(token);
  };

  const handleAdminLogout = async () => {
    sessionStorage.removeItem('claro_admin_token');
    sessionStorage.removeItem('claro_admin_email');
    setAdminToken(null);
    setParticipants([]);
    setSessions([]);
    setAnswers([]);
    setResults([]);
    await signOutAdmin().catch(() => {});
    setAppZone('participant_portal');
    window.history.pushState({}, '', '/capacitaciones');
    await fetchAllState(null);
  };

  // Filtered Sessions (Used across Dashboard, Gap Analytics, and Excel Exports)
  const filteredSessions = useMemo(() => {
    return sessions.filter((sess) => {
      const part = participants.find((p) => p.id === sess.participant_id);
      if (filterCourseId !== 'ALL' && sess.course_id !== filterCourseId) return false;
      if (filterArea !== 'ALL' && part?.area !== filterArea) return false;
      if (filterRole !== 'ALL' && part?.role !== filterRole) return false;
      if (filterStatus !== 'ALL' && sess.status !== filterStatus) return false;

      if (filterDateFrom) {
        const dFrom = new Date(filterDateFrom).getTime();
        if (new Date(sess.started_at).getTime() < dFrom) return false;
      }
      if (filterDateTo) {
        const dTo = new Date(filterDateTo).getTime() + 86400000;
        if (new Date(sess.started_at).getTime() > dTo) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = part?.full_name.toLowerCase().includes(q);
        const matchId = part?.identification_number.toLowerCase().includes(q);
        const matchArea = part?.area.toLowerCase().includes(q);
        const matchRole = part?.role.toLowerCase().includes(q);
        const matchCode = sess.session_code.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchArea && !matchRole && !matchCode) return false;
      }

      return true;
    });
  }, [
    sessions,
    participants,
    filterCourseId,
    filterArea,
    filterRole,
    filterStatus,
    filterDateFrom,
    filterDateTo,
    searchQuery,
  ]);

  // Dashboard Executive KPIs (Section 12)
  const kpis = useMemo(() => {
    const activeCoursesCount = courses.filter((c) => c.status === 'published').length;
    const uniqueParticipantIds = new Set(filteredSessions.map((s) => s.participant_id));
    const startedCount = filteredSessions.length;
    const finishedSessions = filteredSessions.filter(
      (s) =>
        s.status === 'Aprobado' ||
        s.status === 'Requiere refuerzo' ||
        s.status === 'Finalizado'
    );
    const finishedCount = finishedSessions.length;
    const completionRate =
      startedCount > 0 ? Math.round((finishedCount / startedCount) * 100) : 0;

    const avgScore =
      finishedCount > 0
        ? Math.round(
            finishedSessions.reduce((acc, s) => acc + s.score_percentage, 0) /
              finishedCount
          )
        : 0;

    const approvedCount = finishedSessions.filter(
      (s) => s.status === 'Aprobado'
    ).length;
    const approvalRate =
      finishedCount > 0 ? Math.round((approvedCount / finishedCount) * 100) : 0;

    const needsReinforcementCount = filteredSessions.filter(
      (s) => s.status === 'Requiere refuerzo'
    ).length;

    return {
      activeCoursesCount,
      uniqueParticipantsCount: uniqueParticipantIds.size,
      startedCount,
      finishedCount,
      completionRate,
      avgScore,
      approvalRate,
      needsReinforcementCount,
    };
  }, [courses, filteredSessions]);

  // Gap Analytics by Competency (Section 13: "Puntos de mejora")
  const competencyAnalytics = useMemo(() => {
    const allowedSessionIds = new Set(filteredSessions.map((s) => s.id));
    const relevantAnswers = answers.filter((a) => allowedSessionIds.has(a.session_id));

    const statsMap = new Map<
      string,
      {
        competency: Competency;
        earnedPoints: number;
        maxPoints: number;
        totalAnswers: number;
        correctAnswers: number;
      }
    >();

    competencies.forEach((comp) => {
      statsMap.set(comp.id, {
        competency: comp,
        earnedPoints: 0,
        maxPoints: 0,
        totalAnswers: 0,
        correctAnswers: 0,
      });
    });

    // Deduplicate multiple attempts per (session_id, question_id) taking the best attempt
    const bestAttemptMap = new Map<string, ParticipantAnswer>();
    relevantAnswers.forEach((ans) => {
      const key = `${ans.session_id}::${ans.question_id}`;
      const prev = bestAttemptMap.get(key);
      if (!prev || ans.points_obtained >= prev.points_obtained) {
        bestAttemptMap.set(key, ans);
      }
    });

    Array.from(bestAttemptMap.values()).forEach((ans) => {
      let entry = statsMap.get(ans.competency_id);
      if (!entry) {
        entry = {
          competency: {
            id: ans.competency_id,
            code: ans.competency_id.toUpperCase(),
            name: ans.competency_id,
            description: '',
            category: 'General',
            created_at: '',
            updated_at: '',
          },
          earnedPoints: 0,
          maxPoints: 0,
          totalAnswers: 0,
          correctAnswers: 0,
        };
        statsMap.set(ans.competency_id, entry);
      }
      entry.earnedPoints += ans.points_obtained;
      entry.maxPoints += ans.max_points;
      entry.totalAnswers += 1;
      if (ans.is_correct) entry.correctAnswers += 1;
    });

    const list = Array.from(statsMap.values())
      .filter((item) => item.totalAnswers > 0)
      .map((item) => {
        const percentage =
          item.maxPoints > 0
            ? Math.round((item.earnedPoints / item.maxPoints) * 100)
            : 0;
        const level: 'good' | 'warning' | 'critical' =
          percentage >= thresholds.goodMin
            ? 'good'
            : percentage >= thresholds.warningMin
            ? 'warning'
            : 'critical';

        return {
          ...item,
          percentage,
          level,
        };
      })
      .sort((a, b) => b.percentage - a.percentage);

    const topStrengths = [...list].slice(0, 5);
    const topGaps = [...list].sort((a, b) => a.percentage - b.percentage).slice(0, 5);

    return {
      all: list,
      topStrengths,
      topGaps,
    };
  }, [filteredSessions, answers, competencies, thresholds]);

  // 1. If participant is executing a training (/formacion/:slug or /actividad/:slug), render the full-screen interactive player
  if (activeActivitySlug) {
    return (
      <ParticipantActivityPlayer
        slug={activeActivitySlug}
        adminToken={isPreviewActivity ? adminToken : null}
        isPreviewMode={isPreviewActivity}
        onExit={closeActivityPlayer}
      />
    );
  }

  // 2. ZONA A: PORTAL DEL PARTICIPANTE (/ o /capacitaciones) — Completamente separado del panel administrador
  if (appZone === 'participant_portal') {
    return (
      <div className="min-h-screen bg-white text-[#0F172A] flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b-2 border-[#DA291C] px-6 py-3.5 shadow-2xs">
          <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setParticipantPortalTab('library')}
              className="flex items-center gap-3 text-left"
            >
              <UClaroTecnologiaLogo className="w-11 h-11 shrink-0" />
              <div>
                <div className="text-[11px] font-extrabold tracking-wider uppercase text-[#DA291C]">
                  U Claro Tecnología
                </div>
                <div className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
                  Capacitaciones · Portal del Participante
                </div>
              </div>
            </button>

            <nav className="flex flex-wrap items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setParticipantPortalTab('library')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                  participantPortalTab === 'library'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Biblioteca de Capacitaciones
              </button>
              <button
                type="button"
                onClick={() => setParticipantPortalTab('course_session')}
                className={`px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-colors whitespace-nowrap ${
                  participantPortalTab === 'course_session'
                    ? 'bg-[#DA291C] text-white shadow-2xs'
                    : 'text-slate-700 hover:text-[#DA291C]'
                }`}
              >
                Sesión Curso
              </button>
              <button
                type="button"
                onClick={() => openMaterialGeneratorDirectly(true)}
                className="px-3.5 py-1.5 text-xs font-extrabold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-[#DA291C]" />
                <span>+ Cargar Material y Generar Curso</span>
              </button>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 bg-white">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-64 bg-white border border-slate-200 rounded-2xl p-5 animate-pulse"
                />
              ))}
            </div>
          ) : participantPortalTab === 'course_session' ? (
            <CourseSessionHubView
              courses={courses}
              initialSelectedSlug={selectedPortalCourseSlug}
              onStartCourseSession={(slug) => openActivityBySlug(slug, false)}
            />
          ) : (
            <TrainingLibraryView
              courses={courses}
              onStartTraining={(slug) => openActivityBySlug(slug, false)}
              onOpenCourseSessionHub={(slug) => {
                setSelectedPortalCourseSlug(slug);
                setParticipantPortalTab('course_session');
              }}
              isAdminView={false}
            />
          )}
        </main>

        <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
          <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>U Claro Tecnología · Ecosistema de Formación Técnica</span>
            </div>
            <button
              type="button"
              onClick={navigateToAdminLogin}
              className="text-xs font-mono text-slate-500 hover:text-[#DA291C] inline-flex items-center gap-1.5 transition-colors"
            >
              <Lock className="w-3 h-3" />
              <span>{adminToken ? 'Ir a /admin/dashboard' : 'Acceso Administrador (/admin/login)'}</span>
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // 3. ZONA B (LOGIN): ENTRADA ADMINISTRATIVA PROTEGIDA (/admin/login)
  if (appZone === 'admin_login' || !adminToken) {
    return (
      <AdminLoginScreen
        onSuccess={handleAdminAuthSuccess}
        onBackToPortal={navigateToParticipantPortal}
      />
    );
  }

  // 4. ZONA B (DASHBOARD): PANEL DEL ADMINISTRADOR (/admin/dashboard)
  const areas = Array.from(
    new Set([
      ...catalogs.filter((c) => c.type === 'area' && c.active).map((c) => c.name),
      ...participants.map((p) => p.area).filter(Boolean),
    ])
  );
  const roles = Array.from(
    new Set([
      ...catalogs.filter((c) => c.type === 'role' && c.active).map((c) => c.name),
      ...participants.map((p) => p.role).filter(Boolean),
    ])
  );
  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId);

  return (
    <div className="min-h-screen bg-white text-[#0F172A] flex flex-col">
      {/* ============================================================================ */}
      {/* TOP BAR CONTRACT — PANEL DEL ADMINISTRADOR (/admin/dashboard) */}
      {/* ============================================================================ */}
      <header className="sticky top-0 z-30 bg-white border-b-2 border-[#DA291C] px-6 py-3.5 shadow-2xs">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-6">
          {/* Zone 1: U Claro Tecnología Brand & Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setSelectedParticipantId(null);
              setWizardOpen(false);
              setActiveTab('dashboard');
            }}
            className="flex items-center gap-3 shrink-0 group"
          >
            <UClaroTecnologiaLogo className="w-11 h-11 shrink-0" />
            <div>
              <div className="text-[11px] font-extrabold tracking-wider uppercase text-[#DA291C]">
                U Claro Tecnología · Panel Administrador
              </div>
              <div className="text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Fábrica Inteligente de Formación
              </div>
            </div>
          </a>

          {/* Zone 2: Clean navigation links with Claro Red active underline */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => {
                setSelectedParticipantId(null);
                setWizardOpen(false);
                setActiveTab('dashboard');
              }}
              className={`hover:text-[#DA291C] transition-colors whitespace-nowrap py-1 border-b-2 ${
                activeTab === 'dashboard'
                  ? 'border-[#DA291C] text-[#DA291C] font-bold'
                  : 'border-transparent'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedParticipantId(null);
                setWizardOpen(false);
                setActiveTab('courses_admin');
              }}
              className={`hover:text-[#DA291C] transition-colors whitespace-nowrap py-1 border-b-2 ${
                activeTab === 'courses_admin'
                  ? 'border-[#DA291C] text-[#DA291C] font-bold'
                  : 'border-transparent'
              }`}
            >
              Curso y Sesiones
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedParticipantId(null);
                setWizardOpen(false);
                setActiveTab('public_portal');
              }}
              className={`hover:text-[#DA291C] transition-colors whitespace-nowrap py-1 border-b-2 ${
                activeTab === 'public_portal'
                  ? 'border-[#DA291C] text-[#DA291C] font-bold'
                  : 'border-transparent'
              }`}
            >
              Capacitaciones (Cards)
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedParticipantId(null);
                setWizardOpen(false);
                setActiveTab('gap_analytics');
              }}
              className={`hover:text-[#DA291C] transition-colors whitespace-nowrap py-1 border-b-2 ${
                activeTab === 'gap_analytics'
                  ? 'border-[#DA291C] text-[#DA291C] font-bold'
                  : 'border-transparent'
              }`}
            >
              Puntos de Mejora
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedParticipantId(null);
                setWizardOpen(false);
                setActiveTab('participants');
              }}
              className={`hover:text-[#DA291C] transition-colors whitespace-nowrap py-1 border-b-2 ${
                activeTab === 'participants'
                  ? 'border-[#DA291C] text-[#DA291C] font-bold'
                  : 'border-transparent'
              }`}
            >
              Participantes
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedParticipantId(null);
                setWizardOpen(false);
                setActiveTab('catalogs_sql');
              }}
              className={`hover:text-[#DA291C] transition-colors whitespace-nowrap py-1 border-b-2 inline-flex items-center gap-1 ${
                activeTab === 'catalogs_sql'
                  ? 'border-[#DA291C] text-[#DA291C] font-bold'
                  : 'border-transparent'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Cargos y Áreas</span>
            </button>
          </nav>

          {/* Zone 3: Primary actions in Claro Red */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingCourse(null);
                setSelectedParticipantId(null);
                setWizardOpen(true);
              }}
              className="px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ NUEVA CAPACITACIÓN</span>
            </button>

            <button
              type="button"
              onClick={navigateToParticipantPortal}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg hidden xl:inline-flex items-center gap-1.5 whitespace-nowrap"
              title="Ver portal público del participante"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Portal Participante</span>
            </button>

            <button
              type="button"
              onClick={handleAdminLogout}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-[#DA291C] border border-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
              title={`Cerrar sesión (${adminEmail})`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir Admin</span>
            </button>
          </div>
        </div>

        {/* Mobile Secondary Navigation Strip */}
        <div className="flex lg:hidden items-center gap-2 overflow-x-auto pt-2.5 mt-2.5 border-t border-slate-100 text-xs font-medium">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'courses_admin', label: 'Cursos' },
            { id: 'public_portal', label: 'Capacitaciones' },
            { id: 'gap_analytics', label: 'Puntos de Mejora' },
            { id: 'participants', label: 'Participantes' },
            { id: 'catalogs_sql', label: 'Cargos y Áreas' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedParticipantId(null);
                setWizardOpen(false);
                setActiveTab(t.id as ActiveTab);
              }}
              className={`px-2.5 py-1 rounded whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-[#DA291C] text-white font-bold'
                  : 'text-slate-600 bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Container on Pure White Background */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 bg-white">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-28 bg-white border border-slate-200 rounded-xl p-5 animate-pulse"
              />
            ))}
          </div>
        ) : wizardOpen && adminToken ? (
          <CourseBuilderWizard
            initialCourse={editingCourse}
            competencies={competencies}
            catalogs={catalogs}
            adminToken={adminToken}
            onSaveCourse={async (savedCourse) => {
              await syncCourseToFirestore(savedCourse).catch(() => {});
              setWizardOpen(false);
              setEditingCourse(null);
              await fetchAllState();
              setActiveTab('courses_admin');
            }}
            onPreviewCourse={(slug) => openActivityBySlug(slug, true)}
            onCancel={() => {
              setWizardOpen(false);
              setEditingCourse(null);
            }}
          />
        ) : selectedParticipant ? (
          <ParticipantProfileView
            participant={selectedParticipant}
            courses={courses}
            sessions={sessions}
            answers={answers}
            competencies={competencies}
            thresholds={thresholds}
            onBack={() => setSelectedParticipantId(null)}
            onLaunchActivity={(slug) => openActivityBySlug(slug, false)}
          />
        ) : (
          <>
            {/* ============================================================================ */}
            {/* VISTA 1: BIBLIOTECA VISUAL DE CAPACITACIONES (CARDS DINÁMICAS) */}
            {/* ============================================================================ */}
            {activeTab === 'public_portal' && (
              <TrainingLibraryView
                courses={courses}
                onStartTraining={(slug) => openActivityBySlug(slug, false)}
                isAdminView={true}
                onShowQr={(slug) => setQrModalSlug(slug)}
              />
            )}

            {/* ============================================================================ */}
            {/* VISTA 2: DASHBOARD ADMINISTRATIVO Y EXPORTACIÓN EXCEL (SECCIONES 12 Y 15) */}
            {/* ============================================================================ */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Banner de Ejecución Directa: Carga de Material en Cualquier Formato */}
                <div className="p-5 bg-gradient-to-r from-red-50 via-white to-red-50/40 border-2 border-[#DA291C] rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-2xs">
                  <div className="space-y-1">
                    <div className="text-xs font-mono font-extrabold text-[#DA291C] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#DA291C]" />
                      <span>MOTOR IA MULTIFORMATO ACTIVO · PDF, WORD, EXCEL, PPT, CSV, TXT, IMAGEN, AUDIO Y VIDEO</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                      Carga cualquier archivo y genera automáticamente Material Formativo, Preguntas Evaluativas y Casos Prácticos Reales
                    </h2>
                    <p className="text-xs text-slate-600">
                      La aplicación analiza íntegramente el documento o archivo multimedia que subas y construye los módulos formativos, evaluaciones y escenarios reales de campo.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCourse(null);
                        setSelectedParticipantId(null);
                        setWizardOpen(true);
                      }}
                      className="px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider bg-[#DA291C] hover:bg-[#B91C1C] text-white rounded-xl inline-flex items-center gap-2 shadow-xs transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Cargar Material y Generar Curso Ahora</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('courses_admin')}
                      className="px-4 py-2.5 text-xs font-bold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl inline-flex items-center gap-1.5 transition-colors"
                    >
                      <span>Ir a Curso y Sesiones</span>
                    </button>
                  </div>
                </div>

                {/* Dashboard Title, Claro Brand Identity & "Exportar a Excel" Action Suite */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="h-2 w-full bg-[#DA291C]" />
                  <div className="p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 bg-white">
                    <div className="flex items-start sm:items-center gap-4">
                      <UClaroTecnologiaLogo className="w-14 h-14 shrink-0" />
                      <div>
                        <div className="text-[11px] font-mono font-bold text-[#DA291C] uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                          <span>U CLARO TECNOLOGÍA · MONITOREO Y REPORTES MICROSOFT EXCEL (.XLSX)</span>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
                          Dashboard Ejecutivo de Formación Operativa
                        </h1>
                        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                          <li className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                            <span>Registro unificado por Cédula (Nombre completo, Cédula, Área y Cargo)</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                            <span>Exportación binaria OpenXML (.xlsx) con filtros activos</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2 w-full lg:w-auto">
                      <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                        <Download className="w-3.5 h-3.5 text-[#DA291C]" />
                        <span>Exportar a Excel (Respeta filtros activos)</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const courseObj = courses.find((c) => c.id === filterCourseId);
                            const labelParts = [
                              courseObj ? courseObj.slug : null,
                              filterArea !== 'ALL' ? filterArea : null,
                              filterRole !== 'ALL' ? filterRole : null,
                              filterStatus !== 'ALL' ? filterStatus : null,
                            ].filter(Boolean);
                            const info = exportSummaryToExcel({
                              sessions: filteredSessions,
                              participants,
                              courses,
                              results,
                              answers,
                              competencies,
                              filterLabel:
                                labelParts.length > 0
                                  ? labelParts.join('_')
                                  : 'Consolidado',
                            });
                            setLastExcelExportInfo(info);
                          }}
                          className="px-3.5 py-2 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>1. Exportación resumen (.xlsx)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const courseObj = courses.find((c) => c.id === filterCourseId);
                            const labelParts = [
                              courseObj ? courseObj.slug : null,
                              filterArea !== 'ALL' ? filterArea : null,
                              filterRole !== 'ALL' ? filterRole : null,
                              filterStatus !== 'ALL' ? filterStatus : null,
                            ].filter(Boolean);
                            const info = exportDetailToExcel({
                              sessions: filteredSessions,
                              participants,
                              courses,
                              answers,
                              competencies,
                              filterLabel:
                                labelParts.length > 0
                                  ? labelParts.join('_')
                                  : 'Consolidado',
                            });
                            setLastExcelExportInfo(info);
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-[#DA291C]" />
                          <span>2. Exportación detallada (.xlsx)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const courseObj = courses.find((c) => c.id === filterCourseId);
                            const labelParts = [
                              courseObj ? courseObj.slug : null,
                              filterArea !== 'ALL' ? filterArea : null,
                              filterRole !== 'ALL' ? filterRole : null,
                            ].filter(Boolean);
                            const info = exportCompleteWorkbookToExcel({
                              sessions: filteredSessions,
                              participants,
                              courses,
                              results,
                              answers,
                              competencies,
                              filterLabel:
                                labelParts.length > 0
                                  ? labelParts.join('_')
                                  : 'Consolidado',
                            });
                            setLastExcelExportInfo(info);
                          }}
                          className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                          title="Descargar un único archivo .xlsx con ambas hojas: Resumen y Detalle"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-700" />
                          <span>Libro Completo (2 hojas .xlsx)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowExcelPreview((prev) => !prev)}
                          className={`px-3 py-2 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                            showExcelPreview
                              ? 'bg-red-50 border-[#DA291C] text-[#DA291C]'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{showExcelPreview ? 'Ocultar estructura Excel' : 'Verificar columnas Excel'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Binary XLSX Verification Notification Banner */}
                {lastExcelExportInfo && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-950 space-y-0.5">
                        <div className="font-bold">
                          Archivo Microsoft Excel generado y verificado: <span className="font-mono">{lastExcelExportInfo.fileName}</span>
                        </div>
                        <div className="text-emerald-800 font-mono text-[11px]">
                          Formato: OpenXML Workbook (.xlsx real, firma binaria ZIP PK\x03\x04: {lastExcelExportInfo.validZipSignature ? 'VÁLIDA' : 'ERROR'}) · Tamaño: {(lastExcelExportInfo.byteLength / 1024).toFixed(1)} KB · Hojas: {lastExcelExportInfo.sheetNames.map((s) => `${s} (${lastExcelExportInfo.rowCountBySheet[s]} filas)`).join(', ')}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLastExcelExportInfo(null)}
                      className="text-xs font-semibold text-emerald-800 hover:underline"
                    >
                      Cerrar aviso
                    </button>
                  </div>
                )}

                {/* Interactive Excel Structure & Filtered Rows Inspector */}
                {showExcelPreview && (() => {
                  const summaryRows = buildSummaryExcelRows({
                    sessions: filteredSessions,
                    participants,
                    courses,
                    results,
                    answers,
                    competencies,
                  });
                  const detailRows = buildDetailExcelRows({
                    sessions: filteredSessions,
                    participants,
                    courses,
                    answers,
                    competencies,
                  });
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden space-y-4 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                        <div>
                          <h2 className="text-sm font-bold text-slate-900">
                            Previsualización de Estructura Oficial Microsoft Excel (.xlsx)
                          </h2>
                          <p className="text-xs text-slate-500">
                            Vista en vivo de las filas que se incluyen al exportar con los filtros actuales ({summaryRows.length} sesiones en Resumen · {detailRows.length} respuestas en Detalle).
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExcelPreviewTab('summary')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                              excelPreviewTab === 'summary'
                                ? 'bg-[#DA291C] text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            1. Exportación resumen ({SUMMARY_EXCEL_HEADERS.length} columnas · {summaryRows.length} filas)
                          </button>
                          <button
                            type="button"
                            onClick={() => setExcelPreviewTab('detail')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                              excelPreviewTab === 'detail'
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            2. Exportación detallada ({DETAIL_EXCEL_HEADERS.length} columnas · {detailRows.length} filas)
                          </button>
                        </div>
                      </div>

                      {excelPreviewTab === 'summary' ? (
                        <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-lg">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                              <tr>
                                {SUMMARY_EXCEL_HEADERS.map((h) => (
                                  <th key={h} className="py-2 px-3 whitespace-nowrap border-r border-slate-200 last:border-r-0">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {summaryRows.length === 0 ? (
                                <tr>
                                  <td colSpan={SUMMARY_EXCEL_HEADERS.length} className="py-6 text-center text-slate-500">
                                    No hay registros que coincidan con los filtros seleccionados.
                                  </td>
                                </tr>
                              ) : (
                                summaryRows.map((r, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">{r.Nombre}</td>
                                    <td className="py-2 px-3 font-mono whitespace-nowrap">{r.Cédula}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Área}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Cargo}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Curso}</td>
                                    <td className="py-2 px-3 font-mono whitespace-nowrap">{r['Fecha de inicio']}</td>
                                    <td className="py-2 px-3 font-mono whitespace-nowrap">{r['Fecha de finalización']}</td>
                                    <td className="py-2 px-3 font-mono whitespace-nowrap">{r.Duración}</td>
                                    <td className="py-2 px-3 font-mono font-bold text-right whitespace-nowrap">{r.Nota}</td>
                                    <td className="py-2 px-3 font-semibold whitespace-nowrap">{r.Estado}</td>
                                    <td className="py-2 px-3 text-emerald-700 whitespace-nowrap">{r['Principal fortaleza']}</td>
                                    <td className="py-2 px-3 text-[#DA291C] whitespace-nowrap">{r['Principal punto a mejorar']}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-lg">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                              <tr>
                                {DETAIL_EXCEL_HEADERS.map((h) => (
                                  <th key={h} className="py-2 px-3 whitespace-nowrap border-r border-slate-200 last:border-r-0">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {detailRows.length === 0 ? (
                                <tr>
                                  <td colSpan={DETAIL_EXCEL_HEADERS.length} className="py-6 text-center text-slate-500">
                                    No hay respuestas que coincidan con los filtros seleccionados.
                                  </td>
                                </tr>
                              ) : (
                                detailRows.map((r, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">{r.Nombre}</td>
                                    <td className="py-2 px-3 font-mono whitespace-nowrap">{r.Cédula}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Área}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Cargo}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Curso}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Módulo}</td>
                                    <td className="py-2 px-3 whitespace-nowrap">{r.Competencia}</td>
                                    <td className="py-2 px-3 max-w-xs truncate" title={r.Pregunta}>{r.Pregunta}</td>
                                    <td className="py-2 px-3 max-w-xs truncate" title={r['Respuesta del participante']}>{r['Respuesta del participante']}</td>
                                    <td className="py-2 px-3 max-w-xs truncate" title={r['Respuesta correcta']}>{r['Respuesta correcta']}</td>
                                    <td className={`py-2 px-3 font-semibold whitespace-nowrap ${r.Resultado === 'Correcto' ? 'text-emerald-700' : 'text-[#DA291C]'}`}>{r.Resultado}</td>
                                    <td className="py-2 px-3 font-mono text-right whitespace-nowrap">{r.Intentos}</td>
                                    <td className="py-2 px-3 font-mono font-bold text-right whitespace-nowrap">{r.Puntaje}</td>
                                    <td className="py-2 px-3 font-mono whitespace-nowrap">{r.Fecha}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Multi-Dimensional Filter Bar (Curso, Área, Cargo, Estado, Fecha, Búsqueda por Nombre o Cédula) */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                      <span>
                        Filtros del Dashboard y Exportación a Excel ({filteredSessions.length} de {sessions.length} participaciones)
                      </span>
                    </span>
                    {(filterCourseId !== 'ALL' ||
                      filterArea !== 'ALL' ||
                      filterRole !== 'ALL' ||
                      filterStatus !== 'ALL' ||
                      filterDateFrom !== '' ||
                      filterDateTo !== '' ||
                      searchQuery.trim() !== '') && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterCourseId('ALL');
                          setFilterArea('ALL');
                          setFilterRole('ALL');
                          setFilterStatus('ALL');
                          setFilterDateFrom('');
                          setFilterDateTo('');
                          setSearchQuery('');
                        }}
                        className="text-xs font-semibold text-[#DA291C] hover:underline"
                      >
                        Restablecer filtros
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Curso
                      </label>
                      <select
                        value={filterCourseId}
                        onChange={(e) => setFilterCourseId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="ALL">Todos los cursos</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Área
                      </label>
                      <select
                        value={filterArea}
                        onChange={(e) => setFilterArea(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="ALL">Todas las áreas</option>
                        {areas.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Cargo
                        </label>
                        <button
                          type="button"
                          onClick={() => setActiveTab('catalogs_sql')}
                          className="text-[10px] font-bold text-[#DA291C] hover:underline"
                          title="Ingresar o administrar cargos de la organización"
                        >
                          + Ingresar cargos
                        </button>
                      </div>
                      <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="ALL">Todos los cargos</option>
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Estado
                      </label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="ALL">Todos los estados</option>
                        <option value="Aprobado">Aprobado</option>
                        <option value="Requiere refuerzo">Requiere refuerzo</option>
                        <option value="En progreso">En progreso</option>
                        <option value="Registrado">Registrado</option>
                        <option value="Abandonado">Abandonado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Desde fecha
                      </label>
                      <input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Hasta fecha
                      </label>
                      <input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Búsqueda (Nombre o Cédula)
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Nombre o cédula..."
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 8 Required General Indicators (Section 12) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">Cursos activos</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {kpis.activeCoursesCount}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">Participantes</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {kpis.uniqueParticipantsCount}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">Iniciadas</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {kpis.startedCount}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">Finalizadas</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {kpis.finishedCount}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">% Finalización</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-sky-700 mt-1">
                      {kpis.completionRate}%
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">Promedio Gral.</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {kpis.avgScore}%
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">% Aprobación</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                      {kpis.approvalRate}%
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] text-slate-500">Req. Refuerzo</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-red-700 mt-1">
                      {kpis.needsReinforcementCount}
                    </div>
                  </div>
                </div>

                {/* Visual Rankings: Desempeño por Curso y Desempeño por Competencia */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-900">
                        Desempeño y Participación por Curso
                      </h2>
                      <span className="text-xs text-slate-500">Promedio y sesiones</span>
                    </div>

                    <div className="space-y-3.5">
                      {courses.map((c) => {
                        const cSessions = filteredSessions.filter(
                          (s) => s.course_id === c.id
                        );
                        const avg =
                          cSessions.length > 0
                            ? Math.round(
                                cSessions.reduce(
                                  (sum, s) => sum + s.score_percentage,
                                  0
                                ) / cSessions.length
                              )
                            : 0;

                        return (
                          <div key={c.id} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <button
                                type="button"
                                onClick={() => openActivityBySlug(c.slug, false)}
                                className="font-semibold text-slate-800 hover:text-sky-700 text-left truncate max-w-[70%]"
                              >
                                {c.title}
                              </button>
                              <span className="font-mono text-slate-600 tabular-nums">
                                {cSessions.length} sesiones · <strong>{avg}%</strong>
                              </span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#0284C7] rounded-full"
                                style={{ width: `${avg}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-900">
                        Resumen Rápido de Brechas por Competencia
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('gap_analytics')}
                        className="text-xs font-semibold text-sky-700 hover:underline"
                      >
                        Ver analítica detallada →
                      </button>
                    </div>

                    {competencyAnalytics.all.length === 0 ? (
                      <div className="py-6 text-center text-xs font-medium text-slate-500">
                        No existen suficientes datos para generar este análisis.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {competencyAnalytics.all.map((item) => (
                          <div key={item.competency.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-800">
                                {item.competency.name}
                              </span>
                              <div className="flex items-center gap-2 font-mono tabular-nums">
                                <span className="text-[11px] text-slate-500">
                                  {item.level === 'good'
                                    ? 'Buen desempeño'
                                    : item.level === 'warning'
                                    ? 'Requiere atención'
                                    : 'Brecha importante'}
                                </span>
                                <span
                                  className={`font-bold ${
                                    item.level === 'good'
                                      ? 'text-emerald-700'
                                      : item.level === 'warning'
                                      ? 'text-amber-700'
                                      : 'text-red-700'
                                  }`}
                                >
                                  {item.percentage}%
                                </span>
                              </div>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  item.level === 'good'
                                    ? 'bg-emerald-600'
                                    : item.level === 'warning'
                                    ? 'bg-amber-500'
                                    : 'bg-red-600'
                                }`}
                                style={{ width: `${Math.max(6, item.percentage)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sessions Table with 1-Click Participant Profile Drilldown */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                      <span>Registro de Participaciones en Cursos ({filteredSessions.length})</span>
                    </h2>
                    <span className="text-xs text-slate-500">
                      Haz clic sobre cualquier participante para abrir su Ficha Individual e Historial por Cédula
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                          <th className="py-2.5 px-4">Nombre Completo / Cédula</th>
                          <th className="py-2.5 px-4">Área / Cargo</th>
                          <th className="py-2.5 px-4">Curso (Participación)</th>
                          <th className="py-2.5 px-4 text-right">Avance</th>
                          <th className="py-2.5 px-4 text-right">Resultado</th>
                          <th className="py-2.5 px-4">Estado</th>
                          <th className="py-2.5 px-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredSessions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                              Aún no hay participaciones registradas. Los datos se irán diligenciando automáticamente a medida que el personal ingrese al enlace de cada capacitación (/formacion/tema) y registre sus datos reales.
                            </td>
                          </tr>
                        ) : (
                          filteredSessions.map((sess) => {
                            const part = participants.find(
                              (p) => p.id === sess.participant_id
                            );
                          const course = courses.find((c) => c.id === sess.course_id);
                          return (
                            <tr key={sess.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    part && setSelectedParticipantId(part.id)
                                  }
                                  className="font-semibold text-slate-900 hover:text-[#DA291C] text-left block"
                                >
                                  {part?.full_name || 'Participante'}
                                </button>
                                <span className="text-[11px] font-mono text-slate-500">
                                  Cédula: {part?.identification_number} · {sess.session_code}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-600">
                                <div className="font-medium text-slate-800">
                                  {part?.area}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {part?.role}
                                </div>
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-800">
                                {course?.title || sess.course_id}
                                <span className="ml-1.5 text-[11px] font-mono text-slate-500">
                                  (Intento #{sess.attempt_number})
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                {sess.progress_percentage}%
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                                {sess.score_percentage}%
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`font-semibold ${
                                    sess.status === 'Aprobado'
                                      ? 'text-emerald-700'
                                      : sess.status === 'Requiere refuerzo'
                                      ? 'text-[#DA291C]'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {sess.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                {part && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedParticipantId(part.id)}
                                    className="text-xs font-semibold text-[#DA291C] hover:underline whitespace-nowrap"
                                  >
                                    Ver perfil
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================================ */}
            {/* VISTA 3: ANALÍTICA DE BRECHAS — "PUNTOS DE MEJORA" (SECCIÓN 13) */}
            {/* ============================================================================ */}
            {activeTab === 'gap_analytics' && (
              <GapAnalyticsModule
                courses={courses}
                participants={participants}
                sessions={sessions}
                answers={answers}
                competencies={competencies}
                catalogs={catalogs}
                thresholds={thresholds}
                onUpdateThresholds={async (next) => {
                  setThresholds(next);
                  if (adminToken) {
                    await fetch('/api/admin/thresholds', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${adminToken}`,
                      },
                      body: JSON.stringify(next),
                    });
                  }
                }}
                filterCourseId={filterCourseId}
                setFilterCourseId={setFilterCourseId}
                filterArea={filterArea}
                setFilterArea={setFilterArea}
                filterRole={filterRole}
                setFilterRole={setFilterRole}
                filterDateFrom={filterDateFrom}
                setFilterDateFrom={setFilterDateFrom}
                filterDateTo={filterDateTo}
                setFilterDateTo={setFilterDateTo}
                onSelectParticipantProfile={(participantId) =>
                  setSelectedParticipantId(participantId)
                }
              />
            )}

            {/* ============================================================================ */}
            {/* VISTA 4: DIRECTORIO DE PARTICIPANTES Y PERFIL INDIVIDUAL (SECCIÓN 14) */}
            {/* ============================================================================ */}
            {activeTab === 'participants' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono font-bold text-[#DA291C] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                      <span>REGISTRO ÚNICO DE PERSONAS POR CÉDULA · HISTORIAL MULTICURSO</span>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                      Directorio de Participantes y Perfiles Individuales ({participants.length})
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cada participante se identifica de forma única por su Cédula y conserva el historial de todas sus participaciones en diferentes formaciones.
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="py-3 px-4">Nombre Completo</th>
                        <th className="py-3 px-4">Cédula</th>
                        <th className="py-3 px-4">Área</th>
                        <th className="py-3 px-4">Cargo</th>
                        <th className="py-3 px-4 text-right">Participaciones en Cursos</th>
                        <th className="py-3 px-4 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {participants.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                            No hay participantes registrados aún. Este directorio se alimentará automáticamente con los datos reales (Nombre completo, Cédula, Área y Cargo) del personal que ingrese a los links de formación.
                          </td>
                        </tr>
                      ) : (
                        participants.map((p) => {
                          const pSess = sessions.filter((s) => s.participant_id === p.id);
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                              {p.full_name}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-600">
                              {p.identification_number}
                            </td>
                            <td className="py-3.5 px-4 text-slate-700">{p.area}</td>
                            <td className="py-3.5 px-4 text-slate-600">{p.role}</td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                              {pSess.length}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedParticipantId(p.id)}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg"
                              >
                                Ver Perfil e Historial
                              </button>
                            </td>
                          </tr>
                        );
                      })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ============================================================================ */}
            {/* VISTA 5: SECCIÓN CURSO Y SESIONES DE CURSO (GENERADOR IA, TEMARIO Y LINKS) */}
            {/* ============================================================================ */}
            {activeTab === 'courses_admin' && adminToken && (
              <AdminCourseSessionsView
                courses={courses}
                participants={participants}
                sessions={sessions}
                answers={answers}
                results={results}
                competencies={competencies}
                catalogs={catalogs}
                adminToken={adminToken}
                onOpenWizard={(courseToEdit) => {
                  setEditingCourse(courseToEdit || null);
                  setWizardOpen(true);
                }}
                onPreviewCourseSession={(slug, isPreview) =>
                  openActivityBySlug(slug, isPreview)
                }
                onSelectParticipantProfile={(partId) =>
                  setSelectedParticipantId(partId)
                }
                onShowQrModal={(slug) => setQrModalSlug(slug)}
                onRefreshState={async () => {
                  await fetchAllState();
                }}
              />
            )}

            {/* ============================================================================ */}
            {/* VISTA 6: GESTIÓN DE CARGOS, ÁREAS, COMPETENCIAS Y ESQUEMA DE BASE DE DATOS */}
            {/* ============================================================================ */}
            {activeTab === 'catalogs_sql' && (
              <div className="space-y-8">
                {/* Dedicated Organizational Cargos, Areas, and Categories Manager */}
                <OrganizationalRolesManager
                  catalogs={catalogs}
                  adminToken={adminToken}
                  onRefresh={() => fetchAllState()}
                />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: Competencies Manager */}
                  <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                      Competencias / Temas Evaluables ({competencies.length})
                    </h2>

                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newCompName.trim() || !adminToken) return;
                        await fetch('/api/admin/competencies', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${adminToken}`,
                          },
                          body: JSON.stringify({
                            code: newCompCode || `COMP-0${competencies.length + 1}`,
                            name: newCompName,
                            category: newCompCategory,
                            description: newCompDesc,
                          }),
                        });
                        setNewCompName('');
                        setNewCompCode('');
                        setNewCompDesc('');
                        fetchAllState();
                      }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 p-3.5 rounded-lg border border-slate-200"
                    >
                      <input
                        type="text"
                        required
                        value={newCompName}
                        onChange={(e) => setNewCompName(e.target.value)}
                        placeholder="Nombre competencia (ej. Empalmes FO)"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        value={newCompCode}
                        onChange={(e) => setNewCompCode(e.target.value)}
                        placeholder="Código (ej. FO-EMP-07)"
                        className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded"
                      >
                        + Agregar competencia
                      </button>
                    </form>

                    <div className="divide-y divide-slate-100 text-xs max-h-80 overflow-y-auto">
                      {competencies.map((comp) => (
                        <div key={comp.id} className="py-2.5 flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {comp.name}{' '}
                              <span className="font-mono text-slate-500">({comp.code})</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {comp.description}
                            </div>
                          </div>
                          <span className="text-[11px] text-slate-500 shrink-0">
                            {comp.category}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Database Schema Inspector */}
                  <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <Database className="w-5 h-5 text-[#DA291C]" />
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Seguridad Firestore y Esquema Relacional
                          </h3>
                          <p className="text-xs text-slate-500">
                            Separación estricta entre participante público y administrador autenticado.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(supabaseSql)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Esquema SQL</span>
                      </button>
                    </div>
                    <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto max-h-72 leading-relaxed">
                      {supabaseSql}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* QR Code & Link Sharing Modal */}
      {qrModalSlug && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5 text-center">
            <div className="text-xs font-mono text-[#DA291C] font-bold">
              ENLACE PÚBLICO DE CAPACITACIÓN
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Compartir Enlace (/formacion/{qrModalSlug}) y Código QR
            </h3>
            <div className="flex justify-center">
              <CourseQrCodeSvg
                value={`${window.location.origin}/formacion/${qrModalSlug}`}
                size={180}
              />
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 break-all">
              {`${window.location.origin}/formacion/${qrModalSlug}`}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setQrModalSlug(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  const slug = qrModalSlug;
                  setQrModalSlug(null);
                  openActivityBySlug(slug, false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir capacitación</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
