import React from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Award,
  BookOpen,
} from 'lucide-react';
import {
  Competency,
  Course,
  GapThresholdConfig,
  Participant,
  ParticipantAnswer,
  ParticipantSession,
} from '../../types/lms.ts';

interface ParticipantProfileViewProps {
  participant: Participant;
  courses: Course[];
  sessions: ParticipantSession[];
  answers: ParticipantAnswer[];
  competencies: Competency[];
  thresholds: GapThresholdConfig;
  onBack: () => void;
  onLaunchActivity: (slug: string) => void;
}

export const ParticipantProfileView: React.FC<ParticipantProfileViewProps> = ({
  participant,
  courses,
  sessions,
  answers,
  competencies,
  thresholds,
  onBack,
  onLaunchActivity,
}) => {
  const partSessions = sessions
    .filter((s) => s.participant_id === participant.id)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  const partAnswers = answers
    .filter((a) => a.participant_id === participant.id)
    .sort((a, b) => new Date(b.answered_at).getTime() - new Date(a.answered_at).getTime());

  const completedCourseIds = new Set(
    partSessions
      .filter(
        (s) =>
          s.status === 'Aprobado' ||
          s.status === 'Finalizado' ||
          s.status === 'Requiere refuerzo'
      )
      .map((s) => s.course_id)
  );

  const publishedCourses = courses.filter((c) => c.status === 'published');
  const pendingCourses = publishedCourses.filter((c) => !completedCourseIds.has(c.id));

  // Deduplicate attempts per (session_id, question_id) taking the best valid attempt
  const bestAttemptPerQuestion = new Map<string, ParticipantAnswer>();
  for (const ans of partAnswers) {
    const key = `${ans.session_id}::${ans.question_id}`;
    const prev = bestAttemptPerQuestion.get(key);
    if (!prev || ans.points_obtained >= prev.points_obtained) {
      bestAttemptPerQuestion.set(key, ans);
    }
  }

  // Competency breakdown for this participant
  const compMap = new Map<
    string,
    { id: string; name: string; earned: number; max: number; count: number }
  >();
  for (const ans of bestAttemptPerQuestion.values()) {
    const comp = competencies.find((c) => c.id === ans.competency_id);
    const name = comp?.name || ans.competency_id;
    const curr = compMap.get(ans.competency_id) || {
      id: ans.competency_id,
      name,
      earned: 0,
      max: 0,
      count: 0,
    };
    curr.earned += ans.points_obtained;
    curr.max += ans.max_points;
    curr.count += 1;
    compMap.set(ans.competency_id, curr);
  }

  const competencyScores = Array.from(compMap.values())
    .map((c) => ({
      ...c,
      percentage: c.max > 0 ? Math.round((c.earned / c.max) * 100) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const strengths = competencyScores.filter((c) => c.percentage >= thresholds.goodMin);
  const gaps = competencyScores
    .filter((c) => c.percentage < thresholds.goodMin)
    .sort((a, b) => a.percentage - b.percentage);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al listado de participantes y sesiones</span>
        </button>
      </div>

      {/* Participant Identity Card (Separación conceptual PARTICIPANTE vs PARTICIPACIÓN EN CURSO) */}
      <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden">
        <div className="h-1.5 w-full bg-[#DA291C]" />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="text-xs font-mono font-bold text-[#DA291C] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                <span>FICHA ÚNICA DE PARTICIPANTE · HISTORIAL MULTICURSO POR CÉDULA</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                {participant.full_name}
              </h2>
              <ul className="flex flex-wrap items-center gap-4 text-xs text-slate-700 mt-2">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                  <span>
                    Cédula: <strong className="font-mono">{participant.identification_number}</strong>
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                  <span>
                    Área: <strong>{participant.area}</strong>
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                  <span>
                    Cargo: <strong>{participant.role}</strong>
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-6 text-right">
              <div>
                <div className="text-xs text-slate-500">Participaciones en cursos</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                  {partSessions.length}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Cursos pendientes</div>
                <div className="text-xl font-bold font-mono tabular-nums text-[#DA291C]">
                  {pendingCourses.length}
                </div>
              </div>
            </div>
          </div>

        {/* FORTALEZAS vs PUNTOS POR REFORZAR (Section 14) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
          <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>FORTALEZAS (Desempeño ≥ {thresholds.goodMin}%)</span>
            </div>
            {strengths.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no registra competencias sobre el umbral de fortaleza ({thresholds.goodMin}%).
              </p>
            ) : (
              <div className="space-y-2.5">
                {strengths.map((st) => (
                  <div key={st.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{st.name}</span>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        {st.percentage}%
                      </span>
                    </div>
                    <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{ width: `${st.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>PUNTOS POR REFORZAR (Desempeño &lt; {thresholds.goodMin}%)</span>
            </div>
            {gaps.length === 0 ? (
              <p className="text-xs text-emerald-800">
                Excelente: No presenta brechas técnicas en las competencias evaluadas.
              </p>
            ) : (
              <div className="space-y-2.5">
                {gaps.map((g) => (
                  <div key={g.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{g.name}</span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          g.percentage < thresholds.warningMin
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {g.percentage}%
                      </span>
                    </div>
                    <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          g.percentage < thresholds.warningMin
                            ? 'bg-red-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.max(8, g.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Cursos Realizados vs Cursos Pendientes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              Historial de Actividades Realizadas y En Progreso
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Curso</th>
                  <th className="py-2.5 px-4">Fecha</th>
                  <th className="py-2.5 px-4 text-right">Calificación</th>
                  <th className="py-2.5 px-4 text-right">Duración</th>
                  <th className="py-2.5 px-4 text-right">Intento</th>
                  <th className="py-2.5 px-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {partSessions.map((s) => {
                  const c = courses.find((x) => x.id === s.course_id);
                  const mins = Math.round(s.total_duration_seconds / 60);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {c?.title || s.course_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                        {s.started_at.slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                        {s.score_percentage}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {mins} min
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        #{s.attempt_number}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            s.status === 'Aprobado'
                              ? 'text-emerald-700'
                              : s.status === 'Requiere refuerzo'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Cursos Pendientes por Realizar ({pendingCourses.length})
          </h3>
          {pendingCourses.length === 0 ? (
            <div className="text-xs text-emerald-700 flex items-center gap-2">
              <Award className="w-4 h-4" />
              <span>El participante ha completado todos los cursos publicados.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingCourses.map((pc) => (
                <div
                  key={pc.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
                >
                  <div className="text-xs font-bold text-slate-900">{pc.title}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span>{pc.estimated_minutes} min · {pc.category}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLaunchActivity(pc.slug)}
                    className="text-xs font-semibold text-sky-700 hover:underline inline-flex items-center gap-1"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Abrir actividad /link</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detailed Question-by-Question Log (Section 10) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">
            Registro Detallado de Respuestas por Interacción ({partAnswers.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4">Curso / Competencia</th>
                <th className="py-2.5 px-4">Respuesta Seleccionada</th>
                <th className="py-2.5 px-4">Resultado</th>
                <th className="py-2.5 px-4 text-right">Intento</th>
                <th className="py-2.5 px-4 text-right">Puntaje</th>
                <th className="py-2.5 px-4 text-right">Tiempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {partAnswers.map((ans) => {
                const c = courses.find((x) => x.id === ans.course_id);
                const comp = competencies.find((x) => x.id === ans.competency_id);
                return (
                  <tr key={ans.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {comp?.name || ans.competency_id}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {c?.title || ans.course_id}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-md">
                      {ans.selected_answer_text}
                    </td>
                    <td className="py-3 px-4">
                      {ans.is_correct ? (
                        <span className="font-semibold text-emerald-700">Correcto</span>
                      ) : (
                        <span className="font-semibold text-red-700">Incorrecto</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      #{ans.attempt_number}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {ans.points_obtained}/{ans.max_points}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {ans.response_duration_seconds}s
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
