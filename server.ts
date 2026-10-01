import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { dbStore } from './src/server/db.ts';
import { SUPABASE_POSTGRES_SCHEMA_SQL } from './src/server/supabaseSchemaSql.ts';
import {
  generateStructuredCourseFromMaterials,
  generateThematicSvgDataUri,
} from './src/server/aiCourseGenerator.ts';
import { extractAndAnalyzeMaterial } from './src/server/materialExtractor.ts';
import {
  analyzeMaterialWithGemini,
  GeminiMaterialAnalysisError,
} from './src/server/geminiMaterialAnalyzer.ts';
import { ensureMaterialsExtracted } from './src/server/materialExtractor.ts';

dotenv.config();

const activeAdminTokens = new Set<string>(['demo-admin-session-token-2026']);

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión como administrador.' });
  }
  const token = authHeader.slice(7).trim();
  if (!activeAdminTokens.has(token)) {
    return res.status(401).json({ error: 'Sesión administrativa expirada o inválida.' });
  }
  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ============================================================================
  // PUBLIC PARTICIPANT ENDPOINTS (Sin contraseña, acceso restringido por RLS)
  // ============================================================================

  app.get('/api/public/bootstrap', (_req: Request, res: Response) => {
    try {
      const state = dbStore.getState();
      res.json({
        published_courses: dbStore.getPublicPublishedCourses(),
        catalogs: state.catalogs.filter((c) => c.active),
        competencies: state.competencies,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error al cargar datos públicos' });
    }
  });

  app.get('/api/public/activity/:slug', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const isAdminPreview =
        Boolean(authHeader?.startsWith('Bearer ')) &&
        activeAdminTokens.has(authHeader!.slice(7).trim());

      const course = dbStore.getPublicCourseBySlug(req.params.slug, isAdminPreview);
      if (!course) {
        return res.status(404).json({
          error: 'La actividad formativa no existe o no se encuentra publicada actualmente.',
        });
      }
      const state = dbStore.getState();
      res.json({
        course,
        catalogs: state.catalogs.filter((c) => c.active),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error al consultar la actividad' });
    }
  });

  app.get('/api/public/sessions/:sessionId', (req: Request, res: Response) => {
    try {
      const sessionData = dbStore.getPublicSessionState(req.params.sessionId);
      if (!sessionData) {
        return res.status(404).json({ error: 'Sesión no encontrada.' });
      }
      res.json(sessionData);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al recuperar la sesión.' });
    }
  });

  app.get('/api/public/participant-sessions', (req: Request, res: Response) => {
    try {
      const cedula = String(req.query.cedula || '').trim();
      const data = dbStore.getPublicParticipantSessionsByCedula(cedula);
      res.json(data);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al consultar sesiones del participante.' });
    }
  });

  app.post('/api/public/activity/:slug/register', (req: Request, res: Response) => {
    try {
      const {
        full_name,
        identification_number,
        area,
        role,
        force_new_attempt,
      } = req.body || {};

      const cleanName = String(full_name || '').trim();
      const cleanCedula = String(identification_number || '').replace(/\s+/g, '').trim();
      const cleanArea = String(area || '').trim();
      const cleanRole = String(role || '').trim();

      if (!cleanName || !cleanCedula || !cleanArea || !cleanRole) {
        return res.status(400).json({
          error: 'Por favor completa los cuatro campos obligatorios: Nombre completo, Cédula, Área y Cargo.',
        });
      }

      if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ'’\-\s]{3,}$/.test(cleanName)) {
        return res.status(400).json({
          error: 'El Nombre completo debe contener únicamente letras, espacios y caracteres propios de nombres.',
        });
      }

      const outcome = dbStore.registerOrResumeParticipant(req.params.slug, {
        full_name: cleanName,
        identification_number: cleanCedula,
        area: cleanArea,
        role: cleanRole,
        force_new_attempt: Boolean(force_new_attempt),
      });

      res.json(outcome);
    } catch (error: any) {
      res
        .status(400)
        .json({ error: error.message || 'No fue posible registrar la participación.' });
    }
  });

  app.post('/api/public/sessions/:sessionId/answer', (req: Request, res: Response) => {
    try {
      const { question_id, selected_option_ids, response_duration_seconds } = req.body || {};
      if (!question_id || !Array.isArray(selected_option_ids)) {
        return res.status(400).json({ error: 'Datos de respuesta incompletos.' });
      }
      const result = dbStore.submitParticipantAnswer(req.params.sessionId, {
        question_id,
        selected_option_ids,
        response_duration_seconds: Number(response_duration_seconds) || 15,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al procesar respuesta.' });
    }
  });

  app.post('/api/public/sessions/:sessionId/progress', (req: Request, res: Response) => {
    try {
      const { slide_index, elapsed_seconds_delta, finalize } = req.body || {};
      const result = dbStore.updateSessionProgress(
        req.params.sessionId,
        Number(slide_index) || 0,
        Number(elapsed_seconds_delta) || 0,
        Boolean(finalize)
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al actualizar progreso.' });
    }
  });

  // ============================================================================
  // PROTECTED ADMINISTRATOR ENDPOINTS
  // ============================================================================

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const expectedEmail = (process.env.ADMIN_EMAIL || 'admin@fabricaformacion.co').toLowerCase();
    const authorizedEmails = new Set([
      expectedEmail,
      'gomezramosmanuel@gmail.com',
      ...dbStore.getState().admins.map((a) => a.email.toLowerCase()),
    ]);

    if (
      authorizedEmails.has(cleanEmail) &&
      (password === 'Admin2026*' || password === 'admin123' || password === 'fabrica2026')
    ) {
      const token = `adm-${crypto.randomUUID()}`;
      activeAdminTokens.add(token);
      const adminUser = dbStore.getState().admins[0];
      return res.json({
        token,
        admin: {
          ...adminUser,
          email: cleanEmail,
        },
      });
    }
    return res.status(401).json({
      error: 'Credenciales inválidas. Utiliza tu cuenta de administrador autorizada.',
    });
  });

  app.post('/api/admin/firebase-login', (req: Request, res: Response) => {
    const { email, uid, displayName, emailVerified } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !uid) {
      return res.status(400).json({ error: 'Token de Firebase Authentication incompleto.' });
    }

    const expectedEmail = (process.env.ADMIN_EMAIL || 'admin@fabricaformacion.co').toLowerCase();
    const authorizedEmails = new Set([
      expectedEmail,
      'gomezramosmanuel@gmail.com',
      ...dbStore.getState().admins.map((a) => a.email.toLowerCase()),
    ]);

    if (!authorizedEmails.has(cleanEmail) && !emailVerified) {
      return res.status(403).json({
        error: `La cuenta ${cleanEmail} no tiene permisos de administrador autorizados.`,
      });
    }

    const token = `adm-fb-${crypto.randomUUID()}`;
    activeAdminTokens.add(token);
    const baseAdmin = dbStore.getState().admins[0];
    return res.json({
      token,
      admin: {
        id: baseAdmin?.id || crypto.randomUUID(),
        email: cleanEmail,
        full_name: displayName || baseAdmin?.full_name || 'Administrador Formación',
        role: 'super_admin',
        created_at: baseAdmin?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  app.post(
    '/api/admin/ai/extract-material',
    requireAdminAuth,
    async (req: Request, res: Response) => {
      try {
        const {
          material_id,
          file_name,
          file_type,
          mime_type,
          media_data_url,
          raw_text,
          course_title,
          course_category,
        } = req.body || {};

        const result = await extractAndAnalyzeMaterial({
          materialId: typeof material_id === 'string' ? material_id : crypto.randomUUID(),
          fileName: String(file_name || 'archivo_referencia'),
          fileType: file_type,
          mimeType: String(mime_type || ''),
          mediaDataUrl: typeof media_data_url === 'string' ? media_data_url : undefined,
          rawText: typeof raw_text === 'string' ? raw_text : undefined,
          courseTitle: String(course_title || ''),
          courseCategory: String(course_category || ''),
        });

        res.json({
          file_type: result.file_type,
          extracted_text: result.extracted_text,
          extracted_pages: result.extracted_pages,
          extracted_images: result.extracted_images,
          classified_images: result.classified_images,
          analysis_summary: result.analysis_summary,
          storage_path: result.storage_path,
          persistent_file_url: result.persistent_file_url,
          processing_status: result.processing_status,
        });
      } catch (error: any) {
        res.status(500).json({
          error:
            error.message || 'Error al analizar y extraer información del archivo.',
        });
      }
    }
  );

  app.post(
    '/api/admin/ai/analyze-material',
    requireAdminAuth,
    async (req: Request, res: Response) => {
      try {
        const {
          materials,
          file_name,
          mime_type,
          media_data_url,
          storage_path,
          extracted_text,
          extracted_pages,
          course_title,
          course_category,
          timeout_ms,
        } = req.body || {};

        let resolvedFileName = typeof file_name === 'string' ? file_name : '';
        let resolvedMimeType = typeof mime_type === 'string' ? mime_type : '';
        let resolvedMediaDataUrl =
          typeof media_data_url === 'string' ? media_data_url : undefined;
        let resolvedStoragePath =
          typeof storage_path === 'string' ? storage_path : undefined;
        let resolvedExtractedText =
          typeof extracted_text === 'string' ? extracted_text : '';
        let resolvedExtractedPages = Array.isArray(extracted_pages)
          ? extracted_pages
          : [];

        if (Array.isArray(materials) && materials.length > 0) {
          const enriched = await ensureMaterialsExtracted(
            materials,
            String(course_title || ''),
            String(course_category || '')
          );
          const primaryPdf =
            enriched.find((m) => m.file_type === 'pdf') || enriched[0];
          resolvedFileName =
            resolvedFileName || primaryPdf?.file_name || primaryPdf?.title || 'documento.pdf';
          resolvedMimeType =
            resolvedMimeType ||
            (primaryPdf?.file_type === 'pdf' ? 'application/pdf' : 'text/plain');
          resolvedMediaDataUrl = resolvedMediaDataUrl || primaryPdf?.media_data_url;
          resolvedStoragePath = resolvedStoragePath || primaryPdf?.storage_path;

          const combinedTextParts: string[] = [];
          const combinedPages: any[] = [];
          enriched.forEach((mat) => {
            if (mat.extracted_text) {
              combinedTextParts.push(
                `=== ARCHIVO: ${mat.file_name || mat.title} ===\n${mat.extracted_text}`
              );
            }
            if (Array.isArray(mat.extracted_pages)) {
              combinedPages.push(...mat.extracted_pages);
            }
          });
          if (combinedTextParts.length > 0) {
            resolvedExtractedText = combinedTextParts.join('\n\n');
          }
          if (combinedPages.length > 0) {
            resolvedExtractedPages = combinedPages;
          }
        }

        const analysis = await analyzeMaterialWithGemini({
          fileName: resolvedFileName || 'documento_referencia.pdf',
          mimeType: resolvedMimeType,
          mediaDataUrl: resolvedMediaDataUrl,
          storagePath: resolvedStoragePath,
          extractedText: resolvedExtractedText,
          extractedPages: resolvedExtractedPages,
          courseTitle: typeof course_title === 'string' ? course_title : undefined,
          courseCategory: typeof course_category === 'string' ? course_category : undefined,
          timeoutMs: typeof timeout_ms === 'number' ? timeout_ms : 50000,
        });

        res.json({
          analysis,
        });
      } catch (error: any) {
        if (error instanceof GeminiMaterialAnalysisError) {
          const statusMap: Record<string, number> = {
            INVALID_FILE: 400,
            EMPTY_CONTENT: 422,
            TIMEOUT: 504,
            INVALID_JSON: 502,
            API_ERROR: 502,
          };
          return res.status(statusMap[error.code] || 500).json({
            error: error.message,
            error_code: error.code,
          });
        }
        res.status(500).json({
          error:
            error.message ||
            'Error inesperado al analizar el material con Gemini.',
          error_code: 'API_ERROR',
        });
      }
    }
  );

  app.post(
    '/api/admin/ai/generate-course',
    requireAdminAuth,
    async (req: Request, res: Response) => {
      try {
        const {
          course_id,
          title,
          description,
          category,
          level,
          estimated_minutes,
          materials,
          gemini_analysis,
        } = req.body || {};

        const state = dbStore.getState();
        const generated = await generateStructuredCourseFromMaterials({
          courseId: course_id || crypto.randomUUID(),
          title: String(title || 'Nueva Capacitación Técnica'),
          description: String(description || ''),
          category: String(category || 'Operaciones Técnicas'),
          level: level || 'Intermedio',
          estimatedMinutes: Number(estimated_minutes) || 25,
          materials: Array.isArray(materials) ? materials : [],
          competencies: state.competencies,
          geminiAnalysis: gemini_analysis || undefined,
        });

        res.json({
          ...generated,
          aiAnalysisSummary: generated.analysisSummary,
        });
      } catch (error: any) {
        res.status(500).json({
          error:
            error.message || 'Error al estructurar la capacitación a partir del material.',
        });
      }
    }
  );

  app.post(
    '/api/admin/ai/generate-illustration',
    requireAdminAuth,
    (req: Request, res: Response) => {
      try {
        const {
          course_title,
          slide_title,
          slide_subtitle,
          slide_objective,
          slide_body,
          slide_steps,
          technical_specs,
          highlight_note,
          source_file_name,
          category,
        } = req.body || {};

        const bullets =
          typeof slide_body === 'string' && slide_body.trim()
            ? slide_body
                .split(/\n+/)
                .map((l: string) => l.replace(/^[•\-*]\s*/, '').trim())
                .filter(Boolean)
            : undefined;

        const dataUri = generateThematicSvgDataUri({
          title: String(slide_title || course_title || 'Esquema Didáctico del Slide'),
          subtitle: String(
            slide_subtitle || category || 'ESQUEMA DIDÁCTICO BASADO EN EL MATERIAL DE REFERENCIA'
          ),
          objective: typeof slide_objective === 'string' ? slide_objective : undefined,
          bullets,
          steps: Array.isArray(slide_steps) ? slide_steps : undefined,
          technicalSpecs: Array.isArray(technical_specs) ? technical_specs : undefined,
          highlightNote: typeof highlight_note === 'string' ? highlight_note : undefined,
          sourceFileName: typeof source_file_name === 'string' ? source_file_name : undefined,
        });
        res.json({ image_url: dataUri });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Error al generar ilustración' });
      }
    }
  );

  app.get('/api/admin/state', requireAdminAuth, (_req: Request, res: Response) => {
    try {
      const state = dbStore.getState();
      res.json({
        ...state,
        supabase_sql: SUPABASE_POSTGRES_SCHEMA_SQL,
        supabase_configured: Boolean(
          process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ),
        audit_report: dbStore.getDatabaseAuditReport(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error al obtener estado administrativo' });
    }
  });

  app.get('/api/admin/audit', requireAdminAuth, (_req: Request, res: Response) => {
    try {
      res.json(dbStore.getDatabaseAuditReport());
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error al generar reporte de auditoría' });
    }
  });

  app.post('/api/admin/courses', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const saved = dbStore.upsertCourse(req.body);
      res.json(saved);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al guardar el curso' });
    }
  });

  app.patch('/api/admin/courses/:id/status', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const { status } = req.body || {};
      if (!['draft', 'published', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Estado de curso inválido.' });
      }
      const updated = dbStore.setCourseStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ error: 'Curso no encontrado.' });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al cambiar estado del curso' });
    }
  });

  app.delete('/api/admin/courses/:id', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const ok = dbStore.deleteCourse(req.params.id);
      res.json({ deleted: ok });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al eliminar el curso' });
    }
  });

  app.post('/api/admin/competencies', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const saved = dbStore.upsertCompetency(req.body);
      res.json(saved);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al guardar competencia' });
    }
  });

  app.delete('/api/admin/competencies/:id', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const deleted = dbStore.deleteCompetency(req.params.id);
      res.json({ deleted });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al eliminar competencia' });
    }
  });

  app.post('/api/admin/catalogs', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const saved = dbStore.upsertCatalogItem(req.body);
      res.json(saved);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al guardar catálogo' });
    }
  });

  app.delete('/api/admin/catalogs/:id', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const deleted = dbStore.deleteCatalogItem(req.params.id);
      res.json({ deleted });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al eliminar ítem de catálogo' });
    }
  });

  app.post('/api/admin/thresholds', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const updated = dbStore.updateThresholds(req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Error al actualizar umbrales' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fábrica Inteligente de Formación running on http://localhost:${PORT}`);
  });
}

startServer();
