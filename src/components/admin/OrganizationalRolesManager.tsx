import React, { useState } from 'react';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Edit3,
  Layers,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CatalogItem, CatalogType } from '../../types/lms.ts';

interface OrganizationalRolesManagerProps {
  catalogs: CatalogItem[];
  adminToken: string | null;
  onRefresh: () => void;
}

export const OrganizationalRolesManager: React.FC<OrganizationalRolesManagerProps> = ({
  catalogs,
  adminToken,
  onRefresh,
}) => {
  const [selectedType, setSelectedType] = useState<CatalogType>('role');
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingCode, setEditingCode] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const rolesList = catalogs.filter((c) => c.type === 'role');
  const areasList = catalogs.filter((c) => c.type === 'area');
  const categoriesList = catalogs.filter((c) => c.type === 'category');

  const activeList = catalogs
    .filter((c) => c.type === selectedType)
    .filter((c) => {
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
    });

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !adminToken) return;
    setSaving(true);
    try {
      const prefix =
        selectedType === 'role' ? 'CARGO' : selectedType === 'area' ? 'AREA' : 'CAT';
      await fetch('/api/admin/catalogs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          type: selectedType,
          name: newName.trim(),
          code:
            newCode.trim() ||
            `${prefix}-${newName
              .trim()
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 5)
              .toUpperCase()}`,
          active: true,
        }),
      });
      setNewName('');
      setNewCode('');
      showToast(
        selectedType === 'role'
          ? `Cargo "${newName.trim()}" agregado al catálogo de la organización.`
          : `Registro "${newName.trim()}" agregado correctamente.`
      );
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim() || !adminToken) return;
    const entries = bulkText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length === 0) return;

    setSaving(true);
    try {
      const prefix =
        selectedType === 'role' ? 'CARGO' : selectedType === 'area' ? 'AREA' : 'CAT';
      for (const itemName of entries) {
        await fetch('/api/admin/catalogs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            type: selectedType,
            name: itemName,
            code: `${prefix}-${itemName
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 5)
              .toUpperCase()}`,
            active: true,
          }),
        });
      }
      setBulkText('');
      setShowBulkModal(false);
      showToast(`Se registraron ${entries.length} elementos en el catálogo organizacional.`);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (item: CatalogItem) => {
    if (!editingName.trim() || !adminToken) return;
    setSaving(true);
    try {
      await fetch('/api/admin/catalogs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          ...item,
          name: editingName.trim(),
          code: editingCode.trim() || item.code,
        }),
      });
      setEditingItemId(null);
      showToast(`"${editingName.trim()}" actualizado correctamente.`);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CatalogItem) => {
    if (!adminToken) return;
    await fetch('/api/admin/catalogs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ...item,
        active: !item.active,
      }),
    });
    onRefresh();
  };

  const handleDelete = async (item: CatalogItem) => {
    if (!adminToken) return;
    await fetch(`/api/admin/catalogs/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    showToast(`"${item.name}" eliminado del catálogo.`);
    onRefresh();
  };

  const typeLabel =
    selectedType === 'role'
      ? 'Cargo de la Organización'
      : selectedType === 'area'
      ? 'Área de la Organización'
      : 'Categoría / Tema Formativo';

  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
      <div className="h-1.5 w-full bg-[#DA291C]" />
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#DA291C] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>ESTRUCTURA ORGANIZACIONAL CONFIGURABLE</span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
              Gestión de Cargos, Áreas y Categorías de la Organización
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Ingresa, edita o importa los cargos según las necesidades de la organización. Los cargos activos aparecen inmediatamente en el formulario de ingreso del participante y en los filtros de reportes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowBulkModal(true)}
            className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-[#DA291C]" />
            <span>Carga múltiple de {selectedType === 'role' ? 'Cargos' : selectedType === 'area' ? 'Áreas' : 'Categorías'}</span>
          </button>
        </div>

        {feedbackMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Selector Tabs: Cargos (Prioritario), Áreas, Categorías */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedType('role')}
              className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                selectedType === 'role'
                  ? 'bg-[#DA291C] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Cargos ({rolesList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('area')}
              className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                selectedType === 'area'
                  ? 'bg-[#DA291C] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Áreas ({areasList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('category')}
              className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                selectedType === 'category'
                  ? 'bg-[#DA291C] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Categorías de Formación ({categoriesList.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Buscar ${selectedType === 'role' ? 'cargo' : 'registro'}...`}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            />
          </div>
        </div>

        {/* Form to add a new Cargo / Área / Categoría */}
        <form
          onSubmit={handleCreateSingle}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 items-end"
        >
          <div className="sm:col-span-6">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Nuevo {typeLabel} *
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                selectedType === 'role'
                  ? 'Ej. Técnico Empalmador FTTH, Supervisor NOC, Líder HSE...'
                  : selectedType === 'area'
                  ? 'Ej. Operaciones de Campo, Ingeniería de Red, Mantenimiento...'
                  : 'Ej. Trabajo en Alturas, Apertura de Cámaras, Mediciones...'
              }
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Código interno (Opcional)
            </label>
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Ej. CARGO-FTTH"
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 px-4 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>
                {selectedType === 'role'
                  ? 'Agregar Cargo'
                  : selectedType === 'area'
                  ? 'Agregar Área'
                  : 'Agregar Categoría'}
              </span>
            </button>
          </div>
        </form>

        {/* Active Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {activeList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No se encontraron registros para el filtro actual.
              </div>
            ) : (
              activeList.map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 text-xs"
                >
                  {editingItemId === item.id ? (
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white flex-1 min-w-[200px]"
                      />
                      <input
                        type="text"
                        value={editingCode}
                        onChange={(e) => setEditingCode(e.target.value)}
                        className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white w-32"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(item)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-[#DA291C] rounded-lg"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingItemId(null)}
                        className="px-2.5 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#DA291C] shrink-0" />
                        <span className="font-bold text-slate-900">{item.name}</span>
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {item.code}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          className={`font-mono text-[11px] px-2.5 py-1 rounded-lg border font-semibold ${
                            item.active
                              ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                              : 'text-slate-500 border-slate-200 bg-slate-100'
                          }`}
                        >
                          {item.active ? 'Activo' : 'Inactivo'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItemId(item.id);
                            setEditingName(item.name);
                            setEditingCode(item.code);
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg"
                          title="Editar nombre"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="p-1.5 text-slate-400 hover:text-[#DA291C] border border-slate-200 rounded-lg"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bulk Upload Modal for Cargos / Áreas */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Ingreso Múltiple de {typeLabel}s
              </h3>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Escribe o pega la lista de {selectedType === 'role' ? 'cargos de la organización' : 'registros'} separados por salto de línea o por comas. Todos quedarán habilitados inmediatamente.
            </p>
            <form onSubmit={handleBulkImport} className="space-y-4">
              <textarea
                rows={6}
                required
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  selectedType === 'role'
                    ? 'Técnico Instalador FTTH\nTécnico de Mantenimiento Planta Externa\nSupervisor de Campo R1\nIngeniero de Certificación Óptica\nLíder de Cuadrilla Alturas'
                    : 'Operaciones de Campo\nPlanta Externa\nAseguramiento de Red'
                }
                className="w-full p-3 text-xs border border-slate-300 rounded-xl font-mono focus:outline-none focus:border-[#DA291C]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg"
                >
                  {saving ? 'Guardando...' : 'Guardar lista en catálogo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
