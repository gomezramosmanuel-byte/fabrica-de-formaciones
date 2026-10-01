import { Course } from '../types/lms.ts';

export const IMG_FTTH = '/src/assets/images/course_ftth_install_1790622367929.jpg';
export const IMG_R1 = '/src/assets/images/course_network_r1_1790622377980.jpg';
export const IMG_SAFETY = '/src/assets/images/course_field_safety_1790622388520.jpg';
export const IMG_CONNECTOR = '/src/assets/images/case_connector_inspection_1790622397721.jpg';

// Canonical UUIDs for Seed Entities (RFC 4122 v4 compliant)
export const UUIDS = {
  ADMIN_1: '00000000-0000-4000-8000-000000000001',
  // Competencies
  COMP_SEGURIDAD: '10000000-0000-4000-8000-000000000001',
  COMP_CONECTORES: '10000000-0000-4000-8000-000000000002',
  COMP_COLORES: '10000000-0000-4000-8000-000000000003',
  COMP_PROCEDIMIENTO: '10000000-0000-4000-8000-000000000004',
  COMP_POTENCIAS: '10000000-0000-4000-8000-000000000005',
  COMP_DIAGNOSTICO: '10000000-0000-4000-8000-000000000006',
  // Courses
  COURSE_FTTH: '20000000-0000-4000-8000-000000000001',
  COURSE_R1: '20000000-0000-4000-8000-000000000002',
  COURSE_SEG: '20000000-0000-4000-8000-000000000003',
  // Modules
  MOD_FTTH_1: '30000000-0000-4000-8000-000000000001',
  MOD_FTTH_2: '30000000-0000-4000-8000-000000000002',
  MOD_R1_1: '30000000-0000-4000-8000-000000000003',
  MOD_SEG_1: '30000000-0000-4000-8000-000000000004',
  // Content Items (Slides)
  ITEM_FTTH_101: '40000000-0000-4000-8000-000000000101',
  ITEM_FTTH_102: '40000000-0000-4000-8000-000000000102',
  ITEM_FTTH_103: '40000000-0000-4000-8000-000000000103',
  ITEM_FTTH_201: '40000000-0000-4000-8000-000000000201',
  ITEM_FTTH_202: '40000000-0000-4000-8000-000000000202',
  ITEM_FTTH_203: '40000000-0000-4000-8000-000000000203',
  ITEM_FTTH_204: '40000000-0000-4000-8000-000000000204',
  ITEM_FTTH_205: '40000000-0000-4000-8000-000000000205',
  ITEM_R1_101: '40000000-0000-4000-8000-000000000301',
  ITEM_R1_102: '40000000-0000-4000-8000-000000000302',
  ITEM_R1_103: '40000000-0000-4000-8000-000000000303',
  ITEM_R1_104: '40000000-0000-4000-8000-000000000304',
  ITEM_SEG_101: '40000000-0000-4000-8000-000000000401',
  ITEM_SEG_102: '40000000-0000-4000-8000-000000000402',
  // Questions
  Q_FTTH_1: '50000000-0000-4000-8000-000000000001',
  Q_FTTH_2: '50000000-0000-4000-8000-000000000002',
  Q_FTTH_3: '50000000-0000-4000-8000-000000000003',
  Q_FTTH_4: '50000000-0000-4000-8000-000000000004',
  Q_R1_1: '50000000-0000-4000-8000-000000000005',
  Q_R1_2: '50000000-0000-4000-8000-000000000006',
  Q_SEG_1: '50000000-0000-4000-8000-000000000007',
};

export const INITIAL_COURSES: Course[] = [
  {
    id: UUIDS.COURSE_FTTH,
    slug: 'instalacion-certificacion-ftth',
    title: 'Instalación, Medición y Certificación de Red FTTH',
    description:
      'Formación técnico-operativa sobre arquitectura GPON, presupuesto óptico, conectorización SC/APC, medición con OPM y resolución de atenuaciones en última milla.',
    category: 'Fibra Óptica y Acceso',
    estimated_minutes: 30,
    level: 'Intermedio',
    cover_image_url: IMG_FTTH,
    passing_score: 80,
    retry_policy: 'continue',
    status: 'published',
    ai_generated_draft: false,
    approved_by: UUIDS.ADMIN_1,
    published_at: '2026-08-15T10:00:00Z',
    created_at: '2026-08-10T08:00:00Z',
    updated_at: '2026-08-15T10:00:00Z',
    materials: [
      {
        id: '60000000-0000-4000-8000-000000000001',
        course_id: UUIDS.COURSE_FTTH,
        title: 'Manual Operativo de Instalación y Certificación FTTH GPON v4.2',
        file_type: 'pdf',
        file_name: 'Manual_Operativo_FTTH_GPON_v4_2.pdf',
        file_size_kb: 2840,
        storage_path: 'supabase://training-materials/ftth/Manual_Operativo_FTTH_GPON_v4_2.pdf',
        uploaded_at: '2026-08-10T09:00:00Z',
        extracted_text: `ESTÁNDAR TÉCNICO DE INSTALACIÓN FTTH GPON:
1. Presupuesto y Potencias Ópticas en ONT:
- Rango óptimo de recepción en la ONT (1490 nm): entre -15.0 dBm y -24.0 dBm.
- Umbral de advertencia / degradación: entre -24.1 dBm y -26.5 dBm.
- Pérdida crítica / fuera de rango (LOS o intermitencia): peor a -27.0 dBm o saturación superior a -8.0 dBm.
2. Atenuaciones máximas permitidas por elemento pasivo:
- Conector SC/APC (verde, pulido angulado 8 grados): pérdida máxima 0.3 dB a 0.5 dB. Retorno (ORL) > 60 dB.
- Conector SC/UPC (azul, pulido plano): pérdida de retorno ~50 dB. NUNCA acoplar un conector SC/APC verde con un SC/UPC azul porque daña la férula cerámica y genera atenuación superior a 3 dB.
- Empalme por fusión: pérdida máxima aceptable 0.05 dB - 0.1 dB.
- Splitter 1:8: pérdida típica 10.5 dB. Splitter 1:16: pérdida típica 13.8 dB.
3. Radio mínimo de curvatura en cable Drop:
- Fibra G.657.A2 insensible a curvatura: radio mínimo 7.5 mm en interior, 15 mm bajo tensión.
4. Procedimiento de Conectorización Mecánica SC/APC:
Paso 1: Deschaquetar el cable drop figura 8 separando el portante de acero.
Paso 2: Pelar el recubrimiento de 250 micras a 125 micras con peladora calibrada.
Paso 3: Limpiar la fibra desnuda con paño libre de pelusa y alcohol isopropílico al 99.9%.
Paso 4: Realizar el corte de precisión a 90 grados con cortadora de diamante (longitud según plantilla).
Paso 5: Insertar la fibra en el conector SC/APC asegurando microcurvatura de bloqueo y verificar con VFL/OPM.`,
      },
    ],
    modules: [
      {
        id: UUIDS.MOD_FTTH_1,
        course_id: UUIDS.COURSE_FTTH,
        title: 'Módulo 1: Presupuesto Óptico y Niveles en Caja NAP',
        description: 'Parámetros de potencia óptica GPON en 1490 nm y validación en puerto de distribución.',
        order_index: 1,
        created_at: '2026-08-10T08:00:00Z',
        updated_at: '2026-08-10T08:00:00Z',
        items: [
          {
            id: UUIDS.ITEM_FTTH_101,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_1,
            content_type: 'title',
            title: 'Arquitectura de Red Pasiva GPON y Presupuesto Óptico',
            subtitle: 'Estándares de validación con medidor de potencia óptica (OPM) antes del tendido de acometida.',
            body: 'Toda instalación FTTH comienza validando el nivel de potencia en el puerto asignado de la Caja de Distribución Óptica (NAP). Iniciar un tendido sin certificar primero la potencia en la NAP es la principal causa de retrabajos en campo.',
            media_url: IMG_FTTH,
            media_caption: 'Verificación de potencia descendente (1490 nm) directamente en puerto NAP.',
            order_index: 1,
            estimated_seconds: 45,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
          },
          {
            id: UUIDS.ITEM_FTTH_102,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_1,
            content_type: 'highlight',
            title: 'Umbrales Oficiales de Potencia en Recepción (ONT)',
            subtitle: 'Longitud de onda descendente: 1490 nm',
            body: 'El medidor de potencia óptica (OPM) debe configurarse obligatoriamente en 1490 nm para medir la señal proveniente de la OLT hacia el suscriptor. Los valores se expresan en dBm negativos:',
            highlight_note:
              'RANGO ÓPTIMO: -15.0 dBm a -24.0 dBm  |  UMBRAL DE ALERTA: -24.1 dBm a -26.5 dBm  |  FUERA DE ESTÁNDAR (RECHAZO): Peor a -27.0 dBm',
            order_index: 2,
            estimated_seconds: 60,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
          },
          {
            id: UUIDS.ITEM_FTTH_103,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_1,
            content_type: 'question',
            title: 'Verificación de Conocimiento: Potencia en ONT',
            question_id: UUIDS.Q_FTTH_1,
            order_index: 3,
            estimated_seconds: 60,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
            question: {
              id: UUIDS.Q_FTTH_1,
              course_id: UUIDS.COURSE_FTTH,
              module_id: UUIDS.MOD_FTTH_1,
              competency_id: UUIDS.COMP_POTENCIAS,
              competency_name: 'Potencias ópticas',
              question_type: 'single_choice',
              prompt:
                'Al medir en la roseta óptica del cliente con el OPM configurado en 1490 nm, ¿cuál de las siguientes lecturas se encuentra dentro del rango óptimo de certificación?',
              difficulty: 'Básico',
              points: 20,
              max_attempts: 2,
              order_index: 1,
              related_content_id: UUIDS.ITEM_FTTH_102,
              explanation:
                'El rango óptimo de operación en la ONT para redes GPON a 1490 nm está comprendido entre -15.0 dBm y -24.0 dBm.',
              correct_concept:
                'Una lectura de -19.4 dBm ofrece un margen de seguridad ideal frente a envejecimiento o microcurvaturas.',
              recommendation:
                'Verifica siempre que el OPM esté en la longitud de onda 1490 nm y que la lectura no sea más negativa que -24.0 dBm.',
              created_at: '2026-08-10T08:00:00Z',
              updated_at: '2026-08-10T08:00:00Z',
              options: [
                { id: '61000000-0000-4000-8000-000000000001', question_id: UUIDS.Q_FTTH_1, label: 'A', text: '-28.5 dBm (Baja potencia crítica)', is_correct: false },
                { id: '61000000-0000-4000-8000-000000000002', question_id: UUIDS.Q_FTTH_1, label: 'B', text: '-19.4 dBm (Dentro de ventana operativa óptima)', is_correct: true },
                { id: '61000000-0000-4000-8000-000000000003', question_id: UUIDS.Q_FTTH_1, label: 'C', text: '-4.0 dBm (Saturación del fotodiodo receptor)', is_correct: false },
                { id: '61000000-0000-4000-8000-000000000004', question_id: UUIDS.Q_FTTH_1, label: 'D', text: '-31.2 dBm (Pérdida de sincronismo LOS)', is_correct: false },
              ],
            },
          },
        ],
      },
      {
        id: UUIDS.MOD_FTTH_2,
        course_id: UUIDS.COURSE_FTTH,
        title: 'Módulo 2: Conectorización SC/APC y Diagnóstico en Campo',
        description: 'Identificación de férulas, secuencia de conectorización y resolución de casos reales.',
        order_index: 2,
        created_at: '2026-08-10T08:00:00Z',
        updated_at: '2026-08-10T08:00:00Z',
        items: [
          {
            id: UUIDS.ITEM_FTTH_201,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_2,
            content_type: 'image',
            title: 'Diferenciación Crítica: Conector SC/APC vs SC/UPC',
            subtitle: 'Geometría de pulido de la férula cerámica',
            body: 'El conector SC/APC (verde) posee un pulido angulado de 8° que desvía las reflexiones hacia el revestimiento, logrando pérdidas de retorno (ORL) mayores a 60 dB indispensables para GPON. El conector SC/UPC (azul) tiene pulido plano (0°). Acoplar un conector verde con uno azul en un enfrentador provoca daño físico en la férula y pérdidas mayores a 3.5 dB.',
            media_url: IMG_CONNECTOR,
            media_caption: 'Izquierda: Conector SC/APC (Verde, 8°). Derecha: Conector SC/UPC (Azul, 0°) junto a cortadora de precisión.',
            order_index: 1,
            estimated_seconds: 60,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
          },
          {
            id: UUIDS.ITEM_FTTH_202,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_2,
            content_type: 'steps',
            title: 'Procedimiento Paso a Paso: Armado de Conector Mecánico SC/APC',
            subtitle: 'Secuencia estandarizada para garantizar atenuación menor a 0.4 dB',
            body: 'El orden de preparación y limpieza de la fibra determina la vida útil del enlace óptico:',
            steps: [
              {
                step_number: 1,
                title: 'Separación del mensajero y deschaquetado del cable Drop',
                description: 'Separar el alambre portante de acero y retirar 5 cm de chaqueta LSZH con la peladora de drop sin mellar el recubrimiento.',
                critical_note: 'No utilizar alicates de corte diagonal para pelar la chaqueta.',
              },
              {
                step_number: 2,
                title: 'Pelado del acrilato (250 µm a 125 µm)',
                description: 'Utilizar la muesca calibrada de la peladora Miller a 35 mm en un ángulo de 45° con movimiento firme.',
              },
              {
                step_number: 3,
                title: 'Limpieza con alcohol isopropílico al 99.9%',
                description: 'Limpiar la fibra desnuda con paño libre de pelusa humedecido en alcohol isopropílico hasta escuchar el chirrido característico.',
                critical_note: 'Nunca tocar la fibra desnuda después de limpiarla.',
              },
              {
                step_number: 4,
                title: 'Corte de precisión a 90° con cortadora de diamante',
                description: 'Colocar la fibra en el riel guía y accionar el carro de corte una sola vez.',
              },
              {
                step_number: 5,
                title: 'Inserción, bloqueo de cuña y prueba óptica',
                description: 'Insertar la fibra hasta el tope manteniendo una leve microcurvatura, asegurar el seguro del conector y medir con OPM.',
              },
            ],
            order_index: 2,
            estimated_seconds: 75,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
          },
          {
            id: UUIDS.ITEM_FTTH_203,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_2,
            content_type: 'question',
            title: 'Actividad Interactiva: Ordenar Procedimiento de Conectorización',
            question_id: UUIDS.Q_FTTH_2,
            order_index: 3,
            estimated_seconds: 75,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
            question: {
              id: UUIDS.Q_FTTH_2,
              course_id: UUIDS.COURSE_FTTH,
              module_id: UUIDS.MOD_FTTH_2,
              competency_id: UUIDS.COMP_PROCEDIMIENTO,
              competency_name: 'Procedimiento técnico',
              question_type: 'order_steps',
              prompt:
                'Ordena en la secuencia técnica correcta los 4 pasos fundamentales para el armado de un conector de campo SC/APC:',
              difficulty: 'Intermedio',
              points: 25,
              max_attempts: 2,
              order_index: 2,
              related_content_id: UUIDS.ITEM_FTTH_202,
              explanation:
                'La fibra nunca debe limpiarse después del corte en la cortadora de diamante, ya que cualquier contacto con el extremo clivado daña el ángulo de 90 grados o deposita partículas en el núcleo.',
              correct_concept:
                'Secuencia obligatoria: 1. Deschaquetar y pelar acrilato -> 2. Limpiar con alcohol isopropílico -> 3. Cortar con cortadora de precisión -> 4. Insertar en conector y bloquear.',
              recommendation:
                'Repasa la pantalla de Procedimiento Paso a Paso: recuerda que la limpieza siempre va ANTES del corte de precisión.',
              created_at: '2026-08-10T08:00:00Z',
              updated_at: '2026-08-10T08:00:00Z',
              options: [
                { id: '61000000-0000-4000-8000-000000000005', question_id: UUIDS.Q_FTTH_2, label: '1', text: 'Deschaquetar el cable Drop y retirar el recubrimiento de 250 µm', step_order: 1, is_correct: true },
                { id: '61000000-0000-4000-8000-000000000006', question_id: UUIDS.Q_FTTH_2, label: '2', text: 'Limpiar la fibra desnuda con alcohol isopropílico al 99.9% y paño sin pelusa', step_order: 2, is_correct: true },
                { id: '61000000-0000-4000-8000-000000000007', question_id: UUIDS.Q_FTTH_2, label: '3', text: 'Ejecutar el corte a 90° en la cortadora de precisión', step_order: 3, is_correct: true },
                { id: '61000000-0000-4000-8000-000000000008', question_id: UUIDS.Q_FTTH_2, label: '4', text: 'Insertar la fibra en el conector SC/APC, trabar la cuña y certificar con OPM', step_order: 4, is_correct: true },
              ],
            },
          },
          {
            id: UUIDS.ITEM_FTTH_204,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_2,
            content_type: 'case_study',
            title: 'Caso Práctico de Campo: Caída de 4.2 dB en Roseta Interna',
            question_id: UUIDS.Q_FTTH_3,
            order_index: 4,
            estimated_seconds: 90,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
            question: {
              id: UUIDS.Q_FTTH_3,
              course_id: UUIDS.COURSE_FTTH,
              module_id: UUIDS.MOD_FTTH_2,
              competency_id: UUIDS.COMP_DIAGNOSTICO,
              competency_name: 'Diagnóstico FTTH',
              question_type: 'single_choice',
              case_study_situation:
                'Un técnico instala una acometida de 85 metros. En el puerto de la NAP midió -19.2 dBm, pero al medir en el patchcord conectado a la roseta óptica dentro del domicilio obtiene -25.8 dBm (una pérdida anormal de 6.6 dB en el tramo). Al inspeccionar la roseta observa que se instaló un patchcord con conector azul (SC/UPC) acoplado al adaptador verde (SC/APC) del cable drop.',
              case_study_description:
                'Observa la evidencia fotográfica de los conectores encontrados en la roseta del cliente y determina la decisión técnica correcta.',
              case_study_image_url: IMG_CONNECTOR,
              prompt: '¿Qué acción técnica debe ejecutar el instalador para corregir la atenuación y certificar el servicio?',
              difficulty: 'Avanzado',
              points: 30,
              max_attempts: 2,
              order_index: 3,
              related_content_id: UUIDS.ITEM_FTTH_201,
              explanation:
                'El acoplamiento entre un conector SC/APC (verde, 8°) y un SC/UPC (azul, 0°) deja un espacio de aire asimétrico entre las férulas y daña el pulido, provocando más de 4 dB de pérdida de inserción y alta reflexión.',
              correct_concept:
                'En redes FTTH GPON todos los acoplamientos en NAP y roseta deben mantener el mismo estándar de pulido angulado SC/APC (verde con verde) previa limpieza de férulas con One-Click Cleaner.',
              recommendation:
                'Sustituye siempre patchcords SC/UPC azules por patchcords SC/APC verdes certificados y limpia ambas caras del enfrentador antes de medir nuevamente.',
              created_at: '2026-08-10T08:00:00Z',
              updated_at: '2026-08-10T08:00:00Z',
              options: [
                {
                  id: '61000000-0000-4000-8000-000000000009',
                  question_id: UUIDS.Q_FTTH_3,
                  label: 'A',
                  text: 'Dejar el servicio en -25.8 dBm ya que la ONT aún sincroniza aunque esté en umbral de alerta.',
                  is_correct: false,
                },
                {
                  id: '61000000-0000-4000-8000-000000000010',
                  question_id: UUIDS.Q_FTTH_3,
                  label: 'B',
                  text: 'Reemplazar el patchcord azul SC/UPC por uno verde SC/APC, limpiar la férula del drop con One-Click Cleaner y verificar que la potencia suba a ~ -19.6 dBm.',
                  is_correct: true,
                },
                {
                  id: '61000000-0000-4000-8000-000000000011',
                  question_id: UUIDS.Q_FTTH_3,
                  label: 'C',
                  text: 'Cambiar el puerto del cliente en la caja NAP sin modificar los conectores de la roseta interna.',
                  is_correct: false,
                },
                {
                  id: '61000000-0000-4000-8000-000000000012',
                  question_id: UUIDS.Q_FTTH_3,
                  label: 'D',
                  text: 'Aplicar alcohol directamente dentro del enfrentador con el conector enchufado.',
                  is_correct: false,
                },
              ],
            },
          },
          {
            id: UUIDS.ITEM_FTTH_205,
            course_id: UUIDS.COURSE_FTTH,
            module_id: UUIDS.MOD_FTTH_2,
            content_type: 'evaluation',
            title: 'Evaluación Final: Identificación de Causas de Atenuación',
            question_id: UUIDS.Q_FTTH_4,
            order_index: 5,
            estimated_seconds: 75,
            created_at: '2026-08-10T08:00:00Z',
            updated_at: '2026-08-10T08:00:00Z',
            question: {
              id: UUIDS.Q_FTTH_4,
              course_id: UUIDS.COURSE_FTTH,
              module_id: UUIDS.MOD_FTTH_2,
              competency_id: UUIDS.COMP_CONECTORES,
              competency_name: 'Conectores',
              question_type: 'multiple_choice',
              prompt:
                'Selecciona TODAS las condiciones que provocan un incremento crítico de atenuación (macrocurvatura o pérdida de inserción) en una acometida FTTH:',
              difficulty: 'Intermedio',
              points: 25,
              max_attempts: 2,
              order_index: 4,
              related_content_id: UUIDS.ITEM_FTTH_201,
              explanation:
                'Las grapas plásticas excesivamente apretadas, los radios de curvatura inferiores a 7.5 mm en esquinas y la suciedad en la férula cerámica del conector SC/APC son las tres causas principales de atenuación inducida en la instalación.',
              correct_concept:
                'Respetar el radio mínimo de curvatura, usar herrajes sin estrangular la chaqueta y limpiar conectores con One-Click Cleaner preserva el presupuesto óptico.',
              recommendation:
                'Revisa el protocolo de tendido interior y limpieza óptica antes de cerrar la orden.',
              created_at: '2026-08-10T08:00:00Z',
              updated_at: '2026-08-10T08:00:00Z',
              options: [
                {
                  id: '61000000-0000-4000-8000-000000000013',
                  question_id: UUIDS.Q_FTTH_4,
                  label: 'A',
                  text: 'Polvo o grasa dactilar en el extremo de la férula cerámica del conector SC/APC',
                  is_correct: true,
                },
                {
                  id: '61000000-0000-4000-8000-000000000014',
                  question_id: UUIDS.Q_FTTH_4,
                  label: 'B',
                  text: 'Doblar el cable Drop en ángulo recto cerrado (< 5 mm) al pasar por marcos de puertas',
                  is_correct: true,
                },
                {
                  id: '61000000-0000-4000-8000-000000000015',
                  question_id: UUIDS.Q_FTTH_4,
                  label: 'C',
                  text: 'Dejar reserva técnica en roseta con radio suave mayor a 30 mm',
                  is_correct: false,
                },
                {
                  id: '61000000-0000-4000-8000-000000000016',
                  question_id: UUIDS.Q_FTTH_4,
                  label: 'D',
                  text: 'Estrangular el cable Drop con cintillos plásticos o grapas martilladas sobre el núcleo',
                  is_correct: true,
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: UUIDS.COURSE_R1,
    slug: 'normalizacion-red-r1',
    title: 'Normalización de Red Exterior R1 y Código de Colores',
    description:
      'Estandarización de cierres de empalme, cajas NAP, etiquetado de acometidas, herrajes de retención y norma internacional TIA/EIA-598 de código de colores en fibra óptica.',
    category: 'Planta Externa y Normalización',
    estimated_minutes: 25,
    level: 'Intermedio',
    cover_image_url: IMG_R1,
    passing_score: 80,
    retry_policy: 'new_attempt',
    status: 'published',
    ai_generated_draft: false,
    approved_by: UUIDS.ADMIN_1,
    published_at: '2026-08-20T14:00:00Z',
    created_at: '2026-08-18T10:00:00Z',
    updated_at: '2026-08-20T14:00:00Z',
    materials: [
      {
        id: '60000000-0000-4000-8000-000000000002',
        course_id: UUIDS.COURSE_R1,
        title: 'Guía de Normalización de Planta Externa R1 y Código TIA-598',
        file_type: 'pdf',
        file_name: 'Norma_Normalizacion_Red_R1_TIA598.pdf',
        file_size_kb: 1950,
        storage_path: 'supabase://training-materials/r1/Norma_Normalizacion_Red_R1_TIA598.pdf',
        uploaded_at: '2026-08-18T11:00:00Z',
        extracted_text: `NORMA TÉCNICA DE NORMALIZACIÓN DE RED EXTERIOR R1:
1. Código de Colores Estándar TIA/EIA-598 para buffers y fibras ópticas (1 al 12):
1: Azul | 2: Naranja | 3: Verde | 4: Marrón (Café) | 5: Gris (Pizarra) | 6: Blanco | 7: Rojo | 8: Negro | 9: Amarillo | 10: Violeta | 11: Rosa | 12: Aguamarina (Turquesa).
2. Normalización en Cajas NAP:
- Cada acometida activa debe ingresar por su prensaestopa de goma perforado (nunca dejar la caja NAP abierta ni pasar cables por la bisagra).
- Toda acometida debe portar marquilla reflectiva o placa acrílica con el ID del servicio / puerto a 15 cm de la entrada de la NAP.
- Los puertos vacantes del splitter deben conservar su tapón guardapolvo colocado.
- Prohibido dejar acometidas muertas (en desuso) conectadas o colgando del herraje del poste.`,
      },
    ],
    modules: [
      {
        id: UUIDS.MOD_R1_1,
        course_id: UUIDS.COURSE_R1,
        title: 'Módulo 1: Estándar TIA/EIA-598 y Ordenamiento en NAP',
        description: 'Identificación cromática de hilos y disciplina operativa en cajas de distribución aérea.',
        order_index: 1,
        created_at: '2026-08-18T10:00:00Z',
        updated_at: '2026-08-18T10:00:00Z',
        items: [
          {
            id: UUIDS.ITEM_R1_101,
            course_id: UUIDS.COURSE_R1,
            module_id: UUIDS.MOD_R1_1,
            content_type: 'title',
            title: 'Criterios de Auditoría y Normalización R1 en Poste',
            subtitle: 'Hermeticidad, marquillado e identificación de buffers según norma TIA/EIA-598',
            body: 'Una caja NAP mal cerrada o con cables ingresando sin prensaestopa permite el ingreso de humedad, insectos y polvo a los acopladores ópticos, degradando la potencia de todos los clientes del splitter.',
            media_url: IMG_R1,
            media_caption: 'Caja NAP normalizada en poste con herraje de retención, gotero y prensaestopas sellados.',
            order_index: 1,
            estimated_seconds: 50,
            created_at: '2026-08-18T10:00:00Z',
            updated_at: '2026-08-18T10:00:00Z',
          },
          {
            id: UUIDS.ITEM_R1_102,
            course_id: UUIDS.COURSE_R1,
            module_id: UUIDS.MOD_R1_1,
            content_type: 'highlight',
            title: 'Secuencia del Código de Colores TIA/EIA-598 (Fibras 1 a 12)',
            subtitle: 'Identificación universal tanto para tubos holgados (buffers) como para hilos de fibra',
            body: 'Memorizar con exactitud la posición de cada color evita desconexiones erróneas de clientes activos durante mantenimientos correctivos o fusiones de distribución:',
            highlight_note:
              '1. Azul · 2. Naranja · 3. Verde · 4. Marrón · 5. Gris · 6. Blanco · 7. Rojo · 8. Negro · 9. Amarillo · 10. Violeta · 11. Rosa · 12. Aguamarina',
            order_index: 2,
            estimated_seconds: 60,
            created_at: '2026-08-18T10:00:00Z',
            updated_at: '2026-08-18T10:00:00Z',
          },
          {
            id: UUIDS.ITEM_R1_103,
            course_id: UUIDS.COURSE_R1,
            module_id: UUIDS.MOD_R1_1,
            content_type: 'question',
            title: 'Validación: Código de Colores TIA/EIA-598',
            question_id: UUIDS.Q_R1_1,
            order_index: 3,
            estimated_seconds: 60,
            created_at: '2026-08-18T10:00:00Z',
            updated_at: '2026-08-18T10:00:00Z',
            question: {
              id: UUIDS.Q_R1_1,
              course_id: UUIDS.COURSE_R1,
              module_id: UUIDS.MOD_R1_1,
              competency_id: UUIDS.COMP_COLORES,
              competency_name: 'Código de colores',
              question_type: 'single_choice',
              prompt:
                'Según la norma internacional TIA/EIA-598, ¿qué colores corresponden respectivamente a las fibras número 1, 5 y 9 dentro de un buffer de 12 hilos?',
              difficulty: 'Intermedio',
              points: 50,
              max_attempts: 2,
              order_index: 1,
              related_content_id: UUIDS.ITEM_R1_102,
              explanation:
                'En la secuencia TIA/EIA-598: 1 es Azul, 2 Naranja, 3 Verde, 4 Marrón, 5 Gris, 6 Blanco, 7 Rojo, 8 Negro, 9 Amarillo, 10 Violeta, 11 Rosa y 12 Aguamarina.',
              correct_concept: 'Fibra 1 = Azul, Fibra 5 = Gris (Pizarra), Fibra 9 = Amarillo.',
              recommendation: 'Revisa la tabla de los 12 colores en la pantalla anterior antes de intervenir bandejas de empalme.',
              created_at: '2026-08-18T10:00:00Z',
              updated_at: '2026-08-18T10:00:00Z',
              options: [
                { id: '61000000-0000-4000-8000-000000000017', question_id: UUIDS.Q_R1_1, label: 'A', text: '1: Verde, 5: Blanco, 9: Rojo', is_correct: false },
                { id: '61000000-0000-4000-8000-000000000018', question_id: UUIDS.Q_R1_1, label: 'B', text: '1: Azul, 5: Gris, 9: Amarillo', is_correct: true },
                { id: '61000000-0000-4000-8000-000000000019', question_id: UUIDS.Q_R1_1, label: 'C', text: '1: Azul, 5: Marrón, 9: Violeta', is_correct: false },
                { id: '61000000-0000-4000-8000-000000000020', question_id: UUIDS.Q_R1_1, label: 'D', text: '1: Naranja, 5: Gris, 9: Aguamarina', is_correct: false },
              ],
            },
          },
          {
            id: UUIDS.ITEM_R1_104,
            course_id: UUIDS.COURSE_R1,
            module_id: UUIDS.MOD_R1_1,
            content_type: 'evaluation',
            title: 'Caso de Auditoría R1: Hermeticidad y Marquillado en NAP',
            question_id: UUIDS.Q_R1_2,
            order_index: 4,
            estimated_seconds: 60,
            created_at: '2026-08-18T10:00:00Z',
            updated_at: '2026-08-18T10:00:00Z',
            question: {
              id: UUIDS.Q_R1_2,
              course_id: UUIDS.COURSE_R1,
              module_id: UUIDS.MOD_R1_1,
              competency_id: UUIDS.COMP_PROCEDIMIENTO,
              competency_name: 'Procedimiento técnico',
              question_type: 'true_false',
              prompt:
                'Durante una visita de normalización R1, si todos los pasamuros de goma están ocupados por cables en desuso (bajas), es válido pasar la nueva acometida por el borde de la tapa sin cerrar los broches de presión de la NAP.',
              difficulty: 'Básico',
              points: 50,
              max_attempts: 1,
              order_index: 2,
              related_content_id: UUIDS.ITEM_R1_101,
              explanation:
                'Está estrictamente prohibido dejar la caja NAP abierta o aplastar el cable drop con la tapa. El técnico debe retirar las acometidas muertas/en desuso verificadas y pasar el nuevo cable por el prensaestopa de goma sellando los broches.',
              correct_concept: 'Toda caja NAP intervenida debe quedar herméticamente cerrada, con tapones guardapolvo en puertos libres y marquilla instalada.',
              recommendation: 'Retira acometidas dadas de baja en el puerto asignado y garantiza siempre el cierre hermético de la NAP.',
              created_at: '2026-08-18T10:00:00Z',
              updated_at: '2026-08-18T10:00:00Z',
              options: [
                { id: '61000000-0000-4000-8000-000000000021', question_id: UUIDS.Q_R1_2, label: 'V', text: 'Verdadero', is_correct: false },
                { id: '61000000-0000-4000-8000-000000000022', question_id: UUIDS.Q_R1_2, label: 'F', text: 'Falso', is_correct: true },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: UUIDS.COURSE_SEG,
    slug: 'seguridad-operativa-alturas',
    title: 'Seguridad en Campo, Riesgo Eléctrico y Trabajo Seguro en Alturas',
    description:
      'Protocolo obligatorio de inspección preoperacional de arnés, detector de tensión sin contacto, distancias mínimas de seguridad en postería y manejo seguro de residuos de fibra óptica.',
    category: 'Seguridad y Salud en el Trabajo (SST)',
    estimated_minutes: 20,
    level: 'Básico',
    cover_image_url: IMG_SAFETY,
    passing_score: 85,
    retry_policy: 'continue',
    status: 'published',
    ai_generated_draft: false,
    approved_by: UUIDS.ADMIN_1,
    published_at: '2026-09-01T08:00:00Z',
    created_at: '2026-08-28T08:00:00Z',
    updated_at: '2026-09-01T08:00:00Z',
    materials: [
      {
        id: '60000000-0000-4000-8000-000000000003',
        course_id: UUIDS.COURSE_SEG,
        title: 'Protocolo SST de Ascenso a Poste y Riesgo Eléctrico en Telecomunicaciones',
        file_type: 'pdf',
        file_name: 'Protocolo_SST_Alturas_Riesgo_Electrico.pdf',
        file_size_kb: 1620,
        storage_path: 'supabase://training-materials/seguridad/Protocolo_SST_Alturas_Riesgo_Electrico.pdf',
        uploaded_at: '2026-08-28T09:00:00Z',
        extracted_text: `PROTOCOLO DE SEGURIDAD EN CAMPO Y TRABAJO EN ALTURAS:
1. Antes de apoyar la escalera dieléctrica en el poste:
- Verificar con detector de tensión sin contacto (canario) la ausencia de energización en herrajes, vientos o bajantes metálicas.
- Inspeccionar la base del poste (fracturas, pudrición o inclinación crítica).
- Respetar la relación de inclinación 4:1 de la escalera dieléctrica (por cada 4 metros de altura, 1 metro de separación en la base).
2. Distancias mínimas de seguridad respecto a redes eléctricas:
- Red de Baja Tensión: mínimo 0.80 m a 1.00 m.
- Red de Media Tensión (13.2 kV - 34.5 kV): mínimo 1.80 m a 2.30 m. Si existe invasión de distancia, suspender inmediatamente la maniobra.
3. Manejo de microfragmentos de vidrio de fibra óptica:
- Usar siempre gafas de seguridad certificadas ANSI Z87.1 y contenedor hermético de descarte de esquirlas de fibra.`,
      },
    ],
    modules: [
      {
        id: UUIDS.MOD_SEG_1,
        course_id: UUIDS.COURSE_SEG,
        title: 'Módulo Único: Protocolo de Ascenso y Riesgo Eléctrico',
        description: 'Reglas que salvan vidas en postería compartida y manipulación de vidrio óptico.',
        order_index: 1,
        created_at: '2026-08-28T08:00:00Z',
        updated_at: '2026-08-28T08:00:00Z',
        items: [
          {
            id: UUIDS.ITEM_SEG_101,
            course_id: UUIDS.COURSE_SEG,
            module_id: UUIDS.MOD_SEG_1,
            content_type: 'instructions',
            title: 'Inspección Preoperacional Antes de Ascender al Poste',
            subtitle: 'Ninguna orden de servicio justifica omitir la prueba de tensión inducida',
            body: 'En postería compartida con redes eléctricas, los herrajes metálicos, cables mensajeros de acero y retenidas pueden encontrarse energizados accidentalmente. Antes de posicionar la escalera dieléctrica es obligatorio ejecutar la verificación con detector de tensión sin contacto.',
            media_url: IMG_SAFETY,
            media_caption: 'Técnico con EPP dieléctrico completo, casco con barbuquejo de 3 puntos y arnés multipropósito.',
            highlight_note:
              'REGLA DE ORO: Usa siempre escalera de fibra de vidrio (dieléctrica), mantén relación 4:1 en la base y verifica ausencia de tensión en herrajes antes del ascenso.',
            order_index: 1,
            estimated_seconds: 60,
            created_at: '2026-08-28T08:00:00Z',
            updated_at: '2026-08-28T08:00:00Z',
          },
          {
            id: UUIDS.ITEM_SEG_102,
            course_id: UUIDS.COURSE_SEG,
            module_id: UUIDS.MOD_SEG_1,
            content_type: 'evaluation',
            title: 'Evaluación Certificadora: Toma de Decisiones ante Riesgo Eléctrico',
            question_id: UUIDS.Q_SEG_1,
            order_index: 2,
            estimated_seconds: 60,
            created_at: '2026-08-28T08:00:00Z',
            updated_at: '2026-08-28T08:00:00Z',
            question: {
              id: UUIDS.Q_SEG_1,
              course_id: UUIDS.COURSE_SEG,
              module_id: UUIDS.MOD_SEG_1,
              competency_id: UUIDS.COMP_SEGURIDAD,
              competency_name: 'Seguridad en campo',
              question_type: 'single_choice',
              prompt:
                'Al llegar al poste donde se ubica la caja NAP, el detector de tensión sin contacto emite alarma sonora y luminosa al acercarlo al herraje y al cable portante. ¿Cuál es el procedimiento obligatorio?',
              difficulty: 'Básico',
              points: 100,
              max_attempts: 2,
              order_index: 1,
              related_content_id: UUIDS.ITEM_SEG_101,
              explanation:
                'Una alerta positiva en el detector de tensión indica presencia de corriente eléctrica peligrosa en el herraje o mensajero. Nunca se debe ascender ni tocar el elemento energizado.',
              correct_concept:
                'Suspender inmediatamente la maniobra de ascenso, señalizar el área, reportar la condición insegura al centro de despacho / supervisión SST y esperar el despeje de la electrificadora.',
              recommendation: 'Aplica siempre el derecho y deber de detención de tarea ante riesgo eléctrico activo.',
              created_at: '2026-08-28T08:00:00Z',
              updated_at: '2026-08-28T08:00:00Z',
              options: [
                {
                  id: '61000000-0000-4000-8000-000000000023',
                  question_id: UUIDS.Q_SEG_1,
                  label: 'A',
                  text: 'Subir rápidamente usando guantes de carnaza para conectar el drop en menos de 2 minutos.',
                  is_correct: false,
                },
                {
                  id: '61000000-0000-4000-8000-000000000024',
                  question_id: UUIDS.Q_SEG_1,
                  label: 'B',
                  text: 'Suspender inmediatamente el ascenso, demarcar el riesgo, documentar evidencia y reportar a supervisión SST / despacho.',
                  is_correct: true,
                },
                {
                  id: '61000000-0000-4000-8000-000000000025',
                  question_id: UUIDS.Q_SEG_1,
                  label: 'C',
                  text: 'Cortar el cable portante con alicate para eliminar la corriente inducida.',
                  is_correct: false,
                },
                {
                  id: '61000000-0000-4000-8000-000000000026',
                  question_id: UUIDS.Q_SEG_1,
                  label: 'D',
                  text: 'Ignorar la alarma si el día está lluvioso porque suele ser estática.',
                  is_correct: false,
                },
              ],
            },
          },
        ],
      },
    ],
  },
];
