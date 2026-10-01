import React, { useState, useMemo } from 'react';
import { ArrowRight, BookOpen, Clock, Layers, QrCode, Search, Copy } from 'lucide-react';
import { Course } from '../../types/lms.ts';
import { ResilientImage } from '../common/ResilientImage.tsx';
import {
  CLARO_TECHNICIAN_IMAGE_URL,
  UClaroTecnologiaLogo,
} from '../common/ClaroBrandAssets.tsx';

interface TrainingLibraryViewProps {
  courses: Course[];
  onStartTraining: (slug: string) => void;
  onOpenCourseSessionHub?: (slug: string) => void;
  isAdminView?: boolean;
  onShowQr?: (slug: string) => void;
}

export const TrainingLibraryView: React.FC<TrainingLibraryViewProps> = ({
  courses,
  onStartTraining,
  onOpenCourseSessionHub,
  isAdminView = false,
  onShowQr,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const publishedCourses = useMemo(
    () => courses.filter((c) => c.status === 'published'),
    [courses]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    publishedCourses.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set);
  }, [publishedCourses]);

  const filteredCourses = useMemo(() => {
    return publishedCourses.filter((c) => {
      if (selectedCategory !== 'ALL' && c.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchDesc = c.description.toLowerCase().includes(q);
        const matchCat = c.category.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchCat) return false;
      }
      return true;
    });
  }, [publishedCourses, selectedCategory, searchQuery]);

  return (
    <div className="space-y-8 bg-white">
      {/* Corporate Claro Hero Presentation Banner with Supplied Images ("fondo blanco viñetas rojas") */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="h-2 w-full bg-[#DA291C]" />
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white">
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center gap-3.5">
              <UClaroTecnologiaLogo className="w-16 h-16 shrink-0" />
              <div>
                <div className="text-xs font-extrabold tracking-wider uppercase text-[#DA291C] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                  <span>U CLARO TECNOLOGÍA · PORTAL DEL PARTICIPANTE</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5">
                  Capacitaciones
                </h1>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed max-w-2xl">
              Selecciona tu tema formativo en la biblioteca de capacitaciones de <strong>Claro</strong> o ingresa directamente desde tu enlace compartido (<span className="font-mono text-xs text-[#DA291C]">/formacion/tema</span>):
            </p>

            {/* Corporate Red Bullets on Pure White Background */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs sm:text-sm text-slate-800">
              <li className="flex items-start gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                <span>
                  <strong>Ingreso ágil de 4 datos:</strong> Nombre completo, Cédula, Área y Cargo (con opción de ingresar cargos de acuerdo a la organización).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                <span>
                  <strong>Módulos e ilustraciones técnicas:</strong> Diapositivas visuales, procedimientos paso a paso y casos prácticos de campo.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                <span>
                  <strong>Preguntas intercaladas:</strong> Retroalimentación inmediata en cada módulo antes de avanzar.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                <span>
                  <strong>Diagnóstico final personalizado:</strong> Puntaje, fortalezas y puntos a mejorar al concluir la capacitación.
                </span>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-end relative overflow-hidden">
            <div className="h-60 w-full bg-white flex items-end justify-center">
              <img
                src={CLARO_TECHNICIAN_IMAGE_URL}
                alt="Modelo Técnico Claro"
                referrerPolicy="no-referrer"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="w-full pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                <span>Modelo Técnico Claro</span>
              </span>
              <span className="font-mono font-semibold text-[#DA291C]">
                Excelencia en Campo
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar by Dynamic Category and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-[#DA291C] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Todas ({publishedCourses.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#DA291C] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar capacitación por tema..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#DA291C]"
          />
        </div>
      </div>

      {/* Dynamic Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCourses.map((c) => {
          const moduleCount = c.modules ? c.modules.length : 1;
          const shareUrl = `${window.location.origin}/formacion/${c.slug}`;

          return (
            <div
              key={c.id}
              className="bg-white border-2 border-slate-200 hover:border-[#DA291C] rounded-2xl overflow-hidden flex flex-col justify-between shadow-2xs transition-colors group"
            >
              <div>
                <div className="h-1.5 w-full bg-[#DA291C]" />
                {/* IMAGEN DEL TEMA */}
                <div className="aspect-video w-full relative overflow-hidden bg-slate-900">
                  <ResilientImage
                    src={c.cover_image_url}
                    alt={c.title}
                    category={c.category}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex flex-col justify-end p-4">
                    <div className="text-xs text-white font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                      <span>{c.category}</span>
                    </div>
                  </div>
                </div>

                {/* CONTENIDO DE LA CARD */}
                <div className="p-5 space-y-3 bg-white">
                  <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight leading-snug">
                    {c.title}
                  </h2>
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {c.description}
                  </p>

                  <ul className="pt-3 space-y-1.5 text-xs text-slate-800 border-t border-slate-100">
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] shrink-0" />
                      <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-semibold">{moduleCount} módulos</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] shrink-0" />
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-semibold">{c.estimated_minutes} minutos</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] shrink-0" />
                      <BookOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>
                        Nivel: <strong>{c.level}</strong>
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-5 pt-0 space-y-2.5 bg-white">
                {isAdminView && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-[11px] font-mono text-slate-600">
                    <span className="truncate">/formacion/{c.slug}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(shareUrl);
                          setCopiedSlug(c.slug);
                          setTimeout(() => setCopiedSlug(null), 2000);
                        }}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-800 hover:border-[#DA291C] hover:text-[#DA291C] inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedSlug === c.slug ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      {onShowQr && (
                        <button
                          type="button"
                          onClick={() => onShowQr(c.slug)}
                          className="p-1 bg-white border border-slate-200 rounded text-slate-800 hover:border-[#DA291C] hover:text-[#DA291C]"
                          title="Código QR"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {onOpenCourseSessionHub && (
                    <button
                      type="button"
                      onClick={() => onOpenCourseSessionHub(c.slug)}
                      className="py-3 px-3.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
                    >
                      Sesión Curso
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onStartTraining(c.slug)}
                    className="flex-1 py-3 px-4 text-xs font-extrabold uppercase tracking-wider text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors inline-flex items-center justify-center gap-2 shadow-2xs"
                  >
                    <span>INICIAR</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
