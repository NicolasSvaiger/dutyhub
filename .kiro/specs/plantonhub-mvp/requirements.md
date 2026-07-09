# Documento de Requisitos - PlantonHub MVP

## Introdução

O PlantonHub é um sistema de gestão de plantões médicos (MVP) projetado para validar a arquitetura, autenticação, multi-tenant, perfis de acesso e fluxo de check-in/check-out. O sistema permite que profissionais de saúde gerenciem seus plantões em múltiplas clínicas, com controle de acesso baseado em papéis (RBAC) e isolamento de dados por clínica (multi-tenant).

## Glossário

- **Sistema**: O sistema PlantonHub como um todo (backend + frontend)
- **API**: O backend ASP.NET Core Web API do PlantonHub
- **Frontend**: A aplicação web React que consome a API
- **Usuário**: Pessoa registrada no sistema que pode ter múltiplos perfis em múltiplas clínicas
- **Clínica**: Unidade de saúde que representa um tenant no sistema
- **Perfil**: Papel atribuído a um usuário no contexto de uma clínica (AdminGlobal, AdminClinica, Medico, Enfermeiro, Tecnico)
- **Plantão**: Período de trabalho agendado em uma clínica específica
- **Atribuição**: Vínculo entre um profissional e um plantão específico
- **Presença**: Registro de check-in e check-out de um profissional em um plantão
- **Tenant**: Isolamento lógico de dados por clínica no sistema
- **Token_JWT**: Token de autenticação JSON Web Token utilizado para autorização
- **Refresh_Token**: Token utilizado para renovar o Token_JWT sem re-autenticação
- **Validação_Biométrica**: Flag booleana que indica se o dispositivo local validou a biometria do profissional (sem armazenamento de dados biométricos no servidor)
- **AdminGlobal**: Perfil com acesso total ao sistema, capaz de gerenciar todas as clínicas e usuários
- **AdminClinica**: Perfil com acesso administrativo restrito a uma clínica específica
- **Medico**: Perfil de médico vinculado a uma clínica
- **Enfermeiro**: Perfil de enfermeiro vinculado a uma clínica
- **Tecnico**: Perfil de técnico vinculado a uma clínica
- **AuditLog**: Registro de auditoria que rastreia operações realizadas no sistema

## Requisitos

### Requisito 1: Autenticação JWT

**User Story:** Como um usuário do sistema, eu quero me autenticar com email e senha, para que eu possa acessar as funcionalidades protegidas do sistema de forma segura.

#### Critérios de Aceitação

1. WHEN um usuário submete credenciais válidas (email e senha) ao endpoint POST /api/auth/login, THE API SHALL retornar um Token_JWT contendo claims de UserId, perfis (roles) e ClinicId ativa, juntamente com um Refresh_Token.
2. WHEN um usuário submete credenciais inválidas ao endpoint POST /api/auth/login, THE API SHALL retornar HTTP 401 Unauthorized com uma mensagem de erro descritiva.
3. WHEN um usuário submete um Refresh_Token válido e não expirado ao endpoint POST /api/auth/refresh-token, THE API SHALL retornar um novo Token_JWT e um novo Refresh_Token.
4. WHEN um usuário submete um Refresh_Token inválido ou expirado ao endpoint POST /api/auth/refresh-token, THE API SHALL retornar HTTP 401 Unauthorized.
5. THE API SHALL incluir nos claims do Token_JWT: UserId, lista de perfis do usuário e ClinicId do contexto ativo.
6. THE API SHALL expor documentação Swagger com suporte a autenticação Bearer Token para todos os endpoints protegidos.

---

### Requisito 2: Controle de Acesso Baseado em Papéis (RBAC)

**User Story:** Como um administrador do sistema, eu quero que cada usuário tenha perfis específicos por clínica, para que o acesso seja restrito conforme a função de cada profissional.

#### Critérios de Aceitação

1. THE Sistema SHALL suportar cinco perfis de acesso: AdminGlobal, AdminClinica, Medico, Enfermeiro e Tecnico.
2. THE Sistema SHALL permitir que um mesmo Usuário possua múltiplos perfis em múltiplas Clínicas simultaneamente.
3. WHEN um Usuário com perfil AdminGlobal realiza uma requisição, THE API SHALL conceder acesso a todas as Clínicas, criação de Clínicas, criação de Usuários e visualização de todos os Plantões.
4. WHEN um Usuário com perfil AdminClinica realiza uma requisição, THE API SHALL restringir o acesso apenas à Clínica vinculada ao perfil, permitindo criar Plantões e atribuir profissionais a Plantões dentro dessa Clínica.
5. WHEN um Usuário com perfil Medico, Enfermeiro ou Tecnico realiza uma requisição, THE API SHALL restringir o acesso apenas aos Plantões atribuídos ao Usuário na Clínica ativa, permitindo realizar check-in e check-out.
6. THE API SHALL implementar authorization policies que validem o perfil do Usuário e o contexto do Tenant antes de processar cada requisição.

---

### Requisito 3: Multi-Tenancy por Clínica

**User Story:** Como um administrador, eu quero que os dados sejam isolados por clínica, para que cada clínica veja apenas seus próprios dados.

#### Critérios de Aceitação

1. THE API SHALL implementar um middleware de Tenant que extraia o ClinicId do Token_JWT e aplique filtro de dados em todas as consultas ao banco de dados.
2. WHEN um Usuário com perfil AdminClinica, Medico, Enfermeiro ou Tecnico realiza uma consulta, THE API SHALL retornar apenas dados pertencentes à Clínica ativa no contexto do Token_JWT.
3. WHEN um Usuário com perfil AdminGlobal realiza uma consulta, THE API SHALL retornar dados de todas as Clínicas sem filtro de Tenant.
4. IF um Usuário tentar acessar dados de uma Clínica à qual não possui vínculo, THEN THE API SHALL retornar HTTP 403 Forbidden.

---

### Requisito 4: Gestão de Clínicas

**User Story:** Como um AdminGlobal, eu quero criar e listar clínicas, para que eu possa gerenciar as unidades de saúde cadastradas no sistema.

#### Critérios de Aceitação

1. WHEN um Usuário com perfil AdminGlobal envia uma requisição GET /api/clinics, THE API SHALL retornar a lista de todas as Clínicas cadastradas no sistema.
2. WHEN um Usuário com perfil AdminGlobal envia uma requisição POST /api/clinics com dados válidos, THE API SHALL criar uma nova Clínica e retornar HTTP 201 Created com os dados da Clínica criada.
3. WHEN um Usuário com perfil AdminClinica envia uma requisição GET /api/clinics, THE API SHALL retornar apenas a Clínica vinculada ao perfil do Usuário.
4. IF um Usuário sem perfil AdminGlobal tentar criar uma Clínica via POST /api/clinics, THEN THE API SHALL retornar HTTP 403 Forbidden.

---

### Requisito 5: Gestão de Usuários

**User Story:** Como um AdminGlobal, eu quero criar usuários e atribuir perfis por clínica, para que os profissionais de saúde tenham acesso ao sistema conforme suas funções.

#### Critérios de Aceitação

1. WHEN um Usuário com perfil AdminGlobal envia uma requisição GET /api/users, THE API SHALL retornar a lista de todos os Usuários cadastrados.
2. WHEN um Usuário com perfil AdminGlobal envia uma requisição POST /api/users com dados válidos, THE API SHALL criar um novo Usuário e retornar HTTP 201 Created.
3. WHEN um Usuário com perfil AdminGlobal envia uma requisição POST /api/users/{userId}/clinic-role com ClinicId e perfil válidos, THE API SHALL criar uma associação UserClinicRole vinculando o Usuário à Clínica com o perfil especificado.
4. IF um Usuário sem perfil AdminGlobal tentar criar Usuários ou atribuir perfis, THEN THE API SHALL retornar HTTP 403 Forbidden.
5. IF os dados submetidos para criação de Usuário forem inválidos (email duplicado, campos obrigatórios ausentes), THEN THE API SHALL retornar HTTP 400 Bad Request com detalhes dos erros de validação.

---

### Requisito 6: Gestão de Plantões

**User Story:** Como um AdminClinica, eu quero criar plantões e atribuir profissionais, para que a escala de trabalho da clínica seja organizada.

#### Critérios de Aceitação

1. WHEN um Usuário com perfil AdminClinica envia uma requisição POST /api/shifts com dados válidos, THE API SHALL criar um novo Plantão vinculado à Clínica do Usuário e retornar HTTP 201 Created.
2. WHEN um Usuário com perfil AdminClinica envia uma requisição POST /api/shifts/{shiftId}/assign com UserId válido, THE API SHALL criar uma Atribuição vinculando o profissional ao Plantão.
3. WHEN um Usuário com perfil AdminClinica envia uma requisição GET /api/shifts, THE API SHALL retornar a lista de Plantões da Clínica do Usuário.
4. WHEN um Usuário com perfil Medico, Enfermeiro ou Tecnico envia uma requisição GET /api/shifts, THE API SHALL retornar apenas os Plantões atribuídos ao Usuário na Clínica ativa.
5. WHEN um Usuário com perfil AdminGlobal envia uma requisição GET /api/shifts, THE API SHALL retornar todos os Plantões de todas as Clínicas.
6. IF um Usuário com perfil AdminClinica tentar criar um Plantão ou atribuir profissional em uma Clínica diferente da sua, THEN THE API SHALL retornar HTTP 403 Forbidden.

---

### Requisito 7: Check-in de Presença

**User Story:** Como um profissional de saúde (Medico, Enfermeiro ou Tecnico), eu quero registrar meu check-in no plantão, para que minha presença seja documentada com data, hora e localização.

#### Critérios de Aceitação

1. WHEN um profissional (Medico, Enfermeiro ou Tecnico) envia uma requisição POST /api/attendance/check-in com dados válidos, THE API SHALL registrar a Presença com: UserId, ShiftId, ClinicId, DateTime, Latitude, Longitude, DeviceId e BiometricValidated.
2. WHEN o check-in é registrado com sucesso, THE API SHALL retornar HTTP 201 Created com os dados do registro de Presença.
3. IF um profissional tentar realizar check-in em um Plantão ao qual não está atribuído, THEN THE API SHALL retornar HTTP 403 Forbidden.
4. IF um profissional tentar realizar check-in em um Plantão que já possui check-in registrado sem check-out correspondente, THEN THE API SHALL retornar HTTP 409 Conflict.
5. THE API SHALL aceitar o campo BiometricValidated como um booleano, tratando a validação biométrica como uma confirmação local do dispositivo sem armazenar dados biométricos no servidor.

---

### Requisito 8: Check-out de Presença

**User Story:** Como um profissional de saúde (Medico, Enfermeiro ou Tecnico), eu quero registrar meu check-out do plantão, para que o encerramento da minha presença seja documentado.

#### Critérios de Aceitação

1. WHEN um profissional (Medico, Enfermeiro ou Tecnico) envia uma requisição POST /api/attendance/check-out com dados válidos, THE API SHALL atualizar o registro de Presença existente com: DateTime de saída, Latitude, Longitude e DeviceId.
2. WHEN o check-out é registrado com sucesso, THE API SHALL retornar HTTP 200 OK com os dados atualizados do registro de Presença.
3. IF um profissional tentar realizar check-out sem um check-in ativo correspondente, THEN THE API SHALL retornar HTTP 400 Bad Request com mensagem indicando a ausência de check-in.
4. IF um profissional tentar realizar check-out em um Plantão ao qual não está atribuído, THEN THE API SHALL retornar HTTP 403 Forbidden.

---

### Requisito 9: Histórico de Presença

**User Story:** Como um profissional de saúde, eu quero consultar meu histórico de presenças, para que eu possa acompanhar meus registros de check-in e check-out.

#### Critérios de Aceitação

1. WHEN um profissional envia uma requisição GET /api/attendance/my-history, THE API SHALL retornar a lista de registros de Presença do Usuário autenticado na Clínica ativa, ordenada por data decrescente.
2. THE API SHALL incluir em cada registro do histórico: ShiftId, ClinicId, DateTime de check-in, DateTime de check-out (quando aplicável), Latitude e Longitude de ambos os registros.

---

### Requisito 10: Auditoria

**User Story:** Como um AdminGlobal, eu quero consultar os registros de auditoria, para que eu possa rastrear as operações realizadas no sistema.

#### Critérios de Aceitação

1. THE API SHALL registrar em AuditLog todas as operações de criação, atualização e exclusão realizadas no sistema, incluindo: UserId do autor, DateTime, tipo de operação, entidade afetada e dados relevantes da operação.
2. WHEN um Usuário com perfil AdminGlobal envia uma requisição GET /api/audit, THE API SHALL retornar a lista de registros de AuditLog ordenada por data decrescente.
3. IF um Usuário sem perfil AdminGlobal tentar acessar GET /api/audit, THEN THE API SHALL retornar HTTP 403 Forbidden.

---

### Requisito 11: Arquitetura e Infraestrutura

**User Story:** Como um desenvolvedor, eu quero que o projeto siga Clean Architecture com containerização Docker, para que o código seja mantível e o ambiente reproduzível.

#### Critérios de Aceitação

1. THE Sistema SHALL organizar o código backend em quatro camadas: Domain (entidades e interfaces), Application (serviços e DTOs), Infrastructure (EF Core, repositórios, serviços externos) e API (controllers e configuração).
2. THE Sistema SHALL utilizar .NET 8 ou .NET 9 com ASP.NET Core Web API e Entity Framework Core com PostgreSQL.
3. THE Sistema SHALL fornecer um arquivo docker-compose.yml contendo serviços para: API, PostgreSQL e Frontend.
4. THE Sistema SHALL fornecer um Dockerfile para build e execução da API.
5. THE Sistema SHALL gerar migrations do Entity Framework Core para criação do schema do banco de dados.
6. THE Sistema SHALL fornecer um seed inicial contendo: usuário AdminGlobal (admin@plantonhub.com / Admin@123), duas Clínicas (Clínica Alpha e Clínica Beta), e usuários de teste (medico@plantonhub.com, enfermeiro@plantonhub.com, adminclinica@plantonhub.com) com senha padrão Teste@123.

---

### Requisito 12: Frontend Web

**User Story:** Como um usuário do sistema, eu quero uma interface web funcional, para que eu possa interagir com todas as funcionalidades do PlantonHub.

#### Critérios de Aceitação

1. THE Frontend SHALL implementar uma tela de login que solicite email e senha e armazene o Token_JWT e Refresh_Token retornados pela API.
2. THE Frontend SHALL implementar um dashboard principal que exiba informações contextuais ao perfil do Usuário autenticado.
3. THE Frontend SHALL implementar um seletor de Clínica ativa para Usuários com perfis em múltiplas Clínicas.
4. THE Frontend SHALL implementar uma tela de listagem de Plantões com filtro pela Clínica ativa.
5. THE Frontend SHALL implementar botões de check-in e check-out que enviem os dados de localização (Latitude, Longitude), DeviceId e BiometricValidated para a API.
6. THE Frontend SHALL implementar uma tela administrativa para listagem de Clínicas e Usuários, acessível apenas a Usuários com perfil AdminGlobal ou AdminClinica.
7. WHEN o Token_JWT expira, THE Frontend SHALL utilizar o Refresh_Token para obter um novo Token_JWT sem exigir nova autenticação do Usuário.

---

### Requisito 13: Testes e Documentação

**User Story:** Como um desenvolvedor, eu quero exemplos de requisições HTTP e documentação para executar o projeto, para que eu possa testar e validar todas as funcionalidades rapidamente.

#### Critérios de Aceitação

1. THE Sistema SHALL fornecer um arquivo README com instruções passo a passo para executar o projeto localmente utilizando Docker.
2. THE Sistema SHALL fornecer exemplos de requisições HTTP (collection Postman ou arquivo .http) cobrindo: login, criação de clínica, criação de plantão, atribuição de profissional, check-in, check-out e consulta de histórico.
3. THE Sistema SHALL incluir no README os comandos para execução de migrations do Entity Framework Core.
4. THE Sistema SHALL incluir no README os dados de acesso do seed (emails e senhas dos usuários de teste).
