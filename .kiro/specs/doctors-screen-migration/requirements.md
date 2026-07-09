# Requirements Document

## Introduction

Migração da tela estática de médicos (`frontend/public/medico.html`) para componentes React dentro da aplicação SPA existente. A tela atual é uma página HTML standalone com interface mobile-first que oferece autenticação biométrica facial, check-in/check-out de plantão e visualização de relatórios para médicos. O objetivo é recriar essas funcionalidades como páginas React mantendo **exatamente** o mesmo frontend visual (HTML, CSS, animações, layout, ícones SVG e fluxo de telas) do `medico.html` original, integrados ao sistema de rotas, autenticação e API existentes.

## Glossary

- **Doctor_Dashboard**: Página principal do médico após login, exibindo saudação personalizada, relógio em tempo real e ações de check-in/check-out
- **Attendance_System**: Sistema de registro de presença que processa check-in e check-out dos profissionais de saúde
- **Reports_View**: Tela de relatórios do médico que exibe histórico de registros de presença com filtros por data e unidade
- **Bottom_Navigation**: Componente de navegação inferior com abas (Início, Check-in, Check-out, Relatórios, Sair)
- **Confirmation_Screen**: Tela de confirmação exibida após check-in ou check-out bem-sucedido
- **React_Router**: Sistema de roteamento da aplicação React (react-router-dom)
- **ProtectedRoute**: Componente wrapper que restringe acesso por role do usuário
- **AuthContext**: Contexto React que gerencia estado de autenticação do usuário

## Requirements

### Requirement 1: Rota e Página do Médico

**User Story:** Como médico, quero acessar minha área dedicada na aplicação React, para que eu possa realizar check-in/check-out e ver meus relatórios sem depender da página HTML estática.

#### Acceptance Criteria

1. WHEN um usuário com role "Medico" navega para a rota `/doctor`, THE React_Router SHALL renderizar a página Doctor_Dashboard dentro de um ProtectedRoute
2. WHEN um usuário sem role "Medico" tenta acessar `/doctor`, THE ProtectedRoute SHALL exibir mensagem de acesso negado
3. WHEN um usuário não autenticado tenta acessar `/doctor`, THE ProtectedRoute SHALL redirecionar para a página de login
4. THE Doctor_Dashboard SHALL exibir o nome do médico logado obtido do AuthContext
5. THE Doctor_Dashboard SHALL exibir a hora atual em formato HH:mm atualizada a cada segundo

### Requirement 2: Check-in do Médico

**User Story:** Como médico, quero registrar minha entrada no plantão diretamente pela aplicação React, para que meu registro de presença fique salvo no sistema.

#### Acceptance Criteria

1. WHEN o médico pressiona o botão "Check-in" no Doctor_Dashboard, THE Attendance_System SHALL enviar uma requisição de check-in à API com coordenadas de geolocalização e identificador do dispositivo
2. WHEN a API retorna sucesso no check-in, THE Confirmation_Screen SHALL exibir nome do médico, data, hora de entrada e local do plantão
3. IF a API retorna erro no check-in, THEN THE Attendance_System SHALL exibir mensagem de erro descritiva ao médico
4. WHILE a requisição de check-in está em andamento, THE Doctor_Dashboard SHALL desabilitar o botão de check-in e exibir indicador de carregamento

### Requirement 3: Check-out do Médico

**User Story:** Como médico, quero registrar minha saída do plantão pela aplicação React, para que o sistema registre o término do meu expediente.

#### Acceptance Criteria

1. WHEN o médico pressiona o botão "Check-out" no Doctor_Dashboard, THE Attendance_System SHALL enviar uma requisição de check-out à API com coordenadas de geolocalização e identificador do dispositivo
2. WHEN a API retorna sucesso no check-out, THE Confirmation_Screen SHALL exibir nome do médico, data, hora de saída e local do plantão
3. IF a API retorna erro no check-out, THEN THE Attendance_System SHALL exibir mensagem de erro descritiva ao médico
4. WHILE a requisição de check-out está em andamento, THE Doctor_Dashboard SHALL desabilitar o botão de check-out e exibir indicador de carregamento

### Requirement 4: Relatórios do Médico

**User Story:** Como médico, quero visualizar meu histórico de presenças com filtros, para que eu possa acompanhar meus registros de plantões.

#### Acceptance Criteria

1. WHEN o médico navega para a seção de relatórios, THE Reports_View SHALL exibir a lista de registros de presença do médico logado
2. THE Reports_View SHALL exibir estatísticas resumidas incluindo total de plantões, horas trabalhadas e média de horas por plantão
3. WHEN o médico seleciona um filtro de data, THE Reports_View SHALL exibir apenas os registros dentro do período selecionado
4. WHEN o médico seleciona um filtro de unidade, THE Reports_View SHALL exibir apenas os registros da unidade selecionada
5. THE Reports_View SHALL exibir cada registro com data, hora de entrada, hora de saída e badge indicando tipo (entrada/saída)
6. WHILE os dados de relatórios estão sendo carregados, THE Reports_View SHALL exibir indicador de carregamento

### Requirement 5: Navegação e Fluxo de Telas

**User Story:** Como médico, quero navegar entre as seções da minha área usando a barra inferior e o fluxo de telas idêntico ao original, para que a experiência seja intuitiva e familiar.

#### Acceptance Criteria

1. THE Bottom_Navigation SHALL exibir cinco abas: Início, Check-in, Check-out, Relatórios e Sair, com ícones SVG idênticos ao `medico.html` original
2. WHEN o médico pressiona uma aba na Bottom_Navigation, THE React_Router SHALL navegar para a seção correspondente
3. THE Bottom_Navigation SHALL destacar visualmente a aba ativa com cor teal (ou orange para check-out) conforme o design original
4. WHEN o médico pressiona a aba "Sair", THE AuthContext SHALL executar logout e redirecionar para a página de login
5. THE Bottom_Navigation SHALL permanecer fixa na parte inferior da viewport com height var(--nav-h) e padding-bottom env(safe-area-inset-bottom)
6. THE Doctor_Dashboard SHALL implementar o fluxo de telas: Início → (Check-in/Check-out) → Tela de Confirmação → retorno ao Início, preservando as transições com animação fadeUp

### Requirement 6: Preservação Total do Frontend Visual

**User Story:** Como médico, quero que a interface migrada seja visualmente idêntica à tela HTML estática existente, para que a experiência de uso permaneça exatamente a mesma.

#### Acceptance Criteria

1. THE Doctor_Dashboard SHALL reproduzir fielmente toda a estrutura HTML e estilos CSS do arquivo `medico.html` original, incluindo variáveis CSS (--teal, --orange, --bg, --text, --muted, --nav-h)
2. THE Doctor_Dashboard SHALL manter todas as animações CSS existentes: fadeUp, pulse-oval, scanning, fill-up, blink, float-user, scan-ring, pop, slideUp e fadeIn
3. THE Doctor_Dashboard SHALL utilizar a fonte Nunito com os mesmos pesos (400, 600, 700, 800, 900) conforme a tela original
4. THE Doctor_Dashboard SHALL preservar todos os ícones SVG inline exatamente como definidos no `medico.html` original
5. THE Doctor_Dashboard SHALL manter o layout mobile-first com overflow hidden, safe-area-inset-bottom e viewport meta tags equivalentes
6. THE Confirmation_Screen SHALL preservar os cards de pessoa (person-card) com avatar gradiente, detalhes e badges conforme o design original
7. THE Reports_View SHALL preservar o layout de cards, filtros com custom-select-wrap e grid de estatísticas (stats-row) conforme o design original

### Requirement 7: Integração com Sistema Offline

**User Story:** Como médico, quero que meus registros de check-in/check-out sejam salvos localmente quando estiver sem conexão, para que não perca registros por problemas de rede.

#### Acceptance Criteria

1. WHEN a requisição de check-in falha por falta de conexão, THE Attendance_System SHALL enfileirar o evento na fila offline existente
2. WHEN a requisição de check-out falha por falta de conexão, THE Attendance_System SHALL enfileirar o evento na fila offline existente
3. WHEN a conexão é restabelecida, THE Attendance_System SHALL sincronizar automaticamente os eventos enfileirados
4. WHILE existem eventos pendentes na fila, THE Doctor_Dashboard SHALL exibir indicador de operações pendentes

