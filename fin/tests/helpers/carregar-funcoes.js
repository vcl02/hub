// Helper de testes: executa funções puras de scripts clássicos sem carregar DOM ou Supabase.
const fs = require('node:fs');
const vm = require('node:vm');

function extrairTrecho(fonte, inicioTexto, fimTexto) {
    const inicio = fonte.indexOf(inicioTexto);
    const fim = fonte.indexOf(fimTexto, inicio);
    if (inicio < 0 || fim < 0) throw Error(`Não encontrou trecho: ${inicioTexto}`);
    return fonte.slice(inicio, fim);
}

function carregarFuncoes(arquivo, nomes, contexto = {}) {
    const fonte = fs.readFileSync(arquivo, 'utf8');
    vm.createContext(contexto);
    vm.runInContext(`${fonte}\nglobalThis.funcoesTestadas = { ${nomes.join(', ')} };`, contexto);
    return contexto.funcoesTestadas;
}

module.exports = { extrairTrecho, carregarFuncoes };
