#
# Sprint 2 - Migrar usuarios do seed (dev) para o Cognito User Pool.
#
# Uso:
#   .\scripts\cognito-migrate-users.ps1 -UserPoolId "us-east-1_AbC123dEf"
#   .\scripts\cognito-migrate-users.ps1 -UserPoolId "us-east-1_AbC123dEf" -SetPermanentPassword
#
# Pre-requisitos:
#   - AWS CLI v2 configurado com credenciais cognito-idp:AdminCreateUser
#
param(
    [Parameter(Mandatory=$true)]
    [string]$UserPoolId,

    [switch]$SetPermanentPassword
)

$ErrorActionPreference = "Stop"

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "  Cognito User Migration - DutyHub / 24p7" -ForegroundColor Cyan
Write-Host "  User Pool: $UserPoolId" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

$Users = @(
    @{ Email = "admin@plantonhub.com"; Name = "Admin Global"; Password = "Admin@123"; Group = "AdminGlobal" },
    @{ Email = "medico@plantonhub.com"; Name = "Dr. Medico Teste"; Password = "Teste@123"; Group = "Medico" },
    @{ Email = "enfermeiro@plantonhub.com"; Name = "Enfermeiro Teste"; Password = "Teste@123"; Group = "Enfermeiro" },
    @{ Email = "adminclinica@plantonhub.com"; Name = "Admin Clinica Teste"; Password = "Teste@123"; Group = "AdminClinica" },
    # Sprint 7A - Portal Prefeitura. Necessario para E2E prefeitura-flows/tv.
    # DatabaseSeeder.SeedGestorPublicoAsync cria o registro no Postgres e vincula
    # a Prefeitura de Santo Andre via UserPublicOrganRole; este user aqui e o
    # lado Cognito equivalente (login SDK).
    @{ Email = "gestor@plantonhub.com"; Name = "Gestor Prefeitura Teste"; Password = "Teste@123"; Group = "GestorPublico" }
)

# PowerShell nao trata exit-code != 0 de comandos nativos como sucesso,
# mas com $ErrorActionPreference=Stop qualquer stderr do aws.exe borra a
# execucao inteira como "NativeCommandError". Deixamos Continue localmente
# para que possamos capturar exit code + stderr manualmente por chamada.
$ErrorActionPreference = "Continue"

# Helper: roda "aws ..." capturando stdout e stderr num unico stream para
# poder imprimir a mensagem real quando falhar (o script antigo silenciava
# tudo com $null, escondendo por que uma chamada morreu).
function Invoke-Aws {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $out = & aws @Args 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = ($out | Out-String).Trim() }
}

foreach ($user in $Users) {
    Write-Host "  -> Criando $($user.Email)... " -NoNewline

    # Check if user already exists. Cognito retorna UserNotFoundException com
    # exit=254 quando o usuario nao existe — isso NAO e erro pra nos.
    $probe = Invoke-Aws cognito-idp admin-get-user --user-pool-id $UserPoolId --username $user.Email
    if ($probe.ExitCode -eq 0) {
        Write-Host "ja existe (pulando)" -ForegroundColor Yellow
        Write-Host ""
        continue
    }
    if ($probe.Output -notmatch "UserNotFoundException|User does not exist") {
        Write-Host "ERRO ao consultar" -ForegroundColor Red
        Write-Host $probe.Output -ForegroundColor Red
        Write-Host ""
        continue
    }

    # Create user with temporary password
    $create = Invoke-Aws cognito-idp admin-create-user `
        --user-pool-id $UserPoolId `
        --username $user.Email `
        --user-attributes "Name=email,Value=$($user.Email)" "Name=email_verified,Value=true" "Name=name,Value=$($user.Name)" `
        --temporary-password $user.Password `
        --message-action SUPPRESS `
        --output json
    if ($create.ExitCode -ne 0) {
        Write-Host "ERRO ao criar" -ForegroundColor Red
        Write-Host $create.Output -ForegroundColor Red
        Write-Host ""
        continue
    }

    Write-Host "criado" -ForegroundColor Green

    # Optionally set permanent password
    if ($SetPermanentPassword) {
        $setpwd = Invoke-Aws cognito-idp admin-set-user-password `
            --user-pool-id $UserPoolId `
            --username $user.Email `
            --password $user.Password `
            --permanent `
            --output json
        if ($setpwd.ExitCode -ne 0) {
            Write-Host "       -> ERRO ao definir senha permanente" -ForegroundColor Red
            Write-Host "          $($setpwd.Output)" -ForegroundColor Red
        } else {
            Write-Host "       -> Senha permanente definida"
        }
    }

    # Add to group
    $addgrp = Invoke-Aws cognito-idp admin-add-user-to-group `
        --user-pool-id $UserPoolId `
        --username $user.Email `
        --group-name $user.Group `
        --output json
    if ($addgrp.ExitCode -ne 0) {
        Write-Host "       -> ERRO ao adicionar ao grupo $($user.Group)" -ForegroundColor Red
        Write-Host "          $($addgrp.Output)" -ForegroundColor Red
    } else {
        Write-Host "       -> Adicionado ao grupo: $($user.Group)"
    }
    Write-Host ""
}

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "Done! Migracao concluida." -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:"
if (-not $SetPermanentPassword) {
    Write-Host "  - Usuarios vao precisar trocar a senha no primeiro login"
}
Write-Host "  - Verifique os usuarios no console AWS Cognito"
Write-Host "  - Atualize VITE_COGNITO_USER_POOL_ID e VITE_COGNITO_CLIENT_ID nos .env"
Write-Host "===========================================================" -ForegroundColor Cyan
