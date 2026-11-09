// Ajuda dos testes de função do Fin: roda o SALVAR do cadastro de verdade (`submeteNovoLancamento`, de js/form.js) com a tela
// falsa e a gravação falsa, junto com o fechar-do-modal que consolida depois do cadastro (`consolidarAoFecharCadastro`).
// O teste preenche os campos, manda salvar e confere o que foi gravado, o que a tela mostrou e o que o fechar do modal faz.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FIN = path.join(__dirname, '..', '..');

// campos: valores dos campos do formulário (`fNome: 'Mercado'`, `fCred: true`...); faturas: o que `idsFaturasDoFormulario` devolve
function montarCadastro({ simulando = false, campos = {}, faturas = [] } = {}) {
  const fonte = fs.readFileSync(path.join(FIN, 'js/form.js'), 'utf8');
  const iniFlag = fonte.indexOf('let consolidarAoFecharCadastro');

  const fimFlag =
    fonte.indexOf('});', fonte.indexOf("modalNovo.addEventListener('close'", iniFlag)) +
    3;

  const iniSalvar = fonte.indexOf('async function submeteNovoLancamento()');
  const fimSalvar = fonte.indexOf('\n}\n', iniSalvar) + 3;

  const padrao = {
    fNome: 'Mercado',
    fCateg: 'Casa',
    fData: '2026-10-20',
    fValor: '10,00',
    fCred: false,
    fPago: true,
    fReserva: false,
    fComprometido: false,
    fPraSempre: false,
    fFreq: '',
    fParcelas: '1',
    fDivide: true,
  };

  const elementos = {};

  const chamadas = {
    gravados: [],
    simulados: [],
    consolidacoes: [],
    modalDasFaturas: 0,
    rolagens: 0,
  };

  const ouvintes = {};

  const el = (id) =>
    (elementos[id] ||= {
      id,
      value:
        id in padrao && typeof padrao[id] !== 'boolean'
          ? String(campos[id] ?? padrao[id])
          : '',
      checked:
        id in padrao && typeof padrao[id] === 'boolean'
          ? (campos[id] ?? padrao[id])
          : false,
      disabled: false,
      textContent: '',
      classList: { add() {}, remove() {} },
      focus() {},
      reset() {},
      showModal() {
        if (id === 'modalFaturasParcelas') chamadas.modalDasFaturas++;
      },
      scrollIntoView() {
        chamadas.rolagens++;
      },
    });

  const ctx = {
    Estado: { simulando, gravandoAjuste: false },
    el,
    document: { querySelector: () => null },
    modalNovo: {
      dataset: {},
      addEventListener: (evento, f) => {
        ouvintes[evento] = f;
      },
    },
    setTimeout: () => {},
    consolidarTudo: (botao, _depois, opcoes) =>
      chamadas.consolidacoes.push([botao.id, opcoes]),
    DATA_LIMITE_RECORRENCIA: '2032-12-31',
    ehAntecipacaoFatura: () => false,
    idsFaturasDoFormulario: () => faturas,
    valorMascaraParaNumero: (texto) => Number(String(texto).replace(',', '.')) || 0,
    valorDasParcelas: (total, n) => Array(n).fill(total / n),
    ocorrenciasAteLimite: () => 1,
    faturaDaOcorrencia: (fatura) => fatura,
    dataDaOcorrencia: (data) => data,
    simulaLancamentoParcelado: (campos) => chamadas.simulados.push(campos),
    salvaLancamentoParceladoNoBanco: async (campos) => {
      chamadas.gravados.push(campos);

      return '';
    },
    textoDoCadastroSalvo: () => 'Salvo',
    atualizaSinalUI() {},
    hojeISO: () => '2026-10-20',
    atualizaModoFrequencia() {},
    atualizarFaturasDoFormulario() {},
    popularCategoriasNoForm() {},
    popularNomesNoForm() {},
    desenhar() {},
  };

  vm.createContext(ctx);
  vm.runInContext(
    `let sinalPositivo = false;\n${fonte.slice(iniFlag, fimFlag)}\n${fonte.slice(iniSalvar, fimSalvar)}`,
    ctx,
    { filename: 'js/form.js' }
  );

  return {
    ctx,
    chamadas,
    elementos,
    el,
    salvar: () => ctx.submeteNovoLancamento(),
    fecharModal: () => ouvintes.close(),
  };
}

// Consulta de largura (`(min-width: 641px)`) respondida como a tela de `largura` px responderia.
function larguraAtende(consulta, largura) {
  const px = Number(/\d+/.exec(consulta)?.[0]);

  return consulta.includes('min-width') ? largura >= px : largura <= px;
}

// Abre o cadastro (novo, Duplicar ou Editar) de verdade: `abreModalNovo` com a tela falsa. Devolve as chamadas que ela fez a
// `atualizarFaturasDoFormulario` (cada uma com os ids de fatura que recebeu) e os campos como ficaram.
function abrirCadastro({
  prefill,
  modoEdicao = false,
  simulando = false,
  largura = 1000,
} = {}) {
  const fonte = fs.readFileSync(path.join(FIN, 'js/form.js'), 'utf8');
  const ini = fonte.indexOf('function abreModalNovo(');
  const fim = fonte.indexOf('\n}\n', ini) + 3;
  const elementos = {};
  const atualizacoesDeFatura = [];
  const focos = [];
  const agendados = [];

  const el = (id) =>
    (elementos[id] ||= {
      id,
      value: '',
      checked: false,
      hidden: false,
      textContent: '',
      classList: { add() {}, remove() {} },
      reset() {},
      focus() {
        focos.push(id);
      },
    });

  const ctx = {
    Estado: { simulando, temPraSempre: false },
    el,
    popularCategoriasNoForm() {},
    popularNomesNoForm() {},
    RECORRENCIAS: { Mensal: 1, Anual: 1 },
    formataMascaraDinheiro: (texto) => texto,
    atualizaModoFrequencia() {},
    idsFaturasDoFormulario: () => [],
    atualizarFaturasDoFormulario: (ids) => atualizacoesDeFatura.push(ids),
    atualizaSinalUI() {},
    sugereModoValorParcelas() {},
    modalNovo: { dataset: {}, showModal() {} },
    window: { matchMedia: (consulta) => ({ matches: larguraAtende(consulta, largura) }) },
    hojeISO: () => '2026-10-20',
    dataISO: (v) => String(v || '').slice(0, 10),
    setTimeout: (f) => agendados.push(f),
  };

  vm.createContext(ctx);

  const abre = vm.runInContext(
    `let sinalPositivo = false;\n${fonte.slice(ini, fim)}\nabreModalNovo;`,
    ctx,
    { filename: 'js/form.js' }
  );

  abre(prefill, modoEdicao);

  // Deixa o tempo passar: roda o que o cadastro agendou (o foco automático) e devolve os campos que receberam foco
  const passarTempo = () => {
    agendados.splice(0).forEach((f) => f());

    return focos;
  };

  return { atualizacoesDeFatura, elementos, ctx, focos, passarTempo };
}

module.exports = { montarCadastro, abrirCadastro };
