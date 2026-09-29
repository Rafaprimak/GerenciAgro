// Leitura do laudo (foto ou PDF) com o Claude, quando o celular está online.
// Ativada apenas se a chave ANTHROPIC_API_KEY estiver configurada no servidor.
// Usado pelo servidor Node (server/index.js) e pelo Cloudflare Worker (worker/index.js).
import Anthropic from '@anthropic-ai/sdk';

const MODELO_PADRAO = 'claude-opus-5';

const CAMPOS_SOLO = {
  phCaCl2: 'pH em CaCl2',
  phH2O: 'pH em água (H2O)',
  phSMP: 'pH SMP / índice SMP',
  al: 'Alumínio trocável Al3+ (cmolc/dm³). "N.D." = 0',
  hal: 'Acidez potencial H+Al (cmolc/dm³)',
  ca: 'Cálcio Ca2+ (cmolc/dm³)',
  mg: 'Magnésio Mg2+ (cmolc/dm³)',
  k: 'Potássio K+ (cmolc/dm³). Se o laudo der em mg/dm³, divida por 391',
  na: 'Sódio Na+ (cmolc/dm³)',
  p: 'Fósforo Mehlich-1 (mg/dm³). NÃO use P-remanescente nem Mehlich-3/resina se houver Mehlich-1',
  s: 'Enxofre S-SO4 (mg/dm³)',
  b: 'Boro (mg/dm³)',
  cu: 'Cobre (mg/dm³)',
  fe: 'Ferro (mg/dm³)',
  mn: 'Manganês (mg/dm³)',
  zn: 'Zinco (mg/dm³)',
  mo: 'Matéria orgânica em g/dm³ (se vier em %, multiplique por 10)',
  argila: 'Argila em g/kg (se vier em %, multiplique por 10)',
  ctc: 'CTC a pH 7,0 (cmolc/dm³)',
  v: 'Saturação por bases V (%)',
};
const CAMPOS_INFO = {
  produtor: 'Produtor / proprietário',
  propriedade: 'Propriedade / fazenda',
  municipio: 'Município/UF',
  talhao: 'Talhão, gleba ou nome da amostra',
  areaHa: 'Área em hectares, se aparecer',
  profundidade: 'Profundidade da amostra, ex.: 0-20',
  dataColeta: 'Data da coleta no formato DD/MM/AAAA',
  laboratorio: 'Nome do laboratório',
  codigo: 'Número/código da amostra',
};

const nulo = (tipo) => ({ anyOf: [{ type: tipo }, { type: 'null' }] });
const SCHEMA = {
  type: 'object',
  properties: {
    solo: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(CAMPOS_SOLO).map(([k, d]) => [k, { ...nulo('number'), description: d }])),
      required: Object.keys(CAMPOS_SOLO),
      additionalProperties: false,
    },
    info: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(CAMPOS_INFO).map(([k, d]) => [k, { ...nulo(k === 'areaHa' ? 'number' : 'string'), description: d }])),
      required: Object.keys(CAMPOS_INFO),
      additionalProperties: false,
    },
    avisos: { type: 'array', items: { type: 'string' }, description: 'Dúvidas de leitura: valores ilegíveis, unidades convertidas etc.' },
  },
  required: ['solo', 'info', 'avisos'],
  additionalProperties: false,
};

const PROMPT = `Este é um laudo de análise química de solo de um laboratório brasileiro.
Extraia os valores exatamente como aparecem no laudo, convertendo vírgula decimal em ponto.
Se houver mais de uma amostra, use a primeira. Use null para o que não estiver no laudo.
Não calcule valores que não estão escritos, exceto as conversões de unidade indicadas na descrição de cada campo.
Registre em "avisos" qualquer valor ilegível ou conversão de unidade feita.`;

const clientes = new Map();

export async function extrairComClaude({ mediaType, data }, { apiKey, modelo = MODELO_PADRAO }) {
  if (!clientes.has(apiKey)) clientes.set(apiKey, new Anthropic({ apiKey }));
  const cliente = clientes.get(apiKey);
  const bloco = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };

  const resposta = await cliente.beta.messages.create({
    model: modelo,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [bloco, { type: 'text', text: PROMPT }] }],
  });

  if (resposta.stop_reason === 'refusal') throw new Error('A IA recusou a leitura deste arquivo');
  if (resposta.stop_reason === 'max_tokens') throw new Error('Resposta da IA incompleta');
  const texto = resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = JSON.parse(texto);
  const limpar = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ''));
  return { solo: limpar(json.solo), info: limpar(json.info), avisos: json.avisos || [] };
}
