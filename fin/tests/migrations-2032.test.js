// Limite de geração em 31/12/2032 e as migrations que levam o banco até lá: 32 (pra sempre
// por frequência), 33 (estende as séries pra sempre), 34 (ciclos até 2032) e 35 (antecipação
// sem Frequência). Todas precisam rodar no DataGrip, que parte o script em cada ";".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const dominio = fs.readFileSync('js/domain.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const ler = nome => fs.readFileSync(`migrations/${nome}`, 'utf8');
const m32 = ler('32-pra-sempre-por-frequencia.sql');
const m33 = ler('33-estender-pra-sempre-ate-2032.sql');
const m34 = ler('34-ciclos-ate-2032.sql');
const m35 = ler('35-antecipacao-sem-frequencia.sql');

test('as quatro migrations são seguras pro DataGrip: sem $$, sem DO, sem ";" em comentário, numa transação', () => {
    for (const sql of [m32, m33, m34, m35]) {
        assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\$\$/);
        assert.doesNotMatch(sql, /^\s*do\s/im);
        assert.ok(!sql.split('\n').some(l => /^\s*--.*;/.test(l)));
        assert.match(sql, /^begin;$/m);
        assert.match(sql, /^commit;$/m);
    }
});

test('a data-limite das migrations é a mesma do código', () => {
    const limite = dominio.match(/const DATA_LIMITE_RECORRENCIA = '(\d{4}-\d{2}-\d{2})';/)[1];
    assert.equal(limite, '2032-12-31');
    assert.match(m33, new RegExp(`date '${limite}'`));
    assert.match(m34, new RegExp(`date '${limite}'`));
});

test('migration 32: critério por frequência contra o limite antigo, só liga a marca', () => {
    assert.match(m32, /select 'public\.fin_historico'::regclass;/);
    assert.match(m32, /when 'Anual' then ultima \+ interval '1 year'/);
    assert.match(m32, /when 'Semestral' then ultima \+ interval '6 months'/);
    assert.match(m32, /end > date '2029-12-31'/);
    assert.match(m32, /and ultima <= date '2029-12-31'/);
    assert.match(m32, /!~\* '\(investimento\|antecipa\|pagamento fatura\|ajuste\)'/);
    assert.match(m32, /set pra_sempre = true/);
    assert.doesNotMatch(m32, /set pra_sempre = false/);
});

test('migration 33: parte da ocorrência mais recente, copia o modelo, nasce aberta, fatura anda com a data', () => {
    assert.match(m33, /\(array_agg\(id order by data desc, id desc\)\)\[1\] modelo_id/);
    assert.match(m33, /when 'Mensal' then m\.data \+ make_interval\(months => p\)/);
    assert.match(m33, /when 'Quinzenal' then m\.data \+ make_interval\(days => 14 \* p\)/);
    assert.match(m33, /select data, valor, nome, categ, freq, cred, false, fatura, recorrencia_id,\s*\n\s*null, canal, prio, reserva, comprometido, true/);
    assert.match(m33, /case when m\.cred then \(m\.fatura \+ make_interval\(months =>/);
    assert.match(m33, /coalesce\(f\.recorrencia_id, nextval\('public\.fin_recorrencia_seq'\)::int\) recorrencia_id/);
    assert.match(m33, /where o\.data <= date '2032-12-31'/);
});

test('migration 34: ciclos a partir do Faturamento PJ, fim na véspera do seguinte, último aberto', () => {
    assert.match(m34, /lock table public\.fin_ciclo in share row exclusive mode;/);
    assert.match(m34, /\(lead\(data\) over \(order by data\) - 1\) fim/);
    assert.match(m34, /when 6 then d\.util \+ 2\s*\n\s*when 7 then d\.util \+ 1/);
    assert.match(m34, /to_char\(data, 'MM-DD'\) = '09-07'/);
    assert.match(m34, /set fim = \(select min\(inicio\) - 1 from ciclos_novos\)\s*\n\s*where fim is null/);
    assert.match(m34, /and data > \(select max\(inicio\) from public\.fin_ciclo\)/);
});

test('migration 35: antecipação/Ajuste sem lote perdem a Frequência e freq perde o default Mensal', () => {
    assert.match(m35, /set freq = null\s*\n\s*where freq is not null\s*\n\s*and recorrencia_id is null/);
    assert.match(m35, /alter table public\.fin alter column freq drop default;/);
});

test('REGRAS.md documenta o limite 2032 e as migrations 32 a 35', () => {
    assert.match(regras, /`DATA_LIMITE_RECORRENCIA` \(31\/12\/2032, inclusive; em `js\/domain\.js`\)/);
    assert.match(regras, /`migrations\/32-pra-sempre-por-frequencia\.sql` marca pra sempre, pelo critério por frequência/);
    assert.match(regras, /`migrations\/33-estender-pra-sempre-ate-2032\.sql` gera, pra cada grupo pra sempre, as ocorrências que faltam/);
    assert.match(regras, /`migrations\/34-ciclos-ate-2032\.sql` cria os ciclos de jan\/2030 a dez\/2032/);
    assert.match(regras, /`migrations\/35-antecipacao-sem-frequencia\.sql` tira a Frequência/);
    assert.match(regras, /O `setval` dela volta a sequência de propósito e, como toda mudança de sequência no PostgreSQL, não é desfeito por `rollback`/);
});

test('toda migration da 28 em diante roda no DataGrip (sem DO, sem ";" em $$ ou comentário, numa transação)', () => {
    const arquivos = fs.readdirSync('migrations').filter(n => /^\d+-.*\.sql$/.test(n) && parseInt(n, 10) >= 28);
    assert.ok(arquivos.length >= 8);
    for (const nome of arquivos) {
        const sql = ler(nome);
        const semComentarios = sql.replace(/--[^\n]*/g, '');
        for (const [, corpo] of semComentarios.matchAll(/\$\$([\s\S]*?)\$\$/g)) assert.doesNotMatch(corpo, /;/, nome);
        assert.doesNotMatch(sql, /^\s*do\s/im, nome);
        assert.ok(!sql.split('\n').some(l => /^\s*--.*;/.test(l)), `${nome}: ";" em comentário`);
        assert.match(sql, /^begin;$/m, nome);
        assert.match(sql, /^commit;$/m, nome);
    }
});

test('docs explicam o formato do DataGrip e o histórico de problemas', () => {
    const agentes = fs.readFileSync('AGENTS.md', 'utf8');
    const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
    const checklist = fs.readFileSync('docs/CHECKLIST-PUBLICACAO.md', 'utf8');
    assert.match(agentes, /Toda migration precisa rodar no DataGrip, que parte o script em \*\*cada\*\* `;`/);
    assert.match(decisoes, /^## Migrations no DataGrip$/m);
    assert.match(decisoes, /unterminated dollar-quoted string/);
    assert.match(decisoes, /^## Limite de geração das séries$/m);
    assert.match(decisoes, /^## Histórico de problemas e correções$/m);
    assert.match(regras, /Aplicadas e conferidas por `SELECT` até a 35/);
    assert.match(checklist, /Se o script abortar, rode `rollback;` antes de tentar de novo\./);
});
