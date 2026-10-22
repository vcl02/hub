// Contrato de nomenclatura da tabela técnica `fin` e da migration que preserva os registros existentes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const estado = fs.readFileSync('js/app-state.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const migration = fs.readFileSync('migrations/13-renomear-lancamentos-para-fin.sql', 'utf8');
const migrationColunas = fs.readFileSync('migrations/14-renomear-colunas-fin.sql', 'utf8');

test('usa fin como tabela técnica e não mantém rota ativa para o nome antigo', () => {
    assert.match(estado, /const TABELA_FIN = 'fin';/);
    assert.match(api, /rest\/v1\/\$\{TABELA_FIN\}/);
    assert.doesNotMatch(api, /rest\/v1\/lancamentos/);
});

test('a migration renomeia a tabela sem copiar registros e recarrega o schema da API', () => {
    assert.match(migration, /alter table public\.lancamentos rename to fin;/);
    assert.match(migration, /alter table public\.fin rename constraint lancamentos_2_pkey to fin_pkey;/);
    assert.match(migration, /notify pgrst, 'reload schema';/);
    assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into\s+)?public\.(lancamentos|fin)\b/i);
});

test('a migration renomeia as colunas sem alterar valores e recarrega o schema da API', () => {
    assert.match(migrationColunas, /alter table public\.fin rename column fatura_venc to fatura;/);
    assert.match(migrationColunas, /alter table public\.fin rename column reserva_emergencia to reserva;/);
    assert.match(migrationColunas, /alter index public\.fin_fatura_venc_idx rename to fin_fatura_idx;/);
    assert.match(migrationColunas, /notify pgrst, 'reload schema';/);
    assert.doesNotMatch(migrationColunas, /\b(insert|update|delete)\s+(into\s+)?public\.fin\b/i);
});
