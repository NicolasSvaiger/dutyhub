import pg from "pg";

const { Client } = pg;

// Password is injected as env var at deploy time (from Secrets Manager via CDK)
// This avoids needing a VPC Endpoint for Secrets Manager ($14/mo)
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_ENDPOINT = process.env.DB_ENDPOINT;

export async function handler(event) {
  const email = event.request.userAttributes.email;

  try {
    const client = new Client({
      host: DB_ENDPOINT,
      port: 5432,
      database: "dutyhub",
      user: "dutyhub_admin",
      password: DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    await client.connect();

    // Query clinic IDs and roles for this user (clinical / admin path)
    const clinicResult = await client.query(
      `SELECT "ClinicId"::text, "Role"::int
       FROM "UserClinicRoles" ucr
       JOIN "Users" u ON u."Id" = ucr."UserId"
       WHERE u."Email" = $1`,
      [email]
    );

    // Query public organ role (GestorPublico — Sprint 7A). Multi-organ é
    // débito documentado; por ora pegamos o primeiro. Coluna Role fica em
    // GestorPublico=6 sempre por FK design.
    const organResult = await client.query(
      `SELECT "PublicOrganId"::text
       FROM "UserPublicOrganRoles" upor
       JOIN "Users" u ON u."Id" = upor."UserId"
       WHERE u."Email" = $1
       LIMIT 1`,
      [email]
    );

    await client.end();

    // Build clinicIds array + roles set
    const clinicIds = clinicResult.rows.map((r) => r.ClinicId);
    const roles = [...new Set(clinicResult.rows.map((r) => mapRole(r.Role)))];

    // GestorPublico: append role + inject publicOrganId claim
    const publicOrganId = organResult.rows[0]?.PublicOrganId;
    if (publicOrganId && !roles.includes("GestorPublico")) {
      roles.push("GestorPublico");
    }

    // Claims comuns aos dois tokens
    const claimsToAdd = {
      clinicIds: JSON.stringify(clinicIds),
      roles: JSON.stringify(roles),
    };
    if (publicOrganId) {
      claimsToAdd.publicOrganId = publicOrganId;
    }

    // Inject custom claims — formato V1 pra bater com PreTokenGenerationConfig.LambdaVersion=V1_0
    // do pool. O trigger no CDK (cognito-stack.ts:164) foi criado sem especificar
    // cognito.LambdaVersion.V2_0, então caiu no default V1_0 — o response.claimsAndScopeOverrideDetails
    // (formato V2) era silenciosamente ignorado, resultando em JWTs sem claims.
    // Depois: migrar trigger pro V2_0 no CDK (addTrigger com terceiro parametro)
    // e reverter esta mudanca pra idToken/accessTokenGeneration separados.
    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: claimsToAdd,
      },
    };
  } catch (error) {
    console.error("Pre-token generation error:", error);
    // Don't block login if Lambda fails — just skip custom claims
  }

  return event;
}

// Mapping alinhado com PlantonHub.Domain.Enums.RoleType (1-indexado).
// O código anterior estava 0-indexado — bug pré-existente corrigido nesta
// sprint. HasConversion<int>() no EF grava exatamente o valor do enum.
function mapRole(roleInt) {
  const roles = {
    1: "AdminGlobal",
    2: "AdminClinica",
    3: "Medico",
    4: "Enfermeiro",
    5: "Tecnico",
    6: "GestorPublico",
  };
  return roles[roleInt] || "Unknown";
}
