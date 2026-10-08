// Planejamento forrageiro: estimativas de produção de matéria seca (MS) das forrageiras.
// Fonte: planilha "Planejamento Forrageiro" v2.2.4 (UFPR, Depto. de Fitotecnia e
// Fitossanitarismo, Prof. Dr. Anibal de Moraes), abas "EST. PROD. SUL" e "EST. PROD. NORTE".
//
// prod: produção total de MS (t/ha/ano) por condição da pastagem [degradada, média, ótima]
// dist: % da produção anual em cada mês [jan ... dez]

export const REGIOES = [
  { id: 'sul', nome: 'Sul do Paraná' },
  { id: 'norte', nome: 'Norte do Paraná' },
];

export const CONDICOES = [
  { id: 'degradada', nome: 'Degradada' },
  { id: 'media', nome: 'Média' },
  { id: 'otima', nome: 'Ótima' },
];

export const FORRAGEIRAS = [
  { id: 'andropogon', nome: 'Andropogon',
    sul: { prod: [4, 10.86, 15], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 10.86, 15], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'angola', nome: 'Angola',
    sul: { prod: [3, 9.65, 15], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [3, 9.65, 15], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'aveia-branca', nome: 'Aveia branca',
    sul: { prod: [2, 5, 8], dist: [0, 0, 0, 0, 10, 25, 30, 25, 10, 0, 0, 0] },
    norte: { prod: [2, 5, 8], dist: [0, 0, 0, 0, 10, 25, 30, 25, 10, 0, 0, 0] } },
  { id: 'aveia-preta', nome: 'Aveia preta',
    sul: { prod: [2, 5, 8], dist: [0, 0, 0, 0, 0, 25, 30, 25, 20, 0, 0, 0] },
    norte: { prod: [2, 5, 8], dist: [0, 0, 0, 0, 10, 25, 30, 25, 10, 0, 0, 0] } },
  { id: 'aveia-azevem', nome: 'Aveia + Azevém',
    sul: { prod: [2, 5, 9], dist: [0, 0, 0, 0, 0, 20, 20, 25, 20, 15, 0, 0] },
    norte: { prod: [2, 5, 9], dist: [0, 0, 0, 0, 5, 25, 25, 25, 15, 7, 0, 0] } },
  { id: 'azevem', nome: 'Azevém',
    sul: { prod: [2, 4, 9], dist: [0, 0, 0, 0, 3, 20, 30, 30, 10, 7, 0, 0] },
    norte: { prod: [2, 4, 9], dist: [0, 0, 0, 0, 3, 20, 30, 30, 10, 7, 0, 0] } },
  { id: 'b-brizanta', nome: 'B. Brizanta',
    sul: { prod: [5, 11.34, 18], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [5, 11.34, 18], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'b-decumbens', nome: 'B. Decumbens',
    sul: { prod: [4, 12.78, 18], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 12.78, 18], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'b-humidicola', nome: 'B. Humidícola',
    sul: { prod: [3, 6.96, 15], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [3, 6.96, 15], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'b-ruziziensis', nome: 'B. Ruziziensis',
    sul: { prod: [4, 9.48, 12], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 9.48, 12], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'coast-cross-1', nome: 'Coast cross 1',
    sul: { prod: [3, 11.44, 20], dist: [20, 15, 7, 3, 0, 0, 0, 0, 2, 10, 21, 21.94] },
    norte: { prod: [3, 11.44, 20], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'coloniao', nome: 'Colonião',
    sul: { prod: [4, 9.88, 18], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 9.88, 18], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'elefante', nome: 'Elefante',
    sul: { prod: [4, 10, 25], dist: [25, 25, 10, 2, 0, 0, 0, 0, 0, 3, 15, 20] },
    norte: { prod: [4, 10, 25], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'estrela-africana', nome: 'Estrela africana',
    sul: { prod: [4, 10, 18], dist: [18, 18, 18, 0, 0, 0, 0, 0, 0, 10, 18, 18] },
    norte: { prod: [4, 11.79, 20], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'gordura', nome: 'Gordura',
    sul: { prod: [4, 4.24, 7], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 4.24, 7], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'jaragua', nome: 'Jaraguá',
    sul: { prod: [3, 8.05, 12], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [3, 8.05, 12], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'milheto', nome: 'Milheto',
    sul: { prod: [5, 8, 18], dist: [25, 15, 10, 0, 0, 0, 0, 0, 0, 0, 20, 30] },
    norte: { prod: [5, 8, 18], dist: [25, 15, 10, 0, 0, 0, 0, 0, 0, 0, 20, 30] } },
  { id: 'mombaca', nome: 'Mombaça',
    sul: { prod: [4, 9.88, 18], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 9.88, 18], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'pangola', nome: 'Pangola',
    sul: { prod: [4, 5.87, 16], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 5.87, 16], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'pensacola', nome: 'Pensacola',
    sul: { prod: [3, 6, 18], dist: [20, 15, 7, 3, 0, 0, 0, 0, 2, 10, 21, 21.94] },
    norte: { prod: [3, 6, 18], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'quicuio', nome: 'Quicuio',
    sul: { prod: [4, 7, 20], dist: [20, 20, 10, 5, 0, 0, 0, 0, 3, 7, 15, 20] },
    norte: { prod: [4, 7, 20], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'rhodes', nome: 'Rhodes',
    sul: { prod: [4, 7.29, 15], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 7.29, 15], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'setaria', nome: 'Setaria',
    sul: { prod: [4, 6.64, 15], dist: [20, 15, 7, 3, 0, 0, 0, 0, 2, 10, 21, 21.94] },
    norte: { prod: [4, 6.64, 15], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'tanzania', nome: 'Tanzânia',
    sul: { prod: [4, 9.88, 18], dist: [22, 18, 8, 2, 0, 0, 0, 0, 2, 5, 21, 22] },
    norte: { prod: [4, 9.88, 18], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'tifton-85', nome: 'Tifton 85',
    sul: { prod: [3, 5.17, 20], dist: [20, 15, 7, 3, 0, 0, 0, 0, 2, 10, 21, 21.94] },
    norte: { prod: [3, 5.17, 20], dist: [20, 15, 7, 3, 2, 2, 1, 2, 3, 10, 15, 20] } },
  { id: 'triticale', nome: 'Triticale',
    sul: { prod: [2, 4, 8], dist: [0, 0, 0, 0, 10, 25, 30, 25, 10, 0, 0, 0] },
    norte: { prod: [2, 4, 8], dist: [0, 0, 0, 0, 10, 25, 30, 25, 10, 0, 0, 0] } },];

// Categorias do rebanho (aba "DEMANDA"). entrada = mês (1 a 12) em que a categoria entra no pasto.
// Peso inicial/final e ganhos ficam em branco: cada propriedade preenche os seus.
export const CATEGORIAS = [
  { id: 'bezerros', nome: 'Bezerros', entrada: 6 },
  { id: 'novilhosJovens', nome: 'Novilhos jovens', entrada: 1 },
  { id: 'novilhosAdultos', nome: 'Novilhos adultos', entrada: 11 },
  { id: 'bezerras', nome: 'Bezerras', entrada: 6 },
  { id: 'novilhasJovens', nome: 'Novilhas jovens', entrada: 12 },
  { id: 'novilhasAdultas', nome: 'Novilhas adultas', entrada: 11 },
  { id: 'vacas', nome: 'Vacas (matrizes)', entrada: 1 },
  { id: 'touros', nome: 'Touros', entrada: 1 },
];

// Ganho de peso por estação: verão (dez-fev), outono (mar-mai), inverno (jun-ago), primavera (set-nov)
export const ESTACOES = [
  { id: 'verao', nome: 'Verão', meses: [11, 0, 1] },
  { id: 'outono', nome: 'Outono', meses: [2, 3, 4] },
  { id: 'inverno', nome: 'Inverno', meses: [5, 6, 7] },
  { id: 'primavera', nome: 'Primavera', meses: [8, 9, 10] },
];

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const PADROES = {
  aproveitamento: 70, // % da produção que o animal consegue colher
  consumo: 2.5, // consumo de MS em % do peso vivo
  pesoUA: 450, // kg de 1 unidade animal (U.A.)
};

export function getForrageira(id) {
  return FORRAGEIRAS.find((f) => f.id === id) || null;
}
