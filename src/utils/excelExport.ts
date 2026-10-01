import * as XLSX from 'xlsx';
import {
  Competency,
  Course,
  CourseResult,
  Participant,
  ParticipantAnswer,
  ParticipantSession,
} from '../types/lms.ts';

export interface SummaryExcelRow {
  Nombre: string;
  Cédula: string;
  Área: string;
  Cargo: string;
  Curso: string;
  'Fecha de inicio': string;
  'Fecha de finalización': string;
  Duración: string;
  Nota: number;
  Estado: string;
  'Principal fortaleza': string;
  'Principal punto a mejorar': string;
}

export interface DetailExcelRow {
  Nombre: string;
  Cédula: string;
  Área: string;
  Cargo: string;
  Curso: string;
  Módulo: string;
  Competencia: string;
  Pregunta: string;
  'Respuesta del participante': string;
  'Respuesta correcta': string;
  Resultado: string;
  Intentos: number;
  Puntaje: number;
  Fecha: string;
}

export const SUMMARY_EXCEL_HEADERS: Array<keyof SummaryExcelRow> = [
  'Nombre',
  'Cédula',
  'Área',
  'Cargo',
  'Curso',
  'Fecha de inicio',
  'Fecha de finalización',
  'Duración',
  'Nota',
  'Estado',
  'Principal fortaleza',
  'Principal punto a mejorar',
];

export const DETAIL_EXCEL_HEADERS: Array<keyof DetailExcelRow> = [
  'Nombre',
  'Cédula',
  'Área',
  'Cargo',
  'Curso',
  'Módulo',
  'Competencia',
  'Pregunta',
  'Respuesta del participante',
  'Respuesta correcta',
  'Resultado',
  'Intentos',
  'Puntaje',
  'Fecha',
];

function formatDurationMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m 0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function verifyXlsxBinaryBuffer(buffer: ArrayBuffer): {
  validZipSignature: boolean;
  sheetNames: string[];
  rowCountBySheet: Record<string, number>;
} {
  const bytes = new Uint8Array(buffer);
  // Real OpenXML .xlsx files are ZIP archives starting with PK\x03\x04 (0x50 0x4B 0x03 0x04)
  const validZipSignature =
    bytes.length > 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  const parsed = XLSX.read(buffer, { type: 'array' });
  const rowCountBySheet: Record<string, number> = {};
  for (const name of parsed.SheetNames) {
    const sheet = parsed.Sheets[name];
    const json = XLSX.utils.sheet_to_json(sheet);
    rowCountBySheet[name] = json.length;
  }

  return {
    validZipSignature,
    sheetNames: parsed.SheetNames,
    rowCountBySheet,
  };
}

function triggerBinaryXlsxDownload(workbook: XLSX.WorkBook, fileName: string) {
  const cleanFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;

  const excelBuffer: ArrayBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });

  const verification = verifyXlsxBinaryBuffer(excelBuffer);
  if (!verification.validZipSignature) {
    throw new Error('Error al generar el contenedor binario OpenXML (.xlsx)');
  }

  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = cleanFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  return {
    fileName: cleanFileName,
    byteLength: excelBuffer.byteLength,
    ...verification,
  };
}

export function buildSummaryExcelRows(params: {
  sessions: ParticipantSession[];
  participants: Participant[];
  courses: Course[];
  results: CourseResult[];
  answers: ParticipantAnswer[];
  competencies: Competency[];
}): SummaryExcelRow[] {
  return params.sessions.map((sess) => {
    const part = params.participants.find((p) => p.id === sess.participant_id);
    const course = params.courses.find((c) => c.id === sess.course_id);
    const res = params.results.find((r) => r.session_id === sess.id);

    // Deduplicate attempts per question in this session to compute real competency domain
    const sessAnswers = params.answers.filter((a) => a.session_id === sess.id);
    const bestByQuestion = new Map<string, ParticipantAnswer>();
    for (const ans of sessAnswers) {
      const prev = bestByQuestion.get(ans.question_id);
      if (!prev || ans.points_obtained >= prev.points_obtained) {
        bestByQuestion.set(ans.question_id, ans);
      }
    }

    const byComp = new Map<string, { earned: number; max: number }>();
    for (const ans of bestByQuestion.values()) {
      const curr = byComp.get(ans.competency_id) || { earned: 0, max: 0 };
      curr.earned += ans.points_obtained;
      curr.max += ans.max_points;
      byComp.set(ans.competency_id, curr);
    }

    let topStrength = res?.top_strength_competency || 'Sin respuestas registradas';
    let topGap = res?.top_gap_competency || 'Sin respuestas registradas';

    if (byComp.size > 0) {
      let bestPct = -1;
      let bestCompName = '';
      let worstPct = 101;
      let worstCompName = '';

      for (const [compId, st] of byComp.entries()) {
        const pct = st.max > 0 ? Math.round((st.earned / st.max) * 100) : 0;
        const compName =
          params.competencies.find((c) => c.id === compId)?.name || compId;
        if (pct > bestPct) {
          bestPct = pct;
          bestCompName = compName;
        }
        if (pct < worstPct) {
          worstPct = pct;
          worstCompName = compName;
        }
      }

      if (bestPct >= 65) {
        topStrength = `${bestCompName} (${bestPct}%)`;
      } else {
        topStrength = 'Sin fortalezas consolidadas';
      }

      if (worstPct < 80) {
        topGap = `${worstCompName} (${worstPct}%)`;
      } else {
        topGap = 'Sin brechas identificadas';
      }
    }

    return {
      Nombre: part?.full_name || 'Sin registro',
      Cédula: part?.identification_number || '-',
      Área: part?.area || '-',
      Cargo: part?.role || '-',
      Curso: course?.title || sess.course_id,
      'Fecha de inicio': formatDateTime(sess.started_at),
      'Fecha de finalización': sess.finished_at
        ? formatDateTime(sess.finished_at)
        : 'En progreso',
      Duración: formatDurationMinutes(sess.total_duration_seconds),
      Nota: sess.score_percentage,
      Estado: sess.status,
      'Principal fortaleza': topStrength,
      'Principal punto a mejorar': topGap,
    };
  });
}

export function buildDetailExcelRows(params: {
  sessions: ParticipantSession[];
  participants: Participant[];
  courses: Course[];
  answers: ParticipantAnswer[];
  competencies: Competency[];
}): DetailExcelRow[] {
  const allowedSessionIds = new Set(params.sessions.map((s) => s.id));
  const filteredAnswers = params.answers
    .filter((a) => allowedSessionIds.has(a.session_id))
    .sort(
      (a, b) =>
        new Date(b.answered_at).getTime() - new Date(a.answered_at).getTime()
    );

  return filteredAnswers.map((ans) => {
    const part = params.participants.find((p) => p.id === ans.participant_id);
    const course = params.courses.find((c) => c.id === ans.course_id);
    const courseMods = Array.isArray(course?.modules) ? course!.modules : [];
    const mod = courseMods.find((m) => m.id === ans.module_id);
    const comp = params.competencies.find((c) => c.id === ans.competency_id);

    let questionPrompt = ans.question_id;
    if (course) {
      for (const m of courseMods) {
        for (const it of m.items || []) {
          if (it.question && it.question.id === ans.question_id) {
            questionPrompt = it.question.prompt;
            break;
          }
        }
      }
    }

    return {
      Nombre: part?.full_name || 'Sin registro',
      Cédula: part?.identification_number || '-',
      Área: part?.area || '-',
      Cargo: part?.role || '-',
      Curso: course?.title || ans.course_id,
      Módulo: mod?.title || ans.module_id,
      Competencia: comp?.name || ans.competency_id,
      Pregunta: questionPrompt,
      'Respuesta del participante': ans.selected_answer_text,
      'Respuesta correcta': ans.correct_answer_text,
      Resultado: ans.is_correct ? 'Correcto' : 'Incorrecto',
      Intentos: ans.attempt_number,
      Puntaje: ans.points_obtained,
      Fecha: formatDateTime(ans.answered_at),
    };
  });
}

function createFormattedSummarySheet(rows: SummaryExcelRow[]): XLSX.WorkSheet {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: SUMMARY_EXCEL_HEADERS,
  });
  worksheet['!cols'] = [
    { wch: 30 }, // Nombre
    { wch: 16 }, // Cédula
    { wch: 28 }, // Área
    { wch: 30 }, // Cargo
    { wch: 36 }, // Curso
    { wch: 19 }, // Fecha de inicio
    { wch: 19 }, // Fecha de finalización
    { wch: 12 }, // Duración
    { wch: 10 }, // Nota
    { wch: 18 }, // Estado
    { wch: 34 }, // Principal fortaleza
    { wch: 34 }, // Principal punto a mejorar
  ];
  const lastRow = Math.max(1, rows.length + 1);
  worksheet['!autofilter'] = { ref: `A1:L${lastRow}` };
  return worksheet;
}

function createFormattedDetailSheet(rows: DetailExcelRow[]): XLSX.WorkSheet {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: DETAIL_EXCEL_HEADERS,
  });
  worksheet['!cols'] = [
    { wch: 28 }, // Nombre
    { wch: 16 }, // Cédula
    { wch: 26 }, // Área
    { wch: 26 }, // Cargo
    { wch: 34 }, // Curso
    { wch: 30 }, // Módulo
    { wch: 26 }, // Competencia
    { wch: 48 }, // Pregunta
    { wch: 38 }, // Respuesta del participante
    { wch: 38 }, // Respuesta correcta
    { wch: 14 }, // Resultado
    { wch: 10 }, // Intentos
    { wch: 10 }, // Puntaje
    { wch: 19 }, // Fecha
  ];
  const lastRow = Math.max(1, rows.length + 1);
  worksheet['!autofilter'] = { ref: `A1:N${lastRow}` };
  return worksheet;
}

export function exportSummaryToExcel(params: {
  sessions: ParticipantSession[];
  participants: Participant[];
  courses: Course[];
  results: CourseResult[];
  answers: ParticipantAnswer[];
  competencies: Competency[];
  filterLabel?: string;
}) {
  const rows = buildSummaryExcelRows(params);
  const worksheet = createFormattedSummarySheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen');

  const dateTag = new Date().toISOString().slice(0, 10);
  const cleanLabel = (params.filterLabel || 'Consolidado').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const fileName = `Exportacion_Resumen_${cleanLabel}_${dateTag}.xlsx`;
  return triggerBinaryXlsxDownload(workbook, fileName);
}

export function exportDetailToExcel(params: {
  sessions: ParticipantSession[];
  participants: Participant[];
  courses: Course[];
  answers: ParticipantAnswer[];
  competencies: Competency[];
  filterLabel?: string;
}) {
  const rows = buildDetailExcelRows(params);
  const worksheet = createFormattedDetailSheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Detalle');

  const dateTag = new Date().toISOString().slice(0, 10);
  const cleanLabel = (params.filterLabel || 'Consolidado').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const fileName = `Exportacion_Detallada_${cleanLabel}_${dateTag}.xlsx`;
  return triggerBinaryXlsxDownload(workbook, fileName);
}

export function exportCompleteWorkbookToExcel(params: {
  sessions: ParticipantSession[];
  participants: Participant[];
  courses: Course[];
  results: CourseResult[];
  answers: ParticipantAnswer[];
  competencies: Competency[];
  filterLabel?: string;
}) {
  const summaryRows = buildSummaryExcelRows(params);
  const detailRows = buildDetailExcelRows(params);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    createFormattedSummarySheet(summaryRows),
    'Resumen'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    createFormattedDetailSheet(detailRows),
    'Detalle'
  );

  const dateTag = new Date().toISOString().slice(0, 10);
  const cleanLabel = (params.filterLabel || 'Consolidado').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const fileName = `Fabrica_Formacion_Excel_${cleanLabel}_${dateTag}.xlsx`;
  return triggerBinaryXlsxDownload(workbook, fileName);
}
