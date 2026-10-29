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

test('Nubank A: depois do Stop do não-despesa, apaga a notificação da Nubank (AutoNotification), tenta lançar sozinho e para se lançou', () => {
    const todas = acoes(ler('tasker/Nubank_A.tsk.xml'));
    assert.deepEqual(todas.map(x => x.codigo), ['129', '548', '137', '2046367074', '129', '339', '129', '523', '137', '129', '523']);
    // Cancel do AutoNotification: só a da Nubank com "aprovad" no texto, sem condição própria (o
    // Stop de antes já garante que é compra; a condição antiga tinha "depesa*" e nunca rodava).
    const cancela = todas[3].corpo;
    assert.match(cancela, /<plugintypeid>com\.joaomgcd\.autonotification\.intent\.IntentCancelNotification<\/plugintypeid>/);
    assert.match(cancela, /_array_InterceptApps0&gt;com\.nu\.production&lt;/);
    assert.match(cancela, /<Text>aprovad<\/Text>/);
    assert.match(cancela, /<CancelAll>false<\/CancelAll>/);
    assert.doesNotMatch(cancela, /ConditionList/);
    assert.doesNotMatch(ler('tasker/Nubank_A.tsk.xml'), /depesa/);
    const a = [...todas.slice(0, 3), ...todas.slice(4)];   // o resto, como antes do Cancel
    const corpo = roda(script(a[3]), { tipo: 'despesa_credito', valor: '12.50', estab: 'NAQUELE CAFE', parcelas: '1' });
    assert.equal(JSON.parse(corpo.body).auto, true);
    assert.match(a[4].corpo, /captura-nubank<\/Str>/);
    assert.match(a[4].corpo, /x-fin-token:%FINTOKEN/);
    assert.match(a[4].corpo, /<Str sr="arg5" ve="3">%body<\/Str>/);
    // Lançou: aviso e para. Sem atalho, erro ou sem resposta: segue o fluxo de sempre.
    const lancou = roda(script(a[5]), { http_response_code: '200', http_data: '{"ok":true,"lancado":true,"nome":"Café","categ":"Besteira"}', valor: '12.50' });
    assert.equal(lancou.lancado, 'sim');
    assert.equal(lancou.aviso, 'Café R$ 12,50 · Besteira');
    for (const [codigo, dados] of [['200', '{"ok":true,"lancado":false}'], ['500', '{"erro":"x"}'], ['', '']]) {
        assert.equal(roda(script(a[5]), { http_response_code: codigo, http_data: dados, valor: '1' }).lancado, 'nao');
    }
    for (const i of [6, 7]) assert.match(a[i].corpo, /<lhs>%lancado<\/lhs>\s*<op>2<\/op>\s*<rhs>sim<\/rhs>/);
    assert.match(a[6].corpo, /<Str sr="arg0" ve="3">%aviso<\/Str>/);
    // O pendente (fluxo de tocar) usa o mesmo instante do pedido automático.
    assert.match(script(a[8]), /var agora = parseInt\(local\("agora"\), 10\) \|\| Math\.floor/);
});

test('Nubank B (e a cópia no perfil Click): "Sempre assim?" depois de Parcelas; Sim manda lembrar', () => {
    for (const arquivo of ['tasker/Nubank_B.tsk.xml', 'tasker/Nubank_Click.prf.xml']) {
        const b = acoes(ler(arquivo));
        assert.equal(b.length, 19, arquivo);
        assert.equal(b[12].codigo, '378');
        assert.match(b[12].corpo, /<Str sr="arg2" ve="3">Sempre assim\?<\/Str>/);
        assert.match(b[12].corpo, /<Str sr="arg3" ve="3">Sim,Não<\/Str>/);
        const base = { nome: 'Café', estab: 'X', tipo: 'despesa_credito', valor: '1', parcelas: '1', categ: 'Besteira', ts: '1' };
        assert.equal(JSON.parse(roda(script(b[13]), { ...base, ld_selected: 'Sim' }).body).lembrar, true);
        assert.equal(JSON.parse(roda(script(b[13]), { ...base, ld_selected: 'Não' }).body).lembrar, false);
        assert.equal(JSON.parse(roda(script(b[13]), { ...base, ld_selected: '' }).body).lembrar, false);
        assert.equal(b[14].codigo, '339');
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
