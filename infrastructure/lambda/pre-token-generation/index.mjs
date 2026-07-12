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

    // Query clinic IDs and roles for this user
    const result = await client.query(
      `SELECT "ClinicId"::text, "Role"::int
       FROM "UserClinicRoles" ucr
       JOIN "Users" u ON u."Id" = ucr."UserId"
       WHERE u."Email" = $1`,
      [email]
    );

    await client.end();

    // Build clinicIds array and roles
    const clinicIds = result.rows.map((r) => r.ClinicId);
    const roles = [...new Set(result.rows.map((r) => mapRole(r.Role)))];

    // Inject custom claims into the token
    event.response = {
      claimsAndScopeOverrideDetails: {
        idTokenGeneration: {
          claimsToAddOrOverride: {
            clinicIds: JSON.stringify(clinicIds),
            roles: JSON.stringify(roles),
          },
        },
        accessTokenGeneration: {
          claimsToAddOrOverride: {
            clinicIds: JSON.stringify(clinicIds),
            roles: JSON.stringify(roles),
          },
        },
      },
    };
  } catch (error) {
    console.error("Pre-token generation error:", error);
    // Don't block login if Lambda fails — just skip custom claims
  }

  return event;
}

function mapRole(roleInt) {
  const roles = {
    0: "Medico",
    1: "Enfermeiro",
    2: "Tecnico",
    3: "AdminClinica",
    4: "AdminGlobal",
  };
  return roles[roleInt] || "Unknown";
}
