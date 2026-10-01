import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  Filter,
  HelpCircle,
  Layers,
  RotateCcw,
  Sliders,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  CatalogItem,
  Competency,
  Course,
  GapThresholdConfig,
  Participant,
  ParticipantAnswer,
  ParticipantSession,
  Question,
} from '../../types/lms.ts';

interface GapAnalyticsModuleProps {
  courses: Course[];
  participants: Participant[];
  sessions: ParticipantSession[];
  answers: ParticipantAnswer[];
  competencies: Competency[];
  catalogs: CatalogItem[];
  thresholds: GapThresholdConfig;
  onUpdateThresholds: (next: GapThresholdConfig) => void;
  filterCourseId: string;
  setFilterCourseId: (val: string) => void;
  filterArea: string;
  setFilterArea: (val: string) => void;
  filterRole: string;
  setFilterRole: (val: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (val: string) => void;
  filterDateTo: string;
  setFilterDateTo: (val: string) => void;
  onSelectParticipantProfile?: (participantId: string) => void;
}

type AnalysisDimensionTab = 'general' | 'by_participant' | 'by_group';
type GroupByDimension = 'area' | 'role' | 'course';

interface CompetencyMetricRow {
  competency: Competency;
  earnedPoints: number;
  maxPoints: number;
  domainPercentage: number;
  totalAttempts: number;
  uniqueQuestionsEvaluated: number;
  correctCount: number;
  incorrectCount: number;
  avgAttemptsPerQuestion: number;
  level: 'good' | 'warning' | 'critical';
}

interface QuestionMetricRow {
  questionId: string;
  prompt: string;
  courseId: string;
  courseTitle: string;
  moduleTitle: string;
  competencyId: string;
  competencyName: string;
  totalAttempts: number;
  uniqueParticipantSessions: number;
  correctAttempts: number;
  incorrectAttempts: number;
  avgAttempts: number;
  accuracyPercentage: number;
}

const INSUFFICIENT_DATA_MESSAGE =
  'No existen suficientes datos para generar este análisis.';

export const GapAnalyticsModule: React.FC<GapAnalyticsModuleProps> = ({
  courses,
  participants,
  sessions,
  answers,
  competencies,
  catalogs,
  thresholds,
  onUpdateThresholds,
  filterCourseId,
  setFilterCourseId,
  filterArea,
  setFilterArea,
  filterRole,
  setFilterRole,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  onSelectParticipantProfile,
}) => {
  const [subTab, setSubTab] = useState<AnalysisDimensionTab>('general');
  const [groupBy, setGroupBy] = useState<GroupByDimension>('area');
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('ALL');
  const [participantSearch, setParticipantSearch] = useState<string>('');

  const areas = useMemo(() => {
    const set = new Set<string>(
      catalogs.filter((c) => c.type === 'area').map((c) => c.name)
    );
    participants.forEach((p) => {
      if (p.area) set.add(p.area);
    });
    return Array.from(set);
  }, [catalogs, participants]);

  const roles = useMemo(() => {
    const set = new Set<string>(
      catalogs.filter((c) => c.type === 'role').map((c) => c.name)
    );
    participants.forEach((p) => {
      if (p.role) set.add(p.role);
    });
    return Array.from(set);
  }, [catalogs, participants]);

  // Build question lookup map from real courses
  const questionMetaMap = useMemo(() => {
    const map = new Map<
      string,
      {
        question: Question;
        courseTitle: string;
        moduleTitle: string;
      }
    >();
    courses.forEach((c) => {
      (c.modules || []).forEach((m) => {
        (m.items || []).forEach((it) => {
          if (it.question) {
            map.set(it.question.id, {
              question: it.question,
              courseTitle: c.title,
              moduleTitle: m.title,
            });
          }
        });
      });
    });
    return map;
  }, [courses]);

  const participantMap = useMemo(() => {
    const map = new Map<string, Participant>();
    participants.forEach((p) => map.set(p.id, p));
    return map;
  }, [participants]);

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  const competencyMap = useMemo(() => {
    const map = new Map<string, Competency>();
    competencies.forEach((c) => map.set(c.id, c));
    return map;
  }, [competencies]);

  // 1. Filter real participant_answers strictly using the filters: curso, área, cargo, fecha
  const filteredAnswers = useMemo(() => {
    return answers.filter((ans) => {
      const part = participantMap.get(ans.participant_id);
      if (!part) return false;

      if (filterCourseId !== 'ALL' && ans.course_id !== filterCourseId) {
        return false;
      }
      if (filterArea !== 'ALL' && part.area !== filterArea) {
        return false;
      }
      if (filterRole !== 'ALL' && part.role !== filterRole) {
        return false;
      }

      if (filterDateFrom) {
        const fromMs = new Date(`${filterDateFrom}T00:00:00`).getTime();
        const ansMs = new Date(ans.answered_at).getTime();
        if (ansMs < fromMs) return false;
      }

      if (filterDateTo) {
        const toMs = new Date(`${filterDateTo}T23:59:59.999`).getTime();
        const ansMs = new Date(ans.answered_at).getTime();
        if (ansMs > toMs) return false;
      }

      return true;
    });
  }, [
    answers,
    participantMap,
    filterCourseId,
    filterArea,
    filterRole,
    filterDateFrom,
    filterDateTo,
  ]);

  // Helper function to compute CompetencyMetricRow[] from any subset of real ParticipantAnswer[]
  const computeCompetencyMetrics = (
    subsetAnswers: ParticipantAnswer[]
  ): CompetencyMetricRow[] => {
    if (subsetAnswers.length === 0) return [];

    // Best attempt per (session_id, question_id) for domain score calculation
    const bestAttemptBySessionQuestion = new Map<string, ParticipantAnswer>();
    // All attempts grouped by competency_id for attempt & correct/incorrect counts
    const rawByCompetency = new Map<
      string,
      {
        totalAttempts: number;
        correctCount: number;
        incorrectCount: number;
        sessionQuestionKeys: Set<string>;
      }
    >();

    for (const ans of subsetAnswers) {
      const sqKey = `${ans.session_id}::${ans.question_id}`;
      const prevBest = bestAttemptBySessionQuestion.get(sqKey);
      if (!prevBest || ans.points_obtained >= prevBest.points_obtained) {
        bestAttemptBySessionQuestion.set(sqKey, ans);
      }

      const raw = rawByCompetency.get(ans.competency_id) || {
        totalAttempts: 0,
        correctCount: 0,
        incorrectCount: 0,
        sessionQuestionKeys: new Set<string>(),
      };
      raw.totalAttempts += 1;
      if (ans.is_correct) {
        raw.correctCount += 1;
      } else {
        raw.incorrectCount += 1;
      }
      raw.sessionQuestionKeys.add(sqKey);
      rawByCompetency.set(ans.competency_id, raw);
    }

    const pointsByCompetency = new Map<string, { earned: number; max: number }>();
    for (const bestAns of bestAttemptBySessionQuestion.values()) {
      const pts = pointsByCompetency.get(bestAns.competency_id) || {
        earned: 0,
        max: 0,
      };
      pts.earned += bestAns.points_obtained;
      pts.max += bestAns.max_points;
      pointsByCompetency.set(bestAns.competency_id, pts);
    }

    const rows: CompetencyMetricRow[] = [];
    for (const [compId, raw] of rawByCompetency.entries()) {
      const comp = competencyMap.get(compId) || {
        id: compId,
        code: compId.slice(0, 8).toUpperCase(),
        name: compId,
        description: '',
        category: 'General',
        created_at: '',
        updated_at: '',
      };
      const pts = pointsByCompetency.get(compId) || { earned: 0, max: 0 };
      const domainPercentage =
        pts.max > 0 ? Math.round((pts.earned / pts.max) * 100) : 0;
      const uniqueQuestionsEvaluated = raw.sessionQuestionKeys.size;
      const avgAttemptsPerQuestion =
        uniqueQuestionsEvaluated > 0
          ? Number((raw.totalAttempts / uniqueQuestionsEvaluated).toFixed(2))
          : 0;

      const level: 'good' | 'warning' | 'critical' =
        domainPercentage >= thresholds.goodMin
          ? 'good'
          : domainPercentage >= thresholds.warningMin
          ? 'warning'
          : 'critical';

      rows.push({
        competency: comp,
        earnedPoints: pts.earned,
        maxPoints: pts.max,
        domainPercentage,
        totalAttempts: raw.totalAttempts,
        uniqueQuestionsEvaluated,
        correctCount: raw.correctCount,
        incorrectCount: raw.incorrectCount,
        avgAttemptsPerQuestion,
        level,
      });
    }

    return rows.sort((a, b) => b.domainPercentage - a.domainPercentage);
  };

  // 2. General Competency Metrics
  const generalCompetencyRows = useMemo(
    () => computeCompetencyMetrics(filteredAnswers),
    [filteredAnswers, competencyMap, thresholds]
  );

  const highestDomainCompetencies = useMemo(
    () =>
      [...generalCompetencyRows]
        .filter((r) => r.domainPercentage >= thresholds.warningMin)
        .sort((a, b) => b.domainPercentage - a.domainPercentage),
    [generalCompetencyRows, thresholds.warningMin]
  );

  const lowestDomainCompetencies = useMemo(
    () =>
      [...generalCompetencyRows].sort(
        (a, b) =>
          a.domainPercentage - b.domainPercentage ||
          b.incorrectCount - a.incorrectCount
      ),
    [generalCompetencyRows]
  );

  // 3. Question-level Breakdown (Curso + Pregunta + Competencia + Correctas + Incorrectas + Intentos)
  const questionMetrics = useMemo((): QuestionMetricRow[] => {
    if (filteredAnswers.length === 0) return [];

    const byQuestion = new Map<
      string,
      {
        courseId: string;
        competencyId: string;
        totalAttempts: number;
        correctAttempts: number;
        incorrectAttempts: number;
        sessionSet: Set<string>;
      }
    >();

    for (const ans of filteredAnswers) {
      const curr = byQuestion.get(ans.question_id) || {
        courseId: ans.course_id,
        competencyId: ans.competency_id,
        totalAttempts: 0,
        correctAttempts: 0,
        incorrectAttempts: 0,
        sessionSet: new Set<string>(),
      };
      curr.totalAttempts += 1;
      if (ans.is_correct) {
        curr.correctAttempts += 1;
      } else {
        curr.incorrectAttempts += 1;
      }
      curr.sessionSet.add(ans.session_id);
      byQuestion.set(ans.question_id, curr);
    }

    const list: QuestionMetricRow[] = [];
    for (const [qId, st] of byQuestion.entries()) {
      const qMeta = questionMetaMap.get(qId);
      const courseObj = courseMap.get(st.courseId);
      const compObj = competencyMap.get(st.competencyId);
      const uniqueSessions = st.sessionSet.size;
      const avgAttempts =
        uniqueSessions > 0
          ? Number((st.totalAttempts / uniqueSessions).toFixed(2))
          : 0;
      const accuracyPercentage =
        st.totalAttempts > 0
          ? Math.round((st.correctAttempts / st.totalAttempts) * 100)
          : 0;

      list.push({
        questionId: qId,
        prompt: qMeta?.question.prompt || `Pregunta ID ${qId.slice(0, 8)}`,
        courseId: st.courseId,
        courseTitle: qMeta?.courseTitle || courseObj?.title || st.courseId,
        moduleTitle: qMeta?.moduleTitle || 'Módulo',
        competencyId: st.competencyId,
        competencyName: compObj?.name || st.competencyId,
        totalAttempts: st.totalAttempts,
        uniqueParticipantSessions: uniqueSessions,
        correctAttempts: st.correctAttempts,
        incorrectAttempts: st.incorrectAttempts,
        avgAttempts,
        accuracyPercentage,
      });
    }

    return list.sort(
      (a, b) =>
        a.accuracyPercentage - b.accuracyPercentage ||
        b.incorrectAttempts - a.incorrectAttempts
    );
  }, [filteredAnswers, questionMetaMap, courseMap, competencyMap]);

  // 4. Overall Summary KPIs from real filtered answers
  const generalKpis = useMemo(() => {
    const uniqueParticipants = new Set(filteredAnswers.map((a) => a.participant_id))
      .size;
    const uniqueCourses = new Set(filteredAnswers.map((a) => a.course_id)).size;
    const totalAttempts = filteredAnswers.length;
    const correctAttempts = filteredAnswers.filter((a) => a.is_correct).length;
    const incorrectAttempts = totalAttempts - correctAttempts;
    const uniqueSessionQuestions = new Set(
      filteredAnswers.map((a) => `${a.session_id}::${a.question_id}`)
    ).size;
    const avgAttemptsPerQuestion =
      uniqueSessionQuestions > 0
        ? Number((totalAttempts / uniqueSessionQuestions).toFixed(2))
        : 0;

    const avgDomain =
      generalCompetencyRows.length > 0
        ? Math.round(
            generalCompetencyRows.reduce((acc, r) => acc + r.domainPercentage, 0) /
              generalCompetencyRows.length
          )
        : 0;

    return {
      uniqueParticipants,
      uniqueCourses,
      totalAttempts,
      correctAttempts,
      incorrectAttempts,
      avgAttemptsPerQuestion,
      avgDomain,
    };
  }, [filteredAnswers, generalCompetencyRows]);

  // 5. Participant-level Analysis (POR PARTICIPANTE: Fortalezas y Puntos por reforzar)
  const participantAnalysisList = useMemo(() => {
    const byParticipant = new Map<string, ParticipantAnswer[]>();
    for (const ans of filteredAnswers) {
      const list = byParticipant.get(ans.participant_id) || [];
      list.push(ans);
      byParticipant.set(ans.participant_id, list);
    }

    const result: Array<{
      participant: Participant;
      totalAttempts: number;
      correctAttempts: number;
      incorrectAttempts: number;
      avgAttemptsPerQuestion: number;
      overallDomain: number;
      competencyRows: CompetencyMetricRow[];
      strengths: CompetencyMetricRow[];
      gapsToReinforce: CompetencyMetricRow[];
      answers: ParticipantAnswer[];
    }> = [];

    for (const [partId, pAnswers] of byParticipant.entries()) {
      const part = participantMap.get(partId);
      if (!part) continue;

      const compRows = computeCompetencyMetrics(pAnswers);
      const totalAttempts = pAnswers.length;
      const correctAttempts = pAnswers.filter((a) => a.is_correct).length;
      const incorrectAttempts = totalAttempts - correctAttempts;
      const uniqueQuestions = new Set(
        pAnswers.map((a) => `${a.session_id}::${a.question_id}`)
      ).size;
      const avgAttemptsPerQuestion =
        uniqueQuestions > 0
          ? Number((totalAttempts / uniqueQuestions).toFixed(2))
          : 0;

      const totalEarned = compRows.reduce((s, r) => s + r.earnedPoints, 0);
      const totalMax = compRows.reduce((s, r) => s + r.maxPoints, 0);
      const overallDomain =
        totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

      const strengths = compRows.filter(
        (r) => r.domainPercentage >= thresholds.goodMin
      );
      const gapsToReinforce = [...compRows]
        .filter(
          (r) =>
            r.domainPercentage < thresholds.goodMin || r.incorrectCount > 0
        )
        .sort(
          (a, b) =>
            a.domainPercentage - b.domainPercentage ||
            b.incorrectCount - a.incorrectCount
        );

      result.push({
        participant: part,
        totalAttempts,
        correctAttempts,
        incorrectAttempts,
        avgAttemptsPerQuestion,
        overallDomain,
        competencyRows: compRows,
        strengths,
        gapsToReinforce,
        answers: [...pAnswers].sort(
          (a, b) =>
            new Date(b.answered_at).getTime() - new Date(a.answered_at).getTime()
        ),
      });
    }

    return result.sort((a, b) => a.overallDomain - b.overallDomain);
  }, [filteredAnswers, participantMap, competencyMap, thresholds]);

  const displayedParticipants = useMemo(() => {
    return participantAnalysisList.filter((item) => {
      if (
        selectedParticipantId !== 'ALL' &&
        item.participant.id !== selectedParticipantId
      ) {
        return false;
      }
      if (participantSearch.trim()) {
        const q = participantSearch.toLowerCase();
        const matchName = item.participant.full_name.toLowerCase().includes(q);
        const matchId = item.participant.identification_number
          .toLowerCase()
          .includes(q);
        const matchArea = item.participant.area.toLowerCase().includes(q);
        const matchRole = item.participant.role.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchArea && !matchRole) return false;
      }
      return true;
    });
  }, [participantAnalysisList, selectedParticipantId, participantSearch]);

  // 6. Group-level Analysis (POR GRUPO: Principales fortalezas y Principales brechas)
  const groupAnalysisList = useMemo(() => {
    if (filteredAnswers.length === 0) return [];

    const byGroup = new Map<string, ParticipantAnswer[]>();
    for (const ans of filteredAnswers) {
      const part = participantMap.get(ans.participant_id);
      if (!part) continue;

      let groupName = '';
      if (groupBy === 'area') {
        groupName = part.area;
      } else if (groupBy === 'role') {
        groupName = part.role;
      } else {
        groupName = courseMap.get(ans.course_id)?.title || ans.course_id;
      }

      const list = byGroup.get(groupName) || [];
      list.push(ans);
      byGroup.set(groupName, list);
    }

    const groups: Array<{
      groupName: string;
      participantsCount: number;
      totalAttempts: number;
      correctAttempts: number;
      incorrectAttempts: number;
      avgAttemptsPerQuestion: number;
      overallDomain: number;
      competencyRows: CompetencyMetricRow[];
      topStrengths: CompetencyMetricRow[];
      topGaps: CompetencyMetricRow[];
    }> = [];

    for (const [groupName, gAnswers] of byGroup.entries()) {
      const compRows = computeCompetencyMetrics(gAnswers);
      const participantsCount = new Set(gAnswers.map((a) => a.participant_id)).size;
      const totalAttempts = gAnswers.length;
      const correctAttempts = gAnswers.filter((a) => a.is_correct).length;
      const incorrectAttempts = totalAttempts - correctAttempts;
      const uniqueQuestions = new Set(
        gAnswers.map((a) => `${a.session_id}::${a.question_id}`)
      ).size;
      const avgAttemptsPerQuestion =
        uniqueQuestions > 0
          ? Number((totalAttempts / uniqueQuestions).toFixed(2))
          : 0;

      const totalEarned = compRows.reduce((s, r) => s + r.earnedPoints, 0);
      const totalMax = compRows.reduce((s, r) => s + r.maxPoints, 0);
      const overallDomain =
        totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

      // Principales fortalezas del grupo: competencias con mayor dominio (>= warningMin)
      const topStrengths = [...compRows]
        .filter((r) => r.domainPercentage >= thresholds.warningMin)
        .sort((a, b) => b.domainPercentage - a.domainPercentage)
        .slice(0, 3);

      // Principales brechas del grupo: competencias con menor dominio o con errores registrados
      const topGaps = [...compRows]
        .filter(
          (r) =>
            r.domainPercentage < thresholds.goodMin || r.incorrectCount > 0
        )
        .sort(
          (a, b) =>
            a.domainPercentage - b.domainPercentage ||
            b.incorrectCount - a.incorrectCount
        )
        .slice(0, 3);

      groups.push({
        groupName,
        participantsCount,
        totalAttempts,
        correctAttempts,
        incorrectAttempts,
        avgAttemptsPerQuestion,
        overallDomain,
        competencyRows: compRows,
        topStrengths,
        topGaps,
      });
    }

    return groups.sort((a, b) => a.overallDomain - b.overallDomain);
  }, [filteredAnswers, groupBy, participantMap, courseMap, competencyMap, thresholds]);

  const hasActiveFilters =
    filterCourseId !== 'ALL' ||
    filterArea !== 'ALL' ||
    filterRole !== 'ALL' ||
    Boolean(filterDateFrom) ||
    Boolean(filterDateTo);

  const resetFilters = () => {
    setFilterCourseId('ALL');
    setFilterArea('ALL');
    setFilterRole('ALL');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSelectedParticipantId('ALL');
    setParticipantSearch('');
  };

  return (
    <div className="space-y-6">
      {/* ============================================================================ */}
      {/* HEADER & CONFIGURABLE THRESHOLDS */}
      {/* ============================================================================ */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-sky-700">
            MÓDULO DE DIAGNÓSTICO OPERATIVO · DATOS 100% REALES PERSISTIDOS
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
            Puntos de Mejora y Analítica de Dominio por Competencia
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Análisis real de participante, curso, pregunta, competencia, respuestas correctas, respuestas incorrectas e intentos registrados.
          </p>
        </div>

        {/* Configurable Thresholds */}
        <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Sliders className="w-3.5 h-3.5 text-sky-700" />
            <span>Umbrales de dominio:</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-emerald-700 font-semibold">
               Alto dominio ≥
            </span>
            <input
              type="number"
              min={60}
              max={98}
              value={thresholds.goodMin}
              onChange={(e) =>
                onUpdateThresholds({
                  ...thresholds,
                  goodMin: Number(e.target.value) || 80,
                })
              }
              className="w-14 px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded tabular-nums"
            />
            <span>%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-amber-700 font-semibold">
              Atención ≥
            </span>
            <input
              type="number"
              min={30}
              max={thresholds.goodMin - 1}
              value={thresholds.warningMin}
              onChange={(e) =>
                onUpdateThresholds({
                  ...thresholds,
                  warningMin: Number(e.target.value) || 65,
                })
              }
              className="w-14 px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded tabular-nums"
            />
            <span>%</span>
          </div>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* MULTI-DIMENSIONAL FILTERS: CURSO, EMPRESA, REGIONAL, CARGO, FECHA */}
      {/* ============================================================================ */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-sky-700" />
            <span>Filtros de segmentación analítica</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-mono text-slate-500 tabular-nums">
              Registros de respuesta evaluados: <strong>{filteredAnswers.length}</strong>
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar filtros</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Curso
            </label>
            <select
              value={filterCourseId}
              onChange={(e) => setFilterCourseId(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
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
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Área
            </label>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
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
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Cargo
            </label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
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
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Fecha desde
            </label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Fecha hasta
            </label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
            />
          </div>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* SUB-NAVIGATION: DESEMPEÑO GENERAL | POR PARTICIPANTE | POR GRUPO */}
      {/* ============================================================================ */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('general')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 ${
              subTab === 'general'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>1. DESEMPEÑO GENERAL</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('by_participant')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 ${
              subTab === 'by_participant'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>2. POR PARTICIPANTE (Fortalezas y Refuerzo)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('by_group')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 ${
              subTab === 'by_group'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>3. POR GRUPO (Fortalezas y Brechas Colectivas)</span>
          </button>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* EMPTY STATE GUARD WHEN NO REAL DATA MATCHES FILTERS */}
      {/* ============================================================================ */}
      {filteredAnswers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
          <p className="text-base font-bold text-slate-900">
            {INSUFFICIENT_DATA_MESSAGE}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No se encontraron respuestas registradas en la base de datos para la combinación actual de filtros (curso, empresa, regional, cargo o rango de fechas).
          </p>
          {hasActiveFilters && (
            <div className="pt-2">
              <button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                Restablecer filtros
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ============================================================================ */}
          {/* SUB-VISTA 1: DESEMPEÑO GENERAL */}
          {/* ============================================================================ */}
          {subTab === 'general' && (
            <div className="space-y-6">
              {/* Real Telemetry Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] text-slate-500">
                    Participantes evaluados
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {generalKpis.uniqueParticipants}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] text-slate-500">
                    Cursos con respuestas
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {generalKpis.uniqueCourses}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] text-slate-500">
                    Total intentos registrados
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-sky-700 mt-1">
                    {generalKpis.totalAttempts}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] text-slate-500">
                    Respuestas correctas
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                    {generalKpis.correctAttempts}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] text-slate-500">
                    Respuestas incorrectas
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-red-700 mt-1">
                    {generalKpis.incorrectAttempts}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] text-slate-500">
                    Prom. intentos / pregunta
                  </div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {generalKpis.avgAttemptsPerQuestion}
                  </div>
                </div>
              </div>

              {/* Main Visual Chart: Desempeño y Dominio por Competencia */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Gráfico de Dominio Real por Competencia
                    </h2>
                    <p className="text-xs text-slate-500">
                      Porcentaje de dominio calculado sobre las respuestas reales almacenadas, con desglose de aciertos, errores e intentos por competencia.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-emerald-700">
                      ● Alto dominio (≥{thresholds.goodMin}%)
                    </span>
                    <span className="text-amber-600">
                      ● Requiere atención ({thresholds.warningMin}%–{thresholds.goodMin - 1}%)
                    </span>
                    <span className="text-red-600">
                      ● Brecha crítica (&lt;{thresholds.warningMin}%)
                    </span>
                  </div>
                </div>

                {generalCompetencyRows.length === 0 ? (
                  <div className="py-8 text-center text-sm font-semibold text-slate-600">
                    {INSUFFICIENT_DATA_MESSAGE}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {generalCompetencyRows.map((row) => {
                      const totalAns = row.correctCount + row.incorrectCount;
                      const correctRatio =
                        totalAns > 0
                          ? Math.round((row.correctCount / totalAns) * 100)
                          : 0;
                      const incorrectRatio = 100 - correctRatio;

                      return (
                        <div
                          key={row.competency.id}
                          className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-sm font-bold text-slate-900">
                                {row.competency.name}
                              </span>
                              <span className="ml-2 text-xs font-mono text-slate-500">
                                [{row.competency.code}] · {row.competency.category}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
                              <span className="text-emerald-700 font-semibold">
                                {row.correctCount} correctas
                              </span>
                              <span className="text-red-700 font-semibold">
                                {row.incorrectCount} incorrectas
                              </span>
                              <span className="text-slate-600">
                                {row.totalAttempts} intentos ({row.avgAttemptsPerQuestion} prom/preg)
                              </span>
                              <span
                                className={`text-sm font-bold ${
                                  row.level === 'good'
                                    ? 'text-emerald-700'
                                    : row.level === 'warning'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                                }`}
                              >
                                Dominio: {row.domainPercentage}%
                              </span>
                            </div>
                          </div>

                          {/* Primary Domain Bar */}
                          <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                row.level === 'good'
                                  ? 'bg-emerald-600'
                                  : row.level === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-red-600'
                              }`}
                              style={{
                                width: `${Math.max(4, row.domainPercentage)}%`,
                              }}
                            />
                          </div>

                          {/* Stacked Correct vs Incorrect Attempts Mini-Bar */}
                          <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                            <span>{row.competency.description}</span>
                            <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                              <span>
                                Distribución de intentos: {correctRatio}% acierto / {incorrectRatio}% fallo
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Competencias con Mayor Dominio vs Competencias con Menor Dominio */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mayor Dominio */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>COMPETENCIAS CON MAYOR DOMINIO</span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                       Dominio ≥ {thresholds.warningMin}%
                    </span>
                  </div>

                  {highestDomainCompetencies.length === 0 ? (
                    <div className="py-6 text-center text-xs font-medium text-slate-500">
                      {INSUFFICIENT_DATA_MESSAGE}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {highestDomainCompetencies.map((item, idx) => (
                        <div
                          key={item.competency.id}
                          className="p-3.5 bg-emerald-50/40 border border-emerald-200 rounded-lg space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">
                              #{idx + 1} · {item.competency.name}
                            </span>
                            <span className="font-mono font-bold text-emerald-700 tabular-nums">
                              {item.domainPercentage}% dominio
                            </span>
                          </div>
                          <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${item.domainPercentage}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 tabular-nums pt-0.5">
                            <span>
                              Correctas: {item.correctCount} · Incorrectas: {item.incorrectCount}
                            </span>
                            <span>
                              Intentos: {item.totalAttempts} (Prom. {item.avgAttemptsPerQuestion})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Menor Dominio */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-red-900">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span>COMPETENCIAS CON MENOR DOMINIO (BRECHAS)</span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      Ordenado de menor a mayor dominio
                    </span>
                  </div>

                  {lowestDomainCompetencies.length === 0 ? (
                    <div className="py-6 text-center text-xs font-medium text-slate-500">
                      {INSUFFICIENT_DATA_MESSAGE}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lowestDomainCompetencies.map((item, idx) => (
                        <div
                          key={item.competency.id}
                          className={`p-3.5 rounded-lg border space-y-1.5 ${
                            item.level === 'critical'
                              ? 'bg-red-50/50 border-red-200'
                              : item.level === 'warning'
                              ? 'bg-amber-50/50 border-amber-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">
                              #{idx + 1} · {item.competency.name}
                            </span>
                            <span
                              className={`font-mono font-bold tabular-nums ${
                                item.level === 'critical'
                                  ? 'text-red-700'
                                  : item.level === 'warning'
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {item.domainPercentage}% dominio
                            </span>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.level === 'critical'
                                  ? 'bg-red-600'
                                  : item.level === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-600'
                              }`}
                              style={{
                                width: `${Math.max(5, item.domainPercentage)}%`,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 tabular-nums pt-0.5">
                            <span>
                              Incorrectas: <strong>{item.incorrectCount}</strong> · Correctas: {item.correctCount}
                            </span>
                            <span>
                              Intentos: {item.totalAttempts} (Prom. {item.avgAttemptsPerQuestion})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Desglose por Pregunta y Curso */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-sky-700" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Análisis de Brechas por Pregunta y Curso ({questionMetrics.length} preguntas evaluadas)
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500">
                    Ordenado por menor tasa de acierto y mayor número de respuestas incorrectas
                  </span>
                </div>

                {questionMetrics.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {INSUFFICIENT_DATA_MESSAGE}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                          <th className="py-3 px-4">Pregunta Evaluada</th>
                          <th className="py-3 px-4">Curso / Módulo</th>
                          <th className="py-3 px-4">Competencia</th>
                          <th className="py-3 px-4 text-right">Correctas</th>
                          <th className="py-3 px-4 text-right">Incorrectas</th>
                          <th className="py-3 px-4 text-right">Intentos Totales</th>
                          <th className="py-3 px-4 text-right">Prom. Intentos</th>
                          <th className="py-3 px-4 text-right">% Acierto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {questionMetrics.map((qm) => (
                          <tr key={qm.questionId} className="hover:bg-slate-50">
                            <td className="py-3 px-4 max-w-md">
                              <div className="font-semibold text-slate-900 line-clamp-2">
                                {qm.prompt}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              <div className="font-medium text-slate-800">
                                {qm.courseTitle}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {qm.moduleTitle}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-medium text-sky-800">
                              {qm.competencyName}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                              {qm.correctAttempts}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-red-700 tabular-nums">
                              {qm.incorrectAttempts}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-800 tabular-nums">
                              {qm.totalAttempts}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                              {qm.avgAttempts}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2 font-mono font-bold tabular-nums">
                                <span
                                  className={
                                    qm.accuracyPercentage >= thresholds.goodMin
                                      ? 'text-emerald-700'
                                      : qm.accuracyPercentage >= thresholds.warningMin
                                      ? 'text-amber-700'
                                      : 'text-red-700'
                                  }
                                >
                                  {qm.accuracyPercentage}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================================ */}
          {/* SUB-VISTA 2: POR PARTICIPANTE (Fortalezas y Puntos por reforzar) */}
          {/* ============================================================================ */}
          {subTab === 'by_participant' && (
            <div className="space-y-6">
              {/* Participant Selector Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="min-w-[260px]">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Seleccionar participante específico
                    </label>
                    <select
                      value={selectedParticipantId}
                      onChange={(e) => setSelectedParticipantId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="ALL">
                        Mostrar todos los participantes con datos ({participantAnalysisList.length})
                      </option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} — Cédula: {p.identification_number} ({p.area})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-[220px]">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Filtrar por nombre o cédula
                    </label>
                    <input
                      type="text"
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      placeholder="Buscar técnico..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="text-xs font-mono text-slate-500 tabular-nums">
                  Participantes mostrados: <strong>{displayedParticipants.length}</strong>
                </div>
              </div>

              {displayedParticipants.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
                  <AlertTriangle className="w-7 h-7 text-amber-600 mx-auto" />
                  <p className="text-base font-bold text-slate-900">
                    {INSUFFICIENT_DATA_MESSAGE}
                  </p>
                  <p className="text-xs text-slate-500">
                    El participante seleccionado aún no registra respuestas evaluadas para los filtros activos.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {displayedParticipants.map((item) => (
                    <div
                      key={item.participant.id}
                      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
                    >
                      {/* Participant Header & Metrics */}
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">
                              {item.participant.full_name}
                            </h3>
                            <span className="text-xs font-mono text-slate-500">
                              Cédula: {item.participant.identification_number}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            Área: {item.participant.area} · Cargo: {item.participant.role}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
                          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                            Dominio global:{' '}
                            <strong
                              className={
                                item.overallDomain >= thresholds.goodMin
                                  ? 'text-emerald-700'
                                  : item.overallDomain >= thresholds.warningMin
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                              }
                            >
                              {item.overallDomain}%
                            </strong>
                          </div>
                          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                            Correctas:{' '}
                            <strong className="text-emerald-700">
                              {item.correctAttempts}
                            </strong>{' '}
                            · Incorrectas:{' '}
                            <strong className="text-red-700">
                              {item.incorrectAttempts}
                            </strong>
                          </div>
                          <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                            Intentos: <strong>{item.totalAttempts}</strong> (Prom.{' '}
                            {item.avgAttemptsPerQuestion}/preg)
                          </div>
                          {onSelectParticipantProfile && (
                            <button
                              type="button"
                              onClick={() =>
                                onSelectParticipantProfile(item.participant.id)
                              }
                              className="px-3 py-1.5 font-sans font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                            >
                              Abrir Perfil Completo
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Fortalezas & Puntos por reforzar columns */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left 4 cols: Fortalezas */}
                        <div className="lg:col-span-4 bg-emerald-50/40 border border-emerald-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>FORTALEZAS IDENTIFICADAS ({item.strengths.length})</span>
                          </div>
                          {item.strengths.length === 0 ? (
                            <p className="text-xs text-slate-600">
                              Ninguna competencia evaluada alcanza todavía el umbral de alto dominio ({thresholds.goodMin}%).
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {item.strengths.map((st) => (
                                <div
                                  key={st.competency.id}
                                  className="p-2.5 bg-white border border-emerald-200 rounded-lg flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <div className="font-semibold text-slate-900">
                                      {st.competency.name}
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-500">
                                      {st.correctCount} aciertos · {st.totalAttempts} int.
                                    </div>
                                  </div>
                                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                                    {st.domainPercentage}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Middle 4 cols: Puntos por reforzar */}
                        <div className="lg:col-span-4 bg-red-50/40 border border-red-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-red-900">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <span>
                              PUNTOS POR REFORZAR ({item.gapsToReinforce.length})
                            </span>
                          </div>
                          {item.gapsToReinforce.length === 0 ? (
                            <p className="text-xs text-emerald-800">
                              Sin brechas ni errores registrados en las competencias evaluadas.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {item.gapsToReinforce.map((gap) => (
                                <div
                                  key={gap.competency.id}
                                  className="p-2.5 bg-white border border-red-200 rounded-lg flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <div className="font-semibold text-slate-900">
                                      {gap.competency.name}
                                    </div>
                                    <div className="text-[11px] font-mono text-red-700">
                                      {gap.incorrectCount} incorrectas · {gap.totalAttempts} int.
                                    </div>
                                  </div>
                                  <span className="font-mono font-bold text-red-700 tabular-nums">
                                    {gap.domainPercentage}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Right 4 cols: Gráfico de barras por competencia del participante */}
                        <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                          <div className="text-xs font-bold text-slate-800">
                            DESEMPEÑO POR COMPETENCIA DEL PARTICIPANTE
                          </div>
                          <div className="space-y-2.5">
                            {item.competencyRows.map((cr) => (
                              <div key={cr.competency.id} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-slate-800">
                                    {cr.competency.name}
                                  </span>
                                  <span className="font-mono font-bold tabular-nums text-slate-900">
                                    {cr.domainPercentage}%
                                  </span>
                                </div>
                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      cr.level === 'good'
                                        ? 'bg-emerald-600'
                                        : cr.level === 'warning'
                                        ? 'bg-amber-500'
                                        : 'bg-red-600'
                                    }`}
                                    style={{
                                      width: `${Math.max(6, cr.domainPercentage)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================================ */}
          {/* SUB-VISTA 3: POR GRUPO (Principales fortalezas y Principales brechas) */}
          {/* ============================================================================ */}
          {subTab === 'by_group' && (
            <div className="space-y-6">
              {/* Group Dimension Selector */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <Layers className="w-4 h-4 text-sky-700" />
                  <span>Agrupar análisis colectivo por:</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'area', label: 'Área' },
                      { id: 'role', label: 'Cargo' },
                      { id: 'course', label: 'Curso / Actividad' },
                    ] as Array<{ id: GroupByDimension; label: string }>
                  ).map((dim) => (
                    <button
                      key={dim.id}
                      type="button"
                      onClick={() => setGroupBy(dim.id)}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        groupBy === dim.id
                          ? 'bg-[#DA291C] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {dim.label}
                    </button>
                  ))}
                </div>
              </div>

              {groupAnalysisList.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
                  <AlertTriangle className="w-7 h-7 text-amber-600 mx-auto" />
                  <p className="text-base font-bold text-slate-900">
                    {INSUFFICIENT_DATA_MESSAGE}
                  </p>
                </div>
              ) : (
                <>
                  {/* Comparative Group Bar Chart */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Comparativo de Dominio Promedio por Grupo
                        </h2>
                        <p className="text-xs text-slate-500">
                          Comparación real entre grupos con conteo de participantes, aciertos, fallos e intentos.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {groupAnalysisList.map((grp) => (
                        <div key={grp.groupName} className="space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-slate-500" />
                              <span className="font-bold text-slate-900">
                                {grp.groupName}
                              </span>
                              <span className="font-mono text-slate-500">
                                ({grp.participantsCount} participantes)
                              </span>
                            </div>
                            <div className="flex items-center gap-4 font-mono tabular-nums">
                              <span className="text-emerald-700">
                                {grp.correctAttempts} correctas
                              </span>
                              <span className="text-red-700">
                                {grp.incorrectAttempts} incorrectas
                              </span>
                              <span className="text-slate-600">
                                {grp.totalAttempts} intentos (Prom.{' '}
                                {grp.avgAttemptsPerQuestion})
                              </span>
                              <span
                                className={`font-bold ${
                                  grp.overallDomain >= thresholds.goodMin
                                    ? 'text-emerald-700'
                                    : grp.overallDomain >= thresholds.warningMin
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                                }`}
                              >
                                {grp.overallDomain}%
                              </span>
                            </div>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                grp.overallDomain >= thresholds.goodMin
                                  ? 'bg-emerald-600'
                                  : grp.overallDomain >= thresholds.warningMin
                                  ? 'bg-amber-500'
                                  : 'bg-red-600'
                              }`}
                              style={{
                                width: `${Math.max(6, grp.overallDomain)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Detailed Cards per Group: Principales Fortalezas & Principales Brechas */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {groupAnalysisList.map((grp) => (
                      <div
                        key={grp.groupName}
                        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
                      >
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <div className="text-[11px] font-mono text-slate-500">
                              ANÁLISIS COLECTIVO DE GRUPO
                            </div>
                            <h3 className="text-base font-bold text-slate-900">
                              {grp.groupName}
                            </h3>
                            <div className="text-xs font-mono text-slate-500 mt-0.5 tabular-nums">
                              {grp.participantsCount} participantes · {grp.correctAttempts} correctas · {grp.incorrectAttempts} incorrectas · {grp.totalAttempts} intentos
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-slate-500">Dominio</div>
                            <div
                              className={`text-xl font-bold font-mono tabular-nums ${
                                grp.overallDomain >= thresholds.goodMin
                                  ? 'text-emerald-700'
                                  : grp.overallDomain >= thresholds.warningMin
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {grp.overallDomain}%
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Principales Fortalezas del Grupo */}
                          <div className="p-3.5 bg-emerald-50/40 border border-emerald-200 rounded-lg space-y-2">
                            <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Principales fortalezas</span>
                            </div>
                            {grp.topStrengths.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                Sin competencias sobre el umbral ({thresholds.warningMin}%).
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {grp.topStrengths.map((st) => (
                                  <div
                                    key={st.competency.id}
                                    className="flex items-center justify-between text-xs bg-white p-2 rounded border border-emerald-100"
                                  >
                                    <span className="font-medium text-slate-800 truncate pr-2">
                                      {st.competency.name}
                                    </span>
                                    <span className="font-mono font-bold text-emerald-700 tabular-nums">
                                      {st.domainPercentage}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Principales Brechas del Grupo */}
                          <div className="p-3.5 bg-red-50/40 border border-red-200 rounded-lg space-y-2">
                            <div className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              <span>Principales brechas</span>
                            </div>
                            {grp.topGaps.length === 0 ? (
                              <p className="text-xs text-emerald-800">
                                Sin brechas registradas en este grupo.
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {grp.topGaps.map((gp) => (
                                  <div
                                    key={gp.competency.id}
                                    className="flex items-center justify-between text-xs bg-white p-2 rounded border border-red-100"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="font-medium text-slate-800 truncate">
                                        {gp.competency.name}
                                      </div>
                                      <div className="text-[10px] font-mono text-red-700">
                                        {gp.incorrectCount} fallos / {gp.totalAttempts} int.
                                      </div>
                                    </div>
                                    <span className="font-mono font-bold text-red-700 tabular-nums shrink-0">
                                      {gp.domainPercentage}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* All Competencies Breakdown for this Group */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="text-[11px] font-semibold text-slate-500">
                            Desglose completo de competencias evaluadas en el grupo:
                          </div>
                          {grp.competencyRows.map((cr) => (
                            <div key={cr.competency.id} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-700 font-medium">
                                  {cr.competency.name}
                                </span>
                                <span className="font-mono text-slate-600 tabular-nums">
                                  {cr.correctCount} ok · {cr.incorrectCount} err ·{' '}
                                  {cr.totalAttempts} int ·{' '}
                                  <strong className="text-slate-900">
                                    {cr.domainPercentage}%
                                  </strong>
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    cr.level === 'good'
                                      ? 'bg-emerald-600'
                                      : cr.level === 'warning'
                                      ? 'bg-amber-500'
                                      : 'bg-red-600'
                                  }`}
                                  style={{
                                    width: `${Math.max(5, cr.domainPercentage)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
