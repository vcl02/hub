# Regras da página inicial (hub)

Comportamento visível da página inicial. As regras comuns a todos os apps (tema, sessão, caminhos, origem) ficam em `../AGENTS.md`; as diretrizes de infraestrutura, em `DIRETRIZES.md`.

## Página inicial

- **Login antes de tudo:** a página inicial abre no login (usuário `victor` ou e-mail, e senha) e só mostra os hábitos depois de entrar. Só a conta `DONO` (a mesma do tr) passa; outra conta sai na hora. Com a sessão salva, entra direto (inclusive sem internet). Sair, no canto superior direito, pede toque duplo e encerra a sessão neste aparelho para todos os apps.
- Hábito ou atalho não fica selecionado: destaque com mouse (`@media (hover: hover)`), teclado ou toque (`.tocado`, desde o toque; a navegação para os apps do hub espera 180 ms pra ela aparecer). Ao voltar, o tocado cresce de novo e volta ao normal sozinho em 0,7 s.
- O app é só do mantenedor: na página inicial, só o login, os hábitos e os atalhos; nada de textos explicando como usar.
- Quase só celular: tudo pensado para a tela do celular em pé, com os atalhos fixos embaixo, ao alcance do polegar.
- A marca do hub é `icons/hub.svg` (favicon e login; nenhum hábito ou atalho usa a marca; o título da tela dos hábitos é só o texto); `hub-32.png` (favicon de reserva), `hub-180.png` (iPhone) e `hub-192/512.png` (manifest, fundo inteiro para o sistema recortar) saem dela.

## Hábitos

- Hábitos: **Treino** (quarta e quinta, `ROTINA.treino`; segunda não conta, nem treinando), **Déficit** (comido ≤ meta do dia = gasto − 500, pela mesma conta do al; comido inclui as bebidas da Água com calorias), **Peso** (do Corpo, todo dia: pesagem lançada no dia), **Sono** (do Corpo: 7 h ou mais na noite que terminou no dia, lançado no dia, `SONO_MIN_H`; a noite de terça para quarta é folga, `SONO_FOLGA`; lançado com menos de 7 h já falha, e o valor fica em vermelho; até 27/10/2026 eram um hábito só, "Peso e sono", e cada um conta o histórico desde o próprio 1º registro), **Água** (1.000 ml, a meta da Água) e **Besteira** (Fin: nos dias presenciais, qua e qui, `ROTINA.presencial`, no máximo R$ 22 por dia na categoria Besteira, pela data da compra e pela mesma regra do teto de Besteira do Fin; o gasto só sobe, então hoje é feito enquanto couber e falha na hora em que passa; os outros dias são folga; começou em 27/10/2026). Cada um abre o app dele.
- **Lançado no dia:** a partir de 27/10/2026, só conta o que foi lançado no próprio dia. Peso e sono pelo instante gravado pelo Corpo (`peso_em`, `sono_em`); comida e caminhada do al pela hora (o al grava sem hora o que é lançado em outro dia): dia com comida lançada depois falha, e caminhada lançada depois não sobe a meta. Água só se lança no dia. Antes de 27/10, tudo conta como lançado no dia.
- **Déficit:** hoje conta como feito enquanto o comido couber na meta (com pelo menos um registro); passou da meta, volta a pendente (treino ou caminhada ainda podem subir a meta) e à meia-noite o dia fecha. Sem nenhum registro de comida no dia, falha.
- Estados de cada dia: feito, falhou, protegido, pendente (hoje), folga (dia sem o hábito) e antes (antes do 1º registro do hábito).
- **Ofensiva** de cada hábito: dias feitos seguidos até hoje; hoje pendente, folga e protegido não quebram nem somam; falha quebra. No treino, a ofensiva conta treinos (só qua e qui). A chama acende quando o de hoje já foi feito ou, em dia de folga, quando a ofensiva está em dia.
- Faixa da semana de hoje em cada hábito, de segunda a domingo como no Treino (os dias que ainda não chegaram ficam vazios, só o contorno apagado): verde = feito, vermelho = falhou, azul = protegido, as mesmas em todos os hábitos (a cor do app fica só no ícone), contorno = hoje pendente, fina = folga, apagada = antes do 1º registro.
- **Dia perfeito:** todos os hábitos feitos (treino pode ser folga), sem proteção; o de hoje conta quando tudo já está feito. No topo, os dias perfeitos seguidos e a semana de hoje (segunda a domingo, com os dias que ainda não chegaram apagados).
- **Dias anteriores:** arrastar de lado na tela dos hábitos troca o dia (para a direita, o dia anterior; para a esquerda, o seguinte, como em todo o hub), do 1º dia com registro até hoje; no computador, também ‹ › ao lado da data e as setas do teclado (no celular os ‹ › não aparecem). A data tem largura fixa (cabe a mais longa do ano), pra nada pular quando ela muda. Num dia passado a data fica em roxo, aparece o botão **Hoje** ao lado do Sair (só o ícone de calendário, o mesmo botão do Sair, em roxo; some em hoje), que volta direto, e tudo é do fim daquele dia: o valor de cada hábito diz o que aconteceu ("Não treinou", "Sem pesagem", "Nada lançado", "Folga"…), a ofensiva e os dias perfeitos seguidos são os daquele dia, e a semana mostrada é a dele. As proteções são sempre as de agora.
  - O dia visto fica no endereço (`?dia=AAAA-MM-DD`, como o `?ciclo` do Fin; em hoje, sem): recarregar mantém, e o Voltar do navegador volta ao dia visto antes.
  - Num dia passado, cada hábito abre o app naquele dia, só leitura (`?dia=AAAA-MM-DD`); a Besteira abre o Fin no ciclo daquele dia, normal (o Fin não tem modo só leitura).
- **Proteções:** +1 a cada semana de treino perfeita (quarta e quinta feitas, contada na quinta), no máximo 2 guardadas. Dia que falha gasta uma automaticamente, na ordem dos hábitos, e fica protegido. Tudo é recalculado dos dados a cada abertura, sem tabela própria.
- Dados: o hub só lê (`tr_treino`, `al_registro`, `al_dia`, `corpo_medida` por `lerMedidas`, `corpo_dia`, `agua_dia`, `fin` só a categoria Besteira), com cópia em `hub-habitos.<conta>` para abrir sem internet; tabela que falha fica com a cópia. Busca de novo ao voltar para a página. O que um app ainda não enviou à nuvem (sem internet, ou a página fechada antes do envio de 0,8 s) só aparece aqui depois de enviado.
- Rede ruim (metrô): cada busca no Supabase tem limite de 15 s; estourou, a tabela fica com a cópia e a próxima busca (ao voltar para a página ou reconectar) não fica presa.
- Atalhos sem hábito, fixos embaixo: Agenda e Anotações. O Fin abre pelo hábito Besteira (o gráfico dele vem na fase de gráficos).

## Atalhos

- Atalho com `class="app atalho externo"` (ex.: Agenda → Google Agenda): link para fora, em outra aba, nunca aceito como `?volta`. No Android, `hub.js` troca o link por um `intent://` que abre o app (`com.google.android.calendar`), com a web como reserva (`browser_fallback_url`).
- Anotações → conversa do WhatsApp comigo mesmo (ícone `icons/anotacoes.svg`, bloco de anotações) (`wa.me/<número>`, número público no repositório).
