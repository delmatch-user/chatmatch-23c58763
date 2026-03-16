# Servidor Baileys para WhatsApp

Este servidor Node.js gerencia a conexão com o WhatsApp usando a biblioteca Baileys.

## 🚀 Instalação

### Opção 1: Docker (Recomendado)

```bash
# 1. Copiar arquivo de exemplo e configurar
cp .env.example .env

# 2. Editar o .env com suas credenciais
nano .env

# 3. Construir e iniciar
docker-compose up -d

# Ver logs
docker-compose logs -f
```

### Opção 2: Node.js direto

```bash
# 1. Copiar e configurar variáveis
cp .env.example .env
nano .env

# 2. Instalar dependências
npm install

# 3. Iniciar em desenvolvimento
npm run dev

# Ou em produção
npm start
```

## ⚙️ Configuração

### Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| PORT | Porta do servidor | Não (padrão: 3001) |
| WEBHOOK_URL | URL do webhook para eventos | Sim |
| AUTH_DIR | Diretório para salvar sessões | Não (padrão: ./auth_sessions) |
| SUPABASE_URL | URL do projeto Supabase | Sim (para upload direto de mídia) |
| SUPABASE_SERVICE_KEY | Service Role Key do Supabase | Sim (para upload direto de mídia) |

## 📡 API Endpoints

### GET /status
Retorna o status atual da conexão.

```json
{
  "status": "connected",
  "phone": "5511999990000",
  "hasQR": false
}
```

### GET /qr
Retorna o QR Code para conexão (base64).

```json
{
  "success": true,
  "qr": "data:image/png;base64,...",
  "status": "waiting_qr"
}
```

### POST /connect
Inicia uma nova conexão.

### POST /disconnect
Desconecta e limpa a sessão.

### POST /send
Envia uma mensagem.

```json
{
  "to": "5511999990000",
  "message": "Olá!",
  "type": "text"
}
```

### GET /check/:phone
Verifica se um número existe no WhatsApp.

### GET /health
Health check do servidor.

## 🔔 Eventos de Webhook

O servidor envia os seguintes eventos para a URL configurada:

- `connection.open` - WhatsApp conectado
- `connection.closed` - Conexão fechada
- `message.received` - Nova mensagem recebida (mídia enviada direto ao Storage)
- `message.status` - Atualização de status (enviado/entregue/lido)

### Processamento de Mídia

Quando uma mensagem com mídia (imagem, áudio, vídeo, documento) é recebida:

1. O servidor baixa a mídia do WhatsApp
2. Faz upload direto para o Supabase Storage (bucket `chat-uploads`)
3. Envia no webhook o campo `mediaUrl` com a URL pública
4. Fallback: se o Storage não estiver configurado, usa base64 para arquivos < 4MB

O Edge Function `whatsapp-webhook` é responsável por:
- Quando recebe `mediaUrl`: usar diretamente (já está no Storage)
- Quando recebe `mediaBase64` (fallback): fazer upload para o Storage
- Salvar a URL pública no banco de dados

## 🐳 Deploy

### Railway/Render/Heroku

1. Faça deploy deste diretório como um serviço Node.js
2. Configure as variáveis de ambiente
3. A porta será automaticamente detectada via `process.env.PORT`

### VPS com Docker

```bash
# Clone o repositório
git clone <repo-url>
cd baileys-server

# Configure o webhook
export WEBHOOK_URL=https://seu-projeto.supabase.co/functions/v1/whatsapp-webhook

# Inicie com Docker Compose
docker-compose up -d
```

## 📝 Notas

- A sessão é persistida no volume Docker
- Reconexão automática em caso de desconexão
- Suporte a múltiplos tipos de mensagem (texto, imagem, documento, etc.)
- Mídias são enviadas direto para o Supabase Storage (sem limite de tamanho do webhook)
