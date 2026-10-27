'use strict';
// Comidas: busca nas salvas (cache), chamada à IA (Edge Function al-estimar) e gravação do que foi comido.
// Comida já salva não vai para a IA: o nome igual ao digitado adiciona direto, e as parecidas aparecem como sugestão.
function sugestoes(texto, max = 6) {
  const palavras = normal(texto).split(' ').filter(p => p.length > 1);
  if (!palavras.length) return [];
  return db.itens.filter(i => { const n = normal(i.nome + ' ' + i.porcao); return palavras.every(p => n.includes(p)); })
    .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome)).slice(0, max);
}
const frequentes = (max = 8) => [...db.itens].filter(i => i.usos > 0).sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome)).slice(0, max);
// Comidas salvas com o nome igual ao digitado (uma por medida: "Feijão · 1 concha pequena" e "Feijão · 1 concha normal")
const itensIguais = texto => db.itens.filter(i => normal(i.nome) === normal(texto)).sort((a, b) => b.usos - a.usos);

// Pergunta à IA. Devolve os itens ou lança um erro com a mensagem para a tela.
async function perguntarIA(texto) {
  if (!navigator.onLine) throw new Error('Sem internet: digite os valores.');
  const { data, error } = await sb.functions.invoke(FUNCAO_IA, { body: { texto } });
  if (error) {
    const status = error.context?.status;
    const msg = status === 429 ? 'Limite de consultas do dia atingido.' : status === 503 ? 'IA indisponível agora.' : status === 401 || status === 403 ? 'Sessão expirada: entre de novo no hub.' : 'Não consegui estimar.';
    throw new Error(msg + ' Digite os valores.');
  }
  const itens = Array.isArray(data?.itens) ? data.itens : [];
  if (!itens.length) throw new Error('Não reconheci comida nisso.');
  return itens;
}

// Total comido ÷ quantas porções = os valores de 1 porção (o que fica salvo para reusar), com 2 casas para porção × qtd
// voltar ao total da tela
const porQtd = (v, q) => Math.round(v / q * 100) / 100;
const porPorcao = (x, q) => ({ nome: x.nome, porcao: x.porcao, kcal: porQtd(x.kcal, q), prot: porQtd(x.prot, q), carb: porQtd(x.carb, q), gord: porQtd(x.gord, q) });
// Salva no cache (al_item): uma comida salva por nome + medida (1 unidade dela). Mesmo nome e mesma medida atualiza os valores
// (vale a correção); medida nova cria outra ("1 concha pequena" e "1 concha normal" de feijão ficam separadas). Devolve o item.
const mesmaComida = (a, b) => normal(a.nome) === normal(b.nome) && normal(a.porcao) === normal(b.porcao);
function salvarItem(x) {
  const achado = db.itens.find(i => mesmaComida(i, x));
  if (achado) { Object.assign(achado, macros(x)); return achado; }
  const novo = { id: novoId(), nome: x.nome, porcao: x.porcao, ...macros(x), usos: 0 };
  db.itens.push(novo);
  return novo;
}
// Repetidas de verdade (mesmo nome e mesma medida) viram uma só, a mais usada, com os usos somados; os registros que apontavam
// para as outras passam a apontar para ela (os valores do registro não mudam). Medidas diferentes ficam separadas.
// Devolve se mudou algo (aí é preciso gravar: as repetidas saem da nuvem também).
function unirRepetidas() {
  const ficou = {}, sai = new Set();
  for (const i of [...db.itens].sort((a, b) => b.usos - a.usos)) {
    const k = normal(i.nome) + '|' + normal(i.porcao), f = ficou[k];
    if (!f) { ficou[k] = i; continue; }
    f.usos += i.usos; sai.add(i.id);
    db.registros.forEach(r => { if (r.item === i.id) r.item = f.id; });
  }
  if (sai.size) db.itens = db.itens.filter(i => !sai.has(i.id));
  return sai.size > 0;
}
// Registra no dia: copia os valores da porção (mudar a comida salva depois não muda o que já foi comido).
function comer(item, dia, qtd = 1) {
  item.usos += 1;
  db.registros.push({ id: novoId(), data: dia, hora: dia === hoje() ? agoraHHMM() : '', item: item.id, nome: item.nome, porcao: item.porcao, qtd, ...macros(item) });
}
