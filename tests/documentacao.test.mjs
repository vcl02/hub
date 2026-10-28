// Documentação e migrations de todos os projetos (sem navegador): AGENTS com Infraestrutura, REGRAS, DECISOES e numeração das migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = arquivo => readFileSync(path.join(RAIZ, arquivo), 'utf8');
const PROJETOS = ['.', 'fin', 'tr', 'al', 'corpo', 'agua'];
const ITENS = ['Migrations', 'Testes', 'Pacotes', 'Backups', 'Domínio'];
const em = (projeto, arquivo) => path.posix.join(projeto, arquivo);

test('diretrizes gerais com as seções de cada tema e a tabela com todos os projetos', () => {
  const diretrizes = ler('docs/DIRETRIZES.md');
  for (const secao of ['## Projetos', '## 1. Documentação: AGENTS, REGRAS, DECISOES', '## 2. Migrations', '## 3. Testes: funções e Playwright',
    '## 4. Pacotes', '## 5. Backups', '## 6. Domínios e endereços', '## 7. Pendências']) assert.ok(diretrizes.includes(`\n${secao}`), secao);
  for (const projeto of PROJETOS.slice(1)) assert.match(diretrizes, new RegExp(`\\| \`${projeto}/\` \\|`), projeto);
  assert.match(ler('AGENTS.md'), /`docs\/DIRETRIZES\.md`/);
});

test('todo projeto tem AGENTS (com Infraestrutura), REGRAS e DECISOES', () => {
  for (const projeto of PROJETOS) {
    for (const doc of ['AGENTS.md', 'docs/REGRAS.md', 'docs/DECISOES.md']) {
      const texto = ler(em(projeto, doc));
      assert.match(texto, /^# \S/, `${em(projeto, doc)}: título`);
      assert.match(texto, /\n## \S/, `${em(projeto, doc)}: ao menos uma seção`);
    }
    const agentes = ler(em(projeto, 'AGENTS.md'));
    const inicio = agentes.indexOf('\n## Infraestrutura\n');
    assert.ok(inicio >= 0, `${projeto}: seção Infraestrutura`);
    const secao = agentes.slice(inicio + 1).split(/\n## /)[0];
    assert.match(secao, /docs\/DIRETRIZES\.md/, `${projeto}: aponta para as diretrizes`);
    assert.deepEqual([...secao.matchAll(/^- \*\*([^:*]+):\*\* /gm)].map(m => m[1]), ITENS, `${projeto}: itens da Infraestrutura`);
  }
});

test('migrations de cada projeto: NN-o-que-faz.sql, de 00 em diante sem pular nem repetir, com cabeçalho', () => {
  for (const projeto of PROJETOS) {
    const pasta = em(projeto, 'migrations');
    assert.ok(existsSync(path.join(RAIZ, pasta)), pasta);
    const nomes = readdirSync(path.join(RAIZ, pasta)).sort();
    assert.ok(nomes.length > 0, pasta);
    nomes.forEach((nome, i) => {
      assert.match(nome, /^\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.sql$/, `${pasta}/${nome}`);
      assert.equal(Number(nome.slice(0, 2)), i, `${pasta}/${nome}: numeração seguida`);
      assert.match(ler(`${pasta}/${nome}`), /^-- \S/, `${pasta}/${nome}: cabeçalho`);
    });
  }
});

test('migration com função de gatilho em plpgsql está listada como exceção nas diretrizes', () => {
  const diretrizes = ler('docs/DIRETRIZES.md');
  const comPlpgsql = PROJETOS.flatMap(projeto => readdirSync(path.join(RAIZ, em(projeto, 'migrations')))
    .filter(nome => /language plpgsql/.test(ler(em(projeto, `migrations/${nome}`))))
    .map(nome => [projeto, nome.slice(0, 2)]));
  assert.deepEqual(comPlpgsql.map(([p, n]) => `${p}/${n}`).sort(), ['./00', 'agua/02', 'fin/27']);
  assert.match(diretrizes, /`fin\/migrations\/27`[^\n]*`migrations\/00` \(raiz\) e `agua\/migrations\/02`/);
});

test('inventário de pacotes das diretrizes bate com o código', () => {
  const diretrizes = ler('docs/DIRETRIZES.md');
  const playwright = JSON.parse(ler('tr/package.json')).devDependencies.playwright;
  assert.match(diretrizes, new RegExp(`\\| \`playwright\` \\| ${playwright.replaceAll('.', '\\.')} \\|`));
  assert.match(ler('supabase.js'), /supabase-js\/2\.118\.0/);
  assert.match(diretrizes, /\| `@supabase\/supabase-js` \| 2\.118\.0 \|/);
  const fin = ler('fin/index.html');
  for (const [pacote, versao] of [['@supabase/supabase-js', fin.match(/@supabase\/supabase-js@([\d.]+)/)[1]], ['chart.js', fin.match(/chart\.js@([\d.]+)/)[1]]]) {
    assert.ok(diretrizes.includes(`| \`${pacote}\` | ${versao} | \`fin/index.html\``), `${pacote}@${versao}`);
  }
  const sdk = ler('al/supabase/functions/al-estimar/index.ts').match(/npm:@anthropic-ai\/sdk@([\d.]+)/)[1];
  assert.ok(diretrizes.includes(`| \`@anthropic-ai/sdk\` | ${sdk} |`), sdk);
  // Só o tr tem package.json: os outros usam o Playwright de lá.
  for (const projeto of PROJETOS.filter(p => p !== 'tr')) assert.ok(!existsSync(path.join(RAIZ, em(projeto, 'package.json'))), projeto);
});

test('sem domínio próprio: nenhum CNAME e nenhum arquivo publicado com o domínio escrito', () => {
  assert.ok(!existsSync(path.join(RAIZ, 'CNAME')));
  const publicados = ['index.html', 'hub.js', 'sw.js', 'manifest.webmanifest', ...PROJETOS.slice(1).flatMap(p => {
    const js = existsSync(path.join(RAIZ, p, 'js')) ? readdirSync(path.join(RAIZ, p, 'js')).map(n => `${p}/js/${n}`) : [];
    return [`${p}/index.html`, `${p}/manifest.webmanifest`, ...js].filter(f => existsSync(path.join(RAIZ, f)));
  })];
  for (const arquivo of publicados) assert.doesNotMatch(ler(arquivo), /github\.io/, arquivo);
});

test('Edge Functions com os tipos jsr em versão fixa, a mesma do supabase-js', () => {
  const versao = ler('supabase.js').match(/supabase-js\/(\d+\.\d+\.\d+)/)[1];
  assert.match(ler('fin/index.html'), new RegExp(`@supabase/supabase-js@${versao.replaceAll('.', '\\.')}/`));
  for (const funcao of ['fin/supabase/functions/captura-nubank/index.ts', 'al/supabase/functions/al-estimar/index.ts', 'agua/supabase/functions/agua-lembrete/index.ts']) {
    const fonte = ler(funcao);
    assert.ok(fonte.includes(`import "jsr:@supabase/functions-js@${versao}/edge-runtime.d.ts";`), funcao);
    const especificadores = [...fonte.matchAll(/(?:from|import) "((?:npm|jsr):[^"]+)"/g)].map(m => m[1]);
    assert.ok(especificadores.length > 0, funcao);
    for (const e of especificadores) assert.match(e, /^(npm|jsr):@[\w-]+\/[\w-]+@\d+\.\d+\.\d+(\/|$)/, `${funcao}: ${e}`);
  }
});
