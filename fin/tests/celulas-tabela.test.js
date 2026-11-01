// Células e filtros da tabela, sem navegador: as funções reais de js/tables.js rodam e o teste confere o HTML que devolvem
// (antes, regex procurando o texto desse código). Edição só em linha real (id do banco); linha calculada fica só leitura.
const assert = require('node:assert/strict');
const test = require('node:test');
const { carregarTela } = require('./helpers/tela-sem-navegador');

const { rodar } = carregarTela();
const real = { id: 5, nome: 'Mercado', data: '2026-10-16', v: -320.5, valor: -320.5 };
const calculada = { id: -1, _sid: 'saldo', nome: 'Saldo do mês anterior', data: '2026-10-15', v: -2000 };
const html = (fn, r, ...args) => rodar(`${fn}(${JSON.stringify(r)}${args.map(a => ', ' + JSON.stringify(a)).join('')})`);

test('Data: na linha real edita (e o século some no celular); na calculada, só o texto; sem data, "—"', () => {
    assert.equal(html('celData', real), '<span class="togData" data-tog-data="5" title="Editar data">16/10/<span class=seculo>20</span>26</span>');
    assert.equal(html('celData', calculada), '15/10/<span class=seculo>20</span>26');
    assert.equal(html('celData', { ...real, data: null }), '<span class="togData" data-tog-data="5" title="Editar data">—</span>');
});

test('recorrência que caiu 2x no ciclo: o botão ↷ aparece só na linha real marcada', () => {
    assert.match(html('celData', { ...real, _dupCiclo: true }), /<button type=button class=corrigeDupData data-corrige-dup="5"[^>]*>↷<\/button>$/);
    assert.doesNotMatch(html('celData', { ...calculada, _dupCiclo: true }), /corrigeDupData/);
    assert.doesNotMatch(html('celData', real), /corrigeDupData/);
});

test('marcas Reserva, Comprometido e Pra sempre: "—" desmarcado, o nome e a cor marcado; alternar só fora da linha calculada', () => {
    for (const [chave, rotulo, cor] of [['reserva', 'Reserva', 'flagReserva'], ['comprometido', 'Comprometido', 'flagComprometido'], ['pra_sempre', 'Pra sempre', 'flagPraSempre']]) {
        assert.equal(html('celFlag', real, chave), `<span class=" togFlag" data-tog-flag="${chave}:5" title="Alternar ${rotulo}">—</span>`);
        assert.equal(html('celFlag', { ...real, [chave]: true }, chave), `<span class="${cor} togFlag" data-tog-flag="${chave}:5" title="Alternar ${rotulo}">${rotulo}</span>`);
        assert.equal(html('celFlag', { ...calculada, [chave]: true }, chave), `<span class=${cor}>${rotulo}</span>`);
        assert.equal(html('celFlag', calculada, chave), '—');
    }
});

test('Obs e Canal: editáveis só na linha real; Canal com texto ganha Copiar e, se for link, Abrir (o clique de copiar sobe até a tabela)', () => {
    assert.match(html('celObs', { ...real, obs: 'troco' }), /^<span class="togObs" data-tog-obs="5">troco<\/span>$/);
    assert.equal(html('celObs', { ...calculada, obs: 'x' }), 'x');
    const link = html('celCanal', { ...real, canal: 'https://loja.com/pedido' });
    assert.match(link, /class="togCanal" data-tog-canal="5"/);
    assert.match(link, /class=copiarCanal data-copiar-canal="5"/);
    assert.doesNotMatch(link.match(/<button[^>]*copiarCanal[^>]*>/)[0], /onclick/);
    assert.match(link, /<a class=linkCanal href="https:\/\/loja\.com\/pedido" target=_blank rel="noopener noreferrer"[^>]*onclick="event\.stopPropagation\(\)"/);
    const pix = html('celCanal', { ...real, canal: 'chave@pix.com' });
    assert.match(pix, /copiarCanal/); assert.doesNotMatch(pix, /linkCanal/);   // chave Pix: copia, não abre
    assert.doesNotMatch(html('celCanal', real), /copiarCanal/);                  // vazio: nada
    assert.match(html('celCanal', { ...calculada, canal: 'x' }), /^<span class=celCanalTexto>x<\/span>/);
});

test('filtros da coluna: sinal (+/−), marcas Sim/Não, ID exato com |, "vazio" e Valor por proximidade', () => {
    const passa = (filtro, r) => rodar(`(Estado.filtroTexto.t = ${JSON.stringify(filtro)}, passaFiltroTexto(${JSON.stringify(r)}, 't'))`);
    assert.deepEqual([passa({ sinal: '+' }, { v: 10 }), passa({ sinal: '+' }, { v: -10 }), passa({ sinal: '-' }, { v: -10 }), passa({ sinal: '+' }, { v: 0 })], [true, false, true, false]);
    assert.deepEqual([passa({ pra_sempre: 'S' }, { pra_sempre: true }), passa({ pra_sempre: 'S' }, {}), passa({ pra_sempre: 'N' }, {}), passa({ reserva: 'N' }, { reserva: true })], [true, false, true, false]);
    assert.deepEqual([passa({ id: '4' }, { id: 4 }), passa({ id: '4' }, { id: 14 }), passa({ id: '4|14' }, { id: 14 })], [true, false, true]);
    assert.deepEqual([passa({ obs: 'vazio' }, { obs: '' }), passa({ obs: 'Vazio' }, { obs: 'x' })], [true, false]);
    assert.deepEqual([passa({ valor: '150,00' }, { v: -150.04 }), passa({ valor: '150,00' }, { v: 151 })], [true, false]);
});

test('máscara de dinheiro (caixa eletrônico): só dígitos, 2 casas; e o caminho de volta para número', () => {
    assert.deepEqual(['1', '1234', 'R$ 12,34x', '', '000150'].map(t => rodar(`formataMascaraDinheiro(${JSON.stringify(t)})`)), ['0,01', '12,34', '12,34', '0,00', '1,50']);
    assert.deepEqual(['12,34', '1.234,56', '', 'abc'].map(t => rodar(`valorMascaraParaNumero(${JSON.stringify(t)})`)), [12.34, 1234.56, 0, 0]);
});

test('Parcela: a cor diz o andamento (até 1/3 vermelho, até 2/3 amarelo, depois verde); "—" onde numerar não diz nada', () => {
    const cor = (posicao, total) => rodar(`corDaParcela({ posicao: ${posicao}, total: ${total} })`);
    assert.deepEqual([cor(1, 3), cor(1, 2), cor(2, 3), cor(3, 3), cor(4, 12), cor(5, 12)], ['vm', 'am', 'vd', 'vd', 'vm', 'am']);
    const semNumero = (r, total = 3) => rodar(`parcelaSemNumero(${JSON.stringify(r)}, { total: ${total} })`);
    assert.equal(semNumero({ categ: 'Casa' }), false);
    for (const r of [{ categ: 'Besteira' }, { categ: 'Isabella' }, { categ: 'Transporte' }, { categ: 'Alimentação' }, { categ: 'Investimento' }, { categ: 'Casa', pra_sempre: true }])
        assert.equal(semNumero(r), true, JSON.stringify(r));
    assert.equal(semNumero({ categ: 'Casa' }, 1), true);                           // 1 de 1: sozinho
});

test('colunas de largura fixa: o mesmo <colgroup> com ou sem filtro', () => {
    const linhas = JSON.stringify([{ ...real, categ: 'Mercado' }, { ...real, id: 6, nome: 'Feira', categ: 'Feira' }]);
    const colgroup = filtro => rodar(`(Estado.filtroTexto.debito = ${JSON.stringify(filtro)}, renderTabela(${linhas}, 'debito', true).match(/<colgroup>.*?<\\/colgroup>/)[0])`);
    const sem = colgroup({});
    assert.match(sem, /^<colgroup><col class=col-[a-z_]+>/);
    assert.equal(colgroup({ nome: 'Mer' }), sem);                                // um filtro que esconde a Feira
});
