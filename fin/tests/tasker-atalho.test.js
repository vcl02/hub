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
function roda(codigo, locais) {
    const saida = { ...locais };
    vm.runInNewContext(codigo, { local: k => saida[k], setLocal: (k, v) => { saida[k] = v; }, JSON, Math, Date, String, parseInt });
    return saida;
}

test('Nubank A: depois do Stop do não-despesa, apaga a notificação do banco (AutoNotification), tenta lançar sozinho e para se lançou', () => {
    const todas = acoes(ler('tasker/Nubank_A.tsk.xml'));
    assert.deepEqual(todas.map(x => x.codigo), ['129', '548', '137', '2046367074', '2046367074', '129', '339', '129', '523', '137', '129', '523']);
    // Cancel do AutoNotification: Nubank com "Compra" no texto (crédito e débito: no débito "aprovada" só
    // está no título) e Mercado Pago pelo texto da fatura; cada um só na compra do próprio banco.
    const [nu, mp] = [todas[3].corpo, todas[4].corpo];
    for (const cancela of [nu, mp]) {
        assert.match(cancela, /<plugintypeid>com\.joaomgcd\.autonotification\.intent\.IntentCancelNotification<\/plugintypeid>/);
        assert.match(cancela, /<CancelAll>false<\/CancelAll>/);
        assert.match(cancela, /<CaseinsensitiveText>true<\/CaseinsensitiveText>/);
    }
    assert.match(nu, /_array_InterceptApps0&gt;com\.nu\.production&lt;/);
    assert.match(nu, /<Text>Compra<\/Text>/);
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
    for (const [codigo, dados] of [['200', '{"ok":true,"lancado":false}'], ['500', '{"erro":"x"}'], ['', '']]) {
        assert.equal(roda(script(a[5]), { http_response_code: codigo, http_data: dados, valor: '1' }).lancado, 'nao');
    }
    for (const i of [6, 7]) assert.match(a[i].corpo, /<lhs>%lancado<\/lhs>\s*<op>2<\/op>\s*<rhs>sim<\/rhs>/);
    assert.match(a[6].corpo, /<Str sr="arg0" ve="3">%aviso<\/Str>/);
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

test('Nubank B (e a cópia no perfil Click): "Sempre assim?" depois de Parcelas; Sim pede o trecho do lugar e manda lembrar', () => {
    for (const arquivo of ['tasker/Nubank_B.tsk.xml', 'tasker/Nubank_Click.prf.xml']) {
        const b = acoes(ler(arquivo));
        assert.equal(b.length, 22, arquivo);
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

test('documentado', () => {
    const decisoes = ler('docs/DECISOES.md');
    assert.match(decisoes, /Atalhos da captura/);
    assert.match(ler('docs/REGRAS.md'), /`migrations\/42-atalhos-captura\.sql`/);
});

test('cada perfil leva a mesma tarefa do arquivo avulso', () => {
    const tarefa = (xml, sr) => xml.match(new RegExp(`<Task sr="${sr}">[\\s\\S]*?</Task>`))[0];
    assert.equal(tarefa(ler('tasker/Nubank.prf.xml'), 'task3'), tarefa(ler('tasker/Nubank_A.tsk.xml'), 'task3'));
    assert.equal(tarefa(ler('tasker/Nubank_Click.prf.xml'), 'task4'), tarefa(ler('tasker/Nubank_B.tsk.xml'), 'task4'));
});
