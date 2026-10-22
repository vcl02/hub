// Reserva/Comprometido como bits do lançamento (migration 22): checkbox no cadastro,
// coluna clicável na tabela, PATCH imediato — mesmo padrão de Crédito/Pago.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migration = fs.readFileSync('migrations/22-reserva-comprometido-colunas-bool.sql', 'utf8');

test('cadastro tem checkbox de Reserva e Comprometido, desmarcados por padrão (diferente de Crédito/Pago)', () => {
    assert.match(pagina, /<label class="fmChk fmChkIco" title="Reserva">\s*\n\s*<input type=checkbox id=fReserva aria-label="Reserva">/);
    assert.match(pagina, /<label class="fmChk fmChkIco" title="Comprometido">\s*\n\s*<input type=checkbox id=fComprometido aria-label="Comprometido">/);
    // "checked" no HTML (como fCred/fPago/fDivide têm) marcaria por padrão — de propósito
    // ausente aqui, já que reserva/comprometido são marcas raras, não o caso comum.
    assert.doesNotMatch(pagina, /id=fReserva checked|id=fComprometido checked/);
});

test('COLS inclui reserva e comprometido como colunas booleanas, sem recorte em nenhuma tabela', () => {
    assert.match(estado, /\['reserva', 'Reserva', 'b'\], \['comprometido', 'Comprometido', 'b'\],/);
    // colunasAtivas só recorta 'prio' (exclusivo do Backlog); reserva/comprometido
    // aparecem em Débito, Crédito e Backlog igualmente.
    assert.match(estado, /const colunasDaTabela = idTabela => idTabela === 'bk'/);
});

test('célula de Reserva/Comprometido mostra "—" quando falso, sem repetir texto negativo em toda linha', () => {
    assert.match(tabelas, /const celFlag = \(r, chave\) => \{/);
    assert.match(tabelas, /const texto = marcado \? ROTULO_FLAG\[chave\] : '—';/);
    assert.match(tabelas, /return !r\._sid\n/);
    assert.match(tabelas, /data-tog-flag="\$\{chave\}:\$\{escapeHtml\(String\(r\.id\)\)\}"/);
    // Pago continua com o esquema antigo (sempre mostra um texto, nunca "—"); só as duas
    // colunas novas usam celFlag.
    assert.match(tabelas, /tipo == 'b' && chave != 'pago' \? `<td>\$\{celFlag\(r, chave\)\}`/);
});

test('clique no badge Reserva/Comprometido faz PATCH imediato, com a mesma guarda de simulação', () => {
    const inicio = interacoes.indexOf("const ROTULO_FLAG_TOGGLE = { reserva: 'Reserva', comprometido: 'Comprometido', pra_sempre: 'Pra sempre' };");
    assert.ok(inicio >= 0, 'não achou o handler de togFlag');
    const trecho = interacoes.slice(inicio, interacoes.indexOf('\n});', inicio) + 4);
    assert.match(trecho, /const badge = e\.target\.closest\('\[data-tog-flag\]'\);/);
    assert.match(trecho, /const \[campo, id\] = badge\.dataset\.togFlag\.split\(':'\);/);
    assert.match(trecho, /const novoValor = !r\[campo\];/);
    // Simulação lida uma vez; um só PATCH (tudo ou nada) pras linhas reais; memória depois.
    assert.match(trecho, /const simulando = Estado\.simulando;\s*\n\s*const reais = simulando \? \[\] : mesmoNome\.filter\(linha => !linha\._sim\);/);
    assert.match(trecho, /if \(reais\.length\) await atualizarLancamentos\(reais\.map\(linha => linha\.id\), \{ \[campo\]: novoValor \}\);/);
    assert.doesNotMatch(trecho, /for \(const linha of mesmoNome\)/);
    assert.match(trecho, /mesmoNome\.forEach\(linha => \{ linha\[campo\] = novoValor; \}\);/);
    assert.match(trecho, /mostrarToast\('Falhou ao atualizar', err\.message\);/);
});

test('marcar/desmarcar Reserva ou Comprometido propaga pros lançamentos com o mesmo nome E a mesma categoria', () => {
    const inicio = interacoes.indexOf("const ROTULO_FLAG_TOGGLE = { reserva: 'Reserva', comprometido: 'Comprometido', pra_sempre: 'Pra sempre' };");
    const trecho = interacoes.slice(inicio, interacoes.indexOf('\n});', inicio) + 4);
    const def = trecho.match(/const chaveDoCompromisso = (x => `[^`]*`);/);
    assert.ok(def, 'não achou chaveDoCompromisso');
    const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const categoriasSeparadas = v => String(v ?? '').split(',').map(c => c.trim()).filter(Boolean);
    const chaveDoCompromisso = require('node:vm').runInNewContext(def[1], { semAcento, categoriasSeparadas });
    const k = (nome, categ) => chaveDoCompromisso({ nome, categ });
    assert.equal(k('Iphone', 'Isabella'), k(' iphone ', 'ISABELLA'));
    assert.equal(k('Cinema', 'Lazer, Isabella'), k('Cinema', 'Isabella, Lazer'));
    assert.notEqual(k('Uber', 'Transporte'), k('Uber', 'Besteira'));
    assert.notEqual(k('Uber', 'Transporte'), k('Uber 99', 'Transporte'));
    assert.match(trecho, /const mesmoNome = Estado\.lancamentos\.filter\(x => !x\._sid && chaveDoCompromisso\(x\) === chave\);/);
    // toast só quando a varredura de fato pegou mais de um lançamento.
    assert.match(trecho, /if \(mesmoNome\.length > 1\) \{/);
    assert.match(regras, /identificado pelo \*\*nome e pela categoria juntos\*\*/);
});

test('Duplicar/Editar herdam reserva/comprometido do lançamento de origem; novo cadastro não força nada', () => {
    assert.match(formulario, /el\('fReserva'\)\.checked = !!prefill\.reserva;/);
    assert.match(formulario, /el\('fComprometido'\)\.checked = !!prefill\.comprometido;/);
});

test('submeteNovoLancamento lê os dois checkboxes e propaga pra simulação e pro Supabase', () => {
    assert.match(formulario, /const reserva = el\('fReserva'\)\.checked;\s*\n\s*const comprometido = el\('fComprometido'\)\.checked;/);
    assert.match(formulario, /simulaLancamentoParcelado\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre, parcelas, valores, faturaIds: faturasDaSerie \}\);/);
    assert.match(formulario, /salvaLancamentoParceladoNoBanco\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre, parcelas, valores, faturaIds: faturasDaSerie \}\);/);
    assert.match(formulario, /async function salvaLancamentoParceladoNoBanco\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre = false, parcelas, valores, faturaIds = \[\] \}\)/);
    assert.match(formulario, /data: dataParcela, freq, cred, pago, reserva, comprometido,/);
    assert.match(formulario, /function simulaLancamentoParcelado\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, praSempre = false, parcelas, valores, faturaIds = \[\] \}\)/);
    assert.match(formulario, /cred, pago, reserva, comprometido, pra_sempre: praSempre,\s*\n\s*fatura: faturaVenc,/);
});

test('submeteEdicaoLancamento reenvia reserva/comprometido no PATCH, igual aos demais campos', () => {
    assert.match(formulario, /nome, categ: normalizaCategorias\(categ\), freq, data, cred, pago, reserva, comprometido,/);
});

test('migration 22 cria os dois bits e extrai dos tokens exatos em categ, sem deixar o texto', () => {
    assert.match(migration, /add column if not exists reserva boolean not null default false;/);
    assert.match(migration, /add column if not exists comprometido boolean not null default false;/);
    assert.match(migration, /lower\(trim\(token\)\) not in \('reserva', 'comprometido'\)/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /checkbox.*Reserva.*Comprometido|Reserva.*Comprometido.*checkbox/);
});

test('Comprometido marcado em laranja escuro e Reserva em amarelo claro, inclusive ao alternar e em linha só leitura', () => {
    const vm = require('node:vm');
    const inicio = tabelas.indexOf('const ROTULO_FLAG =');
    const fim = tabelas.indexOf('\n};', inicio) + 3;
    const ctx = { escapeHtml: String };
    vm.runInNewContext(`${tabelas.slice(inicio, fim)}\nthis.celFlag = celFlag;`, ctx);
    assert.match(ctx.celFlag({ id: 5, comprometido: true }, 'comprometido'), /^<span class="flagComprometido togFlag"[^>]*>Comprometido<\/span>$/);
    assert.match(ctx.celFlag({ id: 5, reserva: true }, 'reserva'), /^<span class="flagReserva togFlag"[^>]*>Reserva<\/span>$/);
    // Desmarcado: "—" sem cor.
    assert.match(ctx.celFlag({ id: 5, reserva: false }, 'reserva'), /^<span class=" togFlag"[^>]*>—<\/span>$/);
    // Linha calculada: mesma cor, sem toggle.
    assert.equal(ctx.celFlag({ id: -3, _sid: 'fat:1', comprometido: true }, 'comprometido'), '<span class=flagComprometido>Comprometido</span>');
    assert.equal(ctx.celFlag({ id: -6, _sid: 'prev:1', reserva: true }, 'reserva'), '<span class=flagReserva>Reserva</span>');
    // O clique troca a mesma classe da marca, nunca o verde de Pago.
    assert.match(interacoes, /badge\.classList\.toggle\(COR_FLAG\[campo\], novoValor\);/);
    const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(estilos, /\.flagComprometido \{\s*\n\s*color: #D9741E;/);
    assert.match(estilos, /\.flagReserva \{\s*\n\s*color: #F6E58D;/);
    assert.match(regras, /\*\*Comprometido em laranja escuro\*\* e \*\*Reserva em amarelo claro\*\*/);
});

test('cabeçalho de Reserva e Comprometido tem a pergunta que decide a marca', () => {
    assert.match(tabelas, /reserva: 'Se eu perder o emprego, preciso continuar pagando isso\?',/);
    assert.match(tabelas, /comprometido: 'Começou o mês, isso já é obrigatório pagar\?',/);
    assert.match(tabelas, /const dica = PERGUNTA_DA_COLUNA\[chave\] \? ` title="\$\{PERGUNTA_DA_COLUNA\[chave\]\}"` : '';/);
    assert.match(regras, /a pergunta que decide a marca: \*\*Reserva\*\* — "Se eu perder o emprego, preciso continuar pagando isso\?"/);
});
