// Regressão: recorrência (nome+categoria) que cai 2x no mesmo ciclo, em meses-calendário
// diferentes — sintoma de a janela do ciclo cortar o mês ao meio, não uma
// despesa nova. Em Comparar isso já virava só um aviso ("*"); aqui, na tabela Débito, a
// ocorrência mais recente do grupo ganha um botão de corrigir a data pro 1º dia do próximo
// ciclo, com confirmação antes do PATCH (altera dado real).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Extrai chaveDaRecorrencia, gruposComRecorrenciaDuplicadaEntreMeses e
// marcaOcorrenciasDuplicadasNoCiclo do arquivo real (não reescreve a regra à mão).
function carregaMarcacao() {
    const inicio = visoes.indexOf('function chaveDaRecorrencia');
    const fim = visoes.indexOf('function todasRecorrenciasDaMudancaSaoExplicadas');
    if (inicio < 0 || fim < 0) throw Error('Não encontrou a marcação de recorrência duplicada.');
    const contexto = {
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        categoriaDaComparacao: categ => categ ?? '',
        textoOuTraco: v => (v == null || v === '' ? '—' : v),
        ehLinhaReal: r => Number.isInteger(+r.id) && +r.id > 0 && !r._sid && !r._sim,
        ehTransferenciaFatura: mockEhTransferenciaFatura,
        dataISO: v => String(v ?? '').slice(0, 10),
        timestamp: v => new Date(String(v)).getTime(),
    };
    vm.createContext(contexto);
    vm.runInContext(`${visoes.slice(inicio, fim)}
globalThis.chaveDaRecorrencia = chaveDaRecorrencia;
globalThis.gruposComRecorrenciaDuplicadaEntreMeses = gruposComRecorrenciaDuplicadaEntreMeses;
globalThis.marcaOcorrenciasDuplicadasNoCiclo = marcaOcorrenciasDuplicadasNoCiclo;`, contexto);
    return contexto;
}

// Mesma regra de ehTransferenciaFatura em js/shared.js (!cred + "antecipacao"+"fatura" em
// categ OU nome, sem diferenciar acento/caixa), reimplementada aqui só pro contexto isolado
// do vm — não é a função real, por isso os testes de integração em bruto continuam
// validando js/shared.js e js/cycle-views.js separadamente.
function mockEhTransferenciaFatura(r) {
    if (r.cred) return false;
    return [r.categ, r.nome].some(v => {
        const c = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        return c.includes('antecipacao') && c.includes('fatura');
    });
}

// Extrai corrigeRecorrenciasDuplicadasNoIntervalo do form.js real E a marcação do
// cycle-views.js real, rodando as duas juntas num contexto isolado — a mesma combinação que
// "Consolidar tudo" usa de verdade, só com atualizarLancamento/reclassificaPeriodo/
// limparCachesFinanceiros simulados (gravam numa lista em vez de chamar o Supabase/redesenhar).
function carregaCorrecaoEmLote() {
    const inicioMarcacao = visoes.indexOf('function chaveDaRecorrencia');
    const fimMarcacao = visoes.indexOf('function todasRecorrenciasDaMudancaSaoExplicadas');
    const inicioLote = formulario.indexOf('async function corrigeRecorrenciasDuplicadasNoIntervalo');
    const fimLote = formulario.indexOf('\n}', inicioLote) + 2;
    if (inicioMarcacao < 0 || fimMarcacao < 0 || inicioLote < 0 || fimLote < 2) {
        throw Error('Não encontrou a correção em lote de recorrência duplicada.');
    }
    const chamadasPatch = [];
    const contexto = {
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        categoriaDaComparacao: categ => categ ?? '',
        textoOuTraco: v => (v == null || v === '' ? '—' : v),
        ehLinhaReal: r => Number.isInteger(+r.id) && +r.id > 0 && !r._sid && !r._sim,
        ehTransferenciaFatura: mockEhTransferenciaFatura,
        dataISO: v => String(v ?? '').slice(0, 10),
        timestamp: v => new Date(String(v)).getTime(),
        Estado: { ciclos: [], lancamentos: [], simulando: false },
        nomePeriodo: c => (c && c.ini ? `ciclo:${c.ini}` : '—'),
        dataBR: s => { const p = String(s ?? '').slice(0, 10).split('-'); return p.length == 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; },
        atualizarLancamento: async (id, campos) => { chamadasPatch.push({ id, ...campos }); },
        reclassificaPeriodo: r => {
            const idx = contexto.Estado.ciclos.findIndex((c, i) =>
                r.data >= c.ini && (!contexto.Estado.ciclos[i + 1] || r.data < contexto.Estado.ciclos[i + 1].ini));
            r.periodoIdx = idx >= 0 ? idx : null;
        },
        limparCachesFinanceiros: () => {},
    };
    vm.createContext(contexto);
    vm.runInContext(`${visoes.slice(inicioMarcacao, fimMarcacao)}
${formulario.slice(inicioLote, fimLote)}
globalThis.corrigeRecorrenciasDuplicadasNoIntervalo = corrigeRecorrenciasDuplicadasNoIntervalo;`, contexto);
    return { contexto, chamadasPatch };
}

test('consolidar tudo em lote: corrige todas as ocorrências aplicáveis no intervalo, sem confirm(), registrando o PATCH de cada uma', async () => {
    const { contexto, chamadasPatch } = carregaCorrecaoEmLote();
    contexto.Estado.ciclos = [
        { ini: '2026-09-08' }, { ini: '2026-10-08' }, { ini: '2026-11-09' }, { ini: '2026-12-09' },
    ];
    contexto.Estado.lancamentos = [
        { id: 10, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', v: -90, freq: 'Mensal', periodoIdx: 1, cred: false },
        { id: 11, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04', v: -90, freq: 'Mensal', periodoIdx: 1, cred: false },
        { id: 12, nome: 'Mercado', categ: 'Casa', data: '2026-10-20', v: -50, periodoIdx: 1, cred: false },
        { id: 13, nome: 'Internet', categ: 'Casa', data: '2026-11-10', v: -70, freq: 'Mensal', periodoIdx: 2, cred: false },
        { id: 14, nome: 'Internet', categ: 'Casa', data: '2026-12-05', v: -70, freq: 'Mensal', periodoIdx: 2, cred: false },
    ];
    const { corrigidos, log } = await contexto.corrigeRecorrenciasDuplicadasNoIntervalo(1, 2);
    assert.equal(corrigidos, 2);
    assert.deepEqual(chamadasPatch, [
        { id: 11, data: '2026-11-09' },
        { id: 14, data: '2026-12-09' },
    ]);
    // Array.from: "log" nasce dentro do vm (outro realm, outro construtor Array) — sem
    // converter primeiro, deepEqual falha por identidade de realm, não por conteúdo.
    assert.deepEqual(Array.from(log), [
        'ciclo:2026-10-08: "Seguro Residencial" movida de 04/11/2026 para 09/11/2026 (recorrência duplicada no ciclo).',
        'ciclo:2026-11-09: "Internet" movida de 05/12/2026 para 09/12/2026 (recorrência duplicada no ciclo).',
    ]);
    const r11 = contexto.Estado.lancamentos.find(r => r.id == 11);
    assert.equal(r11.data, '2026-11-09');
    assert.equal(r11.periodoIdx, 2);   // reclassificado pro ciclo que a nova data cai
    const r14 = contexto.Estado.lancamentos.find(r => r.id == 14);
    assert.equal(r14.data, '2026-12-09');
    assert.equal(r14.periodoIdx, 3);
});

test('simulação (Estado.simulando) não faz PATCH nenhum, só ajusta em memória', async () => {
    const { contexto, chamadasPatch } = carregaCorrecaoEmLote();
    contexto.Estado.simulando = true;
    contexto.Estado.ciclos = [{ ini: '2026-10-08' }, { ini: '2026-11-09' }];
    contexto.Estado.lancamentos = [
        { id: 20, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', v: -90, freq: 'Mensal', periodoIdx: 0, cred: false },
        { id: 21, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04', v: -90, freq: 'Mensal', periodoIdx: 0, cred: false },
    ];
    const { corrigidos } = await contexto.corrigeRecorrenciasDuplicadasNoIntervalo(0, 0);
    assert.equal(corrigidos, 1);
    assert.deepEqual(chamadasPatch, []);
    assert.equal(contexto.Estado.lancamentos.find(r => r.id == 21).data, '2026-11-09');
});

test('marca só a(s) ocorrência(s) mais recente(s) do grupo duplicado, com a data do próximo ciclo', () => {
    const c = carregaMarcacao();
    const antiga = { id: 1, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', v: -90, freq: 'Mensal' };
    const recente = { id: 2, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04', v: -90, freq: 'Mensal' };
    const outraCategoria = { id: 3, nome: 'Mercado', categ: 'Casa', data: '2026-10-08', v: -50 };
    const debitos = [antiga, recente, outraCategoria];
    c.marcaOcorrenciasDuplicadasNoCiclo(debitos, { ini: '2026-11-09' });
    assert.equal(antiga._dupCiclo, undefined);
    assert.equal(recente._dupCiclo, '2026-11-09');
    assert.equal(outraCategoria._dupCiclo, undefined);
});

test('sem próximo ciclo cadastrado, não marca nada (não há pra onde mover)', () => {
    const c = carregaMarcacao();
    const antiga = { id: 1, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', freq: 'Mensal' };
    const recente = { id: 2, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04', freq: 'Mensal' };
    c.marcaOcorrenciasDuplicadasNoCiclo([antiga, recente], undefined);
    assert.equal(antiga._dupCiclo, undefined);
    assert.equal(recente._dupCiclo, undefined);
});

test('mesmo mês (sem duplicidade real) ou linha sintética/simulada não marca', () => {
    const c = carregaMarcacao();
    const mesmoMes1 = { id: 1, nome: 'Mercado', categ: 'Casa', data: '2026-10-05' };
    const mesmoMes2 = { id: 2, nome: 'Mercado', categ: 'Casa', data: '2026-10-20' };
    const sintetica = { _sid: 'fat:0', nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04', freq: 'Mensal' };
    const antigaReal = { id: 3, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', freq: 'Mensal' };
    const debitos = [mesmoMes1, mesmoMes2, sintetica, antigaReal];
    c.marcaOcorrenciasDuplicadasNoCiclo(debitos, { ini: '2026-11-09' });
    assert.equal(mesmoMes1._dupCiclo, undefined);
    assert.equal(mesmoMes2._dupCiclo, undefined);
    assert.equal(sintetica._dupCiclo, undefined);
    assert.equal(antigaReal._dupCiclo, undefined);   // real mas sozinha no grupo: nada pra corrigir
});

test('antecipação de fatura em meses-calendário diferentes no mesmo ciclo nunca ganha o botão de corrigir', () => {
    const c = carregaMarcacao();
    const antecip1 = { id: 1, nome: 'Antecipação Fatura', categ: 'Antecipação Fatura', data: '2026-10-05', cred: false };
    const antecip2 = { id: 2, nome: 'Antecipação Fatura', categ: 'Antecipação Fatura', data: '2026-11-04', cred: false };
    c.marcaOcorrenciasDuplicadasNoCiclo([antecip1, antecip2], { ini: '2026-11-09' });
    assert.equal(antecip1._dupCiclo, undefined);
    assert.equal(antecip2._dupCiclo, undefined);
});

test('antecipação identificada só pelo nome (categoria genérica) também fica fora', () => {
    const c = carregaMarcacao();
    const antecip1 = { id: 1, nome: 'Antecipação Fatura', categ: 'Fatura', data: '2026-10-05', cred: false };
    const antecip2 = { id: 2, nome: 'Antecipação Fatura', categ: 'Fatura', data: '2026-11-04', cred: false };
    c.marcaOcorrenciasDuplicadasNoCiclo([antecip1, antecip2], { ini: '2026-11-09' });
    assert.equal(antecip1._dupCiclo, undefined);
    assert.equal(antecip2._dupCiclo, undefined);
});

test('entrada (valor positivo) em meses-calendário diferentes no mesmo ciclo nunca ganha o botão de corrigir', () => {
    const c = carregaMarcacao();
    const salario1 = { id: 1, nome: 'Salário', categ: 'Isabella', data: '2026-10-10', v: 2000 };
    const salario2 = { id: 2, nome: 'Salário', categ: 'Isabella', data: '2026-11-05', v: 2000 };
    c.marcaOcorrenciasDuplicadasNoCiclo([salario1, salario2], { ini: '2026-11-09' });
    assert.equal(salario1._dupCiclo, undefined);
    assert.equal(salario2._dupCiclo, undefined);
});

test('consolidar tudo em lote também pula entrada (valor positivo), sem PATCH nem contagem', async () => {
    const { contexto, chamadasPatch } = carregaCorrecaoEmLote();
    contexto.Estado.ciclos = [{ ini: '2026-09-08' }, { ini: '2026-10-08' }, { ini: '2026-11-09' }];
    contexto.Estado.lancamentos = [
        { id: 40, nome: 'Salário', categ: 'Isabella', data: '2026-10-10', v: 2000, periodoIdx: 1, cred: false },
        { id: 41, nome: 'Salário', categ: 'Isabella', data: '2026-11-05', v: 2000, periodoIdx: 1, cred: false },
    ];
    const { corrigidos } = await contexto.corrigeRecorrenciasDuplicadasNoIntervalo(1, 1);
    assert.equal(corrigidos, 0);
    assert.deepEqual(chamadasPatch, []);
    assert.equal(contexto.Estado.lancamentos.find(r => r.id == 41).data, '2026-11-05');   // intocada
});

test('consolidar tudo em lote também pula antecipação de fatura, sem PATCH nem contagem', async () => {
    const { contexto, chamadasPatch } = carregaCorrecaoEmLote();
    contexto.Estado.ciclos = [{ ini: '2026-09-08' }, { ini: '2026-10-08' }, { ini: '2026-11-09' }];
    contexto.Estado.lancamentos = [
        { id: 30, nome: 'Antecipação Fatura', categ: 'Antecipação Fatura', data: '2026-10-05', periodoIdx: 1, cred: false },
        { id: 31, nome: 'Antecipação Fatura', categ: 'Antecipação Fatura', data: '2026-11-04', periodoIdx: 1, cred: false },
    ];
    const { corrigidos } = await contexto.corrigeRecorrenciasDuplicadasNoIntervalo(1, 1);
    assert.equal(corrigidos, 0);
    assert.deepEqual(chamadasPatch, []);
    assert.equal(contexto.Estado.lancamentos.find(r => r.id == 31).data, '2026-11-04');   // intocada
});

test('limpa marca de um redesenho anterior antes de recalcular', () => {
    const c = carregaMarcacao();
    const r = { id: 1, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', freq: 'Mensal', _dupCiclo: '2026-09-01' };
    c.marcaOcorrenciasDuplicadasNoCiclo([r], { ini: '2026-11-09' });
    assert.equal(r._dupCiclo, undefined);
});

test('vCiclo chama a marcação antes de montar os blocos, só com o próximo ciclo (Estado.ciclos[i+1])', () => {
    assert.match(visoes, /marcaOcorrenciasDuplicadasNoCiclo\(debitos, Estado\.ciclos\[i \+ 1\]\);/);
});

test('celData (tables.js) mostra o botão "↷" só pra linha real com _dupCiclo', () => {
    assert.match(tabelas, /const corrige = r\._dupCiclo && ehLinhaReal\(r\)/);
    assert.match(tabelas, /class=corrigeDupData data-corrige-dup="\$\{escapeHtml\(String\(r\.id\)\)\}"/);
    assert.match(tabelas, /return `\$\{texto\}\$\{corrige\}`;/);
});

test('clique no botão pede confirmação, faz o PATCH com a guarda de simulação e reclassifica o período', () => {
    assert.match(interacoes, /const botao = e\.target\.closest\('\[data-corrige-dup\]'\);/);
    assert.match(interacoes, /if \(!r \|\| !r\._dupCiclo\) return;/);
    assert.match(interacoes, /if \(!confirm\(`"\$\{r\.nome \?\? ''\}" está duplicado neste ciclo\. Mover a data de \$\{dataBR\(r\.data\)\} para \$\{dataBR\(novaData\)\} \(1º dia do próximo ciclo\)\?`\)\) return;/);
    assert.match(interacoes, /if \(!Estado\.simulando && !r\._sim\) await atualizarLancamento\(r\.id, \{ data: novaData \}\);/);
    assert.match(interacoes, /r\.data = novaData;\s*\n\s*reclassificaPeriodo\(r\);\s*\n\s*desenhar\(\);/);
    assert.match(interacoes, /mostrarToast\('Falhou ao atualizar', err\.message\);/);
});

test('estilos: mesma cor âmbar do aviso "*" de Comparar, em botão circular em evidência', () => {
    assert.match(estilos, /\.corrigeDupData \{[\s\S]*?border: 1px solid #F0A83A;/);
    assert.match(estilos, /\.corrigeDupData \{[\s\S]*?border-radius: 50%;/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /a confirmação ao corrigir a data de uma recorrência duplicada no ciclo/);
    assert.match(regras, /a tabela Débito marca com um botão "↷" ao lado da Data \(mesma cor do asterisco `avisoDup` de Comparar\) só a\(s\) ocorrência\(s\) cujo mês é diferente do da mais antiga do grupo/);
    assert.match(regras, /Um clique, com confirmação, move a `data` dessa linha pro 1º dia do PRÓXIMO ciclo/);
    assert.match(regras, /some sozinho se não houver próximo ciclo cadastrado ainda/);
    assert.match(regras, /Antecipação\/pagamento de fatura nunca entra nessa detecção: é transferência, não recorrência/);
    assert.match(regras, /nunca marcam um lançamento de valor positivo \(entrada\): é recebimento, não conta recorrente/);
});

test('compra avulsa repetida (sem Frequência nem recorrencia_id) nunca é marcada pra mover', () => {
    const c = carregaMarcacao();
    const outubro = { id: 1, nome: 'Mercado', categ: 'Casa', data: '2026-10-15', v: -80 };
    const novembro = { id: 2, nome: 'Mercado', categ: 'Casa', data: '2026-11-03', v: -60 };
    c.marcaOcorrenciasDuplicadasNoCiclo([outubro, novembro], { ini: '2026-11-07' });
    assert.equal(outubro._dupCiclo, undefined);
    assert.equal(novembro._dupCiclo, undefined);
    // Com recorrencia_id (lote do cadastro) volta a valer, mesmo sem Frequência.
    const p1 = { id: 3, nome: 'Curso', categ: 'Educação', data: '2026-10-10', v: -100, recorrencia_id: 7 };
    const p2 = { id: 4, nome: 'Curso', categ: 'Educação', data: '2026-11-02', v: -100, recorrencia_id: 7 };
    c.marcaOcorrenciasDuplicadasNoCiclo([p1, p2], { ini: '2026-11-07' });
    assert.equal(p1._dupCiclo, undefined);
    assert.equal(p2._dupCiclo, '2026-11-07');
});

test('só a ocorrência do OUTRO mês é movida; as do mesmo mês da primeira ficam', () => {
    const c = carregaMarcacao();
    const a = { id: 1, nome: 'Academia', categ: 'Saúde', data: '2026-10-08', v: -100, freq: 'Quinzenal' };
    const b = { id: 2, nome: 'Academia', categ: 'Saúde', data: '2026-10-22', v: -100, freq: 'Quinzenal' };
    const d = { id: 3, nome: 'Academia', categ: 'Saúde', data: '2026-11-05', v: -100, freq: 'Quinzenal' };
    c.marcaOcorrenciasDuplicadasNoCiclo([a, b, d], { ini: '2026-11-07' });
    assert.equal(a._dupCiclo, undefined);
    assert.equal(b._dupCiclo, undefined);   // mesmo mês da 1ª: antes era movida junto
    assert.equal(d._dupCiclo, '2026-11-07');
});

test('consolidação automática (silenciosa) não move data; só o clique move', () => {
    const fonte = fs.readFileSync('js/form.js', 'utf8');
    assert.match(fonte, /const \{ corrigidos, log: logDatas \} = silencioso \? \{ corrigidos: 0, log: \[\] \}\s*\n\s*: await corrigeRecorrenciasDuplicadasNoIntervalo\(Estado\.idxHoje, ultimoCicloAntesDaCorrecao\);/);
    const regrasDoc = fs.readFileSync('docs/REGRAS.md', 'utf8');
    assert.match(regrasDoc, /Só linha de série \(com Frequência ou `recorrencia_id`\) entra/);
    assert.match(regrasDoc, /a consolidação automática de 15 minutos não move datas/);
});
