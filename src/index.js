require("dotenv").config();

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => {
  res.status(200).send("Zyntra Ticket Bot online.");
});

app.listen(PORT, () => {
  console.log(`Servidor HTTP ativo na porta ${PORT}`);
});

const required = ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[AVISO] Variável ausente: ${key}`);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

const ticketTypes = {
  erros: {
    label: "Erros",
    emoji: "🛠️",
    description: "Relate um erro ou problema",
    env: "CATEGORY_ERROS_ID"
  },
  reset_hwid: {
    label: "Reset HWID",
    emoji: "🔄",
    description: "Solicite suporte para reset de HWID",
    env: "CATEGORY_RESET_HWID_ID"
  },
  suporte: {
    label: "Suporte",
    emoji: "🎫",
    description: "Atendimento geral",
    env: "CATEGORY_SUPORTE_ID"
  },
  anydesk: {
    label: "Suporte via AnyDesk",
    emoji: "🖥️",
    description: "Atendimento remoto via AnyDesk",
    env: "CATEGORY_ANYDESK_ID"
  },
  streamers: {
    label: "Streamers",
    emoji: "🎥",
    description: "Parcerias e atendimento para streamers",
    env: "CATEGORY_STREAMERS_ID"
  }
};

function getCategoryId(type) {
  return process.env[ticketTypes[type]?.env] || process.env.DEFAULT_CATEGORY_ID || null;
}

function safeChannelName(user, type) {
  const base = user.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 18) || "usuario";

  return `ticket-${type}-${base}`.slice(0, 95);
}

function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(0xB026FF)
    .setTitle("🎫 ZYNTRA STORE • CENTRAL DE ATENDIMENTO")
    .setDescription(
      "Selecione abaixo o assunto do seu atendimento para abrir um ticket privado com a equipe da **Zyntra**.\n\n" +
      "⚡ Escolha uma categoria\n" +
      "🔐 Aguarde a equipe\n" +
      "💬 Explique seu problema com detalhes"
    )
    .addFields({
      name: "Categorias disponíveis",
      value:
        "🛠️ Erros\n" +
        "🔄 Reset HWID\n" +
        "🎫 Suporte\n" +
        "🖥️ Suporte via AnyDesk\n" +
        "🎥 Streamers"
    })
    .setFooter({ text: "Zyntra Store • Atendimento organizado" });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_category")
    .setPlaceholder("Escolha o tipo de atendimento")
    .addOptions(
      Object.entries(ticketTypes).map(([value, item]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.label)
          .setValue(value)
          .setEmoji(item.emoji)
          .setDescription(item.description)
      )
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("painel")
      .setDescription("Envia o painel de tickets da Zyntra")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log("Comandos registrados.");
}

client.once("ready", async () => {
  console.log(`Conectado como ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "painel") {
      const channel = await client.channels.fetch(process.env.PANEL_CHANNEL_ID).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          content: "❌ O `PANEL_CHANNEL_ID` não é válido ou o bot não consegue acessar o canal.",
          ephemeral: true
        });
      }

      await channel.send(buildPanel());
      return interaction.reply({
        content: "✅ Painel enviado com sucesso.",
        ephemeral: true
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_category") {
      await interaction.deferReply({ ephemeral: true });

      const type = interaction.values[0];
      const typeInfo = ticketTypes[type];
      const guild = interaction.guild;

      const existing = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.topic === `ticket-owner:${interaction.user.id}`
      );

      if (existing) {
        return interaction.editReply({
          content: `❌ Você já possui um ticket aberto: ${existing}`
        });
      }

      const staffRoleId = process.env.STAFF_ROLE_ID;
      const categoryId = getCategoryId(type);

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ];

      if (staffRoleId) {
        permissionOverwrites.push({
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageMessages
          ]
        });
      }

      const ticketChannel = await guild.channels.create({
        name: safeChannelName(interaction.user, type),
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        topic: `ticket-owner:${interaction.user.id}`,
        permissionOverwrites
      });

      const embed = new EmbedBuilder()
        .setColor(0xFF2DA6)
        .setTitle(`${typeInfo.emoji} Ticket de ${typeInfo.label}`)
        .setDescription(
          `Olá, ${interaction.user}!\n\n` +
          `Seu ticket foi criado na categoria **${typeInfo.label}**.\n` +
          "Explique sua situação e aguarde a equipe da Zyntra.\n\n" +
          "Não envie senhas, tokens ou informações confidenciais."
        )
        .setFooter({ text: "Zyntra Store • Atendimento" });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("Assumir ticket")
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Fechar ticket")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `${interaction.user}${staffRoleId ? ` <@&${staffRoleId}>` : ""}`,
        embeds: [embed],
        components: [buttons]
      });

      await interaction.editReply({
        content: `✅ Seu ticket foi criado: ${ticketChannel}`
      });

      const logChannel = process.env.LOG_CHANNEL_ID
        ? await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null)
        : null;

      if (logChannel?.isTextBased()) {
        await logChannel.send(
          `📥 Ticket aberto: ${ticketChannel} | Usuário: ${interaction.user.tag} | Categoria: ${typeInfo.label}`
        );
      }
    }

    if (interaction.isButton() && interaction.customId === "claim_ticket") {
      const staffRoleId = process.env.STAFF_ROLE_ID;
      const member = interaction.member;

      if (staffRoleId && !member.roles.cache.has(staffRoleId)) {
        return interaction.reply({
          content: "❌ Apenas a equipe pode assumir tickets.",
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `🙋 Ticket assumido por **${interaction.user.tag}**.`,
        ephemeral: false
      });
    }

    if (interaction.isButton() && interaction.customId === "close_ticket") {
      const staffRoleId = process.env.STAFF_ROLE_ID;
      const isStaff = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
      const isOwner = interaction.channel.topic === `ticket-owner:${interaction.user.id}`;

      if (!isStaff && !isOwner) {
        return interaction.reply({
          content: "❌ Você não tem permissão para fechar este ticket.",
          ephemeral: true
        });
      }

      await interaction.reply("🔒 Este ticket será fechado em 5 segundos.");
      setTimeout(() => {
        interaction.channel.delete("Ticket fechado").catch(console.error);
      }, 5000);
    }
  } catch (error) {
    console.error("Erro na interação:", error);

    const response = {
      content: "❌ Ocorreu um erro. Verifique os IDs, permissões e logs do bot.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
