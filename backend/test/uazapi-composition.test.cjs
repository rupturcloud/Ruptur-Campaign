const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildUazapiComposition, replaceCompositionVariables } = require('../dist/services/uazapiComposition');

const number = '5511999999999';
const fixtures = [
  ['text', { type: 'text', text: 'Olá' }, '/send/text'],
  ['image', { type: 'image', file: 'https://example.test/a.png', text: 'Imagem' }, '/send/media'],
  ['button', { type: 'button', text: 'Escolha', choices: ['Sim|yes'] }, '/send/menu'],
  ['list', { type: 'list', text: 'Escolha', choices: ['Plano|basic|Descrição'] }, '/send/menu'],
  ['poll', { type: 'poll', text: 'Qual?', choices: ['A', 'B'] }, '/send/menu'],
  ['carousel', { type: 'carousel', text: 'Catálogo', carousel: [{ text: 'Item', buttons: [{ type: 'REPLY', text: 'Comprar', id: 'buy' }] }] }, '/send/carousel'],
  ['location_button', { type: 'location_button', text: 'Envie sua localização' }, '/send/location-button'],
  ['contact', { type: 'contact', fullName: 'Ana', phoneNumber: number }, '/send/contact'],
  ['location', { type: 'location', latitude: -23.5, longitude: -46.6, name: 'São Paulo' }, '/send/location'],
  ['payment', { type: 'payment', amount: 10.5, pixKey: 'pix-key', pixType: 'EVP', pixName: 'Ruptur' }, '/send/request-payment'],
  ['pix_button', { type: 'pix_button', pixType: 'EVP', pixKey: 'pix-key', pixName: 'Ruptur' }, '/send/pix-button'],
  ['status', { type: 'status', statusType: 'text', text: 'Status' }, '/send/status'],
];

test('every experimental composition maps to its documented outbound route', () => {
  for (const [type, composition, endpoint] of fixtures) {
    const built = buildUazapiComposition(number, composition);
    assert.equal(built.endpoint, endpoint, type);
    if (type === 'status') {
      assert.deepEqual(built.payload.recipients, [number]);
      assert.equal(built.payload.type, 'text');
    } else {
      assert.equal(built.payload.number, number);
      assert.equal(built.payload.async, false);
      assert.equal(built.payload.track_source, 'ruptur-campaign');
    }
  }
});

test('composition rejects invalid documented values before contacting Uazapi', () => {
  assert.throws(() => buildUazapiComposition(number, { type: 'location', latitude: 91, longitude: 0 }), /Coordenadas inválidas/);
  assert.throws(() => buildUazapiComposition(number, { type: 'pix_button', pixType: 'INVALID', pixKey: 'x' }), /Campo Uazapi inválido|Tipo de chave PIX/);
  assert.throws(() => buildUazapiComposition(number, { type: 'image', file: 'x', unknown: true }), /não suportado/);
});

test('variables are replaced recursively without executing their content', () => {
  const value = replaceCompositionVariables({ text: 'Olá {{nome}}', choices: ['Falar com {nome}'] }, { nome: 'Ana $&' });
  assert.deepEqual(value, { text: 'Olá Ana $&', choices: ['Falar com Ana $&'] });
});

test('structured reply and link buttons become ordered Uazapi choices with an image', () => {
  const built = buildUazapiComposition(number, { type: 'button', text: 'Escolha', imageButton: 'https://example.test/card.png', buttons: [
    { kind: 'url', text: 'Abrir catálogo', value: 'https://example.test/catalogo' },
    { kind: 'reply', text: 'Falar com alguém', value: 'human' },
  ] });
  assert.equal(built.endpoint, '/send/menu');
  assert.equal(built.payload.imageButton, 'https://example.test/card.png');
  assert.deepEqual(built.payload.choices, ['Abrir catálogo|https://example.test/catalogo', 'Falar com alguém|human']);
});
