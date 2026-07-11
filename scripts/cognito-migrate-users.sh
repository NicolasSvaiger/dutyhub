#!/usr/bin/env bash
#
# Sprint 2 — Migrar usuários do seed (dev) para o Cognito User Pool.
#
# Uso:
#   ./scripts/cognito-migrate-users.sh [USER_POOL_ID]
#
# Pré-requisitos:
#   - AWS CLI v2 configurado com credenciais que tenham permissão cognito-idp:AdminCreateUser
#   - jq instalado (para parsing de output)
#
# Este script cria os 4 usuários do DatabaseSeeder no Cognito User Pool
# com senha temporária. No primeiro login, Cognito pedirá troca de senha
# (NEW_PASSWORD_REQUIRED challenge), que o frontend já suporta.
#
# Para pular o challenge e definir a senha permanente diretamente (útil em dev),
# use --set-permanent-password flag.
#
# NOTA: Em produção, este script deve ser executado uma única vez durante o deploy inicial.
#       Após isso, novos usuários são criados via Admin OS (Sprint 6).

set -euo pipefail

USER_POOL_ID="${1:-}"
SET_PERMANENT="${2:-}"

if [ -z "$USER_POOL_ID" ]; then
  echo "Uso: $0 <USER_POOL_ID> [--set-permanent-password]"
  echo ""
  echo "Exemplo:"
  echo "  $0 us-east-1_AbC123dEf"
  echo "  $0 us-east-1_AbC123dEf --set-permanent-password"
  exit 1
fi

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════"
echo "  Cognito User Migration — DutyHub / 24p7"
echo "  User Pool: $USER_POOL_ID"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Usuários do seed (DatabaseSeeder.cs)
# Format: email|name|temporary_password|group
USERS=(
  "admin@plantonhub.com|Admin Global|Admin@123|AdminGlobal"
  "medico@plantonhub.com|Dr. Médico Teste|Teste@123|Medico"
  "enfermeiro@plantonhub.com|Enfermeiro Teste|Teste@123|Enfermeiro"
  "adminclinica@plantonhub.com|Admin Clínica Teste|Teste@123|AdminClinica"
)

create_user() {
  local email="$1"
  local name="$2"
  local password="$3"
  local group="$4"

  echo -n "  → Criando $email... "

  # Check if user already exists
  if aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$email" &>/dev/null; then
    echo -e "${YELLOW}já existe (pulando)${NC}"
    return 0
  fi

  # Create user with temporary password (suppress email notification with --message-action SUPPRESS)
  aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$email" \
    --user-attributes \
      Name=email,Value="$email" \
      Name=email_verified,Value=true \
      Name=name,Value="$name" \
    --temporary-password "$password" \
    --message-action SUPPRESS \
    --output json > /dev/null

  echo -e "${GREEN}criado${NC}"

  # Optionally set permanent password (skips NEW_PASSWORD_REQUIRED challenge)
  if [ "$SET_PERMANENT" = "--set-permanent-password" ]; then
    aws cognito-idp admin-set-user-password \
      --user-pool-id "$USER_POOL_ID" \
      --username "$email" \
      --password "$password" \
      --permanent \
      --output json > /dev/null
    echo "       ↳ Senha permanente definida"
  fi

  # Add user to group
  aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$USER_POOL_ID" \
    --username "$email" \
    --group-name "$group" \
    --output json > /dev/null
  echo "       ↳ Adicionado ao grupo: $group"
}

echo "Criando usuários..."
echo ""

for entry in "${USERS[@]}"; do
  IFS='|' read -r email name password group <<< "$entry"
  create_user "$email" "$name" "$password" "$group"
  echo ""
done

echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ Migração concluída!${NC}"
echo ""
echo "Próximos passos:"
if [ "$SET_PERMANENT" != "--set-permanent-password" ]; then
  echo "  • Usuários vão precisar trocar a senha no primeiro login"
  echo "    (o frontend já suporta o challenge NEW_PASSWORD_REQUIRED)"
fi
echo "  • Verifique os usuários no console AWS Cognito"
echo "  • Atualize VITE_COGNITO_USER_POOL_ID e VITE_COGNITO_CLIENT_ID nos .env"
echo "═══════════════════════════════════════════════════════════"
