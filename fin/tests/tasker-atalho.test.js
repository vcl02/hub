// Regressão: Tasker com atalhos — Nubank A tenta lançar sozinho (auto) antes da notificação de
// tocar e para se lançou; Nubank B pergunta "Sempre assim?" e manda lembrar com o Sim. Roda os
// JavaScriptlets de verdade, com local/setLocal simulados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const desfaz = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const acoes = xml => [...xml.matchAll(/<Action sr="act(\d+)" ve="7">([\s\S]*?)<\/Action>/g)]
    .map(m => ({ n: +m[1], corpo: m[2], codigo: m[2].match(/<code>(\d+)<\/code>/)[1] }))
    .sort((a, b) => a.n - b.n);
const script = acao => desfaz(acao.corpo.match(/<Str sr="arg0" ve="3">([\s\S]*?)<\/Str>/)[1]);
function roda(codigo, locais, globais = {}) {
    const saida = { ...locais };
    vm.runInNewContext(codigo, {
        local: k => saida[k], setLocal: (k, v) => { saida[k] = v; },
        global: k => globais[k], setGlobal: (k, v) => { globais[k] = v; },
        JSON, Math, Date, String, parseInt,
    });
    return saida;
}

test('Nubank A: depois do Stop do não-despesa, apaga a notificação do banco (AutoNotification), tenta lançar sozinho e para se lançou', () => {
    const todas = acoes(ler('tasker/Nubank_A.tsk.xml'));
    assert.deepEqual(todas.map(x => x.codigo), ['129', '548', '137', '2046367074', '2046367074', '129', '339', '129', '523', '137', '129', '523']);
    // Cancel do AutoNotification: Nubank por regex (compra no crédito e no débito, onde "aprovada" só está
    // no título, Pix e boleto) e Mercado Pago pelo texto da fatura; cada um só na compra do próprio banco.
    const [nu, mp] = [todas[3].corpo, todas[4].corpo];
    for (const cancela of [nu, mp]) {
        assert.match(cancela, /<plugintypeid>com\.joaomgcd\.autonotification\.intent\.IntentCancelNotification<\/plugintypeid>/);
        assert.match(cancela, /<CancelAll>false<\/CancelAll>/);
        assert.match(cancela, /<CaseinsensitiveText>true<\/CaseinsensitiveText>/);
    }
    assert.match(nu, /_array_InterceptApps0&gt;com\.nu\.production&lt;/);
    assert.match(nu, /<Text>\(\?is\)\.\*\(compra\|transfer\|boleto\)\.\*<\/Text>/);
    assert.match(nu, /<RegexText>true<\/RegexText>/);
    const regex = new RegExp(nu.match(/<Text>\(\?is\)(.*?)<\/Text>/)[1], 'is');
    for (const texto of ['Compra de R$ 5,90 em X', 'Transferência realizada', 'Pagamento de BOLETO realizado']) assert.match(texto, regex);
    assert.match(nu, /<lhs>%cartao<\/lhs>\s*<op>2<\/op>\s*<rhs>nubank<\/rhs>/);
    assert.match(mp, /<Text>Cartão Mercado Pago<\/Text>/);
    assert.doesNotMatch(mp, /com\.nu\.production/);
    assert.match(mp, /<lhs>%cartao<\/lhs>\s*<op>2<\/op>\s*<rhs>mp<\/rhs>/);
    const id = c => c.match(/<plugininstanceid>(.*?)<\/plugininstanceid>/)[1];
    assert.notEqual(id(nu), id(mp));
    assert.doesNotMatch(ler('tasker/Nubank_A.tsk.xml'), /depesa/);
    const a = [...todas.slice(0, 3), ...todas.slice(5)];   // o resto, como antes dos Cancel
    const corpo = JSON.parse(roda(script(a[3]), { tipo: 'despesa_credito', valor: '12.50', estab: 'NAQUELE CAFE', parcelas: '1', cartao: 'mp' }).body);
    assert.equal(corpo.auto, true);
    assert.equal(corpo.cartao, 'mp');
    assert.match(a[4].corpo, /captura-nubank<\/Str>/);
    assert.match(a[4].corpo, /x-fin-token:%FINTOKEN/);
    assert.match(a[4].corpo, /<Str sr="arg5" ve="3">%body<\/Str>/);
    // Lançou: aviso e para. Sem atalho, erro ou sem resposta: segue o fluxo de sempre.
    const lancou = roda(script(a[5]), { http_response_code: '200', http_data: '{"ok":true,"lancado":true,"nome":"Café","categ":"Besteira","forma":"débito"}', valor: '12.50' });
    assert.equal(lancou.lancado, 'sim');
    assert.equal(lancou.aviso, 'Café R$ 12,50 · Besteira · débito');
    assert.equal(lancou.avisotit, 'Lançado sozinho');
    // Conta prevista paga sozinha: o texto vem da função e o título diz pago ou recebido.
    const pagou = roda(script(a[5]), { http_response_code: '200', http_data: '{"ok":true,"pago":true,"texto":"Água: pago R$ 237,18 (previsto R$ 250,00)"}', valor: '237.18', tipo: 'conta_saida' });
    assert.deepEqual([pagou.lancado, pagou.aviso, pagou.avisotit], ['sim', 'Água: pago R$ 237,18 (previsto R$ 250,00)', 'Pago sozinho']);
    assert.equal(roda(script(a[5]), { http_response_code: '200', http_data: '{"ok":true,"pago":true,"texto":"x"}', valor: '1', tipo: 'conta_entrada' }).avisotit, 'Recebido sozinho');
    assert.match(a[6].corpo, /<Str sr="arg1" ve="3">%avisotit<\/Str>/);
    for (const [codigo, dados] of [['200', '{"ok":true,"lancado":false}'], ['200', '{"ok":true,"pago":false,"lancado":false}'], ['500', '{"erro":"x"}'], ['', '']]) {
        assert.equal(roda(script(a[5]), { http_response_code: codigo, http_data: dados, valor: '1' }).lancado, 'nao');
    }
    for (const i of [6, 7]) assert.match(a[i].corpo, /<lhs>%lancado<\/lhs>\s*<op>2<\/op>\s*<rhs>sim<\/rhs>/);
    assert.match(a[6].corpo, /<Str sr="arg0" ve="3">%aviso<\/Str>/);
    // O Stop do começo deixa passar compras e contas previstas.
    assert.match(todas[2].corpo, /<lhs>%tipo<\/lhs>\s*<op>3<\/op>\s*<rhs>despesa\*\/conta\*<\/rhs>/);
    // O pendente (fluxo de tocar) usa o mesmo instante do pedido automático e guarda o cartão.
    assert.match(script(a[8]), /var agora = parseInt\(local\("agora"\), 10\) \|\| Math\.floor/);
    assert.match(script(a[8]), /cartao: local\("cartao"\)/);
});

test('Nubank A lê crédito Nubank, NuPay, débito Nubank e crédito Mercado Pago', () => {
    const le = (titulo, texto) => roda(script(acoes(ler('tasker/Nubank_A.tsk.xml'))[0]), { evtprm2: titulo, evtprm3: texto });
    const campos = r => [r.tipo, r.valor, r.estab, r.parcelas, r.cartao];
    assert.deepEqual(campos(le('Compra aprovada', 'Compra de R$ 1.234,56 APROVADA em NAQUELE CAFE para o cartão com final 1234')),
        ['despesa_credito', '1234.56', 'NAQUELE CAFE', '1', 'nubank']);
    assert.deepEqual(campos(le('Compra no débito aprovada', 'Compra de R$ 5,90 em EMV CMT*156596385')),
        ['despesa_debito', '5.90', 'EMV CMT*156596385', '1', 'nubank']);
    assert.deepEqual(campos(le('Você pagou R$ 32,20 a Doceria Gama', 'O valor vai entrar na próxima fatura do seu Cartão Mercado Pago.')),
        ['despesa_credito', '32.20', 'Doceria Gama', '1', 'mp']);
    // Mercado Pago sem a frase da fatura (saldo, Pix) e cashback: não é compra no cartão.
    assert.equal(le('Você pagou R$ 10,00 a Fulano', 'Pagamento feito com saldo.').tipo, 'nenhum');
    assert.equal(le('Você ganhou R$ 0,16 de cashback', 'Continue usando seu Cartão de Crédito Mercado Pago para ganhar mais.').tipo, 'nenhum');
    // Crédito Nubank não vira débito (não tem "débito" na notificação).
    assert.equal(le('Compra aprovada', 'Compra de R$ 5,90 em LOJA').tipo, 'nenhum');
});

test('Nubank A lê Pix enviado, boleto pago e Pix recebido como conta prevista (textos supostos, sem print)', () => {
    const le = (titulo, texto) => roda(script(acoes(ler('tasker/Nubank_A.tsk.xml'))[0]), { evtprm2: titulo, evtprm3: texto });
    const campos = r => [r.tipo, r.valor, r.estab];
    assert.deepEqual(campos(le('Transferência realizada', 'Você transferiu R$ 1.060,33 para MARIA DA SILVA.')), ['conta_saida', '1060.33', 'MARIA DA SILVA']);
    assert.deepEqual(campos(le('Transferência realizada', 'Sua transferência de R$ 50,00 para Fulano de Tal foi realizada')), ['conta_saida', '50.00', 'Fulano de Tal']);
    assert.deepEqual(campos(le('Pagamento realizado', 'O pagamento do boleto de R$ 250,00 para TRYBE foi realizado.')), ['conta_saida', '250.00', 'TRYBE']);
    assert.deepEqual(campos(le('Boleto pago', 'Pagamento de R$ 250,00 confirmado.')), ['conta_saida', '250.00', '']);
    assert.deepEqual(campos(le('Transferência recebida', 'Você recebeu uma transferência de R$ 9.600,00 de EVORA LTDA.')), ['conta_entrada', '9600.00', 'EVORA LTDA']);
    assert.deepEqual(campos(le('Transferência recebida', 'Você recebeu R$ 199,90 de Cintia')), ['conta_entrada', '199.90', 'Cintia']);
    assert.deepEqual(campos(le('Pix recebido', 'Você recebeu um Pix de R$ 10,00 de Ana Souza com sucesso')), ['conta_entrada', '10.00', 'Ana Souza']);
    assert.deepEqual(campos(le('Transferência realizada', 'R$ 20,00 para João via Pix')), ['conta_saida', '20.00', 'João']);
    // Lembrete, agendamento e boleto sem pagamento não pagam conta nenhuma.
    for (const [titulo, texto] of [['Boleto vence amanhã', 'Seu boleto de R$ 250,00 vence amanhã'], ['Pagamento agendado', 'O boleto de R$ 250,00 foi agendado'],
        ['Boleto', 'Você tem um boleto de R$ 250,00 disponível'], ['Transferência agendada', 'R$ 50,00 para Fulano']]) {
        assert.equal(le(titulo, texto).tipo, 'nenhum', titulo);
    }
});

test('Nubank B (e a cópia no perfil Click): "Sempre assim?" depois de Parcelas; Sim pede o trecho do lugar e manda lembrar', () => {
    for (const arquivo of ['tasker/Nubank_B.tsk.xml', 'tasker/Nubank_Click.prf.xml']) {
        // O fluxo de compra, sem o bloco das contas previstas (ações 3 a 22, ver o teste seguinte).
        const todas = acoes(ler(arquivo));
        assert.equal(todas.length, 42, arquivo);
        const b = [...todas.slice(0, 3), ...todas.slice(23)];
        assert.equal(b[12].codigo, '378');
        assert.match(b[12].corpo, /<Str sr="arg2" ve="3">Sempre assim\?<\/Str>/);
        assert.match(b[12].corpo, /<Str sr="arg3" ve="3">Sim,Não<\/Str>/);
        // Com Sim: Input Dialog já preenchido com o estabelecimento, guardado em %trecho.
        const soComSim = /<lhs>%ld_selected<\/lhs>\s*<op>2<\/op>\s*<rhs>Sim<\/rhs>/;
        assert.equal(b[13].codigo, '360');
        assert.match(b[13].corpo, /<Str sr="arg1" ve="3">Trecho que identifica o lugar/);
        assert.match(b[13].corpo, /<Str sr="arg3" ve="3">%estab<\/Str>/);
        assert.match(b[13].corpo, soComSim);
        assert.equal(b[14].codigo, '547');
        assert.match(b[14].corpo, /<Str sr="arg0" ve="3">%trecho<\/Str>\s*<Str sr="arg1" ve="3">%input<\/Str>/);
        assert.match(b[14].corpo, soComSim);
        const base = { nome: 'Café', estab: 'X', tipo: 'despesa_credito', valor: '1', parcelas: '1', categ: 'Besteira', ts: '1', trecho: 'naquele cafe', cartao: 'mp' };
        const sim = JSON.parse(roda(script(b[15]), { ...base, ld_selected: 'Sim' }).body);
        assert.equal(sim.lembrar, true);
        assert.equal(sim.trecho, 'naquele cafe');
        for (const ld_selected of ['Não', '']) {
            const nao = JSON.parse(roda(script(b[15]), { ...base, ld_selected }).body);
            assert.equal(nao.lembrar, false);
            assert.equal(nao.trecho, '');
        }
        assert.equal(sim.cartao, 'mp');
        assert.match(script(b[0]), /setLocal\("cartao", p\.cartao \|\| "nubank"\)/);
        assert.equal(b[16].codigo, '339');
        // Flash final: nome, valor e o atalho lembrado (ou o aviso da função).
        const fim = dados => roda(script(b[18]), { nome: 'Café', valor: '12.50', http_data: dados }).fim;
        assert.equal(fim('{"ok":true}'), 'Café R$ 12.50');
        assert.equal(fim('{"ok":true,"lembrado":true,"atalho":"naquele cafe"}'), 'Café R$ 12.50 · atalho: naquele cafe');
        assert.equal(fim('{"ok":true,"forma":"Mercado Pago"}'), 'Café R$ 12.50 · Mercado Pago');
        assert.equal(fim('{"ok":true,"lembrado":true,"atalho":"x y z w","aviso":"trecho fora do nome"}'), 'Café R$ 12.50 · atalho: x y z w · trecho fora do nome');
        assert.match(b[18].corpo, /<lhs>%http_response_code<\/lhs>\s*<op>2<\/op>\s*<rhs>2\*<\/rhs>/);
        assert.equal(b[19].codigo, '548');
        assert.match(b[19].corpo, /<Str sr="arg0" ve="3">%fim<\/Str>/);
    }
});

test('Nubank B (e a cópia no perfil Click): conta prevista escolhe na lista, paga e pode criar vínculo; Novo lançamento segue o fluxo de compra', () => {
    for (const arquivo of ['tasker/Nubank_B.tsk.xml', 'tasker/Nubank_Click.prf.xml']) {
        const bloco = acoes(ler(arquivo)).slice(3, 23);
        assert.deepEqual(bloco.map(x => x.codigo),
            ['37', '129', '339', '129', '548', '137', '378', '129', '137', '37', '378', '360', '547', '129', '339', '129', '548', '137', '38', '38'], arquivo);
        assert.match(bloco[0].corpo, /<lhs>%tipo<\/lhs>\s*<op>2<\/op>\s*<rhs>conta\*<\/rhs>/);
        const base = { tipo: 'conta_saida', valor: '250.00', estab: 'SABESP', ts: '1700000000', titulo: 'SABESP - R$ 250,00 (10:00:00)' };
        assert.deepEqual(JSON.parse(roda(script(bloco[1]), base).body), { tipo: 'conta_saida', valor: '250.00', estab: 'SABESP', ts: '1700000000', acao: 'opcoes' });
        for (const i of [2, 14]) assert.match(bloco[i].corpo, /<Str sr="arg5" ve="3">%body<\/Str>/);
        // Lista: rótulos da função + Novo lançamento + Ignorar; sem resposta, avisa e para (o pendente fica).
        const opcoes = [{ id: 7, rotulo: 'Água R$ 250‚00 · 10/11' }, { id: 9, rotulo: 'Trybe R$ 250‚00 · 09/11' }];
        const lido = roda(script(bloco[3]), { http_response_code: '200', http_data: JSON.stringify({ ok: true, opcoes }) });
        assert.equal(lido.itens, 'Água R$ 250‚00 · 10/11,Trybe R$ 250‚00 · 09/11,Novo lançamento,Ignorar');
        assert.equal(lido.consultou, 'sim');
        assert.equal(roda(script(bloco[3]), { http_response_code: '500', http_data: '{"erro":"x"}' }).consultou, 'nao');
        for (const i of [4, 5]) assert.match(bloco[i].corpo, /<lhs>%consultou<\/lhs>\s*<op>3<\/op>\s*<rhs>sim<\/rhs>/);
        assert.match(bloco[6].corpo, /<Str sr="arg2" ve="3">%estab · R\$ %valor<\/Str>/);
        assert.match(bloco[6].corpo, /<Str sr="arg3" ve="3">%itens<\/Str>/);
        // Escolha: conta -> id; Novo lançamento -> débito (ou entrada) pelo fluxo de compra; Ignorar apaga o pendente.
        const escolhe = (ld_selected, extra = {}, globais = { FINPEND: JSON.stringify({ [base.titulo]: {} }) }) =>
            ({ r: roda(script(bloco[7]), { ...base, opcoes: JSON.stringify(opcoes), ld_selected, ...extra }, globais), globais });
        assert.equal(escolhe('Trybe R$ 250‚00 · 09/11').r.escolha, '9');
        const novo = escolhe('Novo lançamento');
        assert.deepEqual([novo.r.escolha, novo.r.tipo], ['novo', 'despesa_debito']);
        assert.equal(escolhe('Novo lançamento', { tipo: 'conta_entrada' }).r.tipo, 'receita_debito');
        const ignora = escolhe('Ignorar');
        assert.equal(ignora.r.escolha, 'ignorar');
        assert.equal(ignora.globais.FINPEND, '{}');
        const fechou = escolhe('');
        assert.equal(fechou.r.escolha, 'nada');
        assert.notEqual(fechou.globais.FINPEND, '{}');
        assert.match(bloco[8].corpo, /<lhs>%escolha<\/lhs>\s*<op>2<\/op>\s*<rhs>ignorar\/nada<\/rhs>/);
        // Conta escolhida (não Novo): "Sempre assim?", trecho com Sim, paga e lembra o vínculo.
        assert.match(bloco[9].corpo, /<lhs>%escolha<\/lhs>\s*<op>3<\/op>\s*<rhs>novo<\/rhs>/);
        assert.match(bloco[10].corpo, /<Str sr="arg2" ve="3">Sempre assim\?<\/Str>/);
        assert.match(bloco[11].corpo, /<Str sr="arg3" ve="3">%estab<\/Str>/);
        const paga = JSON.parse(roda(script(bloco[13]), { ...base, escolha: '9', ld_selected: 'Sim', trecho: 'sabesp' }).body);
        assert.deepEqual(paga, { tipo: 'conta_saida', valor: '250.00', estab: 'SABESP', ts: '1700000000', id: '9', lembrar: true, trecho: 'sabesp' });
        assert.equal(JSON.parse(roda(script(bloco[13]), { ...base, escolha: '9', ld_selected: 'Não', trecho: 'x' }).body).trecho, '');
        // Resultado: pagou apaga o pendente e mostra a conta; falhou deixa o pendente e mostra o erro.
        const resultado = (codigo, dados) => {
            const globais = { FINPEND: JSON.stringify({ [base.titulo]: {} }) };
            return { fim: roda(script(bloco[15]), { ...base, http_response_code: codigo, http_data: dados }, globais).fim, globais };
        };
        const ok = resultado('200', '{"ok":true,"pago":true,"texto":"Água: pago R$ 237,18 (previsto R$ 250,00)","lembrado":true,"vinculo":"sabesp"}');
        assert.equal(ok.fim, 'Água: pago R$ 237,18 (previsto R$ 250,00) · vínculo: sabesp');
        assert.equal(ok.globais.FINPEND, '{}');
        const erro = resultado('409', '{"erro":"conta nao esta mais em aberto"}');
        assert.equal(erro.fim, 'Falhou: 409 | conta nao esta mais em aberto');
        assert.notEqual(erro.globais.FINPEND, '{}');
        assert.match(bloco[16].corpo, /<Str sr="arg0" ve="3">%fim<\/Str>/);
        assert.doesNotMatch(bloco[16].corpo, /ConditionList/);
        assert.doesNotMatch(bloco[17].corpo, /ConditionList/);
    }
});

test('documentado', () => {
    const decisoes = ler('docs/DECISOES.md');
    assert.match(decisoes, /Atalhos da captura/);
    assert.match(ler('docs/REGRAS.md'), /`migrations\/42-atalhos-captura\.sql`/);
    assert.match(ler('docs/REGRAS.md'), /`migrations\/43-vinculos-pagamento\.sql`/);
    assert.match(ler('docs/REGRAS.md'), /\*\*Contas previstas pelo celular/);
    assert.match(ler('docs/DECISOES.md'), /Contas previstas: Pix e boleto pagam o que já existe/);
});

test('cada perfil leva a mesma tarefa do arquivo avulso', () => {
    const tarefa = (xml, sr) => xml.match(new RegExp(`<Task sr="${sr}">[\\s\\S]*?</Task>`))[0];
    assert.equal(tarefa(ler('tasker/Nubank.prf.xml'), 'task3'), tarefa(ler('tasker/Nubank_A.tsk.xml'), 'task3'));
    assert.equal(tarefa(ler('tasker/Nubank_Click.prf.xml'), 'task4'), tarefa(ler('tasker/Nubank_B.tsk.xml'), 'task4'));
});
