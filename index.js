require('dotenv').config();
const http = require('http');
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const stockPath = path.join(__dirname, '..', 'stock.json');
let stock = fs.existsSync(stockPath) ? JSON.parse(fs.readFileSync(stockPath, 'utf8')) : {};
function saveStock() { fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2)); }
function stockOf(id) { return Number(stock[id] || 0); }
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const commands = [
  new SlashCommandBuilder().setName('painel-vendas').setDescription('Envia o painel correspondente ao canal atual.'),
  new SlashCommandBuilder().setName('painel-todos').setDescription('Envia/atualiza os painéis de todos os canais de produtos.'),
  new SlashCommandBuilder().setName('produtos').setDescription('Mostra os produtos e o estoque.'),
  new SlashCommandBuilder().setName('estoque').setDescription('Mostra o estoque dos produtos.'),
  new SlashCommandBuilder().setName('adicionar').setDescription('Adiciona unidades ao estoque de um produto.')
    .addStringOption(o => o.setName('produto').setDescription('Produto').setRequired(true).addChoices(
      ...[...new Map(config.products.map(p => [p.channel, p.family])).entries()].map(([channel, family]) => ({ name: family.slice(0, 100), value: channel.slice(0, 100) }))
    ))
    .addStringOption(o => o.setName('plano').setDescription('Plano ou permanente').setRequired(true).addChoices(
      { name: '1 Day', value: '1-day' }, { name: '1 Month', value: '1-month' }, { name: 'Lifetime', value: 'lifetime' }, { name: 'Sem plano / Permanente', value: 'perm' }
    ))
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade para adicionar').setRequired(true).setMinValue(1).setMaxValue(100000)),
  new SlashCommandBuilder().setName('aprovar').setDescription('Aprova a compra deste ticket e entrega o cargo configurado.'),
  new SlashCommandBuilder().setName('fechar').setDescription('Fecha o ticket de compra atual.')
].map(c => c.toJSON());

function money(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: config.currency || 'BRL' }).format(v);
}
function isStaff(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    (config.staffRoleId && member?.roles?.cache?.has(config.staffRoleId));
}
function product(id) { return config.products.find(p => p.id === id); }
function safeName(name) { return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 20); }

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('Comandos registrados.');
}

function channelProducts(channelName) {
  const key = String(channelName || '').toLowerCase();
  return config.products.filter(p => String(p.channel || '').toLowerCase() === key);
}

function productPanel(channelName) {
  const products = channelProducts(channelName);
  if (!products.length) return null;
  const family = products[0].family;
  const permanent = products.length === 1 && products[0].name.toLowerCase() === 'permanent';

  const embed = new EmbedBuilder()
    .setTitle(`👑 ${family}`)
    .setDescription(permanent
      ? `Adquira **${family}** com acesso **permanente**.\n\n💳 Valor: **${money(products[0].price)}**\n📦 Estoque: **${stockOf(products[0].id)}**\n🎫 Ao comprar, um ticket privado será criado automaticamente.\n💰 O pagamento é confirmado manualmente pela equipe.`
      : `Escolha o período que deseja adquirir para **${family}**.\n\n🎫 Ao escolher um plano, um ticket privado será criado automaticamente.\n💰 O pagamento é confirmado manualmente pela equipe.`)
    .addFields({
      name: permanent ? '🛒 Produto' : '🛒 Planos',
      value: products.map(p => `**${p.name}** — ${money(p.price)} — 📦 Estoque: **${stockOf(p.id)}**`).join('\n')
    })
    .setFooter({ text: config.shopName });

  if (permanent) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`comprar_produto_${products[0].id}`)
        .setLabel(`Comprar — ${money(products[0].price)}`.slice(0, 80))
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row] };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`comprar_${safeName(channelName)}`)
    .setPlaceholder('🛒 Escolha seu plano');

  for (const p of products) {
    menu.addOptions(new StringSelectMenuOptionBuilder()
      .setLabel(`${p.name} — ${money(p.price)}`.slice(0, 100))
      .setValue(p.id)
      .setDescription((p.description || 'Plano disponível').slice(0, 100))
      .setEmoji('🛒'));
  }
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

async function createPurchaseTicket(interaction, p) {
  if (!p) return interaction.reply({ content: '❌ Produto inválido.', ephemeral: true });
  if (stockOf(p.id) <= 0) return interaction.reply({ content: `❌ **${p.family} — ${p.name}** está sem estoque no momento.`, ephemeral: true });
  const guild = interaction.guild;
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic?.startsWith(`buyer=${interaction.user.id};`));
  if (existing) return interaction.reply({ content: `⚠️ Você já possui um ticket aberto: ${existing}`, ephemeral: true });

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  if (config.staffRoleId) overwrites.push({ id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const ticketChannel = await guild.channels.create({
    name: `compra-${safeName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: config.categoryId || undefined,
    topic: `buyer=${interaction.user.id};product=${p.id}`,
    permissionOverwrites: overwrites
  });

  const embed = new EmbedBuilder().setTitle('🛒 Pedido iniciado')
    .setDescription(`Olá <@${interaction.user.id}>!\n\n**Produto:** ${p.family}\n**Plano:** ${p.name}\n**Valor:** ${money(p.price)}\n\n💳 **Pagamento — ${config.payment.method}**\n${config.payment.instructions}\n\nDepois de pagar, clique em **Já paguei** e aguarde a equipe.`)
    .setFooter({ text: config.shopName });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ja_paguei').setLabel('Já paguei').setEmoji('💳').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Cancelar').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
  await ticketChannel.send({ content: config.staffRoleId ? `<@&${config.staffRoleId}>` : undefined, embeds: [embed], components: [row] });
  return interaction.reply({ content: `✅ Seu ticket foi criado: ${ticketChannel}`, ephemeral: true });
}

async function sendPanelToChannel(channel) {
  const panel = productPanel(channel.name);
  if (!panel) return false;
  await channel.send(panel);
  return true;
}

client.once('ready', () => console.log(`Logado como ${client.user.tag}`));

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'painel-vendas') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão para isso.', ephemeral: true });
        const panel = productPanel(interaction.channel.name);
        if (!panel) return interaction.reply({ content: '❌ Este canal não é um dos canais de produtos configurados.', ephemeral: true });
        await interaction.channel.send(panel);
        return interaction.reply({ content: '✅ Painel enviado neste canal.', ephemeral: true });
      }

      if (interaction.commandName === 'painel-todos') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão para isso.', ephemeral: true });
        const guild = interaction.guild;
        const names = [...new Set(config.products.map(p => p.channel))];
        let sent = 0;
        for (const name of names) {
          const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === name.toLowerCase());
          if (ch && await sendPanelToChannel(ch)) sent++;
        }
        return interaction.reply({ content: `✅ Painéis enviados em **${sent}/${names.length}** canais.`, ephemeral: true });
      }

      if (interaction.commandName === 'estoque' || interaction.commandName === 'produtos') {
        const families = {};
        for (const p of config.products) (families[p.family] ??= []).push(p);
        const text = Object.entries(families).map(([family, items]) => `**${family}**\n${items.map(p => `• ${p.name} — ${money(p.price)} — 📦 **${stockOf(p.id)}** em estoque`).join('\n')}`).join('\n\n');
        const title = interaction.commandName === 'estoque' ? `📦 ${config.shopName} — Estoque` : `🛒 ${config.shopName} — Produtos`;
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle(title).setDescription(text || 'Nenhum produto configurado.')] });
      }

      if (interaction.commandName === 'adicionar') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão para alterar o estoque.', ephemeral: true });
        const channel = interaction.options.getString('produto');
        const plan = interaction.options.getString('plano');
        const amount = interaction.options.getInteger('quantidade');
        const p = plan === 'perm'
          ? config.products.find(x => x.channel === channel && x.name.toLowerCase() === 'permanent')
          : config.products.find(x => x.channel === channel && x.id.endsWith(`-${plan}`));
        if (!p) return interaction.reply({ content: '❌ Produto/plano não encontrado.', ephemeral: true });
        stock[p.id] = stockOf(p.id) + amount;
        saveStock();
        return interaction.reply({ content: `✅ Adicionado **${amount}** unidade(s) de **${p.family} — ${p.name}**. Estoque atual: **${stockOf(p.id)}**.` });
      }

      if (interaction.commandName === 'aprovar') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Você não tem permissão para aprovar compras.', ephemeral: true });
        const topic = interaction.channel.topic || '';
        const match = topic.match(/buyer=(\d+);product=([^;]+)/);
        if (!match) return interaction.reply({ content: '❌ Este canal não parece ser um ticket de compra.', ephemeral: true });
        const buyerId = match[1];
        const p = product(match[2]);
        if (!p) return interaction.reply({ content: '❌ Produto não encontrado no config.json.', ephemeral: true });
        const guild = interaction.guild;
        const member = await guild.members.fetch(buyerId).catch(() => null);
        if (stockOf(p.id) <= 0) return interaction.reply({ content: '❌ Este produto ficou sem estoque antes da aprovação.', ephemeral: true });
        if (member && p.roleId) await member.roles.add(p.roleId).catch(() => null);
        stock[p.id] = stockOf(p.id) - 1;
        saveStock();
        const log = config.salesLogChannelId ? guild.channels.cache.get(config.salesLogChannelId) : null;
        if (log) {
          const e = new EmbedBuilder().setTitle('💰 Venda aprovada').addFields(
            { name: 'Cliente', value: `<@${buyerId}>`, inline: true },
            { name: 'Produto', value: p.name, inline: true },
            { name: 'Valor', value: money(p.price), inline: true },
            { name: 'Estoque restante', value: String(stockOf(p.id)), inline: true },
            { name: 'Responsável', value: `<@${interaction.user.id}>`, inline: true }
          ).setTimestamp();
          await log.send({ embeds: [e] });
        }
        await interaction.reply({ content: `✅ Compra de **${p.name}** aprovada. Cargo entregue: <@&${p.roleId}>` });
        return;
      }

      if (interaction.commandName === 'fechar') {
        if (!interaction.channel.topic?.startsWith('buyer=')) return interaction.reply({ content: '❌ Este não é um ticket de compra.', ephemeral: true });
        if (!isStaff(interaction.member) && interaction.channel.topic.split(';')[0] !== `buyer=${interaction.user.id}`) return interaction.reply({ content: '❌ Você não pode fechar este ticket.', ephemeral: true });
        await interaction.reply('🔒 Ticket sendo fechado...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 1500);
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('comprar_')) {
      const p = product(interaction.values[0]);
      return createPurchaseTicket(interaction, p);
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('comprar_produto_')) {
        const productId = interaction.customId.slice('comprar_produto_'.length);
        const p = product(productId);
        return createPurchaseTicket(interaction, p);
      }

      if (interaction.customId === 'ja_paguei') {
        const topic = interaction.channel.topic || '';
        const match = topic.match(/buyer=(\d+);product=([^;]+)/);
        if (!match || match[1] !== interaction.user.id) return interaction.reply({ content: '❌ Somente o comprador pode marcar o pagamento.', ephemeral: true });
        await interaction.reply({ content: config.staffRoleId ? `💳 <@&${config.staffRoleId}> o cliente <@${interaction.user.id}> informou que pagou. Confiram o pagamento antes de usar /aprovar.` : '💳 Pagamento informado. Aguarde a confirmação da equipe.' });
      }
      if (interaction.customId === 'fechar_ticket') {
        const topic = interaction.channel.topic || '';
        const buyer = topic.match(/buyer=(\d+)/)?.[1];
        if (buyer !== interaction.user.id && !isStaff(interaction.member)) return interaction.reply({ content: '❌ Você não pode fechar este ticket.', ephemeral: true });
        await interaction.reply('🔒 Fechando ticket...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 1000);
      }
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) interaction.reply({ content: '❌ Ocorreu um erro. Confira o console do bot.', ephemeral: true }).catch(() => {});
  }
});

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 10000);
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('FURIA Vendas Bot online.');
}).listen(PORT, '0.0.0.0', () => console.log(`Servidor HTTP ativo na porta ${PORT}.`));

registerCommands().then(() => client.login(process.env.DISCORD_TOKEN)).catch(console.error);
