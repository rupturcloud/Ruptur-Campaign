import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { UazapiPhonePreview } from './UazapiPhonePreview';

export const uazapiLabels: Record<string, string> = {
  button: 'Botões', list: 'Lista', poll: 'Enquete', carousel: 'Carrossel',
  location_button: 'Solicitar localização', contact: 'Compartilhar contato', location: 'Localização',
  payment: 'Solicitação de pagamento', pix_button: 'Botão PIX', status: 'Status',
  text: 'Texto', image: 'Imagem', video: 'Vídeo', videoplay: 'Vídeo com reprodução',
  document: 'Documento', audio: 'Áudio', myaudio: 'Áudio próprio', ptt: 'Mensagem de voz', ptv: 'Vídeo circular', sticker: 'Figurinha',
};

const style = 'w-full p-2 border border-gray-300 rounded-lg text-sm';

export function UazapiConfig({ value, onChange, showPreview = true }: { value: any; onChange: (value: any) => void; showPreview?: boolean }) {
  const c = value || { type: 'button', headerText: '', text: '', choices: [''] };
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const headerInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const footerInputRef = useRef<HTMLInputElement | null>(null);

  const set = (key: string, v: any) => onChange({ ...c, [key]: v });

  const uploadMedia = async (file: File, fieldKey: string, onUploaded: (url: string, name: string) => void) => {
    setUploadingField(fieldKey);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd, headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao enviar arquivo');
      }
      const data = await res.json();
      const fullUrl = data.fileUrl?.startsWith('/') ? `${window.location.origin}${data.fileUrl}` : data.fileUrl;
      onUploaded(fullUrl, data.originalName || file.name);
      toast.success('Arquivo enviado com sucesso!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro no upload');
    } finally {
      setUploadingField(null);
    }
  };

  const reorderButtons = (from: number, to: number) => {
    const buttons = [...(c.buttons || [])];
    const [button] = buttons.splice(from, 1);
    buttons.splice(to, 0, button);
    set('buttons', buttons);
  };

  const field = (key: string, label: string, numeric = false) => (
    <label key={key} className="block text-sm text-gray-700">
      {label}
      <input
        className={style}
        type={numeric ? 'number' : 'text'}
        step="any"
        value={c[key] ?? ''}
        onChange={e => set(key, numeric ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
      />
    </label>
  );

  const toggle = (key: string, label: string) => (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={!!c[key]} onChange={e => set(key, e.target.checked)} />
      {label}
    </label>
  );

  const media = ['image', 'video', 'videoplay', 'document', 'audio', 'myaudio', 'ptt', 'ptv', 'sticker'].includes(c.type);
  const supportsHeader = ['button', 'list', 'poll', 'text', 'image', 'video', 'videoplay', 'document', 'carousel'].includes(c.type);

  const addBlock = (block: 'header' | 'text' | 'image' | 'buttons' | 'footer') => {
    if (block === 'header') {
      onChange({ ...c, headerText: c.headerText ?? '' });
      setTimeout(() => headerInputRef.current?.focus(), 50);
      return;
    }
    if (block === 'text') {
      onChange({ ...c, text: c.text ?? '' });
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }
    if (block === 'footer') {
      onChange({ ...c, footerText: c.footerText ?? '' });
      setTimeout(() => footerInputRef.current?.focus(), 50);
      return;
    }
    if (block === 'image') {
      if ((c.buttons && c.buttons.length > 0) || c.type === 'button') {
        return onChange({
          ...c,
          type: 'button',
          headerText: c.headerText ?? '',
          text: c.text ?? '',
          buttons: c.buttons?.length ? c.buttons : [{ kind: 'reply', text: '', value: '' }],
          imageButton: c.imageButton || c.file || '',
        });
      }
      return onChange({
        ...c,
        type: media ? c.type : 'image',
        headerText: c.headerText ?? '',
        text: c.text ?? '',
        file: c.file || c.imageButton || '',
      });
    }
    return onChange({
      ...c,
      type: 'button',
      headerText: c.headerText ?? '',
      text: c.text ?? '',
      imageButton: c.imageButton || (c.type === 'image' ? c.file : '') || '',
      buttons: [...(c.buttons || []), { kind: 'reply', text: '', value: '' }],
    });
  };

  const handleTypeChange = (newType: string) => {
    const preserved: any = {
      type: newType,
      ...(c.headerText !== undefined ? { headerText: c.headerText } : {}),
      ...(c.text !== undefined ? { text: c.text } : { text: '' }),
      ...(c.footerText !== undefined ? { footerText: c.footerText } : {}),
    };
    if (newType === 'button') {
      preserved.buttons = c.buttons?.length ? c.buttons : [{ kind: 'reply', text: '', value: '' }];
      if (c.imageButton || (c.type === 'image' && c.file)) {
        preserved.imageButton = c.imageButton || c.file;
      }
    } else if (['list', 'poll'].includes(newType)) {
      preserved.choices = c.choices?.length ? c.choices : [''];
    } else if (newType === 'carousel') {
      preserved.carousel = c.carousel?.length ? c.carousel : [{ headerText: '', text: '', image: '', buttons: [{ type: 'REPLY', text: '', id: '' }] }];
    } else if (['image', 'video', 'videoplay', 'document', 'audio', 'myaudio', 'ptt', 'ptv', 'sticker'].includes(newType)) {
      preserved.file = c.file || c.imageButton || '';
      if (newType === 'document' && c.docName) preserved.docName = c.docName;
    }
    onChange(preserved);
  };

  return (
    <div className={showPreview ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_272px]' : 'space-y-4'}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Use uma conexão Uazapi no início do fluxo. Cada mensagem será enviada ao contato da campanha. Variáveis: {'{{nome}}, {{telefone}}'}.
        </p>

        {/* Barra de blocos da mensagem */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm text-emerald-900">Blocos desta mensagem</strong>
            <details className="relative">
              <summary className="cursor-pointer rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                + Adicionar bloco
              </summary>
              <div className="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded border bg-white p-1 shadow-lg">
                <button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50 font-medium text-emerald-900" onClick={() => addBlock('header')}>
                  📌 Cabeçalho (Header)
                </button>
                <button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => addBlock('text')}>
                  📝 Texto / Corpo
                </button>
                <button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => addBlock('image')}>
                  🖼️ Imagem / Mídia
                </button>
                <button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => addBlock('buttons')}>
                  🔘 Botões e links
                </button>
                <button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => addBlock('footer')}>
                  📎 Rodapé
                </button>
              </div>
            </details>
          </div>

          {/* Botões rápidos de inserção/edição de blocos */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => addBlock('header')}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                c.headerText || c.title
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              📌 {c.headerText || c.title ? 'Cabeçalho ativo' : '+ Cabeçalho'}
            </button>
            <button
              type="button"
              onClick={() => addBlock('text')}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                c.text
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              📝 {c.text ? 'Texto ativo' : '+ Texto'}
            </button>
            <button
              type="button"
              onClick={() => addBlock('image')}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                c.imageButton || c.file
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              🖼️ {c.imageButton || c.file ? 'Mídia ativa' : '+ Imagem / Mídia'}
            </button>
            <button
              type="button"
              onClick={() => addBlock('buttons')}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                (c.buttons || []).length > 0
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              🔘 {(c.buttons || []).length > 0 ? `${(c.buttons || []).length} botão(ões)` : '+ Botões'}
            </button>
            <button
              type="button"
              onClick={() => addBlock('footer')}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                c.footerText
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              📎 {c.footerText ? 'Rodapé ativo' : '+ Rodapé'}
            </button>
          </div>

          <p className="mt-2 text-xs text-emerald-800">
            {c.headerText || c.title ? 'Com cabeçalho' : 'Sem cabeçalho'} · {c.text ? 'Com texto' : 'Sem texto'} · {c.imageButton || c.file ? 'Com mídia' : 'Sem mídia'} · {(c.buttons || []).length} botão(ões). Cabeçalho, texto, mídia e botões são unidos na composição Uazapi.
          </p>
        </div>

        {/* Seletor de Tipo de Mensagem */}
        <label className="block text-sm font-medium text-gray-700">
          Tipo de mensagem
          <select className={`${style} mt-1`} value={c.type} onChange={e => handleTypeChange(e.target.value)}>
            {Object.entries(uazapiLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>

        {/* BLOCO DE CABEÇALHO (HEADER) - Disponível para Mídia, Texto e Botões */}
        {supportsHeader && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                <span>📌</span> Cabeçalho (Header da mensagem)
              </label>
              {(c.headerText || c.title) && (
                <button
                  type="button"
                  onClick={() => onChange({ ...c, headerText: '', title: undefined })}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Limpar cabeçalho
                </button>
              )}
            </div>
            <input
              ref={headerInputRef}
              className={style}
              type="text"
              placeholder="Digite o cabeçalho em destaque no topo (ex: 🔥 OFERTA ESPECIAL — Olá {{nome}})"
              value={c.headerText ?? c.title ?? ''}
              onChange={e => set('headerText', e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">Inserir no cabeçalho:</span>
              {['{{nome}}', '{{telefone}}'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('headerText', `${c.headerText || ''}${v}`)}
                  className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200 font-medium"
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Quando for Botões, permitir também Imagem de Cabeçalho acima dos botões */}
            {c.type === 'button' && (
              <div className="pt-2 border-t border-blue-200/70 space-y-1.5">
                <label className="block text-xs font-semibold text-blue-900">
                  🖼️ Imagem de Cabeçalho (acima do texto e botões — opcional)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className={style}
                    placeholder="Cole a URL da imagem (https://...) ou faça upload ao lado"
                    value={c.imageButton || ''}
                    onChange={e => set('imageButton', e.target.value)}
                  />
                  <label className="shrink-0 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium cursor-pointer hover:bg-blue-700">
                    {uploadingField === 'imageButton' ? 'Enviando...' : '📁 Upload Imagem'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingField === 'imageButton'}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadMedia(f, 'imageButton', (url) => set('imageButton', url));
                      }}
                    />
                  </label>
                  {c.imageButton && (
                    <button
                      type="button"
                      onClick={() => set('imageButton', '')}
                      className="shrink-0 px-2.5 py-2 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BLOCO DE MÍDIA (quando o tipo é Imagem, Vídeo, Documento, Áudio, etc.) */}
        {media && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              🖼️ Arquivo de Mídia ({uazapiLabels[c.type]})
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className={style}
                placeholder="URL do arquivo (https://...) ou faça upload ao lado"
                value={c.file || ''}
                onChange={e => set('file', e.target.value)}
              />
              <label className="shrink-0 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium cursor-pointer hover:bg-emerald-800">
                {uploadingField === 'file' ? 'Enviando...' : '📁 Fazer Upload'}
                <input
                  type="file"
                  accept={
                    c.type === 'image' || c.type === 'sticker' ? 'image/*' :
                    c.type.includes('video') || c.type === 'ptv' ? 'video/*' :
                    c.type.includes('audio') || c.type === 'ptt' ? 'audio/*' :
                    '*/*'
                  }
                  className="hidden"
                  disabled={uploadingField === 'file'}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      uploadMedia(f, 'file', (url, name) => {
                        onChange({ ...c, file: url, ...(c.type === 'document' && !c.docName ? { docName: name } : {}) });
                      });
                    }
                  }}
                />
              </label>
              {c.file && (
                <button
                  type="button"
                  onClick={() => set('file', '')}
                  className="shrink-0 px-2.5 py-2 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50"
                >
                  Remover
                </button>
              )}
            </div>
            {c.type === 'document' && field('docName', 'Nome do documento')}
          </div>
        )}

        {/* BLOCO DE TEXTO / LEGENDA */}
        {!['contact', 'location', 'pix_button'].includes(c.type) && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              📝 Texto / Legenda da mensagem
              <textarea
                ref={textInputRef}
                className={`${style} mt-1`}
                rows={3}
                placeholder="Digite o corpo do texto ou legenda... Use {{nome}}, {{telefone}}"
                value={c.text || ''}
                onChange={e => set('text', e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">Variáveis no texto:</span>
              {['{{nome}}', '{{telefone}}'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('text', `${c.text || ''}${v}`)}
                  className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 font-medium border border-gray-300"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* BLOCO DE BOTÕES / LISTA / ENQUETE */}
        {['button', 'list', 'poll'].includes(c.type) && (
          <>
            {c.type === 'button' ? (
              <div className="space-y-2 rounded-lg border border-gray-200 p-3 bg-white">
                <p className="text-sm font-semibold text-gray-800">🔘 Botões da mensagem</p>
                {(c.buttons || []).map((button: any, index: number) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_auto] gap-2 rounded border p-2 bg-gray-50">
                    <input
                      className={style}
                      placeholder="Texto do botão"
                      value={button.text || ''}
                      onChange={e => {
                        const buttons = [...c.buttons];
                        buttons[index] = { ...button, text: e.target.value };
                        set('buttons', buttons);
                      }}
                    />
                    <select
                      className={style}
                      value={button.kind || 'reply'}
                      onChange={e => {
                        const buttons = [...c.buttons];
                        buttons[index] = { ...button, kind: e.target.value, value: e.target.value === 'url' ? 'https://' : '' };
                        set('buttons', buttons);
                      }}
                    >
                      <option value="reply">Resposta</option>
                      <option value="url">Link</option>
                      <option value="copy">Copiar</option>
                    </select>
                    <input
                      className={style}
                      placeholder={button.kind === 'url' ? 'https://...' : 'ID / Valor de resposta'}
                      value={button.value || ''}
                      onChange={e => {
                        const buttons = [...c.buttons];
                        buttons[index] = { ...button, value: e.target.value };
                        set('buttons', buttons);
                      }}
                    />
                    <button
                      type="button"
                      className="min-h-10 rounded border border-red-200 px-3 text-red-600 text-xs hover:bg-red-50"
                      onClick={() => set('buttons', c.buttons.filter((_: any, i: number) => i !== index))}
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm font-medium text-[#008069] hover:underline"
                  onClick={() => set('buttons', [...(c.buttons || []), { kind: 'reply', text: '', value: '' }])}
                >
                  + Adicionar botão
                </button>
                <p className="text-xs text-gray-500">
                  Arraste os botões diretamente no preview para alterar sua ordem. Botões de link usam URL HTTPS.
                </p>
              </div>
            ) : (
              <>
                <label className="block text-sm">
                  Opções (uma por linha)
                  <textarea
                    className={style}
                    rows={5}
                    value={(c.choices || []).join('\n')}
                    onChange={e => set('choices', e.target.value.split('\n'))}
                  />
                </label>
                <p className="text-xs text-gray-500">Listas: Texto|identificador|descrição; use [Seção] para agrupar opções.</p>
              </>
            )}
            {c.type === 'list' && field('listButton', 'Texto do botão da lista')}
            {c.type === 'poll' && field('selectableCount', 'Quantidade de opções selecionáveis', true)}
          </>
        )}

        {/* BLOCO DE RODAPÉ (para Botões, Lista, Texto e Mídia) */}
        {['button', 'list', 'poll', 'text', 'image', 'video', 'videoplay', 'document'].includes(c.type) && (
          <label className="block text-sm text-gray-700">
            📎 Rodapé (opcional)
            <input
              ref={footerInputRef}
              className={`${style} mt-1`}
              type="text"
              placeholder="Texto discreto no rodapé da mensagem..."
              value={c.footerText ?? ''}
              onChange={e => set('footerText', e.target.value)}
            />
          </label>
        )}

        {/* CARROSSEL */}
        {c.type === 'carousel' && (
          <div className="space-y-3">
            {(c.carousel || []).map((card: any, i: number) => {
              const update = (patch: any) => set('carousel', c.carousel.map((item: any, j: number) => j === i ? { ...item, ...patch } : item));
              return (
                <fieldset key={i} className="border rounded-lg p-3 space-y-2 bg-white">
                  <legend className="px-2 text-sm font-semibold text-gray-700">Cartão {i + 1}</legend>
                  <label className="block text-sm font-medium text-blue-900">
                    📌 Cabeçalho do cartão (opcional)
                    <input
                      className={style}
                      placeholder="Título em destaque do cartão..."
                      value={card.headerText || ''}
                      onChange={e => update({ headerText: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    Texto do cartão
                    <textarea className={style} value={card.text || ''} onChange={e => update({ text: e.target.value })} />
                  </label>
                  <div className="space-y-1">
                    <label className="block text-sm">Imagem do cartão (URL ou Upload)</label>
                    <div className="flex gap-2">
                      <input className={style} value={card.image || ''} placeholder="https://..." onChange={e => update({ image: e.target.value })} />
                      <label className="shrink-0 inline-flex items-center justify-center px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium cursor-pointer hover:bg-emerald-800">
                        {uploadingField === `card-${i}` ? 'Enviando...' : '📁 Upload'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === `card-${i}`}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) uploadMedia(f, `card-${i}`, (url) => update({ image: url }));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  {(card.buttons || []).map((button: any, j: number) => {
                    const updateButton = (patch: any) => update({ buttons: card.buttons.map((b: any, k: number) => k === j ? { ...b, ...patch } : b) });
                    return (
                      <div key={j} className="space-y-1 border-t pt-2">
                        <label className="block text-sm">
                          Ação
                          <select className={style} value={button.type} onChange={e => updateButton({ type: e.target.value })}>
                            {[['REPLY', 'Resposta'], ['URL', 'Abrir site'], ['COPY', 'Copiar'], ['CALL', 'Ligar']].map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          Texto do botão
                          <input className={style} value={button.text} onChange={e => updateButton({ text: e.target.value })} />
                        </label>
                        <label className="block text-sm">
                          Resposta, URL, texto ou telefone
                          <input className={style} value={button.id} onChange={e => updateButton({ id: e.target.value })} />
                        </label>
                        <button type="button" className="text-sm text-red-600" onClick={() => update({ buttons: card.buttons.filter((_: any, k: number) => k !== j) })}>
                          Remover botão
                        </button>
                      </div>
                    );
                  })}
                  <button type="button" className="text-sm text-blue-700" onClick={() => update({ buttons: [...(card.buttons || []), { type: 'REPLY', text: '', id: '' }] })}>
                    + Adicionar botão
                  </button>
                  <button type="button" className="block text-sm text-red-600" onClick={() => set('carousel', c.carousel.filter((_: any, j: number) => j !== i))}>
                    Remover cartão
                  </button>
                </fieldset>
              );
            })}
            <button type="button" className="text-sm font-medium text-blue-700" onClick={() => set('carousel', [...(c.carousel || []), { headerText: '', text: '', image: '', buttons: [{ type: 'REPLY', text: '', id: '' }] }])}>
              + Adicionar cartão
            </button>
          </div>
        )}

        {c.type === 'contact' && <>{field('fullName', 'Nome completo')}{field('phoneNumber', 'Telefone do contato')}{field('organization', 'Organização')}{field('email', 'Email')}{field('url', 'Site')}</>}
        {c.type === 'location' && <>{field('latitude', 'Latitude', true)}{field('longitude', 'Longitude', true)}{field('name', 'Nome do local')}{field('address', 'Endereço')}</>}
        {c.type === 'payment' && <>{field('amount', 'Valor (R$)', true)}{field('title', 'Título')}{field('itemName', 'Item')}{field('invoiceNumber', 'Número da fatura')}{field('paymentLink', 'Link de pagamento')}{field('boletoCode', 'Linha digitável do boleto')}{field('fileUrl', 'URL do boleto')}{field('fileName', 'Nome do arquivo')}</>}
        {['payment', 'pix_button'].includes(c.type) && <>{field('pixKey', 'Chave PIX')}{field('pixName', 'Nome do recebedor')}<label className="block text-sm">Tipo da chave<select className={style} value={c.pixType || ''} onChange={e => set('pixType', e.target.value)}><option value="">Selecione</option>{['CPF', 'CNPJ', 'PHONE', 'EMAIL', 'EVP'].map(t => <option key={t}>{t}</option>)}</select></label></>}
        {c.type === 'status' && <><p className="text-sm text-gray-500">O status terá como audiência somente o contato atual da campanha.</p><label className="block text-sm">Formato<select className={style} value={c.statusType || 'text'} onChange={e => set('statusType', e.target.value)}>{['text', 'image', 'video', 'audio', 'myaudio', 'ptt'].map(t => <option key={t} value={t}>{uazapiLabels[t]}</option>)}</select></label>{c.statusType && c.statusType !== 'text' ? field('file', 'URL do arquivo') : <>{field('background_color', 'Cor de fundo (1 a 19)', true)}{field('font', 'Fonte (0, 1, 2, 6, 7, 8, 9 ou 10)', true)}</>}</>}
        {c.type !== 'status' && <>{field('delay', 'Tempo de presença antes do envio (ms)', true)}{field('replyid', 'ID da mensagem para responder')}</>}

        <details className="rounded-lg border border-slate-200 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Opções avançadas da Uazapi</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {c.type !== 'status' && <>{field('mentions', 'Menções (JIDs separados por vírgula)')}{field('track_id', 'Identificador de rastreio')}{toggle('readchat', 'Marcar chat como lido')}{toggle('readmessages', 'Marcar mensagens como lidas')}{toggle('forward', 'Marcar como encaminhada')}{media && toggle('viewOnce', 'Visualização única')}</>}
            {c.type === 'text' && <>{toggle('linkPreview', 'Exibir prévia do link')}{toggle('linkPreviewLarge', 'Prévia grande')}{field('linkPreviewTitle', 'Título da prévia')}{field('linkPreviewDescription', 'Descrição da prévia')}{field('linkPreviewImage', 'Imagem da prévia (URL)')}</>}
            {c.type === 'status' && <>{field('thumbnail', 'Miniatura (URL)')}{field('mimetype', 'MIME type')}{field('max_recipients', 'Máximo de destinatários', true)}</>}
          </div>
        </details>
      </div>
      {showPreview && <UazapiPhonePreview composition={c} onReorderButtons={c.type === 'button' ? reorderButtons : undefined} />}
    </div>
  );
}
