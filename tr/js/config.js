'use strict';
/*
  Treino — login e dados no Supabase (projeto fin, tabelas tr_*), com cópia local para funcionar sem internet.

  Banco em memória (cada lista vira uma tabela; ver js/banco.js):
    db = {
      exercicios: [{ id, grupo, regiao, series, reps, descanso, modo, ativo,
                     variacoes: [{ id, nome, unidade, passo, lados, equip?, nota? }] }],
      registros:  [{ variacao, data, series: [{ kg, reps, falha? }] }],   // 1 por exercício por dia; kg na unidade da variação; falha = não completou a série
      treinos:    [{ inicio, fim, fechado?, cardio? }]             // horários (ms); fim = última interação ou "Finalizar"
                                                                   // cardio = esteira depois do treino: { inicio, ms, vel, incl } (ms, ms, km/h, %)
    }
  reps = reps da série mais leve (topo da faixa). modo = crescente | reta | invertida.
  variacoes[0] = principal, [1] = substituto (máquina), [2] = halter. "ativo" = variação em uso.
  unidade = kg | lb | nível (máquina que marca só a posição/placa, sem peso) | corpo (peso do corpo: só reps) | s (segundos, como
  pendurar na barra: reps guarda os segundos). corpo e s gravam kg 0. passo = quanto a pirâmide sobe (anilha/placa). lados = 2 quando o peso é por lado.
  Pontos, nível, conquistas e calorias são calculados a partir desses dados (nada extra é guardado).
  Fotos das máquinas ficam fora do banco: localStorage "carga.foto.<variação>".
  Peso corporal, perfil (idade, taxa basal) e a conta das calorias do treino vêm do app Corpo: ../corpo/perfil.js (medidasGuardadas,
  lerMedidas, pesoNoDia, tmb, kcalTreino). O Treino não grava pesagens.
*/
// Este módulo: Configuração do app: Supabase, conta, dias de treino, exercícios padrão e guia de execução.

// ===== Supabase (chave publicável: pode ficar no código; quem protege os dados é o RLS por usuário) =====
const SUPABASE_URL = 'https://yzmyncxoskvqzdczaill.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
const DONO = '32f70255-30a0-4e2b-ad76-31d7a1bf54f7';   // única conta com acesso (o RLS das tabelas tr_* também só libera ela)
const DONO_ANTIGO = '2f9bc201-9966-4f37-9963-2f4b9ddab849';   // conta apagada em 24/10/2026: só para adotar a cópia do aparelho (login.js)
const EMAIL_POR_USUARIO = { victor: 'victor.cabrera0209@gmail.com' };   // login aceita o usuário ou o e-mail, como no fin
const emailDoLogin = texto => { const t = String(texto || '').trim(); return t.includes('@') ? t : EMAIL_POR_USUARIO[t.toLowerCase()] || null; };

// ===== Configuração =====
const DIAS_FIXOS = ROTINA.treino;        // quarta, quinta (Date.getDay) · rotina em ../corpo/perfil.js
const DIAS_EXTRA = ROTINA.treinoExtra;   // segunda (sugerido)
const TIPOS = ['Principal', 'Substituto', 'Halter'];
const REGIOES = ['Pernas', 'Superior'];
const UNIDADES = ['kg', 'lb', 'nível', 'corpo', 's'];
const semPeso = v => v?.unidade === 'corpo' || v?.unidade === 's';   // séries sem peso: só reps (ou segundos)
// Planos por mês (exercício pelo id): cada etapa vale 1 mês a partir do início e a última continua valendo. Em cada etapa,
// a variação, as séries e o alvo de cada semana (1ª, 2ª, 3ª, 4ª em diante): reps, ou segundos na unidade s. Todas as séries
// com o mesmo alvo (modo reta). O plano escolhe a variação, as séries e as reps do exercício: trocar à mão não vale.
const PLANOS = {
  flexao: { inicio: '2026-10-28', etapas: [
    { variacao: 0, series: 3, reps: [6, 8, 10, 12] },    // joelhos apoiados
    { variacao: 1, series: 3, reps: [3, 4, 5, 6] },      // completa, poucas reps
    { variacao: 1, series: 3, reps: [6, 8, 10, 12] }     // completa, subindo as reps
  ] },
  barrafix: { inicio: '2026-10-28', etapas: [
    { variacao: 0, series: 3, reps: [15, 20, 25, 30] },  // pendurado, segundos
    { variacao: 1, series: 3, reps: [3, 3, 4, 5] },      // negativa: sobe com o banco e desce em 3 a 5 s
    { variacao: 2, series: 3, reps: [1, 2, 2, 3] }       // barra completa
  ] }
};
const LB = 0.45359237;
const MODO_PADRAO = 'invertida';   // pirâmide de exercício novo
const AVISO_AJUSTE = 7000;         // ms antes do fim do descanso: aviso "Se ajuste" para se ajeitar na máquina
const MODOS = { crescente: 'Crescente', reta: 'Mesma carga', invertida: 'Invertida' };
const PADRAO = [             // grupo, região, descanso (s), [principal, substituto, halter]
  ['Pernas · empurrar', 'Pernas', 90, ['Leg press 45°', 'Agachamento no Smith', 'Agachamento taça com halter']],
  ['Posterior de coxa', 'Pernas', 60, ['Cadeira flexora', 'Mesa flexora', 'Stiff com halteres']],
  ['Peito', 'Superior', 75, ['Supino máquina', 'Voador (peck deck)', 'Supino reto com halteres']],
  ['Costas · puxar de cima', 'Superior', 75, ['Puxada alta', 'Barra assistida (graviton)', 'Pullover com halter']],
  ['Costas · remar', 'Superior', 75, ['Remada sentada máquina', 'Remada baixa no cabo', 'Remada unilateral (serrote)']],
  ['Ombros', 'Superior', 60, ['Desenvolvimento máquina', 'Desenvolvimento no Smith', 'Desenvolvimento com halteres']]
];
const passoPadrao = (indice, unidade) => ['nível', 'corpo', 's'].includes(unidade) ? 1 : indice === 2 && unidade === 'kg' ? 2 : 5;   // anilha 5, halter 2
// Descrição e posição de cada exercício (orientação geral; ajuste ao seu corpo e à máquina)
const GUIA = {
  'leg press 45°': ['Máquina inclinada com anilhas · quadríceps e glúteos', 'Costas e quadril colados no encosto. Pés na largura dos ombros, no meio da plataforma, joelhos na direção dos pés. Desça até uns 90° no joelho sem tirar o quadril do banco; em cima, não trave o joelho.'],
  'agachamento no smith': ['Barra guiada · quadríceps e glúteos', 'Barra no alto das costas, nunca no pescoço. Pés um pouco à frente da barra, na largura dos ombros. Desça até a coxa ficar paralela ao chão, coluna neutra.'],
  'agachamento taça com halter': ['Em pé, halter junto ao peito · quadríceps e glúteos', 'Halter em pé, colado ao peito. Pés um pouco além da largura dos ombros, pontas levemente para fora. Desça com o tronco ereto, cotovelos por dentro dos joelhos.'],
  'cadeira flexora': ['Máquina sentada · posterior de coxa', 'Joelho alinhado com o eixo de giro da máquina. Rolo logo acima do calcanhar. Prenda a coxa com a almofada de cima; dobre até onde der e volte devagar.'],
  'mesa flexora': ['Máquina deitada de bruços · posterior de coxa', 'Joelho logo depois da borda do banco, alinhado com o eixo. Rolo logo acima do calcanhar. Quadril colado no banco, sem levantar o bumbum.'],
  'stiff com halteres': ['Em pé, halteres · posterior de coxa e glúteos', 'Joelhos levemente dobrados e parados. Leve o quadril para trás com a coluna reta, halteres rente às pernas; desça até sentir alongar atrás da coxa.'],
  'elevação pélvica na máquina': ['Máquina com encosto para as costas · glúteos', 'Alto das costas (logo abaixo das escápulas) no encosto e o rolo ou cinto no vinco do quadril. Pés na largura do quadril, canelas na vertical lá em cima. Suba até alinhar tronco e coxas, aperte o glúteo 1 s e desça sem encostar. Queixo levemente para o peito, sem arquear a lombar.'],
  'elevação pélvica no smith': ['Barra guiada, costas num banco · glúteos', 'Banco atrás, na altura das escápulas; barra no vinco do quadril, com almofada. Pés na largura do quadril, canelas na vertical em cima. Suba até alinhar tronco e coxas e aperte o glúteo em cima; olhar para a frente, sem arquear a lombar.'],
  'elevação pélvica com halter': ['Banco e 1 halter no quadril · glúteos', 'Escápulas apoiadas no banco, halter deitado no vinco do quadril, seguro com as duas mãos. Pés na largura do quadril; suba até alinhar tronco e coxas, segure 1 s em cima e desça devagar.'],
  'supino máquina': ['Máquina sentada · peito, ombro e tríceps', 'Banco na altura em que a pegada fique na linha do meio do peito. Escápulas juntas e costas apoiadas; empurre sem travar o cotovelo.'],
  'voador (peck deck)': ['Máquina sentada (crucifixo) · peito', 'Banco na altura em que os braços fiquem na linha do peito, ombros um pouco abaixo das mãos. Cotovelos levemente dobrados e parados; feche à frente sem bater os pegadores.'],
  'supino reto com halteres': ['Banco reto e halteres · peito, ombro e tríceps', 'Pés no chão. Halteres na linha do meio do peito, cotovelos a uns 45° do tronco. Desça até a linha do peito e suba sem bater os halteres.'],
  'puxada alta': ['Polia alta · costas (dorsal) e bíceps', 'Ajuste o rolo para prender as coxas. Pegada um pouco mais aberta que os ombros. Puxe a barra até o alto do peito levando os cotovelos para baixo, sem jogar o tronco para trás.'],
  'barra assistida (graviton)': ['Máquina com contrapeso · costas e bíceps', 'Aqui mais peso = mais ajuda (fica mais fácil); para progredir, diminua o peso. Joelhos na plataforma, pegada na largura dos ombros; suba até o queixo passar a barra.'],
  'pullover com halter': ['Banco e 1 halter · costas e peito', 'Deitado, halter seguro com as duas mãos acima do peito. Leve para trás da cabeça com os cotovelos levemente dobrados e volte até em cima do peito.'],
  'remada sentada máquina': ['Máquina sentada com apoio no peito · costas e bíceps', 'Peito na almofada; banco na altura em que a pegada fique entre o peito e o abdômen. Puxe levando os cotovelos para trás e juntando as escápulas.'],
  'remada baixa no cabo': ['Polia baixa · costas e bíceps', 'Pés na plataforma, joelhos levemente dobrados, coluna reta. Puxe o triângulo até o abdômen sem balançar o tronco.'],
  'remada unilateral (serrote)': ['Banco e 1 halter · costas', 'Mão e joelho do mesmo lado apoiados no banco, costas retas. Puxe o halter até a lateral do abdômen, cotovelo rente ao corpo.'],
  'desenvolvimento máquina': ['Máquina sentada · ombros e tríceps', 'Banco na altura em que as pegadas fiquem na linha dos ombros. Costas apoiadas; peito estufado; empurre para cima sem tirar o quadril do banco.'],
  'desenvolvimento no smith': ['Barra guiada · ombros e tríceps', 'Banco com encosto em pé; a barra desce até a altura do queixo, à frente do rosto. Peito estufado e abdômen firme, sem jogar o tronco para trás.'],
  'flexão com joelhos apoiados': ['No chão, joelhos apoiados · peito, ombros e tríceps', 'Mãos um pouco mais abertas que os ombros, joelhos no chão (com algo macio embaixo). Corpo reto dos joelhos à cabeça, abdômen e glúteo firmes. Desça até o peito quase encostar no chão, cotovelos a uns 45° do tronco, e empurre.'],
  'flexão completa': ['No chão, na ponta dos pés · peito, ombros e tríceps', 'Mãos um pouco mais abertas que os ombros, corpo reto dos calcanhares à cabeça (sem deixar o quadril cair nem subir). Desça até o peito quase encostar no chão, cotovelos a uns 45° do tronco, e empurre. Não saiu a rep inteira? Termine a série com os joelhos apoiados.'],
  'pendurar na barra': ['Barra fixa, só segurar · pegada, ombros e costas', 'Suba com um banco e segure a barra com as mãos um pouco mais abertas que os ombros, palmas para a frente. Pés fora do chão, braços esticados, ombros um pouco puxados para baixo (sem encolher até a orelha). Segure o tempo da série e desça com o banco.'],
  'negativa na barra': ['Barra fixa e banco · costas (dorsal) e bíceps', 'Suba com o banco até o queixo passar da barra, já na posição de cima. Tire os pés e desça o mais devagar que conseguir (3 a 5 s) até os braços esticarem. Volte com o banco: cada descida é uma rep.'],
  'barra fixa': ['Barra fixa · costas (dorsal) e bíceps', 'Pegada um pouco mais aberta que os ombros, palmas para a frente. Parta de braços esticados, puxe levando os cotovelos para baixo até o queixo passar da barra e desça devagar. Sem balançar. Não saiu nenhuma? Faça negativas no lugar.'],
  'rosca de punho com halteres': ['Sentado, antebraço na coxa · antebraço (parte de dentro)', 'Antebraços apoiados nas coxas, punhos para fora do joelho, palmas para cima, um halter em cada mão. Deixe o halter descer até a ponta dos dedos e suba só dobrando o punho, sem mexer o antebraço.'],
  'rosca de punho invertida com halteres': ['Sentado, antebraço na coxa · antebraço (parte de cima)', 'Igual à rosca de punho, mas com as palmas para baixo: punho para fora do joelho, suba as costas da mão só dobrando o punho e desça devagar. Use menos peso que na normal.'],
  'desenvolvimento com halteres': ['Banco com encosto e halteres · ombros e tríceps', 'Costas apoiadas, halteres na altura das orelhas, cotovelos levemente à frente. Empurre para cima e desça devagar.']
};
const K_ANTIGO = 'carga.vault.v1', K_ANTIGO_CHAVE = 'carga.key.v1';   // banco da versão antiga (só para migrar)
const NOME_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIA_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
