# Documento de Requisitos - Redis Cache Layer

## Introdução

Este documento especifica os requisitos para adição de uma camada de cache distribuído utilizando Redis ao PlantonHub MVP. A estratégia é "simples agora, escala depois" — o Redis é leve de adicionar mas oferece cache distribuído, session store e rate limiting quando o sistema precisar escalar. A implementação utiliza a interface nativa `IDistributedCache` do .NET para manter o código agnóstico ao provider de cache.

## Glossário

- **Cache_Distribuído**: Armazenamento temporário de dados em memória compartilhada entre múltiplas instâncias da aplicação, utilizando Redis como backend
- **Redis**: Banco de dados em memória open-source utilizado como cache distribuído, store de sessão e broker de mensagens
- **IDistributedCache**: Interface nativa do .NET (`Microsoft.Extensions.Caching.Distributed`) que abstrai o provider de cache, permitindo troca transparente entre implementações
- **TTL**: Time-To-Live — tempo de validade de uma entrada no cache antes de ser automaticamente removida
- **Cache_Invalidation**: Processo de remover ou atualizar uma entrada de cache quando os dados subjacentes são modificados
- **ETag**: Header HTTP que identifica uma versão específica de um recurso, usado para cache condicional no cliente
- **Cache_Control**: Header HTTP que instrui clientes e proxies sobre políticas de cache para uma resposta
- **Token_Blacklist**: Estrutura de dados no Redis que armazena tokens JWT revogados para impedir seu uso até a expiração natural
- **Retry_Queue**: Fila em memória no frontend que armazena operações de check-in/check-out falhas para reenvio automático quando a conectividade é restaurada
- **API**: O backend ASP.NET Core Web API do PlantonHub
- **Frontend**: A aplicação web React que consome a API
- **Sistema**: O sistema PlantonHub como um todo (backend + frontend + infraestrutura)

## Requisitos

### Requisito 1: Infraestrutura Redis no Docker Compose

**User Story:** Como um desenvolvedor, eu quero que o Redis esteja disponível como container no docker-compose, para que toda a equipe tenha o mesmo ambiente de cache sem configurações manuais.

#### Critérios de Aceitação

1. THE Sistema SHALL incluir um serviço Redis no arquivo docker-compose.yml utilizando a imagem `redis:7-alpine`.
2. THE Sistema SHALL expor a porta padrão do Redis (6379) para acesso local durante desenvolvimento.
3. THE Sistema SHALL configurar healthcheck no container Redis que valide a conectividade utilizando o comando `redis-cli ping`.
4. THE Sistema SHALL configurar a API para depender do serviço Redis com condição de healthcheck saudável antes de iniciar.
5. THE Sistema SHALL utilizar um volume nomeado para persistência dos dados do Redis entre reinícios do container.

---

### Requisito 2: Configuração do IDistributedCache com Redis

**User Story:** Como um desenvolvedor, eu quero que o cache distribuído utilize a interface IDistributedCache do .NET, para que o código seja agnóstico ao provider e permita troca futura sem alterações na lógica de negócio.

#### Critérios de Aceitação

1. THE API SHALL registrar o Redis como implementação de `IDistributedCache` utilizando o pacote `Microsoft.Extensions.Caching.StackExchangeRedis`.
2. THE API SHALL configurar a connection string do Redis via variável de ambiente ou `appsettings.json`, sem hardcoding de valores.
3. THE API SHALL utilizar um prefixo de instância configurável nas chaves de cache para evitar colisões em ambientes compartilhados.
4. IF o Redis estiver indisponível durante uma operação de leitura de cache, THEN THE API SHALL buscar os dados diretamente da fonte primária (PostgreSQL) sem gerar erro para o usuário.
5. IF o Redis estiver indisponível durante uma operação de escrita de cache, THEN THE API SHALL prosseguir com a operação normalmente, registrando um log de aviso (warning).

---

### Requisito 3: Cache de Listas de Clínicas

**User Story:** Como um usuário do sistema, eu quero que a listagem de clínicas seja rápida, para que a navegação no sistema seja fluida sem sobrecarregar o banco de dados.

#### Critérios de Aceitação

1. WHEN um Usuário solicita a lista de clínicas via GET /api/clinics, THE API SHALL verificar se o resultado está em cache antes de consultar o banco de dados.
2. WHEN o resultado da listagem de clínicas não está em cache, THE API SHALL armazenar o resultado no cache com TTL de 5 minutos.
3. WHEN uma Clínica é criada ou atualizada, THE API SHALL invalidar a entrada de cache correspondente à listagem de clínicas.
4. THE API SHALL gerar chaves de cache para listas de clínicas incluindo o contexto do tenant (ClinicId) para manter o isolamento multi-tenant.

---

### Requisito 4: Cache de Listas de Plantões

**User Story:** Como um profissional de saúde, eu quero que a listagem de plantões carregue rapidamente, para que eu possa consultar minha escala sem atrasos.

#### Critérios de Aceitação

1. WHEN um Usuário solicita a lista de plantões via GET /api/shifts, THE API SHALL verificar se o resultado está em cache antes de consultar o banco de dados.
2. WHEN o resultado da listagem de plantões não está em cache, THE API SHALL armazenar o resultado no cache com TTL de 5 minutos.
3. WHEN um Plantão é criado, atualizado ou uma atribuição é modificada, THE API SHALL invalidar as entradas de cache correspondentes à listagem de plantões da clínica afetada.
4. THE API SHALL gerar chaves de cache para listas de plantões incluindo o ClinicId e o UserId quando aplicável, garantindo isolamento por tenant e por usuário.

---

### Requisito 5: Cache de Perfis de Usuário

**User Story:** Como um administrador, eu quero que os perfis de usuário sejam carregados rapidamente, para que operações frequentes de verificação de permissões não impactem a performance.

#### Critérios de Aceitação

1. WHEN um Usuário solicita dados de perfil (GET /api/users ou verificações internas de RBAC), THE API SHALL verificar se o perfil está em cache antes de consultar o banco de dados.
2. WHEN o perfil de um Usuário não está em cache, THE API SHALL armazenar o resultado no cache com TTL de 5 minutos.
3. WHEN os perfis de um Usuário são modificados (criação de UserClinicRole), THE API SHALL invalidar a entrada de cache correspondente ao perfil do Usuário afetado.
4. THE API SHALL gerar chaves de cache para perfis de usuário utilizando o UserId como identificador único.

---

### Requisito 6: Response Caching Headers (ETag e Cache-Control)

**User Story:** Como um cliente da API, eu quero receber headers de cache adequados nas respostas, para que meu navegador ou aplicação possa evitar requisições desnecessárias quando os dados não mudaram.

#### Critérios de Aceitação

1. WHEN a API retorna uma resposta para requisições GET nos endpoints /api/clinics, /api/shifts e /api/users, THE API SHALL incluir o header `ETag` com um hash do conteúdo da resposta.
2. WHEN um cliente envia uma requisição GET com o header `If-None-Match` contendo um ETag válido e os dados não foram alterados, THE API SHALL retornar HTTP 304 Not Modified sem corpo de resposta.
3. WHEN a API retorna uma resposta para requisições GET de listagem, THE API SHALL incluir o header `Cache-Control` com a diretiva `private, max-age=60` indicando cache privado de 60 segundos.
4. THE API SHALL não incluir headers de cache em respostas de endpoints que realizam operações de escrita (POST, PUT, DELETE).

---

### Requisito 7: Token Blacklist (Invalidação de Tokens) no Redis

**User Story:** Como um administrador de segurança, eu quero poder invalidar tokens JWT antes de sua expiração natural, para que tokens comprometidos ou de sessões encerradas não possam ser reutilizados.

#### Critérios de Aceitação

1. WHEN um Usuário realiza logout via POST /api/auth/logout, THE API SHALL adicionar o Token_JWT atual à Token_Blacklist no Redis com TTL igual ao tempo restante de expiração do token.
2. WHEN a API recebe uma requisição autenticada, THE API SHALL verificar se o Token_JWT apresentado está na Token_Blacklist antes de processar a requisição.
3. IF o Token_JWT apresentado está na Token_Blacklist, THEN THE API SHALL retornar HTTP 401 Unauthorized.
4. THE API SHALL armazenar na Token_Blacklist apenas o identificador único do token (JTI claim) para minimizar uso de memória.
5. THE API SHALL definir o TTL de cada entrada na Token_Blacklist igual ao tempo restante de expiração do token, para que tokens expirados sejam automaticamente removidos.

---

### Requisito 8: Cache Local no Frontend (localStorage)

**User Story:** Como um usuário do frontend, eu quero que meus dados de sessão persistam entre recarregamentos de página, para que eu não precise re-autenticar a cada navegação.

#### Critérios de Aceitação

1. THE Frontend SHALL armazenar o Token_JWT e o Refresh_Token no localStorage do navegador após autenticação bem-sucedida.
2. THE Frontend SHALL armazenar os dados do perfil do Usuário autenticado (nome, email, perfis) no localStorage após login.
3. THE Frontend SHALL armazenar o identificador da Clínica ativa selecionada no localStorage para persistência entre sessões.
4. WHEN o Usuário realiza logout, THE Frontend SHALL remover todos os dados armazenados no localStorage relacionados à sessão (tokens, perfil, clínica ativa).
5. WHEN o Token_JWT expira e a renovação via Refresh_Token falha, THE Frontend SHALL limpar o localStorage e redirecionar o Usuário para a tela de login.

---

### Requisito 9: Retry Queue para Operações Offline (Check-in/Check-out)

**User Story:** Como um profissional de saúde em campo, eu quero que minhas operações de check-in e check-out sejam enfileiradas quando estou offline, para que eu não perca meus registros por falta de conectividade momentânea.

#### Critérios de Aceitação

1. IF uma operação de check-in ou check-out falhar por erro de rede (timeout, sem conectividade), THEN THE Frontend SHALL armazenar a operação em uma fila de retry em memória (array JavaScript).
2. THE Frontend SHALL exibir uma indicação visual ao Usuário informando que existem operações pendentes na fila de retry.
3. WHEN a conectividade é restaurada (evento online do navegador), THE Frontend SHALL reenviar automaticamente todas as operações pendentes na fila de retry, na ordem em que foram enfileiradas (FIFO).
4. WHEN uma operação da fila de retry é reenviada com sucesso, THE Frontend SHALL remover a operação da fila e atualizar a interface com o resultado.
5. IF uma operação da fila de retry falhar com erro de negócio (HTTP 4xx), THEN THE Frontend SHALL remover a operação da fila e notificar o Usuário sobre a falha com detalhes do erro.
6. IF uma operação da fila de retry falhar novamente por erro de rede, THEN THE Frontend SHALL manter a operação na fila para nova tentativa na próxima restauração de conectividade.
7. THE Frontend SHALL limitar a fila de retry a no máximo 20 operações pendentes, rejeitando novas operações quando o limite é atingido e informando o Usuário.

