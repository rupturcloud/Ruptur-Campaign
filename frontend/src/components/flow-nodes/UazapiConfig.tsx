export const uazapiLabels: Record<string, string> = {
  button: 'Botões', list: 'Lista', poll: 'Enquete', carousel: 'Carrossel',
  location_button: 'Solicitar localização', contact: 'Compartilhar contato', location: 'Localização',
  payment: 'Solicitação de pagamento', pix_button: 'Botão PIX', status: 'Status',
  text: 'Texto', image: 'Imagem', video: 'Vídeo', videoplay: 'Vídeo com reprodução',
  document: 'Documento', audio: 'Áudio', myaudio: 'Áudio próprio', ptt: 'Mensagem de voz', ptv: 'Vídeo circular', sticker: 'Figurinha',
};
const style = 'w-full p-2 border border-gray-300 rounded-lg text-sm';
export function UazapiConfig({ value, onChange, showPreview = true }: { value: any; onChange: (value: any) => void; showPreview?: boolean }) {
  const c = value || { type: 'button', text: '', choices: [''] };
  const set = (key: string, v: any) => onChange({ ...c, [key]: v });
  const reorderButtons = (from: number, to: number) => { const buttons = [...(c.buttons || [])]; const [button] = buttons.splice(from, 1); buttons.splice(to, 0, button); set('buttons', buttons); };
  const field = (key: string, label: string, numeric = false) => <label key={key} className="block text-sm text-gray-700">{label}<input className={style} type={numeric ? 'number' : 'text'} step="any" value={c[key] ?? ''} onChange={e => set(key, numeric ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)} /></label>;
  const toggle = (key: string, label: string) => <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={!!c[key]} onChange={e => set(key, e.target.checked)} />{label}</label>;
  const media = ['image', 'video', 'videoplay', 'document', 'audio', 'myaudio', 'ptt', 'ptv', 'sticker'].includes(c.type);
  const addBlock = (block: 'text' | 'image' | 'buttons') => {
    if (block === 'text') return onChange({ ...c, text: c.text || '' });
    // Uazapi /send/menu is the documented composition that carries text, imageButton and choices together.
    if (block === 'image') return onChange({ ...c, type: 'button', text: c.text || '', buttons: c.buttons || [{ kind: 'reply', text: '', value: '' }], imageButton: c.imageButton || '' });
    return onChange({ ...c, type: 'button', text: c.text || '', buttons: [...(c.buttons || []), { kind: 'reply', text: '', value: '' }] });
  };
  return <div className={showPreview ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_272px]' : 'space-y-4'}>
  <div className="space-y-4">
    <p className="text-sm text-gray-500">Use uma conexão Uazapi no início do fluxo. Cada mensagem será enviada ao contato da campanha. Variáveis: {'{{nome}}, {{telefone}}'}.</p>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-emerald-900">Blocos desta mensagem</strong><details className="relative"><summary className="cursor-pointer rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white">Adicionar bloco</summary><div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded border bg-white p-1 shadow-lg"><button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => addBlock('text')}>Texto</button><button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => addBlock('image')}>Imagem</button><button type="button" className="rounded px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => addBlock('buttons')}>Botões e links</button></div></details></div>
      <p className="mt-2 text-xs text-emerald-800">{c.text !== undefined ? 'Texto' : 'Sem texto'} · {c.imageButton ? 'Imagem' : 'Sem imagem'} · {(c.buttons || []).length} botão(ões). Texto, imagem e botões são unidos na mesma composição Uazapi.</p>
    </div>
    <label className="block text-sm">Tipo de mensagem<select className={style} value={c.type} onChange={e => onChange({ type: e.target.value, ...(e.target.value === 'button' ? { text: '', buttons: [{ kind: 'reply', text: '', value: '' }] } : ['list', 'poll'].includes(e.target.value) ? { text: '', choices: [''] } : {}), ...(e.target.value === 'carousel' ? { text: '', carousel: [{ text: '', buttons: [{ type: 'REPLY', text: '', id: '' }] }] } : {}) })}>{Object.entries(uazapiLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {!['contact', 'location', 'pix_button'].includes(c.type) && <label className="block text-sm">Texto / legenda<textarea className={style} rows={3} value={c.text || ''} onChange={e => set('text', e.target.value)} /></label>}
    {['button', 'list', 'poll'].includes(c.type) && <>
      {c.type === 'button' ? <div className="space-y-2"><p className="text-sm font-medium text-gray-700">Botões da mensagem</p>{(c.buttons || []).map((button: any, index: number) => <div key={index} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_auto] gap-2 rounded border p-2"><input className={style} placeholder="Texto" value={button.text || ''} onChange={e => { const buttons = [...c.buttons]; buttons[index] = { ...button, text: e.target.value }; set('buttons', buttons); }} /><select className={style} value={button.kind || 'reply'} onChange={e => { const buttons = [...c.buttons]; buttons[index] = { ...button, kind: e.target.value, value: e.target.value === 'url' ? 'https://' : '' }; set('buttons', buttons); }}><option value="reply">Resposta</option><option value="url">Link</option><option value="copy">Copiar</option></select><input className={style} placeholder={button.kind === 'url' ? 'https://...' : 'Destino'} value={button.value || ''} onChange={e => { const buttons = [...c.buttons]; buttons[index] = { ...button, value: e.target.value }; set('buttons', buttons); }} /><button type="button" className="min-h-10 rounded border border-red-200 px-3 text-red-600" onClick={() => set('buttons', c.buttons.filter((_: any, i: number) => i !== index))}>Remover</button></div>)}<button type="button" className="text-sm font-medium text-[#008069]" onClick={() => set('buttons', [...(c.buttons || []), { kind: 'reply', text: '', value: '' }])}>+ Adicionar botão</button><p className="text-xs text-gray-500">Arraste os botões diretamente no preview para alterar sua ordem. Botões de link usam URL HTTPS.</p></div> : <><label className="block text-sm">Opções (uma por linha)<textarea className={style} rows={5} value={(c.choices || []).join('\n')} onChange={e => set('choices', e.target.value.split('\n'))} /></label><p className="text-xs text-gray-500">Listas: Texto|identificador|descrição; use [Seção] para agrupar opções.</p></>}
      {field('footerText', 'Rodapé')}
      {c.type === 'button' && <><label className="block text-sm font-medium text-gray-700">Imagem acima dos botões<input className={style} placeholder="https://..." value={c.imageButton || ''} onChange={e => set('imageButton', e.target.value)} /></label><p className="text-xs text-gray-500">A Uazapi envia a imagem e os múltiplos botões na mesma mensagem.</p></>}
      {c.type === 'list' && field('listButton', 'Texto do botão da lista')}
      {c.type === 'poll' && field('selectableCount', 'Quantidade de opções selecionáveis', true)}
    </>}
    {c.type === 'carousel' && <div className="space-y-3">{(c.carousel || []).map((card: any, i: number) => {
      const update = (patch: any) => set('carousel', c.carousel.map((item: any, j: number) => j === i ? { ...item, ...patch } : item));
      return <fieldset key={i} className="border rounded p-2 space-y-2"><legend>Cartão {i + 1}</legend>
        <label className="block text-sm">Texto<textarea className={style} value={card.text} onChange={e => update({ text: e.target.value })} /></label>
        <label className="block text-sm">URL da imagem<input className={style} value={card.image || ''} onChange={e => update({ image: e.target.value })} /></label>
        {(card.buttons || []).map((button: any, j: number) => {
          const updateButton = (patch: any) => update({ buttons: card.buttons.map((b: any, k: number) => k === j ? { ...b, ...patch } : b) });
          return <div key={j} className="space-y-1 border-t pt-2"><label className="block text-sm">Ação<select className={style} value={button.type} onChange={e => updateButton({ type: e.target.value })}>{[['REPLY', 'Resposta'], ['URL', 'Abrir site'], ['COPY', 'Copiar'], ['CALL', 'Ligar']].map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="block text-sm">Texto do botão<input className={style} value={button.text} onChange={e => updateButton({ text: e.target.value })} /></label>
            <label className="block text-sm">Resposta, URL, texto ou telefone<input className={style} value={button.id} onChange={e => updateButton({ id: e.target.value })} /></label>
            <button type="button" className="text-sm text-red-600" onClick={() => update({ buttons: card.buttons.filter((_: any, k: number) => k !== j) })}>Remover botão</button>
          </div>;
        })}
        <button type="button" className="text-sm text-blue-700" onClick={() => update({ buttons: [...card.buttons, { type: 'REPLY', text: '', id: '' }] })}>Adicionar botão</button>
        <button type="button" className="block text-sm text-red-600" onClick={() => set('carousel', c.carousel.filter((_: any, j: number) => j !== i))}>Remover cartão</button>
      </fieldset>;
    })}<button type="button" className="text-sm text-blue-700" onClick={() => set('carousel', [...(c.carousel || []), { text: '', buttons: [{ type: 'REPLY', text: '', id: '' }] }])}>Adicionar cartão</button></div>}
    {c.type === 'contact' && <>{field('fullName', 'Nome completo')}{field('phoneNumber', 'Telefone do contato')}{field('organization', 'Organização')}{field('email', 'Email')}{field('url', 'Site')}</>}
    {c.type === 'location' && <>{field('latitude', 'Latitude', true)}{field('longitude', 'Longitude', true)}{field('name', 'Nome do local')}{field('address', 'Endereço')}</>}
    {c.type === 'payment' && <>{field('amount', 'Valor (R$)', true)}{field('title', 'Título')}{field('itemName', 'Item')}{field('invoiceNumber', 'Número da fatura')}{field('paymentLink', 'Link de pagamento')}{field('boletoCode', 'Linha digitável do boleto')}{field('fileUrl', 'URL do boleto')}{field('fileName', 'Nome do arquivo')}</>}
    {['payment', 'pix_button'].includes(c.type) && <>{field('pixKey', 'Chave PIX')}{field('pixName', 'Nome do recebedor')}<label className="block text-sm">Tipo da chave<select className={style} value={c.pixType || ''} onChange={e => set('pixType', e.target.value)}><option value="">Selecione</option>{['CPF', 'CNPJ', 'PHONE', 'EMAIL', 'EVP'].map(t => <option key={t}>{t}</option>)}</select></label></>}
    {c.type === 'status' && <><p className="text-sm text-gray-500">O status terá como audiência somente o contato atual da campanha.</p><label className="block text-sm">Formato<select className={style} value={c.statusType || 'text'} onChange={e => set('statusType', e.target.value)}>{['text', 'image', 'video', 'audio', 'myaudio', 'ptt'].map(t => <option key={t} value={t}>{uazapiLabels[t]}</option>)}</select></label>{c.statusType && c.statusType !== 'text' ? field('file', 'URL do arquivo') : <>{field('background_color', 'Cor de fundo (1 a 19)', true)}{field('font', 'Fonte (0, 1, 2, 6, 7, 8, 9 ou 10)', true)}</>}</>}
    {media && <>{field('file', 'URL do arquivo')}{c.type === 'document' && field('docName', 'Nome do documento')}</>}
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
  </div>;
}
import { UazapiPhonePreview } from './UazapiPhonePreview';
