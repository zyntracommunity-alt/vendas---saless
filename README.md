# FURIA Vendas Bot — 7 canais

Esta versão organiza a loja em 1 categoria com 7 canais normais: `uefi`, `external`, `ghost`, `advanced`, `bypass`, `phantom` e `client`.

Em cada canal, use `/painel-vendas` para publicar o painel com os 3 planos: 1 Day, 1 Month e Lifetime. Todos estão configurados em R$ 10 e os três planos de cada produto entregam o mesmo cargo do produto.

Também existe `/painel-todos`, que procura os 7 canais pelo nome e publica os painéis em todos eles.

A compra cria um ticket privado na categoria definida em `categoryId`. A confirmação do pagamento continua manual: a equipe confere o PIX e usa `/aprovar` no ticket para entregar o cargo e registrar a venda.

## Instalação
1. Node.js 20+.
2. `npm install`
3. Renomeie `.env.example` para `.env` e preencha `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
4. Preencha sua chave PIX em `config.json`.
5. `npm start`

## Discord
Crie 1 categoria de produtos com estes 7 canais de texto:
- `uefi`
- `external`
- `ghost`
- `advanced`
- `bypass`
- `phantom`
- `client`

No servidor, o cargo do bot deve ficar acima de todos os cargos que ele entrega e ter **Gerenciar cargos**. O bot também precisa de Ver canais, Enviar mensagens, Gerenciar canais e Ler histórico.

## Render
Esta versão já inclui um servidor HTTP em `0.0.0.0:$PORT`, então pode ser usada no Web Service do Render com `npm install` e `npm start`.

Nunca compartilhe o token do bot.

## Estoque

O bot agora mantém o estoque em `stock.json`.

- `/adicionar produto:<produto> plano:<1 Day|1 Month|Lifetime> quantidade:<n>` adiciona unidades.
- `/estoque` mostra o estoque por produto/plano.
- `/produtos` mostra produtos, preços e estoque.
- Ao criar o pedido, o bot impede compras sem estoque.
- Ao aprovar uma venda com `/aprovar`, 1 unidade é descontada do estoque e o cargo configurado é entregue.

Os produtos adicionais configurados são B00STS, GTAV, GTAV Compartilhado e Rockstar. Cada um possui 1 Day, 1 Month e Lifetime, com o mesmo cargo da família em todos os planos.


## Produtos sem plano
B00STS, GTAV, GTAV Compartilhado e Rockstar são vendidos como **Permanent**, sem 1 Day/1 Month/Lifetime. Rockstar está configurado em R$ 1,00; os outros produtos permanecem em R$ 10,00.

## Estoque
Use `/adicionar` e escolha `Sem plano / Permanente` para B00STS, GTAV, GTAV Compartilhado ou Rockstar. Exemplo: `/adicionar b00sts sem plano / permanente 3` (na interface do Discord, selecione as opções). Para UEFI, External, Ghost, Advanced, Bypass, Phantom e Client, selecione 1 Day, 1 Month ou Lifetime.

A categoria pode conter estes canais de produto: `uefi`, `external`, `ghost`, `advanced`, `bypass`, `phantom`, `client`, `boosts`, `gtav`, `gtav-compartilhado` e `rockstar`.


### Canais extras
Crie estes canais com os nomes exatos para os painéis extras:
- 🚀・b00sts
- 🔫・gta-v
- ⭐・r0ckstar
