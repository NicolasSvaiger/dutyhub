# Plano de Implementação: PlantonHub MVP

## Visão Geral

Implementação incremental do sistema PlantonHub MVP seguindo Clean Architecture com .NET 8, React + TypeScript e PostgreSQL. O plano prioriza a fundação (Domain + Infrastructure), depois a lógica de aplicação (Application + API), seguido pelo frontend e finalizando com documentação e containerização.

## Tarefas

- [x] 1. Configurar estrutura do projeto e dependências
  - [x] 1.1 Criar solution .NET 8 com projetos das 4 camadas (Domain, Application, Infrastructure, API) e projetos de teste (UnitTests, PropertyTests, IntegrationTests)
    - Criar `PlantonHub.sln` na raiz
    - Criar projetos: `src/PlantonHub.Domain`, `src/PlantonHub.Application`, `src/PlantonHub.Infrastructure`, `src/PlantonHub.API`
    - Criar projetos de teste: `tests/PlantonHub.UnitTests`, `tests/PlantonHub.PropertyTests`, `tests/PlantonHub.IntegrationTests`
    - Adicionar referências entre projetos conforme Clean Architecture (API → Application → Domain, Infrastructure → Domain, API → Infrastructure)
    - Instalar pacotes: EF Core, PostgreSQL provider, FluentValidation, FsCheck.xUnit, Moq, FluentAssertions, Swashbuckle
    - _Requisitos: 11.1, 11.2_

  - [x] 1.2 Criar projeto frontend React + TypeScript com dependências
    - Criar aplicação com Vite + React + TypeScript em `frontend/`
    - Instalar dependências: axios, react-router-dom, @types necessários
    - Configurar estrutura de diretórios: `api/`, `contexts/`, `pages/`, `components/`, `hooks/`, `types/`
    - _Requisitos: 12.1_

- [x] 2. Implementar camada Domain
  - [x] 2.1 Criar entidades e enums do domínio
    - Implementar `RoleType.cs` enum (AdminGlobal, AdminClinica, Medico, Enfermeiro, Tecnico)
    - Implementar entidades: `User.cs`, `Clinic.cs`, `UserClinicRole.cs`, `Shift.cs`, `ShiftAssignment.cs`, `Attendance.cs`, `AuditLog.cs`, `RefreshToken.cs`
    - Todas as entidades com `Id` do tipo `Guid`, campos conforme modelo de dados do design
    - _Requisitos: 2.1, 11.1_

  - [x] 2.2 Criar interfaces de repositório no Domain
    - Implementar `IUserRepository.cs`, `IClinicRepository.cs`, `IShiftRepository.cs`, `IAttendanceRepository.cs`, `IAuditLogRepository.cs`
    - Cada interface com métodos CRUD básicos e queries específicas do domínio
    - _Requisitos: 11.1_

- [x] 3. Implementar camada Infrastructure (Data)
  - [x] 3.1 Criar AppDbContext e configurações de entidade com EF Core
    - Implementar `AppDbContext.cs` com DbSets para todas as entidades
    - Implementar `Configurations/` com Fluent API para cada entidade (constraints, índices, relacionamentos)
    - Configurar unique constraints: `User.Email`, `UserClinicRole(UserId, ClinicId, Role)`, `ShiftAssignment(ShiftId, UserId)`, `RefreshToken.Token`
    - _Requisitos: 11.1, 11.2, 11.5_

  - [x] 3.2 Implementar repositórios concretos
    - Implementar `UserRepository.cs`, `ClinicRepository.cs`, `ShiftRepository.cs`, `AttendanceRepository.cs`, `AuditLogRepository.cs`
    - Incluir filtro de tenant nos repositórios onde aplicável (Shift, Attendance)
    - _Requisitos: 3.1, 3.2, 11.1_

  - [x] 3.3 Implementar serviços de infraestrutura (JWT, Password, Tenant)
    - Implementar `JwtTokenService.cs`: geração de token com claims (UserId, roles, ClinicId), validação de token
    - Implementar `PasswordHashService.cs`: hash com BCrypt, verificação de senha
    - Implementar `TenantService.cs`: resolução do tenant ativo a partir do HttpContext
    - _Requisitos: 1.1, 1.5, 3.1_

  - [x] 3.4 Criar migration inicial e DatabaseSeeder
    - Gerar migration inicial com EF Core representando todo o schema
    - Implementar `DatabaseSeeder.cs` com dados iniciais: admin@plantonhub.com (Admin@123), Clínica Alpha, Clínica Beta, medico@plantonhub.com, enfermeiro@plantonhub.com, adminclinica@plantonhub.com (Teste@123)
    - Seed deve criar as associações UserClinicRole correspondentes
    - _Requisitos: 11.5, 11.6_

- [x] 4. Checkpoint - Verificar compilação e migrations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implementar camada Application (Autenticação)
  - [x] 5.1 Criar DTOs de autenticação e interfaces de serviço
    - Implementar `LoginRequest.cs`, `LoginResponse.cs`, `RefreshTokenRequest.cs`, `RefreshTokenResponse.cs`
    - Implementar `IAuthService.cs` com métodos Login e RefreshToken
    - Implementar `IJwtTokenService.cs` e `IPasswordHashService.cs`
    - _Requisitos: 1.1, 1.3_

  - [x] 5.2 Implementar AuthService com lógica de login e refresh token
    - Validar credenciais (email + password hash)
    - Gerar Token_JWT com claims: UserId, lista de roles, ClinicId da primeira clínica associada
    - Gerar e persistir RefreshToken
    - Implementar lógica de refresh: validar token existente, revogar antigo, gerar novo par
    - Retornar 401 para credenciais/tokens inválidos
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 5.3 Implementar validadores de autenticação com FluentValidation
    - Implementar `LoginRequestValidator.cs`: email obrigatório e formato válido, password obrigatório
    - Implementar `RefreshTokenRequestValidator.cs`: token obrigatório
    - _Requisitos: 1.1_

  - [x] 5.4 Escrever testes de propriedade para autenticação
    - **Propriedade 1: Claims do JWT contêm dados corretos do usuário**
    - **Propriedade 2: Credenciais e tokens inválidos são rejeitados**
    - **Propriedade 3: Refresh token preserva claims (round-trip)**
    - **Valida: Requisitos 1.1, 1.2, 1.3, 1.4, 1.5**

- [x] 6. Implementar camada Application (Autorização e Multi-Tenancy)
  - [x] 6.1 Implementar middleware de Tenant e autorização
    - Implementar `TenantMiddleware.cs`: extrair ClinicId dos claims JWT e injetar no contexto
    - Implementar `ExceptionHandlingMiddleware.cs`: converter exceções de domínio em respostas HTTP padronizadas (RFC 7807)
    - Configurar Authorization Policies por perfil (AdminGlobal, AdminClinica, Profissional)
    - _Requisitos: 2.6, 3.1, 3.3, 3.4_

  - [x] 6.2 Escrever testes de propriedade para autorização e multi-tenancy
    - **Propriedade 4: AdminGlobal possui acesso irrestrito a todos os dados**
    - **Propriedade 5: Isolamento de tenant para usuários não-globais**
    - **Propriedade 6: Profissionais visualizam apenas plantões atribuídos**
    - **Propriedade 7: Acesso não autorizado retorna 403 Forbidden**
    - **Valida: Requisitos 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.3, 4.4, 5.4, 6.3, 6.4, 6.5, 6.6**

- [x] 7. Implementar camada Application (Gestão de Clínicas e Usuários)
  - [x] 7.1 Implementar ClinicService e DTOs
    - Implementar `CreateClinicRequest.cs`, `ClinicResponse.cs`
    - Implementar `IClinicService.cs` e `ClinicService.cs`: GetAll (com filtro tenant), Create (apenas AdminGlobal)
    - Implementar `CreateClinicRequestValidator.cs`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.2 Implementar UserService e DTOs
    - Implementar `CreateUserRequest.cs`, `AssignRoleRequest.cs`, `UserResponse.cs`
    - Implementar `IUserService.cs` e `UserService.cs`: GetAll, Create, AssignClinicRole
    - Validar email duplicado, campos obrigatórios, formato de email
    - Implementar `CreateUserRequestValidator.cs` e `AssignRoleRequestValidator.cs`
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.3 Escrever testes de propriedade para gestão de usuários
    - **Propriedade 8: Usuário suporta múltiplos perfis em múltiplas clínicas**
    - **Propriedade 9: Dados inválidos são rejeitados com detalhes de validação**
    - **Valida: Requisitos 2.2, 5.3, 5.5**

- [x] 8. Implementar camada Application (Gestão de Plantões)
  - [x] 8.1 Implementar ShiftService e DTOs
    - Implementar `CreateShiftRequest.cs`, `AssignShiftRequest.cs`, `ShiftResponse.cs`
    - Implementar `IShiftService.cs` e `ShiftService.cs`: GetAll (filtrado por tenant e perfil), Create (AdminClinica), AssignProfessional (AdminClinica)
    - AdminGlobal vê todos, AdminClinica vê da clínica, Profissionais veem apenas atribuídos
    - Implementar `CreateShiftRequestValidator.cs`
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. Implementar camada Application (Presença - Check-in/Check-out)
  - [x] 9.1 Implementar AttendanceService e DTOs
    - Implementar `CheckInRequest.cs`, `CheckOutRequest.cs`, `AttendanceResponse.cs`
    - Implementar `IAttendanceService.cs` e `AttendanceService.cs`
    - Check-in: validar atribuição ao plantão, validar check-in duplicado (409 Conflict), persistir com geolocalização e biometria
    - Check-out: validar check-in ativo existente (400 se não existe), atualizar registro sem alterar dados de check-in
    - Histórico: retornar registros do profissional na clínica ativa, ordenados por data decrescente
    - Implementar `CheckInRequestValidator.cs` e `CheckOutRequestValidator.cs`
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2_

  - [x] 9.2 Escrever testes de propriedade para presença
    - **Propriedade 10: Check-in persiste registro completo de presença (round-trip)**
    - **Propriedade 11: Check-in duplicado é prevenido**
    - **Propriedade 12: Check-out atualiza registro existente**
    - **Propriedade 13: Check-out requer check-in ativo**
    - **Valida: Requisitos 7.1, 7.4, 8.1, 8.3, 9.2**

- [x] 10. Implementar camada Application (Auditoria)
  - [x] 10.1 Implementar AuditService e middleware de auditoria
    - Implementar `IAuditService.cs` e `AuditService.cs`: registrar operações CUD, consultar logs (AdminGlobal)
    - Implementar `AuditMiddleware.cs`: interceptar operações de criação/atualização/exclusão e registrar em AuditLog
    - Histórico de auditoria ordenado por data decrescente
    - _Requisitos: 10.1, 10.2, 10.3_

  - [x] 10.2 Escrever testes de propriedade para auditoria e histórico
    - **Propriedade 14: Histórico é ordenado por data decrescente**
    - **Propriedade 15: Operações CUD geram registro de auditoria**
    - **Valida: Requisitos 9.1, 10.1, 10.2**

- [x] 11. Checkpoint - Verificar camada Application completa
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implementar camada API (Controllers)
  - [x] 12.1 Implementar AuthController
    - POST /api/auth/login: receber LoginRequest, chamar AuthService, retornar LoginResponse
    - POST /api/auth/refresh-token: receber RefreshTokenRequest, retornar novo par de tokens
    - Endpoints públicos (sem [Authorize])
    - _Requisitos: 1.1, 1.3, 1.6_

  - [x] 12.2 Implementar ClinicsController
    - GET /api/clinics: listar clínicas (AdminGlobal vê todas, AdminClinica vê a sua)
    - POST /api/clinics: criar clínica ([Authorize] AdminGlobal)
    - _Requisitos: 4.1, 4.2, 4.3, 4.4_

  - [x] 12.3 Implementar UsersController
    - GET /api/users: listar usuários ([Authorize] AdminGlobal)
    - POST /api/users: criar usuário ([Authorize] AdminGlobal)
    - POST /api/users/{id}/clinic-role: atribuir perfil ([Authorize] AdminGlobal)
    - _Requisitos: 5.1, 5.2, 5.3, 5.4_

  - [x] 12.4 Implementar ShiftsController
    - GET /api/shifts: listar plantões (filtrado por perfil e tenant)
    - POST /api/shifts: criar plantão ([Authorize] AdminClinica)
    - POST /api/shifts/{id}/assign: atribuir profissional ([Authorize] AdminClinica)
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 12.5 Implementar AttendanceController
    - POST /api/attendance/check-in: registrar check-in ([Authorize] Profissional)
    - POST /api/attendance/check-out: registrar check-out ([Authorize] Profissional)
    - GET /api/attendance/my-history: histórico do profissional ([Authorize] Profissional)
    - _Requisitos: 7.1, 7.2, 8.1, 8.2, 9.1_

  - [x] 12.6 Implementar AuditController
    - GET /api/audit: listar logs de auditoria ([Authorize] AdminGlobal)
    - _Requisitos: 10.2, 10.3_

- [x] 13. Configurar Program.cs e pipeline da API
  - [x] 13.1 Configurar DI, middleware pipeline e Swagger
    - Registrar todos os serviços e repositórios no DI container
    - Configurar JWT Authentication com opções de validação de token
    - Configurar Authorization Policies por perfil
    - Registrar middlewares na ordem: ExceptionHandling → Tenant → Audit
    - Configurar Swagger/OpenAPI com suporte a Bearer Token
    - Configurar CORS para permitir requisições do frontend
    - Configurar `appsettings.json` com ConnectionStrings, JwtSettings (Secret, Issuer, Audience, ExpirationMinutes)
    - Executar migrations e seed automaticamente no startup (desenvolvimento)
    - _Requisitos: 1.6, 2.6, 3.1, 11.1, 11.2_

  - [x] 13.2 Escrever testes unitários para controllers e middleware
    - Testar mapeamento de exceções para HTTP codes no ExceptionHandlingMiddleware
    - Testar extração de claims no TenantMiddleware
    - Testar ValidationFilter com FluentValidation
    - _Requisitos: 1.2, 3.1_

- [x] 14. Checkpoint - Verificar API funcional end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implementar Frontend React
  - [x] 15.1 Implementar camada de API e autenticação (axios, interceptors, AuthContext)
    - Criar `axiosInstance.ts` com baseURL, interceptor para adicionar Bearer token, interceptor para refresh automático em 401
    - Criar `authApi.ts` com funções login e refreshToken
    - Implementar `AuthContext.tsx`: estado do usuário autenticado, token no localStorage, login/logout, refresh automático
    - Implementar `useAuth.ts` hook
    - _Requisitos: 12.1, 12.7_

  - [x] 15.2 Implementar contexto de clínica e hooks auxiliares
    - Implementar `ClinicContext.tsx`: clínica ativa selecionada, troca de clínica
    - Implementar `useClinic.ts` hook
    - Implementar `useGeolocation.ts` hook: obter latitude e longitude via navigator.geolocation
    - Implementar tipos TypeScript em `types/index.ts` para todas as entidades e DTOs
    - _Requisitos: 12.3, 12.5_

  - [x] 15.3 Implementar páginas e componentes principais
    - Implementar `LoginPage.tsx`: formulário email/senha, chamar authApi.login, armazenar tokens
    - Implementar `DashboardPage.tsx`: informações contextuais ao perfil (AdminGlobal: totais, AdminClinica: plantões da clínica, Profissional: próximos plantões)
    - Implementar `ShiftsPage.tsx`: listagem de plantões com filtro pela clínica ativa
    - Implementar `AttendancePage.tsx`: botões de check-in/check-out com envio de geolocalização
    - Implementar `ClinicsPage.tsx`: listagem e criação de clínicas (AdminGlobal/AdminClinica)
    - Implementar `UsersPage.tsx`: listagem e criação de usuários (AdminGlobal)
    - _Requisitos: 12.1, 12.2, 12.4, 12.5, 12.6_

  - [x] 15.4 Implementar componentes compartilhados e roteamento
    - Implementar `ProtectedRoute.tsx`: redirecionar para login se não autenticado, verificar perfil necessário
    - Implementar `ClinicSelector.tsx`: dropdown para troca de clínica ativa
    - Implementar `CheckInButton.tsx` e `CheckOutButton.tsx`: obter geolocalização, enviar request
    - Implementar `ShiftList.tsx`: renderizar lista de plantões
    - Configurar React Router com rotas protegidas por perfil
    - Criar `clinicsApi.ts`, `usersApi.ts`, `shiftsApi.ts`, `attendanceApi.ts`
    - _Requisitos: 12.3, 12.5, 12.6_

- [x] 16. Checkpoint - Verificar frontend funcional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Containerização com Docker
  - [x] 17.1 Criar Dockerfiles e docker-compose.yml
    - Criar `Dockerfile` para a API (.NET 8 multi-stage build: restore → build → publish)
    - Criar `frontend/Dockerfile` para o frontend (Node build → Nginx serve)
    - Criar `docker-compose.yml` com serviços: api (porta 5000), db/postgresql (porta 5432), frontend (porta 3000)
    - Configurar volumes para persistência do PostgreSQL
    - Configurar variáveis de ambiente: ConnectionString, JWT settings
    - Configurar health checks e dependências entre serviços
    - _Requisitos: 11.3, 11.4_

- [x] 18. Documentação e exemplos de teste
  - [x] 18.1 Criar README com instruções de execução
    - Instruções para executar com `docker-compose up`
    - Comandos para migrations do EF Core (`dotnet ef migrations add`, `dotnet ef database update`)
    - Dados de acesso do seed: admin@plantonhub.com / Admin@123, medico@plantonhub.com / Teste@123, enfermeiro@plantonhub.com / Teste@123, adminclinica@plantonhub.com / Teste@123
    - Arquitetura do projeto e estrutura de diretórios
    - _Requisitos: 13.1, 13.3, 13.4_

  - [x] 18.2 Criar arquivo de exemplos de requisições HTTP (.http)
    - Criar arquivo `requests.http` (formato VS Code REST Client) com exemplos para:
    - Login (admin, medico, adminclinica)
    - Criação de clínica
    - Criação de usuário e atribuição de perfil
    - Criação de plantão e atribuição de profissional
    - Check-in com geolocalização
    - Check-out
    - Consulta de histórico
    - Consulta de auditoria
    - Incluir variáveis para tokens retornados
    - _Requisitos: 13.2_

- [x] 19. Checkpoint Final - Verificar sistema completo
  - Ensure all tests pass, ask the user if questions arise.

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para entrega mais rápida do MVP
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Testes de propriedade validam propriedades universais de corretude
- Testes unitários validam exemplos específicos e casos de borda
- A linguagem do backend é C# (.NET 8) e do frontend é TypeScript (React)
