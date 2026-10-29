import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Category, ImportResult } from '../types';
import { apiService } from '../services/api';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DEFAULT_CATEGORY_COLORS = [
  '#1e3a5f', // Astra Dark Blue
  '#4a9eff', // Astra Light Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#EC4899', // Pink
];

export function CSVImportModal({ isOpen, onClose, onSuccess }: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Category selection & inline creation states
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#1e3a5f');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [importedCategoryName, setImportedCategoryName] = useState<string | null>(null);

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const list = await apiService.getAllCategories();
      setCategories(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('Erro ao carregar categorias no modal CSV:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCategories();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        toast.error('Por favor, selecione um arquivo CSV válido');
        return;
      }
      setFile(selectedFile);
      setImportResult(null);
      setImportedCategoryName(null);
    }
  };

  const handleCreateCategoryInline = async (): Promise<Category | null> => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      toast.error('Informe o nome da nova categoria');
      return null;
    }

    setIsSavingCategory(true);
    try {
      const created = await apiService.createCategory({
        nome: trimmedName,
        cor: newCategoryColor || '#1e3a5f',
        descricao: newCategoryDescription.trim() || undefined,
      });
      setCategories((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
      setSelectedCategoryId(created.id);
      setIsCreatingCategory(false);
      setNewCategoryName('');
      setNewCategoryDescription('');
      window.dispatchEvent(new Event('categories-updated'));
      toast.success(`Categoria "${created.nome}" criada e selecionada!`);
      return created;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar categoria';
      toast.error(errorMessage);
      return null;
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Selecione um arquivo CSV');
      return;
    }

    setIsUploading(true);
    try {
      let targetCategoryId = selectedCategoryId;
      let targetCategoryLabel: string | null = null;

      // Se o usuário estiver com o formulário de "Nova Categoria" aberto e preencheu um nome,
      // criamos a categoria automaticamente antes de importar (ou enviamos na própria importação)
      if (isCreatingCategory && newCategoryName.trim()) {
        const created = await handleCreateCategoryInline();
        if (!created) {
          setIsUploading(false);
          return;
        }
        targetCategoryId = created.id;
        targetCategoryLabel = created.nome;
      } else if (targetCategoryId) {
        const found = categories.find((c) => c.id === targetCategoryId);
        targetCategoryLabel = found ? found.nome : null;
      }

      const result = await apiService.importCSV(file, {
        categoriaId: targetCategoryId || undefined,
      });
      setImportResult(result);
      setImportedCategoryName(targetCategoryLabel);

      if (result.success) {
        toast.success(
          targetCategoryLabel
            ? `Importação concluída! ${result.successfulImports} contatos adicionados na categoria "${targetCategoryLabel}".`
            : `Importação concluída! ${result.successfulImports} contatos importados.`
        );
        onSuccess();
      } else {
        if (result.successfulImports > 0) {
          onSuccess();
        }
        toast(`Importação parcial: ${result.successfulImports} sucessos, ${result.failedImports} erros.`, {
          icon: '⚠️',
          style: {
            border: '1px solid #f59e0b',
            color: '#92400e',
          },
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao importar arquivo';
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiService.downloadCSVTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'template-contatos.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Template baixado com sucesso!');
    } catch (error) {
      console.error('Erro ao baixar template:', error);
      toast.error('Erro ao baixar template CSV');
    }
  };

  const handleClose = () => {
    setFile(null);
    setImportResult(null);
    setImportedCategoryName(null);
    setIsCreatingCategory(false);
    setNewCategoryName('');
    setNewCategoryDescription('');
    onClose();
  };

  const selectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl border border-gray-100 my-8" role="dialog" aria-labelledby="import-title">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 id="import-title" className="text-xl font-bold text-gray-900">
                Importar Contatos via CSV
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Importe múltiplos contatos e organize-os em uma categoria
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Fechar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Template Download */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-blue-900 text-sm">Template CSV</h3>
                  <p className="text-xs text-blue-700 mt-1">
                    Baixe o template com o formato correto
                  </p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
                  style={{ backgroundColor: 'var(--astra-dark-blue)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Baixar
                </button>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700 mb-2">
                1. Selecionar arquivo CSV
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="csv-file" className="cursor-pointer block">
                  <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600 font-medium">Clique para selecionar o arquivo CSV</p>
                  <p className="text-xs text-gray-400 mt-1">Formato: .csv (máx. 5MB)</p>
                </label>
              </div>
              {file && (
                <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-green-700 font-medium truncate">
                      {file.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-xs text-green-700 hover:text-green-900 underline ml-2"
                  >
                    Trocar
                  </button>
                </div>
              )}
            </div>

            {/* Category Selection or Inline Creation */}
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/60 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <label htmlFor="csv-category-select" className="block text-sm font-medium text-gray-800">
                    2. Categoria da Lista Importada <span className="text-xs font-normal text-gray-500">(opcional)</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Vincule todos os contatos importados a uma categoria existente ou crie uma nova agora
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCategory((prev) => !prev);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                    isCreatingCategory
                      ? 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  {isCreatingCategory ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Usar existente
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Nova Categoria
                    </>
                  )}
                </button>
              </div>

              {!isCreatingCategory ? (
                <div className="space-y-2">
                  <select
                    id="csv-category-select"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    disabled={loadingCategories}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">
                      {loadingCategories
                        ? 'Carregando categorias...'
                        : 'Sem categoria fixa (ou usar coluna categoriaId do CSV)'}
                    </option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nome}
                      </option>
                    ))}
                  </select>

                  {selectedCategoryObj && (
                    <div className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: selectedCategoryObj.cor || '#1e3a5f' }}
                        />
                        <span className="text-xs font-medium text-gray-800">
                          Os contatos importados entrarão em: <strong>{selectedCategoryObj.nome}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryId('')}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-indigo-200 rounded-xl p-3.5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">
                      Criar Nova Categoria para esta Lista
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nome da Categoria *
                    </label>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Leads Campanha Outubro, Clientes VIP..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Cor da Categoria
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {DEFAULT_CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewCategoryColor(color)}
                          className={`w-6 h-6 rounded-lg transition-transform ${
                            newCategoryColor === color
                              ? 'ring-2 ring-offset-1 ring-gray-800 scale-110'
                              : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                      <input
                        type="color"
                        value={newCategoryColor}
                        onChange={(e) => setNewCategoryColor(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-gray-300"
                        title="Escolher cor personalizada"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Descrição <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={newCategoryDescription}
                      onChange={(e) => setNewCategoryDescription(e.target.value)}
                      placeholder="Ex: Lista importada via CSV"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-gray-500">
                      Você pode clicar em <strong>Criar e Selecionar</strong> agora ou clicar direto em <strong>Importar</strong> abaixo.
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateCategoryInline}
                      disabled={isSavingCategory || !newCategoryName.trim()}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap ml-2"
                    >
                      {isSavingCategory ? 'Criando...' : 'Criar e Selecionar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Import Instructions */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <h3 className="font-medium text-gray-900 text-sm mb-2">ℹ️ Instruções</h3>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Colunas obrigatórias: <strong>nome</strong> e <strong>telefone</strong></li>
                <li>• Opcionais: email, observacoes, tags, categoriaId</li>
                <li>• Se uma categoria for escolhida acima, todos os contatos importados serão adicionados a ela automaticamente</li>
              </ul>
            </div>

            {/* Import Result */}
            {importResult && (
              <div className={`border rounded-lg p-4 ${importResult.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <h3 className={`font-medium text-sm mb-2 ${importResult.success ? 'text-green-900' : 'text-yellow-900'}`}>
                  {importResult.success ? '✅' : '⚠️'} Resultado da Importação
                </h3>
                {importedCategoryName && (
                  <div className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-800">
                    <span>📂 Categoria vinculada:</span>
                    <strong>{importedCategoryName}</strong>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-white rounded p-2 text-center">
                    <div className="text-lg font-bold text-gray-900">{importResult.totalRows}</div>
                    <div className="text-xs text-gray-600">Total</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="text-lg font-bold text-green-600">{importResult.successfulImports}</div>
                    <div className="text-xs text-gray-600">Sucessos</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="text-lg font-bold text-red-600">{importResult.failedImports}</div>
                    <div className="text-xs text-gray-600">Erros</div>
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <details className="cursor-pointer">
                    <summary className="text-xs font-medium text-red-700 hover:text-red-800">Ver erros ({importResult.errors.length})</summary>
                    <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 max-h-32 overflow-y-auto">
                      {importResult.errors.map((error, index) => (
                        <div key={index} className="text-xs text-red-600 py-1">{error}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleClose}
              className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 font-medium transition-colors text-sm"
            >
              Fechar
            </button>
            <button
              onClick={handleImport}
              disabled={!file || isUploading || isSavingCategory}
              className="btn-primary flex-1 py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Importando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  Importar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
