// Recorte comum das tabelas avaliado sem renderizar ou alterar dados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/tables.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const fim = fonte.indexOf('\n// ORDENAÇÃO', 0);
if (fim < 0) throw Error('Não encontrou os filtros de tabela.');

function filtros() {
    const contexto = {
        Estado: { lancamentos: [] },
        // Sem ciclos não há previsão de Besteira/Isabella: a base é só o que veio do banco.
        lancamentosComPrevistas: () => contexto.Estado.lancamentos,
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(0, fim)}\nglobalThis.regras = { filtrarLancamentos };`, contexto);
    return contexto;
}

function filtroDeTexto() {
    const inicio = fonte.indexOf('function termosExcluidosDoFiltro');
    const fim = fonte.indexOf('\n// clique no header', inicio);
    if (inicio < 0 || fim < 0) throw Error('Não encontrou o filtro textual da tabela.');
    const contexto = {
        Estado: { filtroTexto: {} },
        // A base do saldo diário recortado é a mesma do sem recorte (reais + previstas).
        filtrarLancamentos: () => [...contexto.Estado.lancamentos, ...(contexto.previstas || [])],
        estadoFiltroTexto: id => contexto.Estado.filtroTexto[id] || (contexto.Estado.filtroTexto[id] = {}),
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
        valorMascaraParaNumero: () => 0,
        TOLERANCIA_BUSCA_VALOR: 0.05,
        dataBR: s => s.split('-').reverse().join('/'),
        ehVazioTextual: v => {
            if (v == null) return true;
            const limpo = String(v).trim().toLowerCase().replace(/^<|>$/g, '');
            return ['', 'null', 'undefined', 'nan', 'none', 'n/a'].includes(limpo);
        },
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\nglobalThis.regras = { passaFiltroTexto, termosExcluidosDoFiltro, baseParaSaldoDiario };`, contexto);
    return contexto;
}

const linhas = [
    { id: 1, pago: true, cred: false, categ: 'Casa', v: -50 },
    { id: 2, pago: false, cred: true, categ: 'Casa, Isabella', v: -80 },
    { id: 3, pago: true, cred: false, categ: 'Isabella', v: 100 },
    { id: 4, pago: true, cred: false, categ: 'Casa', v: 0 },
];

test('não aplica filtro global de pago nem origem', () => {
    const c = filtros();
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [1, 2, 3, 4]);
    assert.doesNotMatch(fonte, /fpago|origem|passaFiltroTriEstado/);
});

test('não há mais filtro de titular nem de sinal', () => {
    assert.doesNotMatch(fonte, /el\('titular'\)|el\('fvalor'\)/);
});

test('Categoria aceita ! para inverter uma busca sem diferenciar caixa ou acento', () => {
    const c = filtroDeTexto();
    c.Estado.filtroTexto.debito = { categ: '!cása' };
    assert.deepEqual(
        linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [3],
    );
});

test('! isolado em Categoria não filtra; Frequência mantém busca literal (nunca exclui)', () => {
    const c = filtroDeTexto();
    c.Estado.filtroTexto.debito = { categ: '!' };
    assert.deepEqual(
        linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [1, 2, 3, 4],
    );
    // Frequência não é Categoria nem Nome: "!mensal" é buscado literalmente, não exclui nada.
    c.Estado.filtroTexto.debito = { freq: '!mensal' };
    assert.deepEqual(linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')), []);
});

test('Nome também aceita ! para excluir, igual a Categoria', () => {
    const c = filtroDeTexto();
    const linhasComNome = [
        { id: 70, nome: 'Besteira Café' },
        { id: 71, nome: 'Assinatura Netflix' },
        { id: 72, nome: 'Mercado' },
    ];
    c.Estado.filtroTexto.debito = { nome: '!besteira' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [71, 72],
    );
});

test('mais de um ! encadeia exclusões em AND, em Categoria e em Nome', () => {
    const c = filtroDeTexto();
    const linhasComNome = [
        { id: 80, nome: 'Café', categ: 'Besteira' },
        { id: 81, nome: 'Netflix', categ: 'Assinatura' },
        { id: 82, nome: 'Mercado', categ: 'Casa' },
    ];
    c.Estado.filtroTexto.debito = { categ: '!besteira!assinatura' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [82],
    );
    const linhasComNomeVariado = [
        { id: 90, nome: 'Besteira Café' },
        { id: 91, nome: 'Assinatura Netflix' },
        { id: 92, nome: 'Mercado' },
    ];
    c.Estado.filtroTexto.debito = { nome: '!besteira!assinatura' };
    assert.deepEqual(
        linhasComNomeVariado.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [92],
    );
    // pedaço vazio (ex.: "!Besteira!") é ignorado, igual ao "!" isolado
    c.Estado.filtroTexto.debito = { nome: '!besteira!' };
    assert.deepEqual(
        linhasComNomeVariado.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [91, 92],
    );
});

test('"|" funciona como OU em qualquer coluna de texto, sem diferenciar caixa ou acento', () => {
    const c = filtroDeTexto();
    const linhasComNome = [
        { id: 10, nome: 'Assinatura Netflix', categ: 'Lazer' },
        { id: 11, nome: 'Presente Isabella', categ: 'Presente' },
        { id: 12, nome: 'Mercado', categ: 'Casa' },
    ];
    c.Estado.filtroTexto.debito = { nome: 'assinatura|ISABELLA' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [10, 11],
    );
});

test('"|" isolado ou com pedaço vazio não filtra por esse pedaço, igual ao "!" isolado de Categoria', () => {
    const c = filtroDeTexto();
    const linhasComNome = [
        { id: 20, nome: 'Assinatura Netflix', categ: 'Lazer' },
        { id: 21, nome: 'Mercado', categ: 'Casa' },
    ];
    c.Estado.filtroTexto.debito = { nome: '|' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [20, 21],
    );
    c.Estado.filtroTexto.debito = { nome: 'assinatura|' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [20],
    );
});

test('campo de busca por coluna avisa sobre o atalho "vazio"; Valor tem botão de sinal no lugar do aviso', () => {
    assert.match(fonte, /title="Digite \\'vazio\\' pra achar as linhas sem nada preenchido aqui"/);
    assert.doesNotMatch(fonte, /Digite \+ pra só positivos/);
    assert.match(fonte, /<span class=filtroValor>\$\{botaoFiltroEstado\(idTabela, 'sinal', filtroAtual\.sinal\)\}/);
});

test('"vazio" em qualquer coluna de texto acha só as linhas sem nada preenchido ali (null, string vazia ou "null"/"n/a" gravado por engano)', () => {
    const c = filtroDeTexto();
    const linhasComObs = [
        { id: 30, obs: null },
        { id: 31, obs: '' },
        { id: 32, obs: 'null' },
        { id: 33, obs: 'Pago via Pix' },
    ];
    c.Estado.filtroTexto.debito = { obs: 'vazio' };
    assert.deepEqual(
        linhasComObs.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [30, 31, 32],
    );
    // sem diferenciar caixa/acento, e isolado — não combina com "!" nem "|"
    c.Estado.filtroTexto.debito = { categ: 'Vazío' };
    assert.deepEqual(
        linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [],
    );
});

test('atalho "vazio" documentado em REGRAS.md', () => {
    assert.match(regras, /digitar exatamente `vazio` \(sem diferenciar caixa ou acento, sozinho no campo — não combina com `!` nem `\|`\)/);
    assert.match(regras, /mesmo critério da célula "—" \(`ehVazioTextual`\)/);
});

test('botão de sinal do Valor filtra só positivos ou só negativos; zero não entra em nenhum', () => {
    const c = filtroDeTexto();
    const linhasComValor = [
        { id: 40, v: 100 },
        { id: 41, v: -30 },
        { id: 42, v: 0 },
        { id: 43, v: 5000 },
        { id: 50, v: -999, _sug: 300 },     // aporte sugerido: o visível é _sug, não v
    ];
    const ids = () => linhasComValor.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id);
    c.Estado.filtroTexto.debito = { sinal: '+' };
    assert.deepEqual(ids(), [40, 43, 50]);
    c.Estado.filtroTexto.debito = { sinal: '-' };
    assert.deepEqual(ids(), [41]);
    // "+"/"-" digitado no campo não é mais atalho de sinal.
    assert.doesNotMatch(fonte, /termoLimpo === '\+'|bruto === '\+'/);
});

test('Pago, Reserva e Comprometido filtram por clique; Data busca no texto da célula', () => {
    const c = filtroDeTexto();
    const base = [
        { id: 1, pago: true, reserva: true, comprometido: false, data: '2026-10-15' },
        { id: 2, pago: false, reserva: false, comprometido: true, data: '2026-11-02' },
        { id: 3, pago: null, data: null },   // linha sem status (Saldo do mês anterior etc.)
    ];
    const ids = filtro => { c.Estado.filtroTexto.db = filtro; return base.filter(r => c.regras.passaFiltroTexto(r, 'db')).map(r => r.id); };
    assert.deepEqual(ids({ pago: 'S' }), [1]);
    assert.deepEqual(ids({ pago: 'N' }), [2]);
    assert.deepEqual(ids({ reserva: 'S' }), [1]);
    assert.deepEqual(ids({ reserva: 'N' }), [2, 3]);
    assert.deepEqual(ids({ comprometido: 'S' }), [2]);
    assert.deepEqual(ids({ comprometido: 'N' }), [1, 3]);
    assert.deepEqual(ids({ data: '10/2026' }), [1]);
    assert.deepEqual(ids({ data: '15/10|02/11' }), [1, 2]);
    assert.deepEqual(ids({ data: 'vazio' }), [3]);
    assert.deepEqual(ids({ pago: 'S', data: '11/2026' }), []);
});

test('botões de filtro por clique: Todos → 1º → 2º → Todos, guardados no filtro da tabela', () => {
    const inicio = fonte.indexOf('const ESTADOS_FILTRO_CLIQUE');
    const fimBotoes = fonte.indexOf('\n};', fonte.indexOf('window.alternarFiltroEstado')) + 3;
    const contexto = { Estado: { filtroTexto: {} }, window: {}, desenhos: 0 };
    contexto.estadoFiltroTexto = id => contexto.Estado.filtroTexto[id] || (contexto.Estado.filtroTexto[id] = {});
    contexto.desenhar = () => { contexto.desenhos++; };
    vm.createContext(contexto);
    vm.runInContext(fonte.slice(inicio, fimBotoes) + '\nglobalThis.botao = botaoFiltroEstado;', contexto);
    const clica = chave => contexto.window.alternarFiltroEstado('db', chave);
    const sequencia = chave => [1, 2, 3].map(() => { clica(chave); return contexto.Estado.filtroTexto.db[chave]; });
    assert.deepEqual(sequencia('sinal'), ['+', '-', undefined]);
    assert.deepEqual(sequencia('pago'), ['S', 'N', undefined]);
    assert.deepEqual(sequencia('reserva'), ['S', 'N', undefined]);
    assert.equal(contexto.desenhos, 9);
    assert.match(contexto.botao('db', 'pago', undefined), />Todos<\/button>$/);
    assert.match(contexto.botao('db', 'pago', 'N'), /class="filtroEstado ligado vm"[\s\S]*>Aberto<\/button>$/);
    assert.match(contexto.botao('db', 'sinal', undefined), />±<\/button>$/);
    assert.match(contexto.botao('db', 'comprometido', 'S'), /flagComprometido[\s\S]*title="Só comprometidos/);
});

test('filtro numérico normal de Valor continua intacto, sem olhar o sinal', () => {
    const c = filtroDeTexto();
    c.Estado.filtroTexto.debito = { valor: '150' };   // valorMascaraParaNumero mockado devolve 0
    const linhasComValor = [{ id: 60, v: 0 }, { id: 61, v: 5 }];
    assert.deepEqual(
        linhasComValor.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [60],
    );
});

test('filtros por clique e de Data documentados em REGRAS.md', () => {
    assert.match(regras, /O sinal se escolhe por clique, no botão ao lado do campo[^:]*: cada clique avança \*\*±\*\* \(todos\) → \*\*\+\*\* \(só positivos\) → \*\*−\*\* \(só negativos\)/);
    assert.match(regras, /\*\*Data\*\* tem campo de busca como as colunas de texto/);
    assert.match(regras, /\*\*Pago\*\*, \*\*Reserva\*\*, \*\*Comprometido\*\* e \*\*Pra sempre\*\* filtram por clique, sem digitar/);
});

test('exclusão de Categoria fornece ao saldo diário a mesma base, sem obedecer outros filtros', () => {
    const c = filtroDeTexto();
    c.Estado.lancamentos = linhas;
    c.Estado.filtroTexto.db = { categ: '!isabella', nome: 'casa' };
    assert.deepEqual(
        Array.from(c.regras.baseParaSaldoDiario('db')).map(linha => linha.id),
        [1, 4],
    );
    c.Estado.filtroTexto.db = { categ: 'Casa' };
    assert.equal(c.regras.baseParaSaldoDiario('db'), null);
    // mais de um ! também exclui em AND na base do saldo diário
    c.Estado.filtroTexto.db = { categ: '!casa!isabella' };
    assert.deepEqual(Array.from(c.regras.baseParaSaldoDiario('db')).map(linha => linha.id), []);
    // Besteira/Isabella previstas entram na base recortada como no saldo sem recorte: um
    // termo que não tira nada deixa a base igual à de sempre.
    c.previstas = [{ id: -6, categ: 'Besteira', v: -200 }];
    c.Estado.filtroTexto.db = { categ: '!xyz' };
    assert.deepEqual(Array.from(c.regras.baseParaSaldoDiario('db')).map(linha => linha.id), [1, 2, 3, 4, -6]);
    c.Estado.filtroTexto.db = { categ: '!besteira' };
    assert.deepEqual(Array.from(c.regras.baseParaSaldoDiario('db')).map(linha => linha.id), [1, 2, 3, 4]);
});

test('exclusão por ! de Categoria/Nome (uma ou mais) documentada em REGRAS.md', () => {
    assert.match(regras, /\*\*Categoria\*\* e \*\*Nome\*\* aceitam o prefixo `!` para inverter a busca/);
    assert.match(regras, /Mais de um `!` encadeia exclusões em AND — `!Besteira!Assinatura` mostra só as linhas que não contêm nem uma nem a outra/);
});

test('sinal do filtro de Valor fica na mesma coluna dos botões +/− das linhas', () => {
    const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
    // Mesmas medidas da célula: botão 1.5rem + .35rem de folga, valor 6.5rem, folga direita .7rem.
    assert.match(fs.readFileSync('css/forms.css', 'utf8'), /\.sinalBt\.compacto \{[\s\S]*?width: 1\.5rem;[\s\S]*?margin-right: \.35rem;/);
    assert.match(estilos, /\.valorLinha \.togValor,\s*\n\s*\.valorLinha \.valorFixo \{\s*\n\s*width: 6\.5rem;/);
    assert.match(estilos, /thead tr\.filtros \.filtroValor \.filtroEstado \{[\s\S]*?width: 1\.5rem;[\s\S]*?margin-right: \.35rem;/);
    assert.match(estilos, /thead tr\.filtros \.filtroValor input \{\s*\n\s*flex: none;\s*\n\s*width: 6\.5rem;/);
    assert.match(estilos, /td \{\s*\n\s*padding: \.5rem \.7rem;/);
    assert.match(estilos, /thead tr\.filtros th:has\(\.filtroValor\) \{\s*\n\s*padding-right: \.7rem;/);
    assert.match(regras, /alinhado exatamente na mesma coluna dos botões \+\/− das linhas/);
});

test('colunas de largura fixa: não mudam conforme o filtro', () => {
    const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(fonte, /const colunas = colunasAtivas\(idTabela\)\.map\(\(\[chave\]\) => `<col class=col-\$\{chave\}>`\)\.join\(''\);/);
    assert.match(fonte, /<div class=wrap><table class=larguraFixa><colgroup>\$\{colunas\}<\/colgroup><thead>/);
    assert.match(estilos, /table\.larguraFixa \{\s*\n\s*table-layout: fixed;\s*\n\s*min-width: 87rem;/);
    for (const [coluna, largura] of [['data', '7rem'], ['valor', '9\\.75rem'], ['pago', '5rem'], ['reserva', '6rem'], ['comprometido', '8\\.25rem'], ['prio', '4\\.5rem'], ['id', '4rem']]) {
        assert.match(estilos, new RegExp(`\\.col-${coluna} \\{ width: ${largura}; \\}`));
    }
    // Colunas de texto livre ficam sem largura própria: dividem o resto igualmente.
    assert.doesNotMatch(estilos, /\.col-(nome|categ|freq|obs|canal) \{/);
    assert.match(regras, /As tabelas de lançamentos \(Débito, Crédito, Backlog\) têm colunas de largura fixa, que não mudam conforme o filtro/);
});

test('busca por ID é exata e aceita vários com |', () => {
    const c = filtroDeTexto();
    const base = [{ id: 4 }, { id: 14 }, { id: 40 }, { id: -3, _sid: 'fat:1' }];
    const ids = termo => { c.Estado.filtroTexto.db = { id: termo }; return base.filter(r => c.regras.passaFiltroTexto(r, 'db')).map(r => r.id); };
    assert.deepEqual(ids('4'), [4]);
    assert.deepEqual(ids('14|40'), [14, 40]);
    assert.deepEqual(ids(' 40 | '), [40]);
    assert.deepEqual(ids('-3'), [-3]);
    assert.deepEqual(ids('|'), [4, 14, 40, -3]);
    assert.match(fonte, /if \(chave == 'id'\) return `<th class=n>\$\{campoBusca\(chave, 'ID', 'inputmode=numeric title="ID exato; use \| pra vários \(ex\.: 12\|40\)" '\)\.replace\('Filtrar id…', 'ID'\)\}<\/th>`;/);
    assert.match(regras, /\*\*ID\*\* tem campo de busca exata: `4` acha só o lançamento de id 4 \(nunca 14 ou 40\)/);
});

test('Nome e Obs numa linha só, com "…" e texto inteiro no hover', () => {
    const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(fonte, /: chave == 'nome' \|\| chave == 'obs'\s*\n\s*\? `<td class="corta\$\{chave == 'nome' \? ' cNome' : ''\}" title="\$\{escapeHtml\(ehVazioTextual\(r\[chave\]\) \? '' : String\(r\[chave\]\)\)\}">/);
    // O title da célula (texto inteiro) não pode ser encoberto pelo do span de edição.
    assert.doesNotMatch(fonte, /title="Editar nome"|title="Editar observação"/);
    assert.match(estilos, /table\.larguraFixa td\.corta \{\s*\n\s*overflow: hidden;\s*\n\s*white-space: nowrap;\s*\n\s*text-overflow: ellipsis;/);
    assert.match(regras, /\*\*Nome\*\* e \*\*Obs\*\* ficam numa linha só, cortados com "…" quando não cabem, e mostram o texto inteiro ao passar o mouse/);
});
