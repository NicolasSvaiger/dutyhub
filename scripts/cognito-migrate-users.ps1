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
    @{ Email = "adminclinica@plantonhub.com"; Name = "Admin Clinica Teste"; Password = "Teste@123"; Group = "AdminClinica" }
)

foreach ($user in $Users) {
    Write-Host "  -> Criando $($user.Email)... " -NoNewline

    # Check if user already exists
    $exists = $false
    try {
        $null = aws cognito-idp admin-get-user --user-pool-id $UserPoolId --username $user.Email 2>&1
        if ($LASTEXITCODE -eq 0) {
            $exists = $true
        }
    } catch {
        $exists = $false
    }

    if ($exists) {
        Write-Host "ja existe (pulando)" -ForegroundColor Yellow
        Write-Host ""
        continue
    }

    # Create user with temporary password
    $null = aws cognito-idp admin-create-user --user-pool-id $UserPoolId --username $user.Email --user-attributes "Name=email,Value=$($user.Email)" "Name=email_verified,Value=true" "Name=name,Value=$($user.Name)" --temporary-password $user.Password --message-action SUPPRESS --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO ao criar" -ForegroundColor Red
        Write-Host ""
        continue
    }

    Write-Host "criado" -ForegroundColor Green

    # Optionally set permanent password
    if ($SetPermanentPassword) {
        $null = aws cognito-idp admin-set-user-password --user-pool-id $UserPoolId --username $user.Email --password $user.Password --permanent --output json 2>&1
        Write-Host "       -> Senha permanente definida"
    }

    # Add to group
    $null = aws cognito-idp admin-add-user-to-group --user-pool-id $UserPoolId --username $user.Email --group-name $user.Group --output json 2>&1
    Write-Host "       -> Adicionado ao grupo: $($user.Group)"
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
