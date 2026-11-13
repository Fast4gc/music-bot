# 🎵 Bot de Música para Discord (Spotify + salas privadas)

Bot em **discord.js v14** com comandos slash em português, fila completa, botões de controle,
integração com a **API do Spotify** e **salas de voz privadas** criadas por comando.

## Como funciona (importante)

| Parte | Quem faz |
|---|---|
| Nome, artista, capa, duração, álbuns, playlists, busca/autocomplete | **API do Spotify** |
| O áudio em si | **yt-dlp** → YouTube (o Spotify **não** libera áudio por API) |
| Voz no Discord | `@discordjs/voice` + ffmpeg (incluso via `ffmpeg-static`) |

Ao tocar uma faixa do Spotify, o bot procura a equivalente no YouTube (comparando a duração para acertar a versão).
Também toca links de YouTube, playlists do YouTube, SoundCloud e outros sites que o yt-dlp suporte.

## Requisitos

- **Node.js 20+**
- **yt-dlp** instalado e **atualizado** (`yt-dlp -U`) → https://github.com/yt-dlp/yt-dlp/wiki/Installation
  - O YouTube hoje exige um runtime JavaScript para o yt-dlp. O bot já usa `--js-runtimes node` por padrão (`YTDLP_EXTRA_ARGS`). Se instalou o Deno, pode deixar vazio.
  - Prefira o executável oficial (já inclui o `yt-dlp-ejs`); se usar via pip: `pip install -U "yt-dlp[default]"`.
- Um app no Discord e (opcional, mas recomendado) um app no Spotify.

## Instalação

```bash
npm install
cp .env.example .env     # preencha os valores
npm run deploy           # registra os comandos slash
npm start
```

### 1. Discord
1. https://discord.com/developers/applications → **New Application** → aba **Bot** → copie o **Token** (`DISCORD_TOKEN`).
2. Copie o **Application ID** em *General Information* (`CLIENT_ID`).
3. Não precisa de nenhum *Privileged Intent*.
4. Convide o bot com este link (troque `SEU_CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&scope=bot+applications.commands&permissions=288377872
```

Permissões: Ver Canais, Enviar Mensagens, Inserir Links, Conectar, Falar, Mover Membros, **Gerenciar Canais** e **Gerenciar Cargos** (as duas últimas são necessárias para criar as salas privadas).

> Coloque `GUILD_ID` no `.env` durante os testes: os comandos aparecem na hora. Sem ele, o registro é global (pode demorar até ~1h).

### 2. Spotify (opcional, mas habilita links do Spotify, autocomplete e /buscar com Spotify)
1. https://developer.spotify.com/dashboard → **Create app** → marque **Web API**.
2. Copie **Client ID** e **Client Secret** para o `.env`.

**Limites atuais da API (mudanças de fev/2026) — o bot já se adapta a eles:**
- Apps em *Development mode* exigem que o dono do app tenha **Spotify Premium**.
- A busca retorna no máximo **10** resultados.
- Playlists **privadas, de outros usuários ou geradas pelo Spotify** (Daily Mix, Discover Weekly...) podem ser bloqueadas; playlists públicas comuns e álbuns costumam funcionar. Se uma playlist falhar, o bot avisa.
- Links de **artista** tocam até 10 músicas via busca (o endpoint de *top tracks* foi removido pelo Spotify).
- Sem as credenciais do Spotify o bot continua funcionando com YouTube normalmente.

## Comandos

### Música
| Comando | O que faz |
|---|---|
| `/tocar busca [proxima] [embaralhar] [somente_esta]` | Nome, link ou busca. Monta uma **fila** (não toca só 1 música). Use `somente_esta` para tocar só a escolhida |
| `/buscar termo` | Lista resultados num menu e você escolhe qual começa a fila |
| `/dj pedido [quantidade]` | **DJ Agent (IA):** cria uma fila com até 30 recomendações baseadas no seu pedido |
| `/pausar` · `/continuar` | Pausa / retoma |
| `/pular [para]` | Pula a atual ou vai direto à posição da fila |
| `/voltar` | Volta para a anterior |
| `/parar` | Para e limpa a fila |
| `/fila [pagina]` | Mostra a fila paginada com botões ⬅️ / ➡️ |
| `/tocando` | Música atual com barra de progresso e próximas da fila |
| `/volume [valor]` | 1–150% |
| `/repetir modo` | Desligado / música / fila |
| `/embaralhar` · `/remover posicao` · `/limpar` | Gerenciam a fila |
| `/entrar` · `/sair` | Entra no seu canal / sai |
| `/salvar` | Manda a música atual no seu privado |
| `/ping` · `/ajuda` | Latência / lista de comandos |

### IA (Gemini 2.5 Pro)
| Comando | O que faz |
|---|---|
| `/ia-ajuda pergunta` | Pergunte à IA sobre o bot (fila, Spotify, salas, etc.) |
| `/banner texto [estilo]` | Gera um banner de texto estilizado (spotify, neon, retro, minimal) |
| `/banner-musica` | Regenera o banner de IA da música atual (exibido no "Tocando agora") |
| `/verificar-usuario [usuario]` | Analisa o perfil de um usuário com IA (confiança, risco, recomendação) |

### Banners de IA por música (com proteções contra sobrecarga)

Quando uma música começa a tocar, o bot usa o **Gemini** para gerar um **banner personalizado** baseado no título e artista da faixa. O banner aparece na mensagem "Tocando agora" e é regenerado automaticamente a cada nova música.

### Proteções contra erro 503 / alta demanda

Se o Google AI Studio estiver com alta demanda (erro 503) ou limite de taxa (429), o bot:

1. **Tenta novamente automaticamente** com backoff exponencial (3s, 6s, 12s, até 3 tentativas)
2. **Aplica cooldown:** após 3 falhas consecutivas, pausa a geração de banner por 5 minutos (evita sobrecarregar a hospedagem)
3. **Usa cache:** banners já gerados são reutilizados por 24h (não consome requisições desnecessárias)
4. **Rate limit:** máximo 1 requisição a cada 1,5s por servidor
5. **Timeout:** 30 segundos por requisição (não trava o bot)

Você também pode regenerar o banner manualmente com:
- Botão **🎨** na mensagem "Tocando agora"
- Select menu ⚡ → "Regenerar banner IA"
- Comando `/banner-musica`

### Botões atualizados (Tocando agora)

A mensagem "Tocando agora" tem controles modernos:

| Linha | Botões |
|---|---|
| 🎵 Reprodução | ⏮️ ⏯️ ⏭️ ⏹️ 🔁 |
| 🎛️ Controles | 🔀 🔉 🔊 📜 🎨 (banner IA) |
| ⚡ Ações rápidas | Select menu: banner, músicas similares, fila, limpar, salvar |

O botão **🎨** gera um banner exclusivo para a música atual via IA.
O select menu ⚡ oferece ações rápidas sem ocupar espaço com botões extras.

A mensagem **"Tocando agora"** tem botões: ⏮️ ⏯️ ⏭️ ⏹️ 🔁 / 🔀 🔉 🔊 📜.

### Salas de voz privadas
| Comando | O que faz |
|---|---|
| `/sala criar [nome] [limite] [privada]` | Cria a sala (oculta para todos por padrão) e move você para ela |
| `/sala convidar @usuario` | Dá acesso (a sala aparece para a pessoa) |
| `/sala remover @usuario` | Tira o acesso e desconecta da sala |
| `/sala privacidade privada/publica` | Alterna a visibilidade |
| `/sala renomear` · `/sala limite` | Nome e limite de pessoas |
| `/sala transferir @usuario` | Passa a posse |
| `/sala info` · `/sala fechar` | Informações / apagar |

Depois de criar a sala, entre nela e use `/tocar`: o bot entra na sua sala e toca lá.
A sala **se apaga sozinha** quando fica vazia (`ROOM_EMPTY_DELETE_SECONDS`) e o estado é salvo em `data/rooms.json`.
Por padrão cada pessoa pode ter 1 sala (`MAX_ROOMS_PER_USER`); use `ROOMS_CATEGORY_ID` para criá-las dentro de uma categoria.

## Fila inteligente com auto-refill

Quando a fila está chegando ao fim (menos de `REFILL_THRESHOLD` músicas, padrão 5), o bot usa a **IA (Gemini)** para recomendar músicas parecidas com a atual e adiciona até `REFILL_SIZE` (padrão 30) faixas automaticamente. Assim a fila nunca fica vazia enquanto houver pessoas no canal.

Desativar: defina `AUTO_REFILL=false` no `.env`.

## Variáveis de ambiente (.env)

| Variável | Padrão | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | — | Chave do Google AI Studio (necessária para IA, banners, verificação) |
| `GEMINI_MODEL` | `gemini-2.5-pro` | Modelo do Gemini a usar |
| `AUTO_REFILL` | `true` | Ativa/desativa o auto-refill da fila |
| `REFILL_THRESHOLD` | `5` | Músicas restantes para disparar o refill |
| `REFILL_SIZE` | `30` | Quantas músicas adicionar por refill (máx. 30) |
| `DEFAULT_VOLUME` | `50` | Volume inicial |
| `MAX_QUEUE` | `500` | Limite de músicas na fila |
| `SEARCH_RESULTS` | `10` | Resultados por busca livre |

## Limitações conhecidas
- **Um bot = um canal de voz por servidor.** Se já estiver tocando em outro canal, o bot pede para você entrar nele (se estiver ocioso, ele muda para o seu). Para várias salas tocando ao mesmo tempo, rode mais instâncias do bot com tokens diferentes.
- Se o YouTube pedir login ("confirme que não é um robô"), exporte um `cookies.txt` e aponte `YTDLP_COOKIES` para ele.
- Se parar de funcionar do nada, **atualize o yt-dlp** primeiro — o YouTube muda com frequência.

## Problemas comuns
| Sintoma | Solução |
|---|---|
| `yt-dlp não encontrado` | Instale e/ou defina `YTDLP_PATH` com o caminho completo |
| Conecta mas não sai som / cai logo | Atualize as dependências (`npm update`); o Discord exige criptografia DAVE nas chamadas de voz, suportada pelo `@discordjs/voice` recente |
| `Missing Permissions` ao criar sala | Dê *Gerenciar Canais* e *Gerenciar Cargos* ao bot, e deixe o cargo dele acima de quem precisa ser convidado |
| Comandos não aparecem | Rode `npm run deploy` de novo; confira `CLIENT_ID`/`GUILD_ID` |
| Link de playlist do Spotify falha | Veja os limites do Spotify acima; teste com uma playlist pública sua |

## Estrutura
```
src/
  index.js              # cliente, eventos, roteamento de interações
  deploy-commands.js    # registra os slash commands
  config.js             # leitura do .env
  rooms.js              # salas de voz privadas (criar/convidar/apagar/persistir)
  music/
    player.js           # sessão por servidor: fila, loop, volume, conexão de voz
    spotify.js          # API do Spotify (metadados)
    ytdlp.js            # busca e stream via yt-dlp
    resolver.js         # texto/link -> faixas
    playQuery.js        # fluxo completo do /tocar
  handlers/musicButtons.js
  commands/*.js         # um arquivo por comando
  utils/                # embeds e checagens
```

> Aviso: baixar/transmitir áudio do YouTube pode violar os termos de uso deles. Use em servidores privados/pessoais e por sua conta e risco.
