import {
  AdminUser,
  CatalogItem,
  Competency,
  CourseResult,
  Participant,
  ParticipantAnswer,
  ParticipantSession,
} from '../types/lms.ts';
import { UUIDS } from './seedCourses.ts';

export const INITIAL_ADMINS: AdminUser[] = [
  {
    id: UUIDS.ADMIN_1,
    email: 'admin@fabricaformacion.co',
    full_name: 'Dirección Nacional de Formación Técnica',
    role: 'Administrador General',
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
];

export const INITIAL_CATALOGS: CatalogItem[] = [
  { id: '11000000-0000-4000-8000-000000000001', type: 'area', name: 'Operaciones de Campo', code: 'AREA-OP', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000002', type: 'area', name: 'Mantenimiento y Aseguramiento FTTH', code: 'AREA-MTO', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000003', type: 'area', name: 'Planta Externa y Red Primaria R1', code: 'AREA-PEX', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000004', type: 'area', name: 'Calidad y Auditoría Técnica', code: 'AREA-CAL', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000005', type: 'area', name: 'Seguridad y Salud en el Trabajo (HSE)', code: 'AREA-HSE', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000010', type: 'role', name: 'Técnico Instalador FTTH', code: 'TEC-FTTH', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000011', type: 'role', name: 'Empalmador Planta Externa R1', code: 'EMP-R1', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000012', type: 'role', name: 'Técnico de Aseguramiento y Mantenimiento', code: 'TEC-MTO', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000013', type: 'role', name: 'Supervisor de Cuadrilla Operativa', code: 'SUP-OP', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000014', type: 'role', name: 'Auditor de Calidad en Campo', code: 'AUD-CAL', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000015', type: 'category', name: 'Fibra Óptica y Acceso', code: 'FO-ACC', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000016', type: 'category', name: 'Planta Externa y Normalización', code: 'PEX-NORM', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000017', type: 'category', name: 'Seguridad y Salud en el Trabajo (SST)', code: 'SST', active: true, created_at: '2026-08-01T08:00:00Z' },
  { id: '11000000-0000-4000-8000-000000000018', type: 'category', name: 'Procesos y Herramientas Operativas', code: 'PROC-OP', active: true, created_at: '2026-08-01T08:00:00Z' },
];

export const INITIAL_COMPETENCIES: Competency[] = [
  {
    id: UUIDS.COMP_SEGURIDAD,
    code: 'SST-ALT-01',
    name: 'Seguridad en campo',
    description: 'Prevención de riesgo eléctrico, protocolo de trabajo en alturas y manejo de EPP dieléctrico.',
    category: 'Seguridad Operativa',
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
  {
    id: UUIDS.COMP_CONECTORES,
    code: 'FO-CON-02',
    name: 'Conectores',
    description: 'Identificación, limpieza y acoplamiento de conectores ópticos SC/APC y SC/UPC.',
    category: 'Fibra Óptica',
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
  {
    id: UUIDS.COMP_COLORES,
    code: 'FO-TIA-03',
    name: 'Código de colores',
    description: 'Aplicación de la norma internacional TIA/EIA-598 en buffers e hilos de fibra óptica.',
    category: 'Planta Externa',
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
  {
    id: UUIDS.COMP_PROCEDIMIENTO,
    code: 'OP-PRO-04',
    name: 'Procedimiento técnico',
    description: 'Ejecución ordenada de conectorización mecánica, hermeticidad en NAP y etiquetado R1.',
    category: 'Calidad de Instalación',
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
  {
    id: UUIDS.COMP_POTENCIAS,
    code: 'FO-OPM-05',
    name: 'Potencias ópticas',
    description: 'Cálculo de presupuesto óptico y validación de umbrales dBm a 1490 nm con OPM.',
    category: 'Certificación FTTH',
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
  {
    id: UUIDS.COMP_DIAGNOSTICO,
    code: 'FO-DIAG-06',
    name: 'Diagnóstico FTTH',
    description: 'Aislamiento de fallas de atenuación, macrocurvaturas y reflectancia en acometidas.',
    category: 'Mantenimiento y Diagnóstico',
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
];

// Sin participantes de ejemplo: se diligencian únicamente a medida que el personal real ingresa por el link
export const INITIAL_PARTICIPANTS: Participant[] = [];

export const INITIAL_SESSIONS: ParticipantSession[] = [];

export const INITIAL_ANSWERS: ParticipantAnswer[] = [];

export const INITIAL_RESULTS: CourseResult[] = [];
