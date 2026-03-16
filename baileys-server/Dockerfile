FROM node:20-alpine

RUN apk add --no-cache git

# Instalar dependências nativas necessárias para Baileys
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    wget \
    ca-certificates \
    ffmpeg

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar TODAS as dependências (sem --production para compilar bindings nativos)
RUN npm install

# Copiar código fonte
COPY . .

# Criar diretório para sessões
RUN mkdir -p auth_sessions

# Porta padrão
EXPOSE 3001

# Variáveis de ambiente
ENV PORT=3001
ENV AUTH_DIR=/app/auth_sessions

# Comando de inicialização
CMD ["npm", "start"]
