import schemas from '../contracts/uazapi-send.json';

const endpoints: Record<string, string> = {
  text: '/send/text', button: '/send/menu', list: '/send/menu', poll: '/send/menu',
  carousel: '/send/carousel', location_button: '/send/location-button', contact: '/send/contact',
  location: '/send/location', payment: '/send/request-payment', pix_button: '/send/pix-button', status: '/send/status',
};
for (const type of ['image', 'video', 'videoplay', 'document', 'audio', 'myaudio', 'ptt', 'ptv', 'sticker']) endpoints[type] = '/send/media';
function validate(value: any, schema: any, path: string): void {
  const fail = () => { throw new Error(`Campo Uazapi inválido: ${path}`); };
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    for (const key of schema.required || []) if (value[key] === undefined || value[key] === '') throw new Error(`Campo Uazapi obrigatório: ${path}.${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (!schema.properties?.[key]) throw new Error(`Campo Uazapi não suportado: ${path}.${key}`);
      validate(item, schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail();
    value.forEach((item: any, index: number) => validate(item, schema.items, `${path}[${index}]`));
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value)) fail();
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail();
  } else if (schema.type && typeof value !== schema.type) fail();
  if (schema.enum && !schema.enum.includes(value)) fail();
  if (schema.minimum !== undefined && value < schema.minimum) fail();
  if (schema.maximum !== undefined && value > schema.maximum) fail();
}
export function buildUazapiComposition(number: string, composition: any) {
  if (!composition || typeof composition !== 'object' || Array.isArray(composition)) throw new Error('Composição Uazapi inválida');
  const { type, statusType, mediaType, buttons, number: ignoredNumber, recipients: ignoredRecipients, ...fields } = composition;
  const endpoint = Object.hasOwn(endpoints, type) ? endpoints[type] : undefined;
  if (!endpoint) throw new Error('Tipo de composição Uazapi não suportado');
  const structuredChoices = Array.isArray(buttons) ? buttons.map((button: any) => {
    if (!button?.text?.trim() || !button?.value?.trim()) throw new Error('Todo botão precisa de texto e destino');
    return `${button.text.trim()}|${button.value.trim()}`;
  }) : undefined;
  const payload: any = endpoint === '/send/status'
    ? { ...fields, type: statusType || mediaType || 'text', recipients: [number] }
    : { ...fields, number, async: false, track_source: 'ruptur-campaign',
        ...(['/send/menu', '/send/media'].includes(endpoint) ? { type } : {}),
        ...(structuredChoices ? { choices: structuredChoices } : {}) };
  validate(payload, (schemas as any)[endpoint], 'mensagem');
  if (endpoint === '/send/menu' && (!payload.text.trim() || !payload.choices.length || payload.choices.some((v: string) => !v.trim()))) throw new Error('Informe o texto e as opções do menu');
  if (endpoint === '/send/carousel' && (!payload.text.trim() || !payload.carousel.length || payload.carousel.some((c: any) => !c.text.trim() || !c.buttons.length))) throw new Error('Informe o texto, cartões e botões do carrossel');
  if (type === 'location' && (Math.abs(payload.latitude) > 90 || Math.abs(payload.longitude) > 180)) throw new Error('Coordenadas inválidas');
  if (type === 'payment' && payload.amount <= 0) throw new Error('Valor da cobrança deve ser positivo');
  if (type === 'pix_button' && !['CPF', 'CNPJ', 'PHONE', 'EMAIL', 'EVP'].includes(payload.pixType)) throw new Error('Tipo de chave PIX inválido');
  if (type === 'status' && !(payload.type === 'text' ? payload.text?.trim() : payload.file?.trim())) throw new Error('Informe o texto ou arquivo do status');
  return { endpoint, payload };
}

// Replace values recursively, without interpreting contact data as JSON or replacement syntax.
export function replaceCompositionVariables(value: any, variables: Record<string, any>): any {
  if (typeof value === 'string') return value.replace(/\{\{([^{}]+)\}\}|\{([^{}]+)\}/g, (match, double, single) => {
    const key = Object.keys(variables).find(k => k.toLowerCase() === (double || single).toLowerCase());
    return key === undefined ? match : String(variables[key] ?? '');
  });
  if (Array.isArray(value)) return value.map(item => replaceCompositionVariables(item, variables));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceCompositionVariables(item, variables)]));
  return value;
}
