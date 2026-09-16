const previewLabels: Record<string, string> = {
  button: 'Botões', list: 'Lista', poll: 'Enquete', carousel: 'Carrossel',
  location_button: 'Solicitar localização', contact: 'Compartilhar contato', location: 'Localização',
  payment: 'Solicitação de pagamento', pix_button: 'Botão PIX', status: 'Status',
  text: 'Texto', image: 'Imagem', video: 'Vídeo', videoplay: 'Vídeo com reprodução',
  document: 'Documento', audio: 'Áudio', myaudio: 'Áudio próprio', ptt: 'Mensagem de voz', ptv: 'Vídeo circular', sticker: 'Figurinha',
};

function choicesOf(composition: any) {
  if (Array.isArray(composition?.buttons)) return composition.buttons.filter((button: any) => button?.text).map((button: any) => `${button.text}|${button.value || ''}`);
  return Array.isArray(composition?.choices) ? composition.choices.filter((choice: unknown) => String(choice).trim()) : [];
}

export function UazapiPhonePreview({ composition, onReorderButtons }: { composition: any; onReorderButtons?: (from: number, to: number) => void }) {
  const [draggedButton, setDraggedButton] = useState<number | null>(null);
  const c = composition || {};
  const type = c.type || 'text';
  const title = previewLabels[type] || 'Mensagem';
  const text = c.text || (type === 'contact' ? c.fullName : type === 'location' ? c.name || 'Localização' : type === 'pix_button' ? `PIX para ${c.pixName || 'recebedor'}` : 'Sua mensagem aparecerá aqui');
  const choices = choicesOf(c);
  const cards = Array.isArray(c.carousel) ? c.carousel : [];
  const media = ['image', 'video', 'videoplay', 'document', 'audio', 'myaudio', 'ptt', 'ptv', 'sticker'].includes(type);

  return <aside className="sticky top-3 rounded-[2rem] bg-slate-900 p-2 shadow-xl" aria-label="Prévia da mensagem no WhatsApp">
    <div className="w-[272px] overflow-hidden rounded-[1.55rem] bg-[#e9edef]">
      <div className="flex items-center gap-2 bg-[#075e54] px-4 py-3 text-white">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#25d366] text-sm font-bold">R</span>
        <div><strong className="block text-xs">Ruptur Campaign</strong><span className="text-[10px] text-emerald-100">online</span></div>
      </div>
      <div className="min-h-[430px] bg-[#efeae2] p-3" style={{ backgroundImage: 'radial-gradient(#d8d1c5 0.7px, transparent 0.7px)', backgroundSize: '12px 12px' }}>
        <p className="mb-2 text-center text-[10px] text-slate-500">Prévia experimental · {title}</p>
        <div className="ml-auto max-w-[92%] overflow-hidden rounded-lg rounded-tr-none bg-[#d9fdd3] shadow-sm">
          {media && <div className="grid h-28 place-items-center bg-slate-300 text-3xl">{type === 'document' ? '📄' : type.includes('audio') || type === 'ptt' ? '▶︎' : '▧'}</div>}
          {type === 'location' && <div className="grid h-24 place-items-center bg-emerald-100 text-3xl">📍</div>}
          {type === 'contact' && <div className="border-b bg-white p-3 text-sm">👤 <strong>{c.fullName || 'Contato'}</strong><br /><span className="text-xs text-slate-500">{c.phoneNumber || 'Telefone'}</span></div>}
          <div className="p-2.5 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{text}</div>
          {type === 'status' && <div className="mx-2 mb-2 rounded bg-slate-800 px-3 py-5 text-center text-xs text-white">Status · {c.statusType || 'texto'}</div>}
          {type === 'location_button' && <button type="button" disabled className="w-full border-t py-2 text-xs font-medium text-[#00a884]">⌖ Enviar localização</button>}
          {type === 'pix_button' && <button type="button" disabled className="w-full border-t py-2 text-xs font-medium text-[#00a884]">PIX · {c.pixKey || 'Chave PIX'}</button>}
          {type === 'payment' && <div className="border-t p-2 text-xs"><strong>{c.itemName || c.title || 'Pagamento'}</strong><br />R$ {Number(c.amount || 0).toFixed(2)}</div>}
          {choices.map((choice: string, index: number) => <div key={index} draggable={!!onReorderButtons} onDragStart={() => setDraggedButton(index)} onDragOver={e => onReorderButtons && e.preventDefault()} onDrop={() => { if (onReorderButtons && draggedButton !== null && draggedButton !== index) onReorderButtons(draggedButton, index); setDraggedButton(null); }} className={`block w-full border-t px-2 py-2 text-center text-xs font-medium text-[#00a884] ${onReorderButtons ? 'cursor-grab active:cursor-grabbing' : ''}`}>{choice.split('|')[0].replace(/^\[[^\]]+\]$/, '')}{onReorderButtons && <span className="ml-1 text-slate-400">⋮⋮</span>}</div>)}
          {type === 'carousel' && <div className="flex gap-2 overflow-hidden border-t p-2">{cards.slice(0, 2).map((card: any, index: number) => <div key={index} className="min-w-[155px] rounded bg-white p-2 text-[10px] shadow"><div className="mb-1 grid h-12 place-items-center bg-slate-200">{card.image ? '▧' : 'Sem mídia'}</div><strong>{card.text || `Cartão ${index + 1}`}</strong>{(card.buttons || []).slice(0, 2).map((button: any, buttonIndex: number) => <div key={buttonIndex} className="mt-1 border-t pt-1 text-center text-[#00a884]">{button.text || 'Botão'}</div>)}</div>)}</div>}
          <div className="px-2 pb-1 text-right text-[9px] text-slate-500">agora ✓✓</div>
        </div>
      </div>
    </div>
  </aside>;
}
import { useState } from 'react';
