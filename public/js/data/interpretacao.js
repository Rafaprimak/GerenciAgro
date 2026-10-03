// Tabelas de interpretação de análise de solo
// Fonte: Manual de Adubação e Calagem para o Estado do Paraná (Tabelas 3.2 a 3.5)
//
// Cada parâmetro tem 4 limites [t1, t2, t3, t4]:
//   valor <  t1 -> Muito baixo
//   valor <= t2 -> Baixo
//   valor <= t3 -> Médio
//   valor <= t4 -> Alto
//   acima       -> Muito alto
// e opcionalmente `evitar`: acima desse valor -> Condição a evitar.
// Valores que caem nos "buracos" das faixas do manual (ex.: 8,24 entre 4-8 e 9-12)
// vão para a classe de cima.

export const NIVEIS = ['Muito baixo', 'Baixo', 'Médio', 'Alto', 'Muito alto', 'Condição a evitar'];
export const NIVEL_IDX = Object.fromEntries(NIVEIS.map((n, i) => [n, i]));

// Classes de argila para interpretação do fósforo (Tabela 3.3)
export const CLASSES_ARGILA = [
  { id: 'lt250', label: 'Argila < 250 g/kg (arenoso)' },
  { id: '250a400', label: 'Argila 250-400 g/kg (médio)' },
  { id: 'gt400', label: 'Argila > 400 g/kg (argiloso)' },
];

export function classeArgila(argilaGkg) {
  if (argilaGkg == null || argilaGkg === '' || isNaN(argilaGkg)) return null;
  if (argilaGkg < 250) return 'lt250';
  if (argilaGkg <= 400) return '250a400';
  return 'gt400';
}

// Critério de interpretação do P (Tabela 3.3)
export const CRITERIOS_P = {
  lt250: { label: 'Argila < 250 g/kg', lim: [6, 12, 18, 24], evitar: 120 },
  '250a400': { label: 'Argila 250-400 g/kg', lim: [4, 8, 12, 18], evitar: 90 },
  gt400: { label: 'Argila > 400 g/kg', lim: [3, 6, 9, 12], evitar: 60 },
  olericolas: { label: 'Olerícolas', lim: [8, 20, 50, 100], evitar: 300 },
  florestais: { label: 'Florestais', lim: [2, 3, 5, 7], evitar: 28 },
  pastagem_extensiva: { label: 'Pastagem perene extensiva', lim: [2, 3, 6, 10], evitar: 40 },
};

// Critério do K trocável (Tabela 3.4)
export const CRITERIOS_K = {
  geral: { label: 'Geral', lim: [0.06, 0.12, 0.21, 0.45] },
  olericolas: { label: 'Olerícolas, alfafa e café', lim: [0.15, 0.30, 0.45, 1.20] },
};

// Parâmetros interpretados. `fonte` indica a tabela do manual.
export const PARAMETROS = {
  phCaCl2: { label: 'pH CaCl₂', unidade: '', lim: [4.0, 4.4, 4.9, 5.5], evitar: 6.0, fonte: '3.2' },
  phH2O: { label: 'pH H₂O', unidade: '', lim: [4.7, 5.1, 5.6, 6.2], evitar: 6.7, fonte: '3.2' },
  // inverso: para Al e m%, valor baixo é bom (cores invertidas na tela)
  al: { label: 'Alumínio (Al³⁺)', unidade: 'cmolc/dm³', lim: [0.3, 0.7, 1.5, 2.5], fonte: '3.2', inverso: true },
  ca: { label: 'Cálcio (Ca²⁺)', unidade: 'cmolc/dm³', lim: [0.5, 1.0, 2.0, 6.0], fonte: '3.2' },
  mg: { label: 'Magnésio (Mg²⁺)', unidade: 'cmolc/dm³', lim: [0.2, 0.4, 1.0, 2.0], fonte: '3.2' },
  m: { label: 'Saturação por Al (m%)', unidade: '%', lim: [5, 10, 20, 50], fonte: '3.2', inverso: true },
  v: { label: 'Saturação por bases (V%)', unidade: '%', lim: [20, 35, 50, 70], evitar: 90, fonte: '3.2' },
  ctc: { label: 'CTC pH 7,0 (T)', unidade: 'cmolc/dm³', lim: [5, 7, 14, 24], fonte: '3.2' },
  ctcEfetiva: { label: 'CTC efetiva (t)', unidade: 'cmolc/dm³', lim: [1.1, 2.0, 4.0, 8.0], fonte: '3.2' },
  // MO é informada em g/dm³ e interpretada pelo carbono: CO = MO / 1,724
  mo: { label: 'Matéria orgânica', unidade: 'g/dm³', lim: [4, 8, 14, 20], fator: 1 / 1.724, fonte: '3.2 (CO)' },
  p: { label: 'Fósforo (P Mehlich-1)', unidade: 'mg/dm³', criterio: 'P', fonte: '3.3' },
  k: { label: 'Potássio (K⁺)', unidade: 'cmolc/dm³', criterio: 'K', fonte: '3.4' },
  kPct: { label: 'K na CTC (%)', unidade: '%', lim: [0.5, 1.0, 2.0, 3.0], evitar: 10, fonte: '3.4' },
  s: { label: 'Enxofre (S-SO₄) 0-20 cm', unidade: 'mg/dm³', lim: [1.0, 2.0, 3.0, 6.0], fonte: '3.5' },
  b: { label: 'Boro (B)', unidade: 'mg/dm³', lim: [0.10, 0.20, 0.30, 0.60], evitar: 2.0, fonte: '3.5' },
  cu: { label: 'Cobre (Cu)', unidade: 'mg/dm³', lim: [0.2, 0.5, 0.8, 3.0], evitar: 20, fonte: '3.5' },
  mn: { label: 'Manganês (Mn)', unidade: 'mg/dm³', lim: [5, 15, 30, 100], evitar: 200, fonte: '3.5' },
  zn: { label: 'Zinco (Zn)', unidade: 'mg/dm³', lim: [0.4, 0.8, 1.2, 10], evitar: 30, fonte: '3.5' },
};

export function classificar(valor, lim, evitar) {
  if (valor == null || valor === '' || isNaN(valor)) return null;
  const v = Number(valor);
  if (evitar != null && v > evitar) return 'Condição a evitar';
  if (v < lim[0]) return 'Muito baixo';
  if (v <= lim[1]) return 'Baixo';
  if (v <= lim[2]) return 'Médio';
  if (v <= lim[3]) return 'Alto';
  return 'Muito alto';
}
