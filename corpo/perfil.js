'use strict';
// Dados sobre mim, para todos os apps do hub (módulo do app Corpo): altura, nascimento, sexo, idade, taxa basal, calorias do
// treino e a leitura das pesagens e medidas. Altura, nascimento e sexo ficam só no código, fora do banco; pesagens e medidas
// ficam na tabela corpo_medida, que só o app Corpo grava. Os apps carregam com <script src="../corpo/perfil.js">.
const PERFIL = Object.freeze({ altura: 1.78, nascimento: '2002-09-14', sexo: 'M' });   // altura em metros; sexo M | F
// Rotina da semana (Date.getDay: 0 = domingo): treino fixo, treino extra sugerido (opcional), caminhada do dia já marcada e
// dias presenciais no serviço (os outros dias úteis são em casa)
const ROTINA = Object.freeze({ treino: Object.freeze([3, 4]), treinoExtra: Object.freeze([1]), caminhada: Object.freeze([3, 4]), presencial: Object.freeze([3, 4]) });   // qua e qui · seg · qua e qui · qua e qui
// Idade completa no dia (AAAA-MM-DD)
function idadeEm(dia) { const [a, m, d] = dia.split('-').map(Number), [na, nm, nd] = PERFIL.nascimento.split('-').map(Number); return a - na - (m < nm || (m === nm && d < nd) ? 1 : 0); }
// Taxa metabólica basal (Mifflin-St Jeor), kcal/dia
const tmb = (peso, dia) => Math.round(10 * peso + 6.25 * PERFIL.altura * 100 - 5 * idadeEm(dia) + (PERFIL.sexo === 'M' ? 5 : -161));
// Calorias de um treino de musculação: MET 3,5 (Compendium of Physical Activities, código 02054) com 1 MET = a sua
// basal por hora (não os 1 kcal/kg/h do padrão), então idade, altura e sexo entram na conta. ms = duração do treino.
const MET_MUSCULACAO = 3.5;
const kcalTreino = (peso, dia, ms) => Math.round(MET_MUSCULACAO * tmb(peso, dia) / 24 * ms / 36e5);

// Pesagens e medidas (corpo_medida): { data, hora, peso?, cintura? } em kg e cm (cintura = barriga na linha do umbigo).
// Os outros apps só leem: lerMedidas busca na nuvem e guarda a cópia no aparelho (corpo.medidas.<conta>), que
// medidasGuardadas devolve na hora, inclusive sem internet. Em ordem de data, da mais antiga para a mais recente.
const K_MEDIDAS = id => 'corpo.medidas.' + id;
const medidaLimpa = m => {
  const peso = parseFloat(m.peso), cintura = parseFloat(m.cintura);
  return { data: m.data, hora: /^\d{2}:\d{2}$/.test(m.hora) ? m.hora : '', ...(peso > 0 && { peso }), ...(cintura > 0 && { cintura }) };
};
const ordenarMedidas = L => L.filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.data)).map(medidaLimpa).filter(m => m.peso || m.cintura).sort((a, b) => a.data.localeCompare(b.data));
function medidasGuardadas(id) { try { return ordenarMedidas(JSON.parse(localStorage.getItem(K_MEDIDAS(id))) || []); } catch (e) { return []; } }
function guardarMedidas(id, L) { try { localStorage.setItem(K_MEDIDAS(id), JSON.stringify(ordenarMedidas(L))); } catch (e) {} }
async function lerMedidas(sb, id) {
  const L = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('corpo_medida').select('data,hora,peso,cintura').range(i, i + 999);
    if (error) throw error;
    L.push(...data); if (data.length < 1000) break;
  }
  guardarMedidas(id, L);
  return medidasGuardadas(id);
}
// Peso do dia: a pesagem mais recente até ele (antes da 1ª pesagem, a 1ª). Sem nenhuma pesagem, null.
function pesoNoDia(medidas, dia) {
  const P = medidas.filter(m => m.peso);
  return ([...P].reverse().find(m => m.data <= dia) || P[0])?.peso || null;
}
