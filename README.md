# 🚀 Astra Campaign v0.0.4 - Plataforma SaaS Multi-Tenant para Campanhas WhatsApp

<div align="center">

![Logo](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**Plataforma SaaS profissional multi-tenant para campanhas de WhatsApp em massa com IA integrada**

[🎯 Recursos](#-recursos-principais) • [✨ Novidades v0.0.4](#-novidades-da-vers%C3%A3o-004) • [🛠️ Instalação](#️-instalação) • [📚 Documentação](#-documentação) • [🤝 Contribuição](#-contribuindo)

</div>

---

## ✨ Novidades da Versão 0.0.4

### 🎨 **Campanhas Interativas com Flow Builder Visual** (DESTAQUE!)
- ✅ **Editor Visual Drag & Drop** - Crie fluxos de conversação sem código usando ReactFlow
- ✅ **12+ Tipos de Nodes** - Text, Image, Video, Audio, Document, Condition, Delay, AI, HTTP REST, Integrations, Stop
- ✅ **Processamento com IA** - OpenAI/Groq integrado nos fluxos
- ✅ **Condições Inteligentes** - Ramificações baseadas em respostas
- ✅ **Integrações Nativas** - Chatwoot e Perfex CRM dentro dos fluxos
- ✅ **Sistema de Sessões** - Rastreamento completo de estado por contato
- ✅ **Webhooks Bidirecionais** - Resposta automática a mensagens recebidas

### 💼 **Integração Perfex CRM**
- ✅ **Importação de Leads** - Sincronize leads do Perfex CRM como contatos
- ✅ **Sincronização Bidirecional** - Mantenha dados atualizados entre sistemas
- ✅ **Mapeamento de Campos** - Configure campos customizados
- ✅ **Node Dedicado** - Use Perfex diretamente nos fluxos interativos

### 🎛️ **Controle de Provedores por Tenant**
- ✅ **Provedores Configuráveis** - Cada tenant escolhe entre WAHA, Evolution API ou QuePasa
- ✅ **Flexibilidade Total** - Habilite apenas os provedores necessários
- ✅ **Interface Simplificada** - Seleção visual de provedores

### 🔐 **Sistema de Webhooks Seguro**
- ✅ **HMAC-SHA256** - Validação criptográfica de webhooks
- ✅ **Idempotência** - Detecção automática de mensagens duplicadas
- ✅ **URLs Dedicadas** - Webhook único por conexão

### 📈 **Melhorias Gerais**
- ✅ **+19 Componentes** - Novos componentes React para fluxos
- ✅ **+10 Services** - Nova arquitetura de serviços
- ✅ **+9 Rotas API** - Endpoints para campanhas interativas
- ✅ **+5 Modelos Prisma** - Novos models no banco de dados
- ✅ **Documentação Completa** - Guias, API e testes

📖 **[Ver Changelog Completo](RELEASE_v0.0.3.txt)** | **[Guia de Campanhas Interativas](CAMPANHA_INTERATIVA_README.md)**

---

## 📋 Sobre o Projeto

O **Astra Campaign** é uma **plataforma SaaS multi-tenant** completa e open-source para gerenciamento e execução de campanhas de WhatsApp em massa e interativas. Desenvolvido com arquitetura moderna, oferece recursos enterprise como isolamento total de dados por empresa, sistema de quotas, backup/restore automatizado, inteligência artificial para personalização de mensagens, **flow builder visual para conversas interativas**, suporte a múltiplos provedores WhatsApp (WAHA, Evolution API e QuePasa), além de integrações com Chatwoot e Perfex CRM.

> 🔥 **Open Source & SaaS Ready**: Projeto totalmente gratuito com arquitetura multi-tenant pronta para comercialização. Sem ligação alguma com o WhatsApp oficial.

### ✨ Principais Diferenciais

- 🎨 **Flow Builder Visual**: Crie conversas interativas com editor Drag & Drop (ReactFlow)
- 🤖 **Campanhas Interativas**: Fluxos bidirecionais com IA, condições e integrações
- 🏢 **Multi-Tenant (SaaS)**: Isolamento completo de dados por empresa
- 🔌 **Múltiplos Provedores**: WAHA API, Evolution API e QuePasa (configurável por tenant)
- 🤖 **IA Integrada**: OpenAI e Groq para mensagens personalizadas e processamento de respostas
- 💬 **Integração Chatwoot**: Importação de contatos e criação de tickets
- 💼 **Integração Perfex CRM**: Sincronização de leads e dados bidirecionais
- 🎲 **Randomização Inteligente**: Textos, imagens, vídeos e arquivos aleatórios
- 🔄 **Multi-Sessão com Failover**: Distribuição inteligente de envios
- 🔐 **Webhooks Seguros**: HMAC-SHA256 para validação de webhooks
- 💾 **Backup & Restore**: Sistema automatizado de backup e restauração
- 📊 **Analytics Completo**: Relatórios detalhados com exportação CSV
- 👥 **Sistema de Roles**: SUPERADMIN, ADMIN e USER
- ⚖️ **Sistema de Quotas**: Controle de limites por tenant
- 🎨 **White Label**: Personalização completa da marca
- 🐳 **Deploy Simplificado**: Docker Swarm com Traefik

---

## 🎯 Recursos Principais

### 🎨 **Campanhas Interativas com Flow Builder** (NOVO v0.0.4)
- ✅ **Editor Visual Drag & Drop**: Construa fluxos complexos com interface intuitiva
- ✅ **12+ Tipos de Nodes**: Trigger, Text, Image, Video, Audio, Document, Condition, Delay, AI, HTTP REST, Integrations, Stop
- ✅ **Nodes de Condição**: Crie ramificações baseadas em respostas dos contatos
- ✅ **Processamento com IA**: OpenAI e Groq integrados para respostas inteligentes
- ✅ **HTTP REST Node**: Faça requisições a APIs externas durante o fluxo
- ✅ **Integração Chatwoot**: Crie tickets automaticamente no Chatwoot
- ✅ **Integração Perfex**: Atualize leads no CRM durante conversas
- ✅ **Sistema de Sessões**: Rastreamento completo do estado de cada contato
- ✅ **Webhooks Bidirecionais**: Receba e responda mensagens automaticamente
- ✅ **Preview de Fluxo**: Visualize o fluxo completo antes de publicar
- ✅ **Simulação**: Teste fluxos antes de ativar para contatos reais

### 💼 **Integração Perfex CRM** (NOVO v0.0.4)
- ✅ **Importação de Leads**: Busque leads do Perfex e converta em contatos
- ✅ **Sincronização Automática**: Mantenha dados atualizados entre sistemas
- ✅ **Configuração por Tenant**: Cada empresa usa seu próprio Perfex
- ✅ **Node de Integração**: Use Perfex dentro de fluxos interativos
- ✅ **Mapeamento de Campos**: Configure quais campos sincronizar

### 🏢 **Arquitetura Multi-Tenant (SaaS)**
- ✅ Isolamento completo de dados por empresa (tenant)
- ✅ Sistema de quotas personalizáveis (usuários, contatos, campanhas, conexões)
- ✅ Gerenciamento centralizado via Super Admin
- ✅ White Label: Logo, favicon, cores e títulos personalizáveis
- ✅ Planos e limites configuráveis por tenant
- ✅ Associação many-to-many usuário-tenant
- ✅ Mensagens amigáveis para upgrade de plano

### 💾 **Backup & Restore**
- ✅ Backup automático agendado (cron configurável)
- ✅ Backup manual sob demanda
- ✅ Restauração completa do banco de dados
- ✅ Histórico de backups com metadados
- ✅ Armazenamento seguro em volumes Docker
- ✅ Gerenciamento via interface web

### 👥 **Gerenciamento de Contatos**
- ✅ CRUD completo de contatos
- ✅ Importação em massa via CSV
- ✅ **Importação do Chatwoot**: Sincronização de contatos do Chatwoot
- ✅ **Importação do Perfex CRM**: Sincronização de leads do Perfex (NOVO v0.0.4)
- ✅ Sistema de categorização com tags
- ✅ Validação de números telefônicos (formato E.164)
- ✅ Busca avançada e filtros inteligentes
- ✅ Paginação otimizada
- ✅ Isolamento por tenant
- ✅ Edição em massa de contatos

### 📱 **Conexões WhatsApp (Múltiplos Provedores)**
- ✅ **WAHA API**: Suporte completo com QR Code
- ✅ **Evolution API**: Integração nativa com Evolution
- ✅ **QuePasa**: Integração com API QuePasa
- ✅ **Configuração por Tenant**: Escolha quais provedores habilitar (NOVO v0.0.4)
- ✅ Múltiplas sessões simultâneas por tenant
- ✅ QR Code automático com expiração
- ✅ Status em tempo real das conexões
- ✅ Gerenciamento simplificado de sessões
- ✅ Reconnect automático em falhas
- ✅ Seleção de provedor ao criar sessão
- ✅ Webhooks para campanhas interativas (NOVO v0.0.4)

### 🎯 **Campanhas Inteligentes**
- ✅ **Tipos de Mensagem**: Texto, Imagem, Vídeo, Áudio, Documentos
- ✅ **Sequências Complexas**: Múltiplas mensagens em ordem
- ✅ **Randomização**: Textos, imagens, vídeos e arquivos aleatórios
- ✅ **IA Generativa**: OpenAI e Groq para personalização automática
- ✅ **Variáveis Dinâmicas**: `{{nome}}`, `{{telefone}}`, `{{email}}`, `{{categoria}}`, `{{observacoes}}`
- ✅ **Multi-Sessão**: Distribuição automática entre conexões
- ✅ **Agendamento**: Execução imediata ou programada
- ✅ **Controles**: Pausar, retomar, cancelar campanhas
- ✅ **Rate Limiting**: Delays configuráveis para evitar bloqueios
- ✅ **Preview em Tempo Real**: Visualização da mensagem antes do envio

### 🎲 **Sistema de Randomização**
- ✅ **Textos Aleatórios**: Pool de mensagens para variar conteúdo
- ✅ **Imagens Aleatórias**: Múltiplas imagens no pool
- ✅ **Vídeos Aleatórios**: Seleção aleatória de vídeos
- ✅ **Arquivos Aleatórios**: Documentos variados por envio
- ✅ **Legendas Variadas**: Textos diferentes para cada mídia
- ✅ **Humanização**: Evita detecção de envios automatizados

### 📊 **Relatórios e Analytics**
- ✅ Dashboard em tempo real
- ✅ Estatísticas detalhadas (enviadas, falharam, pendentes)
- ✅ Distribuição por sessão WhatsApp
- ✅ Análise de erros categorizada
- ✅ Exportação completa em CSV
- ✅ Timeline de execução
- ✅ Métricas por tenant

### 👤 **Sistema de Usuários e Roles**
- ✅ **SUPERADMIN**: Gerencia todos os tenants
- ✅ **ADMIN**: Gerencia seu tenant
- ✅ **USER**: Acesso limitado às funcionalidades
- ✅ Autenticação JWT segura
- ✅ Controle de acesso por tenant
- ✅ Hash bcrypt para senhas
- ✅ Associação many-to-many com tenants

### ⚙️ **Configurações do Sistema**
- ✅ Configurações globais (Super Admin)
- ✅ Configurações por tenant
- ✅ Integração WAHA configurável
- ✅ Integração Evolution API configurável
- ✅ Personalização visual (logo, favicon, cores, títulos)
- ✅ Chaves de API para IA (OpenAI/Groq) por tenant
- ✅ Gerenciamento de quotas por tenant
- ✅ Sistema de alertas e notificações

### 🔔 **Sistema de Alertas e Monitoramento**
- ✅ Alertas de quota (85% e 100% de uso)
- ✅ Monitoramento de saúde do sistema
- ✅ Notificações de falhas de conexão
- ✅ Dashboard de alertas ativos
- ✅ Auto-resolução de alertas antigos

---

## 🛠️ Tecnologias Utilizadas

### 🎨 **Frontend**
- **React 18** - Framework JavaScript moderno
- **TypeScript** - Tipagem estática para JavaScript
- **Vite** - Build tool ultra-rápida
- **Tailwind CSS** - Framework CSS utilitário
- **React Hook Form + Zod** - Validação de formulários
- **React Hot Toast** - Notificações elegantes
- **React Router Dom** - Roteamento SPA

### ⚡ **Backend**
- **Node.js 20** - Runtime JavaScript
- **Express** - Framework web minimalista
- **TypeScript** - Tipagem estática
- **Prisma ORM** - Object-Relational Mapping
- **bcryptjs** - Hash de senhas
- **jsonwebtoken** - Autenticação JWT
- **express-validator** - Validação de dados
- **libphonenumber-js** - Normalização de telefones
- **node-cron** - Agendamento de tarefas
- **socket.io** - WebSocket para real-time

### 🗄️ **Banco de Dados**
- **PostgreSQL 16** - Banco de dados relacional
- **Redis 7** - Cache e filas
- **Prisma** - ORM com type-safety

### 🐳 **Infraestrutura**
- **Docker & Docker Swarm** - Containerização e orquestração
- **Traefik v2** - Proxy reverso e SSL automático
- **Nginx** - Servidor web para frontend
- **Docker Hub** - Imagens oficiais pré-construídas

### 🔌 **Integrações**
- **WAHA API** - WhatsApp Web API
- **Evolution API** - API alternativa para WhatsApp
- **QuePasa** - API WhatsApp multi-dispositivo
- **Uazapi API** - API WhatsApp por instância, com QR, mensagens e campanhas interativas
- **Chatwoot** - Importação de contatos e criação de tickets
- **Perfex CRM** - Sincronização de leads e gestão de CRM (NOVO v0.0.4)
- **OpenAI API** - GPT para geração de conteúdo e processamento de respostas
- **Groq API** - IA ultra-rápida para fluxos interativos
- **ReactFlow** - Editor visual de fluxos (NOVO v0.0.4)

---

## 🚀 Instalação

### 📋 **Pré-requisitos**
- Docker 20.10+
- Docker Compose/Swarm
- Traefik configurado (para produção)
- Instância WAHA ou Evolution API rodando

### 🐳 **Instalação via Docker (Recomendado)**

1. **Clone o repositório**
```bash
git clone https://github.com/AstraOnlineWeb/astracampaign.git
cd astracampaign
```

2. **Configure as variáveis de ambiente**
```bash
# Edite o docker-stack.yml com suas configurações
nano docker-stack.yml
```

Principais variáveis:
```yaml
environment:
  - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/contacts
  - JWT_SECRET=sua-chave-secreta-muito-segura
  - DEFAULT_WAHA_HOST=https://seu-waha.com
  - DEFAULT_WAHA_API_KEY=sua-waha-api-key
  - DEFAULT_EVOLUTION_HOST=https://seu-evolution.com
  - DEFAULT_EVOLUTION_API_KEY=sua-evolution-api-key
  - DEFAULT_QUEPASA_HOST=https://seu-quepasa.com
  - DEFAULT_QUEPASA_TOKEN=seu-quepasa-token
  - DEFAULT_CHATWOOT_URL=https://seu-chatwoot.com
  - DEFAULT_CHATWOOT_TOKEN=seu-chatwoot-token
  - DEFAULT_COMPANY_NAME=Sua Empresa
  - DEFAULT_PAGE_TITLE=Seu Sistema
```

3. **Deploy no Docker Swarm**
```bash
# Produção
docker stack deploy -c docker-stack.yml work

# Desenvolvimento local
docker-compose up -d
```

4. **Verificar serviços**
```bash
docker service ls
docker service logs -f work_backend
```

### 🛠️ **Desenvolvimento Local**

1. **Backend**
```bash
cd backend
npm install
npm run migrate:prod  # Rodar migrações e seed
npm run dev          # Servidor de desenvolvimento
```

2. **Frontend**
```bash
cd frontend
npm install
npm run dev          # Servidor de desenvolvimento (porta 3000)
```

### ⚙️ **Configuração Inicial**

1. **Acesse o sistema**: `http://localhost` ou seu domínio
2. **Login padrão SUPERADMIN**: `superadmin@astraonline.com.br` / `Admin123`
3. **Login padrão ADMIN**: `admin@astraonline.com.br` / `Admin123`
4. **Configure provedores**: Vá em Configurações e adicione WAHA/Evolution/QuePasa
5. **Configure Chatwoot** (opcional): Adicione URL e token do Chatwoot em Configurações
6. **Crie empresas**: Como SUPERADMIN, crie novos tenants
7. **Crie uma sessão WhatsApp**: Na página de Conexões (escolha o provedor)
8. **Importe contatos**: Via CSV, Chatwoot ou manualmente
9. **Crie sua primeira campanha**: Na página de Campanhas

---

## 📚 Documentação

### 🔗 **Endpoints da API**

#### **Autenticação**
- `POST /api/auth/login` - Login do usuário
- `POST /api/auth/logout` - Logout do usuário

#### **Tenants (SUPERADMIN)**
- `GET /api/tenants` - Listar todos os tenants
- `POST /api/tenants` - Criar novo tenant
- `PUT /api/tenants/:id` - Atualizar tenant
- `DELETE /api/tenants/:id` - Excluir tenant
- `GET /api/tenants/:id` - Detalhes do tenant

#### **Contatos**
- `GET /api/contatos` - Listar contatos (com paginação/busca)
- `POST /api/contatos` - Criar contato
- `PUT /api/contatos/:id` - Atualizar contato
- `DELETE /api/contatos/:id` - Excluir contato
- `POST /api/contatos/import` - Importar CSV
- `POST /api/chatwoot/sync-contacts` - Importar contatos do Chatwoot
- `POST /api/perfex/import` - Importar leads do Perfex CRM (NOVO v0.0.4)
- `POST /api/perfex/sync` - Sincronizar contatos com Perfex (NOVO v0.0.4)
- `PATCH /api/contatos/bulk-edit` - Edição em massa de contatos

#### **Campanhas**
- `GET /api/campaigns` - Listar campanhas
- `POST /api/campaigns` - Criar campanha
- `PATCH /api/campaigns/:id/toggle` - Pausar/Retomar
- `DELETE /api/campaigns/:id` - Excluir campanha
- `GET /api/campaigns/:id/report` - Relatório detalhado

#### **Campanhas Interativas** (NOVO v0.0.4)
- `GET /api/interactive-campaigns` - Listar campanhas interativas
- `POST /api/interactive-campaigns` - Criar campanha interativa
- `GET /api/interactive-campaigns/:id` - Detalhes da campanha
- `PUT /api/interactive-campaigns/:id` - Atualizar campanha
- `DELETE /api/interactive-campaigns/:id` - Excluir campanha
- `POST /api/interactive-campaigns/:id/publish` - Publicar campanha
- `POST /api/interactive-campaigns/:id/simulate` - Simular fluxo

#### **Conexões para Campanhas Interativas** (NOVO v0.0.4)
- `GET /api/connections` - Listar conexões
- `POST /api/connections` - Criar conexão
- `GET /api/connections/:id` - Detalhes da conexão
- `PUT /api/connections/:id` - Atualizar conexão
- `DELETE /api/connections/:id` - Excluir conexão

#### **Webhooks** (NOVO v0.0.4)
- `POST /api/webhooks/wa/:connectionId/callback` - Receber mensagens (HMAC validado)

#### **Sessões WhatsApp**
- `GET /api/waha/sessions` - Listar sessões
- `POST /api/waha/sessions` - Criar sessão (WAHA, Evolution ou QuePasa)
- `DELETE /api/waha/sessions/:name` - Remover sessão
- `POST /api/waha/sessions/:name/restart` - Reiniciar

#### **Backup & Restore**
- `GET /api/backup/stats` - Estatísticas de backup
- `POST /api/backup` - Criar backup manual
- `POST /api/backup/restore/:filename` - Restaurar backup
- `GET /api/backup/list` - Listar backups disponíveis

#### **Analytics**
- `GET /api/analytics/overview` - Visão geral do sistema
- `GET /api/analytics/campaigns` - Métricas de campanhas
- `GET /api/analytics/sessions` - Métricas de sessões

### 📊 **Modelo de Dados**

```typescript
// Tenant (Empresa)
interface Tenant {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  quotas: TenantQuota;
  settings: TenantSettings;
}

// Quotas do Tenant
interface TenantQuota {
  maxUsers: number;
  maxContacts: number;
  maxCampaigns: number;
  maxConnections: number;
}

// Contato
interface Contact {
  id: string;
  tenantId: string;
  nome: string;
  telefone: string; // E.164 format
  email?: string;
  categoriaId?: string;
  observacoes?: string;
}

// Campanha
interface Campaign {
  id: string;
  tenantId: string;
  nome: string;
  targetCategories: string[];
  sessionNames: string[];
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sequence';
  messageContent: MessageContent;
  randomize: boolean; // Randomizar conteúdo
  randomDelay: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PAUSED' | 'FAILED';
}

// Sessão WhatsApp
interface WhatsAppSession {
  id: string;
  tenantId: string;
  name: string;
  displayName?: string;
  status: string;
  provider: 'WAHA' | 'EVOLUTION' | 'QUEPASA' | 'UAZAPI';
  qr?: string;
  quepasaToken?: string; // Token para QuePasa
}
```

## 🔧 Configuração Avançada

### 🔐 **Variáveis de Ambiente**

```env
# Backend (.env)
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://redis:6379
JWT_SECRET=sua-chave-secreta-muito-segura
JWT_EXPIRES_IN=24h

# Provedores WhatsApp
DEFAULT_WAHA_HOST=http://waha:3000
DEFAULT_WAHA_API_KEY=sua-waha-api-key
DEFAULT_EVOLUTION_HOST=http://evolution:8080
DEFAULT_EVOLUTION_API_KEY=sua-evolution-api-key
DEFAULT_QUEPASA_HOST=http://quepasa:31000
DEFAULT_QUEPASA_TOKEN=seu-quepasa-token
# Uazapi (o token da instância é informado ao criar a conexão; nunca é exposto ao navegador)
DEFAULT_UAZAPI_HOST=https://seu-servidor-uazapi.example

# Integração Chatwoot
DEFAULT_CHATWOOT_URL=https://seu-chatwoot.com
DEFAULT_CHATWOOT_TOKEN=seu-chatwoot-token

# Configurações Gerais
DEFAULT_COMPANY_NAME=Astra Campaign
DEFAULT_PAGE_TITLE=Sistema de Gestão de Contatos
```

### 🐳 **Docker Swarm Labels**

```yaml
# Traefik Labels para Produção
labels:
  - traefik.enable=true
  - traefik.http.routers.app.rule=Host(`seu-dominio.com`)
  - traefik.http.routers.app.tls=true
  - traefik.http.routers.app.tls.certresolver=letsencrypt
```

### 📝 **Formato CSV para Importação**

```csv
nome,telefone,email,categoria,observacoes
João Silva,+5511999999999,joao@email.com,Cliente VIP,Cliente preferencial
Maria Santos,+5511888888888,maria@email.com,Prospect,Interessada em produto X
```

### 💬 **Integração com Chatwoot**

Para importar contatos do Chatwoot:

1. **Configure o Chatwoot** nas configurações do tenant:
   - URL do Chatwoot: `https://seu-chatwoot.com`
   - Token de API: Obtenha em Perfil → Tokens de Acesso

2. **Importe os contatos**:
   - Acesse a página de Contatos
   - Clique em "Importar do Chatwoot"
   - Selecione a categoria desejada
   - Os contatos serão sincronizados automaticamente

3. **Dados importados**:
   - Nome do contato
   - Número de telefone
   - Email
   - Categoria (configurável)

### 🔌 **Configuração do QuePasa**

Para usar o QuePasa como provedor WhatsApp:

1. **Configure o QuePasa** nas configurações:
   - Host: `https://seu-quepasa.com` ou `http://ip:31000`
   - Token: Token de autenticação do QuePasa

2. **Crie uma sessão**:
   - Na página de Conexões WhatsApp
   - Selecione "QuePasa" como provedor
   - O token será gerado automaticamente
   - Escaneie o QR Code com o WhatsApp

3. **Recursos suportados**:
   - Envio de mensagens de texto
   - Envio de imagens com legenda
   - Envio de vídeos com legenda
   - Envio de documentos
   - Status da conexão em tempo real

### 🔌 **Configuração da Uazapi API**

1. Informe o host padrão (`uazapiHost`) nas configurações globais ou forneça-o ao criar a conexão.
2. Na página de Conexões WhatsApp, selecione **Uazapi**, informe o token da instância e escolha se a campanha interativa será habilitada.
3. A conexão consulta o status da instância, mostra o QR Code e usa o mesmo fluxo de campanhas dos demais provedores. O token é armazenado cifrado no backend.

### 🎲 **Randomização de Conteúdo**

Para usar randomização de mensagens, configure múltiplos conteúdos:

```json
{
  "texts": [
    "Olá {{nome}}! Tudo bem?",
    "Oi {{nome}}, como vai?",
    "E aí {{nome}}?"
  ],
  "images": [
    "/uploads/image1.jpg",
    "/uploads/image2.jpg",
    "/uploads/image3.jpg"
  ],
  "captions": [
    "Confira essa promoção!",
    "Veja essa novidade!",
    "Aproveite essa oportunidade!"
  ]
}
```

---

## 🚀 Deploy em Produção

### 🔧 **Build das Imagens**

```bash
# Backend
cd backend
docker build --no-cache -t work-backend:latest .

# Frontend
cd frontend
npm run build
docker build -t work-frontend:latest .

# Push para registry (opcional)
docker tag work-backend:latest seu-registry/work-backend:latest
docker push seu-registry/work-backend:latest
```

### 📊 **Monitoramento**

```bash
# Status dos serviços
docker service ls

# Logs em tempo real
docker service logs -f work_backend
docker service logs -f work_frontend

# Restart de serviços
docker service update --force work_backend

# Verificar health
curl http://localhost:3001/api/health
```

### 💾 **Backup Automatizado**

Configure o cron de backup no painel de Super Admin:

- Diário: `0 2 * * *` (02:00 AM)
- Semanal: `0 2 * * 0` (Domingo 02:00 AM)
- Mensal: `0 2 1 * *` (Dia 1 de cada mês 02:00 AM)

---

## 🤝 Contribuindo

Contribuições são muito bem-vindas! Este é um projeto open-source mantido pela comunidade.

### 🛠️ **Como Contribuir**

1. **Fork** o repositório
2. **Crie** uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. **Commit** suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. **Push** para a branch (`git push origin feature/nova-feature`)
5. **Abra** um Pull Request

### 📝 **Reportar Bugs**

- Use o sistema de [Issues](https://github.com/AstraOnlineWeb/astracampaign/issues)
- Descreva o problema detalhadamente
- Inclua logs relevantes
- Especifique ambiente (OS, Docker version, etc.)

### 💡 **Sugerir Features**

- Abra uma [Issue](https://github.com/AstraOnlineWeb/astracampaign/issues) com o label `enhancement`
- Descreva a funcionalidade desejada
- Explique o caso de uso

---

## 📄 Licença

Este projeto está licenciado sob a **GNU Affero General Public License v3.0 (AGPLv3)** - veja o arquivo [LICENSE](LICENSE) para detalhes.

### ⚖️ **Termos de Uso**

- ✅ Uso comercial permitido
- ✅ Modificação permitida
- ✅ Distribuição permitida
- ✅ Uso privado permitido
- ✅ Uso em rede/web permitido
- ⚠️ **Copyleft forte**: Modificações devem ser disponibilizadas sob a mesma licença
- ⚠️ **Divulgação de código**: Serviços web baseados no projeto devem disponibilizar o código fonte
- ❌ Sem garantias
- ❌ Sem responsabilidade dos autores

> **Importante**: A licença AGPLv3 requer que qualquer versão modificada do software, incluindo aquelas usadas para fornecer serviços através de uma rede, tenha seu código fonte disponibilizado publicamente.

---

## ⚠️ Disclaimer

> **IMPORTANTE**: Este projeto é independente e não possui ligação alguma com o WhatsApp oficial, Meta ou Facebook. Use por sua própria conta e risco, respeitando os termos de serviço do WhatsApp.

### 🔒 **Recomendações de Uso**

- ✅ Respeite os limites do WhatsApp
- ✅ Use delays apropriados entre mensagens (recomendado: 5-10 segundos)
- ✅ Use randomização para humanizar os envios
- ✅ Não envie spam
- ✅ Obtenha consentimento dos destinatários
- ✅ Mantenha o sistema atualizado
- ✅ Faça backups regulares

---

## 🙏 Agradecimentos

- **[WAHA](https://waha.devlike.pro/)** - API WhatsApp Web
- **[Evolution API](https://evolution-api.com/)** - API alternativa para WhatsApp
- **[QuePasa](https://github.com/nocodeleaks/quepasa)** - API WhatsApp multi-dispositivo
- **[Chatwoot](https://www.chatwoot.com/)** - Plataforma de atendimento ao cliente
- **[Prisma](https://prisma.io/)** - ORM TypeScript
- **[Tailwind CSS](https://tailwindcss.com/)** - Framework CSS
- **[React](https://reactjs.org/)** - Biblioteca JavaScript
- **Comunidade Open Source** - Por tornar projetos como este possíveis

---

## 📞 Suporte

### 💬 **Comunidade**
- 💬 [Grupo WhatsApp](https://chat.whatsapp.com/LMa44csoeoS9gMjamMpbOK) - **Comunidade aberta para discussões**
- 💬 [Discussions](https://github.com/AstraOnlineWeb/astracampaign/discussions) - Discussões técnicas no GitHub
- 🐛 [Issues](https://github.com/AstraOnlineWeb/astracampaign/issues) - Bugs e features

### 🛠️ **Suporte Profissional**
**Precisa de ajuda para melhorar, customizar ou implementar o projeto?**

📱 **WhatsApp**: [+55 61 9 9687-8959](https://wa.me/5561996878959)

💼 Temos uma equipe especializada para:
- ✅ Customizações e melhorias
- ✅ Implementação e deploy completo
- ✅ Configuração de arquitetura SaaS
- ✅ Integração com outras APIs
- ✅ Desenvolvimento de features específicas
- ✅ Suporte técnico dedicado
- ✅ Consultoria em automação WhatsApp
- ✅ Treinamento e documentação

### 📚 **Recursos Úteis**
- 📖 [Guia de Campanhas Interativas](CAMPANHA_INTERATIVA_README.md) - **Documentação completa da v0.0.4**
- 📖 [API de Campanhas Interativas](CAMPANHA_INTERATIVA_API.md) - **Endpoints e exemplos**
- 📖 [Testes de Campanhas Interativas](CAMPANHA_INTERATIVA_TESTES.md) - **Checklist de validação**
- 📖 [Documentação WAHA](https://waha.devlike.pro/docs/)
- 📖 [Documentação Evolution API](https://doc.evolution-api.com/)
- 📖 [Documentação QuePasa](https://github.com/nocodeleaks/quepasa)
- 📖 [Documentação Chatwoot API](https://www.chatwoot.com/developers/api/)
- 📖 [Documentação Perfex CRM API](https://demo.perfexcrm.com/api-docs/) - **Integração v0.0.4**
- 📖 [Documentação ReactFlow](https://reactflow.dev/) - **Flow Builder v0.0.4**
- 📖 [Documentação Prisma](https://www.prisma.io/docs/)
- 📖 [Documentação React](https://reactjs.org/docs/)
- 📖 [Documentação Docker Swarm](https://docs.docker.com/engine/swarm/)

---

<div align="center">

**⭐ Se este projeto foi útil para você, considere dar uma estrela no GitHub! ⭐**

Feito com ❤️ pela comunidade open-source

![GitHub stars](https://img.shields.io/github/stars/AstraOnlineWeb/astracampaign?style=social)
![GitHub forks](https://img.shields.io/github/forks/AstraOnlineWeb/astracampaign?style=social)
![GitHub issues](https://img.shields.io/github/issues/AstraOnlineWeb/astracampaign)
![GitHub license](https://img.shields.io/github/license/AstraOnlineWeb/astracampaign)
![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)

</div>
